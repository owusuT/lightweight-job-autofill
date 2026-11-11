import { describe, it, expect } from 'vitest';
import {
  parseAgeLabel,
  normalizeJobUrl,
  rawPageJobToJob,
  mergeCapturedJobs,
  type RawPageJob,
} from './jobCapture';
import type { Job } from './types';

const DAY = 86400000;
const NOW = 1_800_000_000_000;

const baseRaw: RawPageJob = {
  title: 'Enterprise Systems Administrator',
  company: 'DoiT',
  location: 'Remote',
  url: 'https://www.glassdoor.co.uk/job-listing/enterprise-systems-administrator-doit-international-JV_KO0,32_KE33,51.htm?jl=1010294393585',
  ageLabel: '18d',
  salary: '£51k /yr Median',
  description: '  Windows\n and  Linux   administration  ',
};

describe('parseAgeLabel', () => {
  it('parses days, hours, weeks, months, and years', () => {
    expect(parseAgeLabel('18d', NOW)).toBe(NOW - 18 * DAY);
    expect(parseAgeLabel('3h', NOW)).toBe(NOW - 3 * 3600000);
    expect(parseAgeLabel('2w', NOW)).toBe(NOW - 14 * DAY);
    expect(parseAgeLabel('2mo', NOW)).toBe(NOW - 60 * DAY);
    expect(parseAgeLabel('1y', NOW)).toBe(NOW - 365 * DAY);
  });

  it('parses a trailing plus and is case-insensitive', () => {
    expect(parseAgeLabel('30D+', NOW)).toBe(NOW - 30 * DAY);
  });

  it('parses relative labels used by LinkedIn and Indeed', () => {
    expect(parseAgeLabel('Posted 6 days ago', NOW)).toBe(NOW - 6 * DAY);
    expect(parseAgeLabel('Just posted', NOW)).toBe(NOW);
    expect(parseAgeLabel('Today', NOW)).toBe(NOW);
    expect(parseAgeLabel('Yesterday', NOW)).toBe(NOW - DAY);
  });

  it('returns undefined for unknown labels', () => {
    expect(parseAgeLabel('Actively hiring', NOW)).toBeUndefined();
    expect(parseAgeLabel('', NOW)).toBeUndefined();
  });
});

describe('normalizeJobUrl', () => {
  it('reduces LinkedIn urls to the job view url', () => {
    expect(
      normalizeJobUrl(
        'https://www.linkedin.com/jobs/view/data-analytics-engineer-at-jmp-usa-4401234567/?eBP=abc&trackingId=xyz'
      )
    ).toBe('https://www.linkedin.com/jobs/view/4401234567/');
    expect(
      normalizeJobUrl('https://www.linkedin.com/jobs/search/?currentJobId=4401234567&keywords=engineer')
    ).toBe('https://www.linkedin.com/jobs/view/4401234567/');
  });

  it('reduces Indeed urls to the jk url', () => {
    expect(
      normalizeJobUrl('https://www.indeed.com/viewjob?jk=abc123&from=serp&vjs=3')
    ).toBe('https://www.indeed.com/viewjob?jk=abc123');
  });

  it('keeps the Glassdoor path and drops tracking params', () => {
    expect(
      normalizeJobUrl('https://www.glassdoor.co.uk/job-listing/x-JV_KO0,1.htm?jl=1010&srs=abc')
    ).toBe('https://www.glassdoor.co.uk/job-listing/x-JV_KO0,1.htm?jl=1010');
  });

  it('leaves unknown urls alone', () => {
    expect(normalizeJobUrl('https://example.com/jobs/1?x=2')).toBe('https://example.com/jobs/1?x=2');
  });
});

