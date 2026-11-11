import { describe, it, expect } from 'vitest';
import { buildHistoryCSV } from './csv';
import type { ApplicationEntry } from './types';

describe('buildHistoryCSV', () => {
  it('returns empty string for empty history', () => {
    const csv = buildHistoryCSV([]);
    expect(csv).toBe('');
  });

  it('includes headers', () => {
    const history: ApplicationEntry[] = [
      { id: '1', timestamp: Date.now(), url: 'https://example.com', fieldsFilled: 5 },
    ];
    const csv = buildHistoryCSV(history);
    expect(csv).toContain('Date,Title,URL,ATS,Fields Filled');
  });

  it('quotes URLs properly', () => {
    const history: ApplicationEntry[] = [
      { id: '1', timestamp: Date.now(), url: 'https://example.com/job?id=123', fieldsFilled: 5 },
    ];
    const csv = buildHistoryCSV(history);
    expect(csv).toContain('"https://example.com/job?id=123"');
  });

  it('escapes quotes in titles', () => {
    const history: ApplicationEntry[] = [
      { id: '1', timestamp: Date.now(), url: 'https://example.com', title: 'Senior "Engineer"', fieldsFilled: 5 },
    ];
    const csv = buildHistoryCSV(history);
    expect(csv).toContain('"Senior ""Engineer"""');
  });

  it('includes ATS name when present', () => {
    const history: ApplicationEntry[] = [
      { id: '1', timestamp: Date.now(), url: 'https://example.com', atsName: 'Greenhouse', fieldsFilled: 5 },
    ];
    const csv = buildHistoryCSV(history);
    expect(csv).toContain('Greenhouse');
  });
});
