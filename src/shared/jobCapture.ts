import type { Job } from './types';

export interface RawPageJob {
  title: string;
  company?: string;
  location?: string;
  url: string;
  ageLabel?: string;
  salary?: string;
  description?: string;
  remote?: boolean;
  postedAt?: number;
}

const DAY = 86400000;
const HOUR = 3600000;

export function parseAgeLabel(label: string, now: number = Date.now()): number | undefined {
  const value = (label || '').toLowerCase();
  if (/\b(just posted|today)\b/.test(value)) return now;
  if (/\byesterday\b/.test(value)) return now - DAY;
  const match = /(\d+)\s*(mo|[hdwy])/.exec(value);
  if (!match) return undefined;
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  const ms =
    unit === 'h'
      ? HOUR
      : unit === 'd'
        ? DAY
        : unit === 'w'
          ? 7 * DAY
          : unit === 'mo'
            ? 30 * DAY
            : 365 * DAY;
  return now - amount * ms;
}

function clean(text: string | undefined): string | undefined {
  const value = (text || '').replace(/\s+/g, ' ').trim();
  return value || undefined;
}

function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 31 + url.charCodeAt(i)) | 0;
  }
  return `captured-${Math.abs(hash).toString(36)}`;
}

function jobIdFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    const linkedIn = /\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/.exec(parsed.pathname);
    if (linkedIn) return linkedIn[1];
    const currentJobId = params.get('currentJobId');
    if (currentJobId && /^\d+$/.test(currentJobId)) return currentJobId;
    const indeed = params.get('jk') || params.get('vjk');
    if (indeed) return indeed;
    return params.get('jl') || params.get('jobListingId') || undefined;
  } catch {
    return undefined;
  }
}

export function normalizeJobUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
      const id = /\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/.exec(parsed.pathname)?.[1] || parsed.searchParams.get('currentJobId');
      if (id && /^\d+$/.test(id)) return `https://www.linkedin.com/jobs/view/${id}/`;
    }
    if (host === 'indeed.com' || host.endsWith('.indeed.com')) {
      const jk = parsed.searchParams.get('jk') || parsed.searchParams.get('vjk');
      if (jk) return `https://www.indeed.com/viewjob?jk=${encodeURIComponent(jk)}`;
    }
    if (host.includes('glassdoor.')) {
      const jl = parsed.searchParams.get('jl');
      if (jl) {
        parsed.search = `?jl=${jl}`;
        parsed.hash = '';
        return parsed.href;
      }
    }
  } catch {
    return url;
  }
  return url;
}

export function rawPageJobToJob(raw: RawPageJob, now: number = Date.now()): Job | null {
  const title = clean(raw.title);
  const sourceUrl = (raw.url || '').trim();
  if (!title || !sourceUrl) return null;
  const url = normalizeJobUrl(sourceUrl);

  const location = clean(raw.location) || '';
  return {
    id: jobIdFromUrl(url) || hashUrl(url),
    title,
    company: clean(raw.company) || '',
    location,
    url,
    description: clean(raw.description)?.slice(0, 8000),
    salary: clean(raw.salary),
    postedAt: raw.postedAt ?? parseAgeLabel(raw.ageLabel || '', now) ?? now,
    remote: raw.remote ?? /remote/i.test(location),
  };
}

export function mergeCapturedJobs(existing: Job[], incoming: Job | Job[], limit = 50): Job[] {
  const incomingJobs = Array.isArray(incoming) ? incoming : [incoming];
  const incomingUrls = new Set<string>();
  const normalized: Job[] = [];
  for (const job of incomingJobs) {
    const url = normalizeJobUrl(job.url);
    if (incomingUrls.has(url)) continue;
    incomingUrls.add(url);
    normalized.push({ ...job, url });
  }
  const kept: Job[] = [];
  for (const job of existing) {
    const url = normalizeJobUrl(job.url);
    if (incomingUrls.has(url)) continue;
    kept.push(url === job.url ? job : { ...job, url });
  }
  return [...normalized, ...kept].slice(0, limit);
}
