// ─── jolly R Background Service Worker v2.0 ────────────────────────────────
// Architecture: module system, tab state machine, keep-alive ports

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const MESSAGE_TYPE = {
  // Content ↔ Background
  CONTENT_SCRIPT_LOAD:     "CONTENT_SCRIPT_LOAD",
  TAB_ACTIVATED:           "TAB_ACTIVATED",
  USER_DATA_UPDATE:        "USER_DATA_UPDATE",

  // ATS Flow
  ATS_ENABLE:              "ATS_ENABLE",
  ATS_START_APPLY_FLOW:    "ATS_START_APPLY_FLOW",
  ATS_AUTO_FILL_STATUS:    "ATS_AUTO_FILL_STATUS",
  ATS_POPUP_MODE_SET:      "ATS_POPUP_MODE_SET",
  ATS_FILL_FIELD:          "ATS_FILL_FIELD",
  ATS_APPLICATION_COMPLETE:"ATS_APPLICATION_COMPLETE",

  // Data
  GET_USER_PROFILE:        "GET_USER_PROFILE",
  SAVE_USER_PROFILE:       "SAVE_USER_PROFILE",
  GET_APP_HISTORY:         "GET_APP_HISTORY",
  ADD_APPLICATION:         "ADD_APPLICATION",
  GET_ATS_STATUS:          "GET_ATS_STATUS",

  // Ports
  KEEP_ALIVE:              "KEEP_ALIVE",
};

const PORTS = {
  KEEP_ALIVE: "KEEP_ALIVE_PORT",
  ATS_STATUS: "ATS_STATUS_PORT",
};

const TAB_STATUS = {
  IDLE:        "IDLE",
  LOADING:     "LOADING",
  NAVIGATING:  "NAVIGATING",
  COMPLETE:    "COMPLETE",
  REDIRECTING: "REDIRECTING",
};

const ATS_POPUP_MODE = {
  DISABLED: "DISABLED",
  BUTTON:   "BUTTON",
  EXPANDED: "EXPANDED",
};

const ATS_FILL_STATUS = {
  IDLE:       "IDLE",
  DETECTING:  "DETECTING",
  FILLING:    "FILLING",
  COMPLETE:   "COMPLETE",
  ERROR:      "ERROR",
};

// Known ATS platforms (atsName detection)
const KNOWN_ATS = {
  WORKDAY:      { name: "Workday",      patterns: ["myworkdayjobs.com", "workday.com"] },
  GREENHOUSE:   { name: "Greenhouse",   patterns: ["greenhouse.io", "boards.greenhouse.io"] },
  LEVER:        { name: "Lever",        patterns: ["jobs.lever.co", "lever.co"] },
  TALEO:        { name: "Taleo",        patterns: ["taleo.net"] },
  ICIMS:        { name: "iCIMS",        patterns: ["icims.com"] },
  BAMBOOHR:     { name: "BambooHR",     patterns: ["bamboohr.com"] },
  SUCCESSFACTORS:{ name: "SAP SF",      patterns: ["successfactors.com", "successfactors.eu"] },
  SMARTRECRUITERS:{ name: "SmartRecruiters", patterns: ["smartrecruiters.com"] },
  INDEED:       { name: "Indeed",       patterns: ["indeed.com"] },
  LINKEDIN:     { name: "LinkedIn",     patterns: ["linkedin.com/jobs"] },
  ZIPRECRUITER: { name: "ZipRecruiter", patterns: ["ziprecruiter.com"] },
  JOBVITE:      { name: "Jobvite",      patterns: ["jobvite.com"] },
  CAREERPLUG:   { name: "CareerPlug",   patterns: ["careerplug.com"] },
  ASHBY:        { name: "Ashby",        patterns: ["ashbyhq.com"] },
  RIPPLING:     { name: "Rippling",     patterns: ["rippling.com"] },
};

