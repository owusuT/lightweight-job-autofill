// Jobs service: fetches and caches jobs from Arbeitnow API

import { MESSAGE_TYPE } from '../../shared/messages';
import type { Job } from '../../shared/types';
import { getLocal, setLocal } from '../../shared/storage';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_JOBS = 100;

interface ArbeitnowJob {
  id: string;
  title: string;
  company_name: string;
  location: string;
  remote: boolean;
  visa_sponsorship: boolean;
  description: string;
  url: string;
  created_at: string | number;
}

interface ArbeitnowResponse {
  data: ArbeitnowJob[];
}

// Arbeitnow returns `created_at` as Unix SECONDS (number), not milliseconds
// and not ISO text; `new Date(number)` treats it as ms and lands in 1970.
function parsePostedAt(raw: string | number | undefined): number {
  if (raw === undefined || raw === null || raw === "") return Date.now();
  const numeric = typeof raw === "number" ? raw : Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

interface JobCacheEntry {
  fetchedAt: number;
  jobs: Job[];
}

interface GetJobsRequest {
  query: string;
  remote?: boolean;
  visa?: boolean;
  limit?: number;
}

export class JobsModule {
  private async _buildCacheKey(request: GetJobsRequest): Promise<string> {
    const { query, remote = false, visa = false, limit = 50 } = request;
    return `${query}|${remote}|${visa}|${limit}`;
  }

  private async _getCache(key: string): Promise<JobCacheEntry | null> {
    const result = await getLocal<Record<string, JobCacheEntry>>({ jobCache: {} });
    const cache: Record<string, JobCacheEntry> = result.jobCache || {};
    const entry = cache[key];

    if (!entry) return null;

    const age = Date.now() - entry.fetchedAt;
    if (age > CACHE_TTL_MS) return null;

    return entry;
  }

  private async _setCache(key: string, jobs: Job[]): Promise<void> {
    const result = await getLocal<Record<string, JobCacheEntry>>({ jobCache: {} });
    const cache: Record<string, JobCacheEntry> = result.jobCache || {};
    cache[key] = {
      fetchedAt: Date.now(),
      jobs,
    };
    await setLocal({ jobCache: cache });
  }

  private _normalizeArbeitnowJob(raw: ArbeitnowJob): Job | null {
    if (!raw.title || !raw.url) return null;

    return {
      id: raw.id,
      title: raw.title,
      company: raw.company_name,
      location: raw.location,
      url: raw.url,
      description: raw.description,
      tags: [],
      postedAt: parsePostedAt(raw.created_at),
      remote: raw.remote,
      visaSponsorship: raw.visa_sponsorship,
    };
  }

  private async _fetchJobs(request: GetJobsRequest): Promise<{ success: boolean; jobs: Job[]; error?: string }> {
    const { query, remote = false, visa = false, limit = 50 } = request;

    try {
      const params = new URLSearchParams({
        search: query,
        remote: remote.toString(),
        visa_sponsorship: visa.toString(),
        limit: limit.toString(),
      });

      const response = await fetch(`https://www.arbeitnow.com/api/job-board-api?${params}`);

      if (!response.ok) {
        return { success: false, jobs: [], error: `HTTP ${response.status}` };
      }

      const data = (await response.json()) as ArbeitnowResponse;
      const rawJobs = data.data || [];

      // Normalize, filter, dedupe
      const jobsMap = new Map<string, Job>();
      for (const raw of rawJobs) {
        const job = this._normalizeArbeitnowJob(raw);
        if (job && !jobsMap.has(job.url)) {
          jobsMap.set(job.url, job);
        }
      }

      const jobs = Array.from(jobsMap.values()).slice(0, MAX_JOBS);
      return { success: true, jobs };
    } catch (error) {
      return {
        success: false,
        jobs: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  processMessage(
    message: { type: string; value?: unknown },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): boolean {
    if (message.type !== MESSAGE_TYPE.GET_JOBS) return false;

    const request = message.value as GetJobsRequest;
    if (!request || !request.query) {
      sendResponse({ success: false, error: 'Invalid request' });
      return true;
    }

    (async () => {
      const cacheKey = await this._buildCacheKey(request);
      const cached = await this._getCache(cacheKey);

      if (cached) {
        sendResponse({
          success: true,
          jobs: cached.jobs,
          fetchedAt: cached.fetchedAt,
          cached: true,
        });
        return;
      }

      const result = await this._fetchJobs(request);

      if (result.success && result.jobs.length > 0) {
        await this._setCache(cacheKey, result.jobs);
      }

      sendResponse({
        success: result.success,
        jobs: result.jobs,
        fetchedAt: Date.now(),
        cached: false,
        error: result.error,
      });
    })();

    return true;
  }
}
