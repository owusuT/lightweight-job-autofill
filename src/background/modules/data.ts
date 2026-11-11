// Data module: handles profile and history data operations

import { MESSAGE_TYPE } from '../../shared/messages';
import type { Profile } from '../../shared/types';
import { UserDataService } from './userData';

export class DataModule {
  constructor(private userData: UserDataService) {}

  processMessage(
    message: { type: string; value?: unknown },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): boolean {
    // Guard against sending on a closed channel
    const safeSend = (payload: unknown) => {
      try {
        sendResponse(payload);
      } catch (e) {
        /* port closed */
      }
    };

    switch (message.type) {
      case MESSAGE_TYPE.GET_USER_PROFILE: {
        (async () => {
          const profile = await this.userData.getProfile();
          safeSend({ success: true, profile });
        })();
        return true;
      }

      case MESSAGE_TYPE.SAVE_USER_PROFILE: {
        (async () => {
          const saved = await this.userData.saveProfile(message.value as Profile);
          // Push update to all active tabs
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach((tab) => {
              chrome.tabs
                .sendMessage(tab.id!, {
                  type: MESSAGE_TYPE.USER_DATA_UPDATE,
                  value: saved,
                })
                .catch(() => {});
            });
          });
          safeSend({ success: true, profile: saved });
        })();
        return true;
      }

      case MESSAGE_TYPE.GET_APP_HISTORY: {
        (async () => {
          const history = await this.userData.getHistory();
          const stats = await this.userData.getStats();
          safeSend({ success: true, history, stats });
        })();
        return true;
      }
    }
    return false;
  }
}