const ASYNC_MESSAGE_TYPES = [
  MESSAGE_TYPE.GET_USER_PROFILE,
  MESSAGE_TYPE.SAVE_USER_PROFILE,
  MESSAGE_TYPE.GET_APP_HISTORY,
  MESSAGE_TYPE.ADD_APPLICATION,
  MESSAGE_TYPE.ATS_ENABLE,
  MESSAGE_TYPE.CONTENT_SCRIPT_LOAD,
  MESSAGE_TYPE.GET_ATS_STATUS,
  "ALL_FRAMES_FILL",
  "ALL_FRAMES_MANUAL",
  "ALL_FRAMES_DETECT",
  "ALL_FRAMES_CLEAR",
];

// ─── TAB STATE SERVICE ────────────────────────────────────────────────────────

class TabStateService {
  constructor() {
    // tabId -> { status, url, atsName, isApplying, fillStatus, frameStates: Map }
    this.tabData = new Map();
  }

  getTab(tabId) {
    if (!this.tabData.has(tabId)) {
      this.tabData.set(tabId, {
        status: TAB_STATUS.IDLE,
        url: "",
        atsName: null,
        isApplying: false,
        fillStatus: ATS_FILL_STATUS.IDLE,
        frameStates: new Map(),
      });
    }
    return this.tabData.get(tabId);
  }

  updateTab(tabId, data) {
    const tab = this.getTab(tabId);
    Object.assign(tab, data);
  }

  updateFrameState(tabId, frameId, data) {
    const tab = this.getTab(tabId);
    const existing = tab.frameStates.get(frameId) || {};
    tab.frameStates.set(frameId, { ...existing, ...data });
  }

  resetTab(tabId) {
    this.tabData.delete(tabId);
  }

  setApplying(tabId, isApplying) {
    this.updateTab(tabId, { isApplying });
  }

  detectAts(url) {
    if (!url) return null;
    for (const [key, ats] of Object.entries(KNOWN_ATS)) {
      if (ats.patterns.some(p => url.includes(p))) {
        return { key, ...ats };
      }
    }
    return null;
  }
}

// ─── USER DATA SERVICE ────────────────────────────────────────────────────────

class UserDataService {
  async getProfile() {
    const result = await chrome.storage.sync.get(["userProfile"]);
    return result.userProfile || null;
  }

  async saveProfile(profile) {
    await chrome.storage.sync.set({ userProfile: profile });
    return profile;
  }

  async getHistory(limit = 100) {
    const result = await chrome.storage.local.get(["appHistory"]);
    const history = result.appHistory || [];
    return history.slice(0, limit);
  }

  async addApplication(app) {
    const history = await this.getHistory();
    const entry = {
      ...app,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    };
    history.unshift(entry);
    if (history.length > 200) history.splice(200);
    await chrome.storage.local.set({ appHistory: history });
    return entry;
  }

  async getStats() {
    const history = await this.getHistory();
    const now = Date.now();
    const dayMs = 86400000;
    return {
      total: history.length,
      today: history.filter(h => now - h.timestamp < dayMs).length,
      thisWeek: history.filter(h => now - h.timestamp < dayMs * 7).length,
      thisMonth: history.filter(h => now - h.timestamp < dayMs * 30).length,
    };
  }
}

// ─── COMMON MODULE (keep-alive, utility) ──────────────────────────────────────

class CommonModule {
  constructor() {
    this.keepAlivePorts = new Map();
  }

  createKeepAlivePort(port) {
    const tabId = port.sender?.tab?.id;
    if (tabId) {
      this.keepAlivePorts.set(tabId, port);
      port.onDisconnect.addListener(() => {
        // Consume the error so Chrome doesn't log "Unchecked runtime.lastError"
        // when the page is moved into the back/forward cache and the channel closes.
        void chrome.runtime.lastError;
        void port.error;
        this.keepAlivePorts.delete(tabId);
      });
    }
  }

  processMessage(message, sender, sendResponse) {
    // No sync messages here
  }

  initHeartbeat() {
    chrome.alarms.create("HEARTBEAT", { periodInMinutes: 0.4 });
  }
}

// ─── ATS MODULE ───────────────────────────────────────────────────────────────

