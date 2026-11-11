// ATS module: handles ATS-specific flow and application tracking

import { MESSAGE_TYPE } from '../../shared/messages';
import type { ApplicationEntry } from '../../shared/types';
import { TabStateService, ATS_FILL_STATUS } from './tabState';
import { UserDataService } from './userData';

export class AtsModule {
  constructor(
    private tabState: TabStateService,
    private userData: UserDataService,
  ) {}

  processMessage(
    message: { type: string; value?: unknown },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): boolean {
    // Popup messages have no sender.tab, so callers pass the tab id explicitly.
    const payload = message.value as { tabId?: number } | undefined;
    const tabId = payload?.tabId ?? (message as { tabId?: number }).tabId ?? sender?.tab?.id;

    switch (message.type) {
      case MESSAGE_TYPE.CONTENT_SCRIPT_LOAD: {
        this._onContentScriptLoad(message as { value?: { windowUrl?: string } }, sender, sendResponse);
        return true;
      }

      case MESSAGE_TYPE.ATS_ENABLE: {
        sendResponse({ success: true });
        return true;
      }

      case MESSAGE_TYPE.ATS_AUTO_FILL_STATUS: {
        const { status } = (message.value as { status?: string }) || {};
        if (tabId) {
          this.tabState.updateTab(tabId, { fillStatus: status || ATS_FILL_STATUS.IDLE });
        }
        // Broadcast to popup if open
        this._broadcastToPopup(MESSAGE_TYPE.ATS_AUTO_FILL_STATUS, message.value);
        return true;
      }

      case MESSAGE_TYPE.FORM_FILLED:
      case 'ATS_APPLICATION_COMPLETE': {
        if (tabId) {
          const tab = this.tabState.getTab(tabId);
          const value = message.value as { url?: string; title?: string; company?: string; fieldsFilled?: number };
          this.userData.addApplication({
            url: value?.url || sender?.tab?.url || '',
            title: value?.title || sender?.tab?.title,
            company: value?.company || '',
            atsName: tab.atsName || undefined,
            fieldsFilled: value?.fieldsFilled || 0,
            status: 'filled',
          });
          this.tabState.updateTab(tabId, {
            isApplying: false,
            fillStatus: ATS_FILL_STATUS.COMPLETE,
          });
        }
        sendResponse({ success: true });
        return true;
      }

      case MESSAGE_TYPE.APPLICATION_SUBMITTED: {
        (async () => {
          if (tabId) {
            const tab = this.tabState.getTab(tabId);
            const value = message.value as { url?: string; title?: string; company?: string; fieldsFilled?: number };
            await this.userData.addApplication({
              url: value?.url || sender?.tab?.url || '',
              title: value?.title || sender?.tab?.title,
              company: value?.company || '',
              atsName: tab.atsName || undefined,
              fieldsFilled: value?.fieldsFilled || 0,
              status: 'submitted',
            });
          }
          sendResponse({ success: true });
        })();
        return true;
      }

      case MESSAGE_TYPE.GET_ATS_STATUS: {
        (async () => {
          const profile = await this.userData.getProfile();
          const stats = await this.userData.getStats();
          let tab = tabId ? this.tabState.getTab(tabId) : ({} as ReturnType<TabStateService['getTab']>);

          // Popup requests do not carry sender.tab, so detect from the tab URL.
          if (tabId && !tab.atsName) {
            try {
              const realTab = await chrome.tabs.get(tabId);
              const atsInfo = this.tabState.detectAts(realTab.url || '');
              if (atsInfo) {
                this.tabState.updateTab(tabId, { atsName: atsInfo.name });
                tab = this.tabState.getTab(tabId);
              }
            } catch {
              /* tab may be gone */
            }
          }

          sendResponse({
            success: true,
            hasProfile: !!profile,
            stats,
            atsName: tab.atsName || null,
            isApplying: tab.isApplying || false,
            fillStatus: tab.fillStatus || ATS_FILL_STATUS.IDLE,
          });
        })();
        return true;
      }

      case MESSAGE_TYPE.ADD_APPLICATION: {
        (async () => {
          const entry = await this.userData.addApplication((message.value as Partial<ApplicationEntry>) || {});
          sendResponse({ success: true, entry });
        })();
        return true;
      }
    }
    return false;
  }

  private async _onContentScriptLoad(
    message: { value?: { windowUrl?: string } },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): Promise<void> {
    const tabId = sender?.tab?.id;
    const url = message.value?.windowUrl || sender?.tab?.url || '';

    if (!tabId) {
      sendResponse({ success: false });
      return;
    }

    // Detect ATS from URL
    const atsInfo = this.tabState.detectAts(url);
    this.tabState.updateTab(tabId, {
      url,
      atsName: atsInfo?.name || null,
      status: 'COMPLETE',
    });

    // Load user profile
    const profile = await this.userData.getProfile();
    const tab = this.tabState.getTab(tabId);

    // Tell the content script what it needs to know
    sendResponse({
      success: true,
      profile,
      atsName: tab.atsName,
      tabId,
    });
  }

  private _broadcastToPopup(type: string, value: unknown): void {
    chrome.runtime.sendMessage({ type, value }).catch(() => {
      // Popup might not be open, that's fine
    });
  }
}
