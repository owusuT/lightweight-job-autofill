// User data storage service

import type { Profile, ApplicationEntry } from '../../shared/types';

export class UserDataService {
  private _writeQueue: Promise<unknown> = Promise.resolve();

  async getProfile(): Promise<Profile | null> {
    const result = await chrome.storage.sync.get(['userProfile']);
    return result.userProfile || null;
  }

  async saveProfile(profile: Profile): Promise<Profile> {
    await chrome.storage.sync.set({ userProfile: profile });
    return profile;
  }

  async getHistory(limit = Infinity): Promise<ApplicationEntry[]> {
    const result = await chrome.storage.local.get(['appHistory']);
    const history: ApplicationEntry[] = result.appHistory || [];
    return Number.isFinite(limit) ? history.slice(0, limit) : history;
  }

  addApplication(app: Partial<ApplicationEntry>): Promise<ApplicationEntry> {
    const task = this._writeQueue.then(async () => {
      const history = await this.getHistory();
      const entry: ApplicationEntry = {
        ...app,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        url: app.url || '',
        fieldsFilled: app.fieldsFilled || 0,
        status: app.status || 'submitted',
      };
      history.unshift(entry);
      // Trim on write only; reads must never truncate stored data.
      history.length = Math.min(history.length, 200);
      await chrome.storage.local.set({ appHistory: history });
      return entry;
    });
    this._writeQueue = task.catch(() => undefined);
    return task;
  }

  async getStats(): Promise<{ total: number; today: number; thisWeek: number; thisMonth: number }> {
    const history = await this.getHistory();
    // Older entries have no status; treat those as submitted.
    const applications = history.filter((h) => h.status !== 'filled');
    const now = Date.now();
    const dayMs = 86400000;
    return {
      total: applications.length,
      today: applications.filter((h) => now - h.timestamp < dayMs).length,
      thisWeek: applications.filter((h) => now - h.timestamp < dayMs * 7).length,
      thisMonth: applications.filter((h) => now - h.timestamp < dayMs * 30).length,
    };
  }
}