class AtsModule {
  constructor(tabStateService, userDataService) {
    this.tabState = tabStateService;
    this.userData = userDataService;
  }

  processMessage(message, sender, sendResponse) {
    const tabId = sender?.tab?.id;

    switch (message.type) {

      case MESSAGE_TYPE.CONTENT_SCRIPT_LOAD: {
        this._onContentScriptLoad(message, sender, sendResponse);
        return;
      }

      case MESSAGE_TYPE.ATS_ENABLE: {
        sendResponse({ success: true });
        return;
      }

      case MESSAGE_TYPE.ATS_AUTO_FILL_STATUS: {
        const { status, fieldInfo } = message.value || {};
        if (tabId) {
          this.tabState.updateTab(tabId, { fillStatus: status });
        }
        // Broadcast to popup if open
        this._broadcastToPopup(MESSAGE_TYPE.ATS_AUTO_FILL_STATUS, message.value);
        return;
      }

      case MESSAGE_TYPE.ATS_APPLICATION_COMPLETE: {
        if (tabId) {
          const tab = this.tabState.getTab(tabId);
          this.userData.addApplication({
            url: message.value?.url || sender?.tab?.url,
            title: message.value?.title || sender?.tab?.title,
            company: message.value?.company || "",
            atsName: tab.atsName,
            fieldsFilled: message.value?.fieldsFilled || 0,
          });
          this.tabState.updateTab(tabId, {
            isApplying: false,
            fillStatus: ATS_FILL_STATUS.COMPLETE,
          });
        }
        sendResponse({ success: true });
        return;
      }

      case MESSAGE_TYPE.GET_ATS_STATUS: {
        (async () => {
          const profile = await this.userData.getProfile();
          const stats = await this.userData.getStats();
          const tab = tabId ? this.tabState.getTab(tabId) : {};
          sendResponse({
            success: true,
            hasProfile: !!profile,
            stats,
            atsName: tab.atsName || null,
            isApplying: tab.isApplying || false,
            fillStatus: tab.fillStatus || ATS_FILL_STATUS.IDLE,
          });
        })();
        return;
      }

      case MESSAGE_TYPE.ADD_APPLICATION: {
        (async () => {
          const entry = await this.userData.addApplication(message.value || {});
          sendResponse({ success: true, entry });
        })();
        return;
      }
    }
  }

  async _onContentScriptLoad(message, sender, sendResponse) {
    const tabId = sender?.tab?.id;
    const url = message.value?.windowUrl || sender?.tab?.url || "";

    if (!tabId) { sendResponse({ success: false }); return; }

    // Detect ATS from URL
    const atsInfo = this.tabState.detectAts(url);
    this.tabState.updateTab(tabId, {
      url,
      atsName: atsInfo?.name || null,
      status: TAB_STATUS.COMPLETE,
    });

    // Load user profile
    const profile = await this.userData.getProfile();
    const tab = this.tabState.getTab(tabId);

    // Tell the content script what it needs to know
    sendResponse({
      success: true,
      hasProfile: !!profile,
      atsInfo,
      isApplying: tab.isApplying,
      user: profile ? {
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
      } : null,
    });
  }

  _broadcastToPopup(type, value) {
    chrome.runtime.sendMessage({ type, value }).catch(() => {
      // Popup not open — ignore
    });
  }
}

// ─── DATA MODULE ──────────────────────────────────────────────────────────────

class DataModule {
  constructor(userDataService) {
    this.userData = userDataService;
  }

