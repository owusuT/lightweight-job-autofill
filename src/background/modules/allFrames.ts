// All-frames service: messages every frame of a tab and merges responses
// Used for forms embedded in iframes (e.g., Greenhouse job_app embeds)

import { UserDataService } from './userData';

interface AllFramesResult {
  success: boolean;
  fieldsFilled?: number;
  framesReached: number;
  perFrame: Record<number, number>;
  forms?: unknown[];
  candidates?: unknown[];
  error?: string | null;
}

interface ApplyAnswerValue {
  frameId?: number;
  token?: string;
  text?: string;
}

export class AllFramesModule {
  constructor(private userData: UserDataService) {}

  private async _enumerateFrames(tabId: number): Promise<number[]> {
    const frames = await new Promise<chrome.webNavigation.GetAllFrameResultDetails[]>((resolve) => {
      chrome.webNavigation.getAllFrames({ tabId }, (result) => {
        if (chrome.runtime.lastError || !result) resolve([]);
        else resolve(result);
      });
    });
    const frameIds = new Set((frames || []).map((f) => f.frameId));
    frameIds.add(0); // always include the top frame
    return Array.from(frameIds).sort((a, b) => a - b);
  }

  private _sendToFrame(tabId: number, frameId: number, message: { type: string; value?: unknown }): Promise<unknown> {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, { frameId }, (response) => {
        if (chrome.runtime.lastError) {
          void chrome.runtime.lastError;
          resolve(null);
        } else {
          resolve(response || null);
        }
      });
    });
  }

  private async _activeTabId(sender: chrome.runtime.MessageSender): Promise<number | null> {
    if (sender?.tab?.id) return sender.tab.id;
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0]?.id || null;
  }

  private async _roundTrip(tabId: number, type: string, value: unknown): Promise<AllFramesResult> {
    const frameIds = await this._enumerateFrames(tabId);
    const perFrame: Record<number, number> = {};
    let framesReached = 0;
    let anySuccess = false;
    let error: string | null = null;

    if (type === 'FILL_JOB_APPLICATION' || type === 'MANUAL_FILL_FORM') {
      let fieldsFilled = 0;
      for (const frameId of frameIds) {
        const resp = (await this._sendToFrame(tabId, frameId, { type, value })) as { fieldsFilled?: number; success?: boolean; error?: string };
        if (!resp) continue;
        framesReached++;
        perFrame[frameId] = resp.fieldsFilled || 0;
        fieldsFilled += resp.fieldsFilled || 0;
        if (resp.success) anySuccess = true;
        if (resp.error && !error) error = resp.error;
      }
      return { success: anySuccess, fieldsFilled, framesReached, perFrame, error };
    }

    if (type === 'DETECT_FORMS') {
      const forms: unknown[] = [];
      for (const frameId of frameIds) {
        const resp = (await this._sendToFrame(tabId, frameId, { type, value })) as { forms?: unknown[]; success?: boolean };
        if (!resp) continue;
        framesReached++;
        if (Array.isArray(resp.forms)) forms.push(...resp.forms);
        if (resp.success) anySuccess = true;
      }
      return { success: anySuccess, forms, framesReached, perFrame, error };
    }

    if (type === 'AI_QUESTION_CANDIDATES') {
      const candidates: unknown[] = [];
      for (const frameId of frameIds) {
        const resp = (await this._sendToFrame(tabId, frameId, { type, value })) as { fields?: unknown[]; success?: boolean };
        if (!resp) continue;
        framesReached++;
        if (Array.isArray(resp.fields)) {
          for (const field of resp.fields) {
            candidates.push({ ...(field as Record<string, unknown>), frameId });
          }
        }
        if (resp.success) anySuccess = true;
      }
      return { success: anySuccess, candidates, framesReached, perFrame, error };
    }

    // CLEAR_ALL_FORMS and anything else: just broadcast
    for (const frameId of frameIds) {
      const resp = (await this._sendToFrame(tabId, frameId, { type, value })) as { success?: boolean };
      if (!resp) continue;
      framesReached++;
      if (resp.success) anySuccess = true;
    }
    return { success: anySuccess, framesReached, perFrame, error };
  }

  processMessage(
    message: { type: string; value?: unknown; tabId?: unknown },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): boolean {
    const types: Record<string, string> = {
      ALL_FRAMES_FILL: 'FILL_JOB_APPLICATION',
      ALL_FRAMES_MANUAL: 'MANUAL_FILL_FORM',
      ALL_FRAMES_DETECT: 'DETECT_FORMS',
      ALL_FRAMES_CLEAR: 'CLEAR_ALL_FORMS',
      ALL_FRAMES_QUESTION_CANDIDATES: 'AI_QUESTION_CANDIDATES',
      ALL_FRAMES_APPLY_ANSWER: 'AI_APPLY_ANSWER',
    };
    const type = types[message.type];
    if (!type) return false;

    (async () => {
      let tabId: number | null;
      if (type === 'FILL_JOB_APPLICATION' && message.tabId !== undefined && !sender.tab) {
        if (typeof message.tabId !== 'number' || !Number.isSafeInteger(message.tabId) || message.tabId < 0) {
          sendResponse({ success: false, error: 'Invalid target tab.' });
          return;
        }
        tabId = message.tabId;
      } else {
        tabId = await this._activeTabId(sender);
      }
      if (tabId === null) {
        sendResponse({ success: false, error: 'No active tab.' });
        return;
      }

      // Applying an answer targets one frame and one captured field token.
      if (type === 'AI_APPLY_ANSWER') {
        const applyValue = (message.value || {}) as ApplyAnswerValue;
        if (!applyValue.token || typeof applyValue.text !== 'string') {
          sendResponse({ success: false, error: 'Missing field token or text.' });
          return;
        }
        const frameId = typeof applyValue.frameId === 'number' ? applyValue.frameId : 0;
        const resp = (await this._sendToFrame(tabId, frameId, {
          type,
          value: { token: applyValue.token, text: applyValue.text },
        })) as { success?: boolean; error?: string } | null;
        sendResponse({
          success: Boolean(resp?.success),
          error: resp?.error || (resp ? null : 'No content script in that frame.'),
        });
        return;
      }

      let value = message.value;

      // Full fill uses the freshest saved profile when the caller didn't pass one
      if (type === 'FILL_JOB_APPLICATION' && !value) {
        value = await this.userData.getProfile();
        if (!value) {
          sendResponse({ success: false, error: 'Save your profile in the popup before autofilling.' });
          return;
        }
      }

      let result = await this._roundTrip(tabId, type, value);

      // SPA forms can render after we first message the frames.
      // If nothing was filled, keep retrying briefly so a slow-hydrating iframe still gets filled.
      if (type === 'FILL_JOB_APPLICATION' && result.fieldsFilled === 0) {
        for (let attempt = 1; attempt < 4; attempt++) {
          await new Promise((r) => setTimeout(r, 1500));
          result = await this._roundTrip(tabId, type, value);
          if (result.fieldsFilled && result.fieldsFilled > 0) break;
        }
      }

      const success = type !== 'FILL_JOB_APPLICATION' ? result.success : (result.fieldsFilled || 0) > 0;
      sendResponse({ ...result, success });
    })();
    return true; // keep channel open for async response
  }
}
