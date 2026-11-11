import { describe, it, expect } from 'vitest';
import { scoreJob, sortJobs, withResumeInfo } from './score';
import type { Job, Profile } from './types';

describe('withResumeInfo', () => {
  it('returns the profile unchanged without resume info', () => {
    const profile: Profile = { skills: 'python, sql', position: 'Data Engineer' };
    expect(withResumeInfo(profile, null)).toBe(profile);
  });

  it('merges resume skills and dedupes, keeping profile values', () => {
    const profile: Profile = { skills: 'python, sql', position: 'Data Engineer' };
    const merged = withResumeInfo(profile, { skills: ['Python', 'dbt', 'airflow'], position: 'Analytics Engineer' });
    expect(merged.skills).toBe('python, sql, Python, dbt, airflow');
    expect(merged.position).toBe('Data Engineer');
  });

  it('falls back to the resume position when the profile has none', () => {
    const merged = withResumeInfo({}, { skills: [], positions: ['Backend Developer'] });
    expect(merged.position).toBe('Backend Developer');
  });

  it('raises the score for a job matching resume skills', () => {
    const job: Job = { id: '1', title: 'dbt Analytics Engineer', company: 'X', location: '', url: 'https://x/1', description: 'We use dbt and airflow daily.' };
    const without = scoreJob(job, { skills: '' });
    const withResume = scoreJob(job, withResumeInfo({}, { skills: ['dbt', 'airflow'] }));
    expect(withResume.score).toBeGreaterThan(without.score);
  });
});

describe('scoreJob', () => {
  const emptyProfile: Profile = {};

  const job: Job = {
    id: '1',
    title: 'Senior React Engineer',
    company: 'Tech Corp',
    location: 'Berlin, Germany',
    url: 'https://example.com/job/1',
    description: 'React and TypeScript development',
    tags: ['React', 'TypeScript'],
    postedAt: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
    remote: true,
  };

  it('returns a score between 0 and 100', () => {
    const scored = scoreJob(job, emptyProfile);
    expect(scored.score).toBeGreaterThanOrEqual(0);
    expect(scored.score).toBeLessThanOrEqual(100);
  });

  it('returns stars between 1 and 5', () => {
    const scored = scoreJob(job, emptyProfile);
    expect(scored.stars).toBeGreaterThanOrEqual(1);
    expect(scored.stars).toBeLessThanOrEqual(5);
  });

  it('includes all seven score parts', () => {
    const scored = scoreJob(job, emptyProfile);
    expect(scored.breakdown).toHaveLength(7);
    const partNames = scored.breakdown.map((p) => p.name);
    expect(partNames).toContain('title');
    expect(partNames).toContain('skills');
    expect(partNames).toContain('location');
    expect(partNames).toContain('remote');
    expect(partNames).toContain('recency');
    expect(partNames).toContain('visa');
    expect(partNames).toContain('salary');
  });

  it('gives full title points for exact match', () => {
    const profile: Profile = { position: 'Senior React Engineer' };
    const scored = scoreJob(job, profile);
    const titlePart = scored.breakdown.find((p) => p.name === 'title');
    expect(titlePart?.score).toBe(30);
  });

  it('gives full recency points for jobs under 3 days', () => {
    const recentJob: Job = { ...job, postedAt: Date.now() - 1 * 24 * 60 * 60 * 1000 };
    const scored = scoreJob(recentJob, emptyProfile);
    const recencyPart = scored.breakdown.find((p) => p.name === 'recency');
    expect(recencyPart?.score).toBe(10);
  });

  it('gives partial recency points for older jobs', () => {
    const oldJob: Job = { ...job, postedAt: Date.now() - 10 * 24 * 60 * 60 * 1000 };
    const scored = scoreJob(oldJob, emptyProfile);
    const recencyPart = scored.breakdown.find((p) => p.name === 'recency');
    expect(recencyPart?.score).toBe(4);
  });

  it('scores remote preference correctly', () => {
    const remoteProfile: Profile = { workType: 'Remote' };
    const scored = scoreJob(job, remoteProfile);
    const remotePart = scored.breakdown.find((p) => p.name === 'remote');
    expect(remotePart?.score).toBe(10);
  });

  it('matches skills from description', () => {
    const profile: Profile = { skills: 'React, TypeScript, Node.js' };
    const scored = scoreJob(job, profile);
    const skillsPart = scored.breakdown.find((p) => p.name === 'skills');
    expect(skillsPart?.score).toBeGreaterThan(0);
  });

  it('counts a £ amount as salary info', () => {
    const scored = scoreJob({ ...job, description: undefined, salary: '£51k /yr Median' }, emptyProfile);
    expect(scored.breakdown.find((p) => p.name === 'salary')?.score).toBe(5);
  });

  it('counts a £ amount without a k suffix', () => {
    const scored = scoreJob({ ...job, description: undefined, salary: '£51,000' }, emptyProfile);
    expect(scored.breakdown.find((p) => p.name === 'salary')?.score).toBe(5);
  });
});

describe('sortJobs', () => {
  const jobs: Job[] = [
    {
      id: '1',
      title: 'Junior Developer',
      company: 'A Corp',
      location: 'Berlin',
      url: 'https://example.com/1',
      postedAt: Date.now() - 10 * 24 * 60 * 60 * 1000,
    },
    {
      id: '2',
      title: 'Senior Developer',
      company: 'B Corp',
      location: 'Berlin',
      url: 'https://example.com/2',
      postedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
    },
  ];

  it('sorts by score descending', () => {
    const profile: Profile = { position: 'Senior Developer' };
    const scored = jobs.map((j) => scoreJob(j, profile));
    const sorted = sortJobs(scored);
    expect(sorted[0].score).toBeGreaterThanOrEqual(sorted[1].score);
  });

  it('breaks ties by recency', () => {
    const profile: Profile = {};
    const scored = jobs.map((j) => scoreJob(j, profile));
    const sorted = sortJobs(scored);
    expect(sorted[0].postedAt).toBeGreaterThanOrEqual(sorted[1].postedAt || 0);
  });
});
