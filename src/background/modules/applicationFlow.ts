import type { ApplicationFlow, ApplicationInspection, FlowResponse } from '../../shared/applicationFlow';
import { FLOW_STORAGE_KEY } from '../../shared/applicationFlow';
import { AllFramesModule } from './allFrames';
import { UserDataService } from './userData';

const ALARM = 'application-flow';
type FrameInspection = ApplicationInspection & { frameId: number };

function isInspection(value: unknown): value is ApplicationInspection {
  if (!value || typeof value !== 'object') return false;
  return 'signature' in value && typeof value.signature === 'string'
    && 'fields' in value && typeof value.fields === 'number'
    && 'next' in value && typeof value.next === 'boolean'
    && 'review' in value && typeof value.review === 'boolean'
    && 'blockers' in value && Array.isArray(value.blockers) && value.blockers.every(item => typeof item === 'string')
    && 'missing' in value && Array.isArray(value.missing) && value.missing.every(item => typeof item === 'string');
}

export class ApplicationFlowModule {
  private queue: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private frames: AllFramesModule, private userData: UserDataService) {
    chrome.alarms.onAlarm.addListener(alarm => {
      if (alarm.name === ALARM) this.wake();
    });
    chrome.tabs.onUpdated.addListener((_id, change) => {
      if (change.status === 'complete') this.wake();
    });
    this.wake();
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async read(): Promise<ApplicationFlow | null> {
    const stored = await chrome.storage.local.get(FLOW_STORAGE_KEY);
    return stored[FLOW_STORAGE_KEY] || null;
  }

  private async save(flow: ApplicationFlow): Promise<void> {
    await chrome.storage.local.set({ [FLOW_STORAGE_KEY]: flow });
  }

  private async pause(flow: ApplicationFlow, message: string, status: ApplicationFlow['status'] = 'paused') {
    await this.save({ ...flow, status, message, updatedAt: Date.now() });
    await chrome.alarms.clear(ALARM);
  }

  wake() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.serial(async () => {
        try {
          await this.tick();
        } catch {
          const flow = await this.read();
          if (flow?.status === 'running') await this.pause(flow, 'Could not access the application. Reload the page, then Resume.');
        }
      }).catch(() => undefined);
    }, 1000);
  }

  private async inspect(tabId: number): Promise<FrameInspection[]> {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    const ids = new Set([0, ...(frames || []).map(frame => frame.frameId)]);
    const results: FrameInspection[] = [];
    for (const frameId of ids) {
      try {
        const result: unknown = await chrome.tabs.sendMessage(tabId, { type: 'AUTOMATION_INSPECT' }, { frameId });
        if (isInspection(result)) results.push({ ...result, frameId });
      } catch { /* Frames without application controls may have no receiver. */ }
    }
    return results;
  }

  private async tick(): Promise<void> {
    const flow = await this.read();
    if (!flow || flow.status !== 'running') return;
    const tab = await chrome.tabs.get(flow.tabId);
    if (tab.status === 'loading') { this.wake(); return; }
    const inspections = await this.inspect(flow.tabId);
    const signature = JSON.stringify(inspections.map(frame => [frame.frameId, frame.signature]));
    if (!inspections.length) {
      if (Date.now() - flow.updatedAt < 15000) this.wake();
      else await this.pause(flow, 'Cannot read this page. Refresh the application page, then Resume.');
      return;
    }
    const blockers = inspections.flatMap(frame => frame.blockers);
    if (blockers.length) { await this.pause(flow, blockers.join(' ')); return; }
    if (flow.phase === 'waiting') {
      if (signature === flow.signature) {
        if (Date.now() - flow.updatedAt > 15000) {
          const missing = inspections.flatMap(frame => frame.missing);
          await this.pause(flow, missing.length ? `Please complete: ${missing.join(', ')}.` : 'The page did not advance. Check the application, then Resume.');
        } else this.wake();
        return;
      }
      await this.save({ ...flow, phase: 'fill', step: flow.step + 1, updatedAt: Date.now(), message: 'Reading the next step…' });
      this.wake();
      return;
    }
    if (flow.step > 30) { await this.pause(flow, 'Reached 30 steps. Check the application before continuing.'); return; }
    if (flow.phase === 'fill') {
      const profile = await this.userData.getProfile();
      if (!profile) { await this.pause(flow, 'Save your profile in the Profile tab, then Resume.'); return; }
      const result = await this.frames.runForTab(flow.tabId, 'AUTOMATION_FILL', {
        ...profile,
        ...(flow.position ? { position: flow.position } : {}),
        ...(flow.company ? { company: flow.company } : {}),
      });
      if (result.error) { await this.pause(flow, result.error); return; }
      await this.save({ ...flow, phase: 'advance', signature, message: `Filled ${result.fieldsFilled || 0} fields. Checking this step…`, updatedAt: Date.now() });
      this.wake();
      return;
    }
    // A new document or SPA step must be filled before it can be advanced.
    if (signature !== flow.signature) {
      await this.save({ ...flow, phase: 'fill', updatedAt: Date.now() });
      this.wake();
      return;
    }
    const missing = inspections.flatMap(frame => frame.missing);
    if (missing.length) { await this.pause(flow, `Please complete: ${missing.join(', ')}.`); return; }
    const next = inspections.filter(frame => frame.next);
    if (next.length !== 1) {
      const review = !next.length && inspections.some(frame => frame.review);
      await this.pause(flow, review ? 'Ready for your final review. Submit the application on the page when you are ready.'
        : 'Could not identify one Next button. Advance the page manually, then Resume.', review ? 'review' : 'paused');
      return;
    }
    // Persist before clicking. A worker restart waits for the page change and never repeats this click.
    await this.save({ ...flow, phase: 'waiting', signature, updatedAt: Date.now(), message: 'Moving to the next step…' });
    const result = await chrome.tabs.sendMessage(flow.tabId, {
      type: 'AUTOMATION_ADVANCE', value: { signature: next[0].signature },
    }, { frameId: next[0].frameId });
    if (!result?.clicked) await this.pause(flow, 'The page changed or needs attention. Check it, then Resume.');
    else this.wake();
  }

  private async control(type: string, value: unknown): Promise<FlowResponse> {
    let flow = await this.read();
    if (type === 'APPLICATION_FLOW_STATUS') return { success: true, flow };
    if (type === 'APPLICATION_FLOW_START') {
      if (flow?.status === 'running' || flow?.status === 'paused') {
        return { success: false, flow, error: 'Stop the current application before starting another.' };
      }
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined || !/^https?:\/\//.test(tab.url || '')) {
        return { success: false, flow, error: 'Open the application form in a browser tab first.' };
      }
      if (!await this.userData.getProfile()) return { success: false, flow, error: 'Save your profile before starting.' };
      const options = value && typeof value === 'object' ? value : {};
      flow = {
        id: crypto.randomUUID(), tabId: tab.id, status: 'running', phase: 'fill', step: 1,
        message: 'Scanning the application…', signature: '', updatedAt: Date.now(),
        position: 'position' in options && typeof options.position === 'string' ? options.position : '',
        company: 'company' in options && typeof options.company === 'string' ? options.company : '',
      };
    } else {
      if (!flow) return { success: false, flow: null, error: 'No application has been started.' };
      if (type === 'APPLICATION_FLOW_PAUSE') flow = { ...flow, status: 'paused', message: 'Paused. Finish the current action on the page if needed.' };
      if (type === 'APPLICATION_FLOW_STOP') flow = { ...flow, status: 'stopped', message: 'Application automation stopped.' };
      if (type === 'APPLICATION_FLOW_RESUME') {
        if (flow.status !== 'paused') return { success: false, flow, error: 'Only a paused application can be resumed.' };
        flow = { ...flow, status: 'running', phase: 'fill', message: 'Resuming the application…' };
      }
    }
    await this.save({ ...flow, updatedAt: Date.now() });
    if (flow.status === 'running') {
      await chrome.alarms.create(ALARM, { periodInMinutes: 1 });
      this.wake();
    } else {
      clearTimeout(this.timer);
      await chrome.alarms.clear(ALARM);
    }
    return { success: true, flow };
  }

  processMessage(message: { type: string; value?: unknown }, sender: chrome.runtime.MessageSender, respond: (response: FlowResponse) => void): boolean {
    if (!['APPLICATION_FLOW_START', 'APPLICATION_FLOW_PAUSE', 'APPLICATION_FLOW_RESUME', 'APPLICATION_FLOW_STOP', 'APPLICATION_FLOW_STATUS'].includes(message.type)) return false;
    if (sender.tab) { respond({ success: false, flow: null, error: 'Use the Apply tab to control automation.' }); return true; }
    if (message.type === 'APPLICATION_FLOW_PAUSE' || message.type === 'APPLICATION_FLOW_STOP') {
      void this.read().then(flow => {
        if (flow?.status === 'running') return this.frames.runForTab(flow.tabId, 'AUTOMATION_CANCEL', undefined);
      }).catch(() => undefined);
    }
    void this.serial(() => this.control(message.type, message.value))
      .then(respond, () => respond({ success: false, flow: null, error: 'Could not update the application workflow.' }));
    return true;
  }
}
