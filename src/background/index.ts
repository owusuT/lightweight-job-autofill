// jolly R Background Service Worker - TypeScript port

import { MESSAGE_TYPE } from '../shared/messages';
import { TabStateService } from './modules/tabState';
import { UserDataService } from './modules/userData';
import { CommonModule, PORTS } from './modules/common';
import { AtsModule } from './modules/ats';
import { DataModule } from './modules/data';
import { AllFramesModule } from './modules/allFrames';
import { JobsModule } from './modules/jobs';
import { AiModule } from './modules/ai';

// Keep the toolbar icon opening the popup, not the side panel.
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: false })
  .catch(() => {});

// Module registry
const tabStateService = new TabStateService();
const userDataService = new UserDataService();
const commonModule = new CommonModule();
const atsModule = new AtsModule(tabStateService, userDataService);
const dataModule = new DataModule(userDataService);
const allFramesModule = new AllFramesModule(userDataService);
const jobsModule = new JobsModule();
const aiModule = new AiModule();

const backgroundModules = [atsModule, dataModule, commonModule, allFramesModule, jobsModule, aiModule];

const ASYNC_MESSAGE_TYPES = [
  MESSAGE_TYPE.GET_USER_PROFILE,
  MESSAGE_TYPE.SAVE_USER_PROFILE,
  MESSAGE_TYPE.GET_APP_HISTORY,
  MESSAGE_TYPE.ADD_APPLICATION,
  MESSAGE_TYPE.ATS_ENABLE,
  MESSAGE_TYPE.CONTENT_SCRIPT_LOAD,
  MESSAGE_TYPE.GET_ATS_STATUS,
  MESSAGE_TYPE.GET_JOBS,
  'ALL_FRAMES_FILL',
  'ALL_FRAMES_MANUAL',
  'ALL_FRAMES_DETECT',
  'ALL_FRAMES_CLEAR',
];

// Chrome event handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    // "Open popup" request from the in-page floating UI
    if (message.type === 'OPEN_POPUP') {
      if (chrome.action?.openPopup) {
        chrome.action.openPopup().catch(() => {});
      }
      sendResponse({ success: true });
      return false;
    }

    for (const mod of backgroundModules) {
      const handled = mod.processMessage(message, sender, sendResponse);
      if (handled) return true;
    }

    if (ASYNC_MESSAGE_TYPES.includes(message.type as string)) {
      return true; // Keep channel open for async response
    }
  } catch (err) {
    console.error('[jolly R] onMessage error:', err);
  }
  return false;
});

chrome.runtime.onConnect.addListener((port) => {
  switch (port.name) {
    case PORTS.KEEP_ALIVE:
      commonModule.createKeepAlivePort(port);
      break;
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  try {
    const { status, url } = changeInfo;
    if (status === 'loading') {
      tabStateService.updateTab(tabId, { status: 'LOADING' });
    } else if (status === 'complete') {
      tabStateService.updateTab(tabId, { status: 'COMPLETE' });

      // Re-detect ATS on navigation
      if (tab.url) {
        const atsInfo = tabStateService.detectAts(tab.url);
        tabStateService.updateTab(tabId, { atsName: atsInfo?.name || null });
      }
    }
    if (url) {
      tabStateService.updateTab(tabId, { url });
    }
  } catch (err) {
    console.error('[jolly R] onUpdated:', err);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStateService.resetTab(tabId);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    chrome.tabs
      .sendMessage(tabId, {
        type: MESSAGE_TYPE.TAB_ACTIVATED,
        value: { tabId, url: tab.url },
      })
      .catch(() => {});
  } catch (err) {
    /* tab might be loading */
  }
});

chrome.webNavigation.onBeforeNavigate.addListener(({ tabId, frameId }) => {
  if (frameId === 0) {
    tabStateService.updateTab(tabId, { status: 'NAVIGATING' });
  }
});

chrome.webNavigation.onCompleted.addListener(({ tabId, frameId, url }) => {
  if (frameId === 0 && url) {
    const atsInfo = tabStateService.detectAts(url);
    tabStateService.updateTab(tabId, { atsName: atsInfo?.name || null });
  }
});