  processMessage(message, sender, sendResponse) {
    // Guard against sending on a closed channel — sendResponse throws if the
    // message port closed before the async work resolves (e.g. the tab was
    // moved into the back/forward cache).
    const safeSend = (payload) => {
      try { sendResponse(payload); } catch (e) { /* port closed */ }
    };

    switch (message.type) {

      case MESSAGE_TYPE.GET_USER_PROFILE: {
        (async () => {
          const profile = await this.userData.getProfile();
          safeSend({ success: true, profile });
        })();
        return;
      }

      case MESSAGE_TYPE.SAVE_USER_PROFILE: {
        (async () => {
          const saved = await this.userData.saveProfile(message.value);
          // Push update to all active tabs
          chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
              chrome.tabs.sendMessage(tab.id, {
                type: MESSAGE_TYPE.USER_DATA_UPDATE,
                value: saved,
              }).catch(() => {});
            });
          });
          safeSend({ success: true, profile: saved });
        })();
        return;
      }

      case MESSAGE_TYPE.GET_APP_HISTORY: {
        (async () => {
          const history = await this.userData.getHistory();
          const stats = await this.userData.getStats();
          safeSend({ success: true, history, stats });
        })();
        return;
      }
    }
  }
}

// ─── ALL-FRAMES SERVICE ────────────────────────────────────────────────────────
// Job application forms frequently live inside an embedded iframe (e.g. the
// Greenhouse job_app embed on a company careers page), so popup and in-page
// dock actions must reach every frame. This is the single implementation of
// "enumerate frames -> message each one -> merge" used by both callers.

class AllFramesModule {
  constructor(userDataService) {
    this.userData = userDataService;
  }

  async _enumerateFrames(tabId) {
    const frames = await new Promise((resolve) => {
      chrome.webNavigation.getAllFrames({ tabId }, (result) => {
        if (chrome.runtime.lastError || !result) resolve([]);
        else resolve(result);
      });
    });
    const frameIds = new Set((frames || []).map(f => f.frameId));
    frameIds.add(0); // always include the top frame
    return Array.from(frameIds).sort((a, b) => a - b);
  }

  _sendToFrame(tabId, frameId, message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, { frameId }, (response) => {
        if (chrome.runtime.lastError) { void chrome.runtime.lastError; resolve(null); }
        else resolve(response || null);
      });
    });
  }

  async _activeTabId(sender) {
    if (sender?.tab?.id) return sender.tab.id;
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0]?.id || null;
  }

  async _roundTrip(tabId, type, value) {
    const frameIds = await this._enumerateFrames(tabId);
    const perFrame = {};
    let framesReached = 0, anySuccess = false, error = null;

    if (type === "FILL_JOB_APPLICATION" || type === "MANUAL_FILL_FORM") {
      let fieldsFilled = 0;
      for (const frameId of frameIds) {
        const resp = await this._sendToFrame(tabId, frameId, { type, value });
        if (!resp) continue;
        framesReached++;
        perFrame[frameId] = resp.fieldsFilled || 0;
        fieldsFilled += resp.fieldsFilled || 0;
        if (resp.success) anySuccess = true;
        if (resp.error && !error) error = resp.error;
      }
      return { success: anySuccess, fieldsFilled, framesReached, perFrame, error };
    }

    if (type === "DETECT_FORMS") {
      const forms = [];
      for (const frameId of frameIds) {
        const resp = await this._sendToFrame(tabId, frameId, { type, value });
        if (!resp) continue;
        framesReached++;
        if (Array.isArray(resp.forms)) forms.push(...resp.forms);
        if (resp.success) anySuccess = true;
      }
      return { success: anySuccess, forms, framesReached, perFrame, error };
    }

    // CLEAR_ALL_FORMS and anything else: just broadcast
    for (const frameId of frameIds) {
      const resp = await this._sendToFrame(tabId, frameId, { type, value });
      if (!resp) continue;
      framesReached++;
      if (resp.success) anySuccess = true;
    }
    return { success: anySuccess, framesReached, perFrame, error };
  }

  processMessage(message, sender, sendResponse) {
    const types = {
      ALL_FRAMES_FILL:   "FILL_JOB_APPLICATION",
      ALL_FRAMES_MANUAL: "MANUAL_FILL_FORM",
      ALL_FRAMES_DETECT: "DETECT_FORMS",
      ALL_FRAMES_CLEAR:  "CLEAR_ALL_FORMS",
    };
    const type = types[message.type];
    if (!type) return false;

    (async () => {
      const tabId = await this._activeTabId(sender);
      if (!tabId) { sendResponse({ success: false, error: "No active tab." }); return; }

      let value = message.value;

      // Full fill uses the freshest saved profile when the caller didn't pass
      // one (e.g. the in-page dock). value IS the profile object, so the
      // content script can adopt it directly.
      if (type === "FILL_JOB_APPLICATION" && !value) {
        value = await this.userData.getProfile();
      }

      let result = await this._roundTrip(tabId, type, value);

      // SPA forms (Greenhouse embed) can render after we first message the
      // frames. If nothing was filled, keep retrying briefly so a slow-hydrating
      // iframe still gets filled instead of silently reporting 0 fields.
      if (type === "FILL_JOB_APPLICATION" && result.fieldsFilled === 0) {
        for (let attempt = 1; attempt < 4; attempt++) {
          await new Promise(r => setTimeout(r, 1500));
          result = await this._roundTrip(tabId, type, value);
          if (result.fieldsFilled > 0) break;
        }
      }

      sendResponse({
        success: type !== "FILL_JOB_APPLICATION" ? result.success : result.fieldsFilled > 0,
        ...result,
      });
    })();
    return true; // keep channel open for async response
  }
}