describe('rawPageJobToJob', () => {
  it('builds a job with the jl id, age, remote flag, salary, and clean description', () => {
    const job = rawPageJobToJob(baseRaw, NOW);
    expect(job).not.toBeNull();
    expect(job!.id).toBe('1010294393585');
    expect(job!.company).toBe('DoiT');
    expect(job!.location).toBe('Remote');
    expect(job!.remote).toBe(true);
    expect(job!.salary).toBe('£51k /yr Median');
    expect(job!.description).toBe('Windows and Linux administration');
    expect(job!.postedAt).toBe(NOW - 18 * DAY);
  });

  it('falls back to now when the age label is unknown', () => {
    const job = rawPageJobToJob({ ...baseRaw, ageLabel: 'Just posted' }, NOW);
    expect(job!.postedAt).toBe(NOW);
  });

  it('returns null without a title or url', () => {
    expect(rawPageJobToJob({ ...baseRaw, title: '' }, NOW)).toBeNull();
    expect(rawPageJobToJob({ ...baseRaw, url: '' }, NOW)).toBeNull();
  });

  it('caps the description at 8000 characters', () => {
    const job = rawPageJobToJob({ ...baseRaw, description: 'x'.repeat(9000) }, NOW);
    expect(job!.description).toHaveLength(8000);
  });

  it('uses LinkedIn and Indeed ids and normalizes their urls', () => {
    const linkedIn = rawPageJobToJob(
      {
        ...baseRaw,
        url: 'https://www.linkedin.com/jobs/view/data-analytics-engineer-4401234567/?trackingId=abc',
      },
      NOW
    );
    expect(linkedIn!.id).toBe('4401234567');
    expect(linkedIn!.url).toBe('https://www.linkedin.com/jobs/view/4401234567/');

    const indeed = rawPageJobToJob(
      { ...baseRaw, url: 'https://www.indeed.com/viewjob?jk=abc123&from=serp' },
      NOW
    );
    expect(indeed!.id).toBe('abc123');
    expect(indeed!.url).toBe('https://www.indeed.com/viewjob?jk=abc123');
  });

  it('prefers an absolute postedAt over the age label', () => {
    const postedAt = NOW - 2 * DAY;
    const job = rawPageJobToJob({ ...baseRaw, postedAt }, NOW);
    expect(job!.postedAt).toBe(postedAt);
  });
});

describe('mergeCapturedJobs', () => {
  const a: Job = { id: '1', title: 'A', company: 'A', location: '', url: 'https://x/1' };
  const b: Job = { id: '2', title: 'B', company: 'B', location: '', url: 'https://x/2' };

  it('prepends the new job', () => {
    expect(mergeCapturedJobs([a], b).map((j) => j.url)).toEqual([b.url, a.url]);
  });

  it('replaces an existing entry with the same url', () => {
    const updated = { ...a, title: 'A2' };
    expect(mergeCapturedJobs([a, b], updated)).toEqual([updated, b]);
  });

  it('caps the list', () => {
    expect(mergeCapturedJobs([a, b], b, 1)).toHaveLength(1);
  });

  it('dedupes and rewrites tracked LinkedIn urls', () => {
    const tracked: Job = {
      id: '7',
      title: 'Data Engineer',
      company: 'JMP USA',
      location: '',
      url: 'https://www.linkedin.com/jobs/view/data-engineer-4401234567/?trackingId=old',
    };
    const incoming: Job = {
      ...tracked,
      url: 'https://www.linkedin.com/jobs/view/4401234567/',
      title: 'Data Engineer (updated)',
    };
    const merged = mergeCapturedJobs([tracked, a], incoming);
    expect(merged).toHaveLength(2);
    expect(merged[0].title).toBe('Data Engineer (updated)');
    expect(merged[1]).toBe(a);
  });

  it('merges a batch of incoming jobs, deduping by url', () => {
    const updated = { ...a, title: 'A2' };
    const c: Job = { id: '3', title: 'C', company: 'C', location: '', url: 'https://x/3' };
    const merged = mergeCapturedJobs([a, b], [updated, c]);
    expect(merged.map((j) => j.url)).toEqual([updated.url, c.url, b.url]);
    expect(merged[0].title).toBe('A2');
  });

  it('dedupes duplicates inside one incoming batch', () => {
    const merged = mergeCapturedJobs([], [a, { ...a, title: 'A2' }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('A');
  });
});
