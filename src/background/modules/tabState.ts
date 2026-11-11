// Tab state management service

export const TAB_STATUS = {
  IDLE: 'IDLE',
  LOADING: 'LOADING',
  NAVIGATING: 'NAVIGATING',
  COMPLETE: 'COMPLETE',
  REDIRECTING: 'REDIRECTING',
} as const;

export const ATS_POPUP_MODE = {
  DISABLED: 'DISABLED',
  BUTTON: 'BUTTON',
  EXPANDED: 'EXPANDED',
} as const;

export const ATS_FILL_STATUS = {
  IDLE: 'IDLE',
  DETECTING: 'DETECTING',
  FILLING: 'FILLING',
  COMPLETE: 'COMPLETE',
  ERROR: 'ERROR',
} as const;

export const KNOWN_ATS = {
  WORKDAY: { name: 'Workday', patterns: ['myworkdayjobs.com', 'workday.com'] },
  GREENHOUSE: { name: 'Greenhouse', patterns: ['greenhouse.io', 'boards.greenhouse.io'] },
  LEVER: { name: 'Lever', patterns: ['jobs.lever.co', 'lever.co'] },
  TALEO: { name: 'Taleo', patterns: ['taleo.net'] },
  ICIMS: { name: 'iCIMS', patterns: ['icims.com'] },
  BAMBOOHR: { name: 'BambooHR', patterns: ['bamboohr.com'] },
  SUCCESSFACTORS: { name: 'SAP SF', patterns: ['successfactors.com', 'successfactors.eu'] },
  SMARTRECRUITERS: { name: 'SmartRecruiters', patterns: ['smartrecruiters.com'] },
  INDEED: { name: 'Indeed', patterns: ['indeed.com'] },
  LINKEDIN: { name: 'LinkedIn', patterns: ['linkedin.com/jobs'] },
  ZIPRECRUITER: { name: 'ZipRecruiter', patterns: ['ziprecruiter.com'] },
  JOBVITE: { name: 'Jobvite', patterns: ['jobvite.com'] },
  CAREERPLUG: { name: 'CareerPlug', patterns: ['careerplug.com'] },
  ASHBY: { name: 'Ashby', patterns: ['ashbyhq.com'] },
  RIPPLING: { name: 'Rippling', patterns: ['rippling.com'] },
} as const;

interface TabData {
  status: string;
  url: string;
  atsName: string | null;
  isApplying: boolean;
  fillStatus: string;
  frameStates: Map<number, Record<string, unknown>>;
}

export class TabStateService {
  private tabData = new Map<number, TabData>();

  getTab(tabId: number): TabData {
    if (!this.tabData.has(tabId)) {
      this.tabData.set(tabId, {
        status: TAB_STATUS.IDLE,
        url: '',
        atsName: null,
        isApplying: false,
        fillStatus: ATS_FILL_STATUS.IDLE,
        frameStates: new Map(),
      });
    }
    return this.tabData.get(tabId)!;
  }

  updateTab(tabId: number, data: Partial<TabData>): void {
    const tab = this.getTab(tabId);
    Object.assign(tab, data);
  }

  updateFrameState(tabId: number, frameId: number, data: Record<string, unknown>): void {
    const tab = this.getTab(tabId);
    const existing = tab.frameStates.get(frameId) || {};
    tab.frameStates.set(frameId, { ...existing, ...data });
  }

  resetTab(tabId: number): void {
    this.tabData.delete(tabId);
  }

  setApplying(tabId: number, isApplying: boolean): void {
    this.updateTab(tabId, { isApplying });
  }

  detectAts(url: string): { key: string; name: string; patterns: readonly string[] } | null {
    if (!url) return null;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    const matches = (pattern: string): boolean => {
      const p = pattern.toLowerCase();
      if (p.includes('/')) {
        const [patternHost, ...rest] = p.split('/');
        const patternPath = '/' + rest.join('/');
        const hostMatches = host === patternHost || host.endsWith('.' + patternHost);
        return hostMatches && path.startsWith(patternPath);
      }
      return host === p || host.endsWith('.' + p);
    };

    for (const [key, ats] of Object.entries(KNOWN_ATS)) {
      if (ats.patterns.some(matches)) {
        return { key, ...ats };
      }
    }
    return null;
  }
}
