import type { ApplicationFlow, ApplicationInspection, FlowResponse } from '../../shared/applicationFlow';
import { FLOW_STORAGE_KEY } from '../../shared/applicationFlow';
import { AllFramesModule } from './allFrames';
import { UserDataService } from './userData';

const ALARM = 'application-flow';
type FrameInspection = ApplicationInspection & { frameId: number };
type AccessStage = NonNullable<ApplicationFlow['accessFailure']>['stage'];

class PageAccessError extends Error {
  constructor(readonly stage: AccessStage, readonly original: unknown) {
    super('Application page access failed');
  }
}

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
        } catch (error) {
          await this.recover(error);
        }
      }).catch(() => undefined);
    }, 1000);
  }

  private async request<T>(flow: ApplicationFlow, stage: AccessStage, operation: () => Promise<T>): Promise<T> {
    let result: T;
    try {
      result = await operation();
    } catch (error) {
      throw new PageAccessError(stage, error);
    }
    if (flow.accessFailure?.stage === stage) {
      delete flow.accessFailure;
      await this.save(flow);
    }
    return result;
  }

  private async recover(error: unknown): Promise<void> {
    const flow = await this.read();
    if (!flow || flow.status !== 'running') return;
    if (!(error instanceof PageAccessError)) {
      await this.pause(flow, 'Application automation encountered an error. Pause on the current page and try Resume.');
      return;
    }
    const detail = error.original instanceof Error ? error.original.message : String(error.original);
    if (error.stage === 'tab' && /no tab|invalid tab|tab.*closed/i.test(detail)) {
      await this.pause(flow, 'The application tab was closed or replaced. Stop this run and Start from the application tab.');
      return;
    }
    const since = flow.accessFailure?.stage === error.stage ? flow.accessFailure.since : Date.now();
    if (Date.now() - since >= 20000) {
      const message: Record<AccessStage, string> = {
        tab: 'Cannot access the original application tab. Stop this run and Start from the application tab.',
        frames: 'Cannot read the application frames. Check extension site access for this application website, then Resume.',
        inspect: 'The application page is not responding. Refresh this page after reloading the extension, then Resume.',
        fill: 'The page did not respond to autofill. Refresh the application page, then Resume.',
        advance: 'The page did not confirm navigation. Check the current step, then Resume.',
      };
      await this.pause(flow, message[error.stage]);
      return;
    }
    await this.save({ ...flow, accessFailure: { stage: error.stage, since }, message: 'Waiting for the application page to finish loading…' });
    this.wake();
  }

  private async inspect(flow: ApplicationFlow): Promise<FrameInspection[]> {
    const tabId = flow.tabId;
    const frames = await this.request(flow, 'frames', () => chrome.webNavigation.getAllFrames({ tabId }));
    const ids = new Set([0, ...(frames || []).map(frame => frame.frameId)]);
    const results: FrameInspection[] = [];
    let failure: unknown = new Error('The content script has not responded.');
    for (const frameId of ids) {
      try {
        const result: unknown = await chrome.tabs.sendMessage(tabId, { type: 'AUTOMATION_INSPECT' }, { frameId });
        if (isInspection(result)) results.push({ ...result, frameId });
      } catch (error) { failure = error; }
    }
    if (!results.length) throw new PageAccessError('inspect', failure);
    if (flow.accessFailure?.stage === 'inspect') {
      delete flow.accessFailure;
      await this.save(flow);
    }
    return results;
  }

  private async tick(): Promise<void> {
    const flow = await this.read();
    if (!flow || flow.status !== 'running') return;
    const tab = await this.request(flow, 'tab', () => chrome.tabs.get(flow.tabId));
    if (tab.status === 'loading') { this.wake(); return; }
    const inspections = await this.inspect(flow);
    const signature = JSON.stringify(inspections.map(frame => [frame.frameId, frame.signature]));
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
      delete flow.accessFailure;
      await this.save({ ...flow, phase: 'fill', step: flow.step + 1, updatedAt: Date.now(), message: 'Reading the next step…' });
      this.wake();
      return;
    }
    if (flow.step > 30) { await this.pause(flow, 'Reached 30 steps. Check the application before continuing.'); return; }
    if (flow.phase === 'fill') {
      const profile = await this.userData.getProfile();
      if (!profile) { await this.pause(flow, 'Save your profile in the Profile tab, then Resume.'); return; }
      const result = await this.request(flow, 'fill', async () => {
        const filled = await this.frames.runForTab(flow.tabId, 'AUTOMATION_FILL', {
          ...profile,
          ...(flow.position ? { position: flow.position } : {}),
          ...(flow.company ? { company: flow.company } : {}),
        });
        if (!filled.framesReached) throw new Error('The page navigated before autofill could respond.');
        return filled;
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
    const result = await this.request(flow, 'advance', () => chrome.tabs.sendMessage(flow.tabId, {
      type: 'AUTOMATION_ADVANCE', value: { signature: next[0].signature },
    }, { frameId: next[0].frameId }));
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
        delete flow.accessFailure;
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