// ─── MODULE REGISTRY ──────────────────────────────────────────────────────────

const tabStateService  = new TabStateService();
const userDataService  = new UserDataService();
const commonModule     = new CommonModule();
const atsModule        = new AtsModule(tabStateService, userDataService);
const dataModule       = new DataModule(userDataService);
const allFramesModule  = new AllFramesModule(userDataService);

const backgroundModules = [atsModule, dataModule, commonModule, allFramesModule];

// ─── CHROME EVENT HANDLERS ────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    // "Open popup" request from the in-page floating UI (best-effort).
    if (message.type === "OPEN_POPUP") {
      if (chrome.action?.openPopup) {
        chrome.action.openPopup().catch(() => {});
      }
      sendResponse({ success: true });
      return;
    }

    for (const mod of backgroundModules) {
      mod.processMessage(message, sender, sendResponse);
    }
    if (ASYNC_MESSAGE_TYPES.includes(message.type)) {
      return true; // Keep channel open for async response
    }
  } catch (err) {
    console.error("[jolly R] onMessage error:", err);
  }
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
    if (status === "loading") {
      tabStateService.updateTab(tabId, { status: TAB_STATUS.LOADING });
    } else if (status === "complete") {
      tabStateService.updateTab(tabId, { status: TAB_STATUS.COMPLETE });

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
    console.error("[jolly R] onUpdated:", err);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStateService.resetTab(tabId);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    chrome.tabs.sendMessage(tabId, {
      type: MESSAGE_TYPE.TAB_ACTIVATED,
      value: { tabId, url: tab.url },
    }).catch(() => {});
  } catch (err) { /* tab might be loading */ }
});

chrome.webNavigation.onBeforeNavigate.addListener(({ tabId, frameId }) => {
  if (frameId === 0) {
    tabStateService.updateTab(tabId, { status: TAB_STATUS.NAVIGATING });
  }
});

chrome.webNavigation.onCompleted.addListener(({ tabId, frameId, url }) => {
  tabStateService.updateFrameState(tabId, frameId, { status: TAB_STATUS.COMPLETE });
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  try {
    if (reason === "install") {
      // Set default config
      await chrome.storage.local.set({
        appHistory: [],
        config: { autoFill: true, showButton: true, theme: "light" },
      });
      // Open onboarding (optional)
      // chrome.tabs.create({ url: "onboarding.html" });
    } else if (reason === "update") {
      // Reload active tab to pick up new content script
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        chrome.tabs.reload(tabs[0].id);
      }
    }
    commonModule.initHeartbeat();
  } catch (err) {
    console.error("[jolly R] onInstalled:", err);
  }
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.clearAll();
  commonModule.initHeartbeat();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "HEARTBEAT") {
    // Keep service worker alive
  }
});

console.log("[jolly R] background service worker loaded v2.0");
