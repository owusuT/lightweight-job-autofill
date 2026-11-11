import { describe, it, expect } from 'vitest';
import { timeAgo, domainFromUrl, escapeHtml } from './format';

describe('timeAgo', () => {
  it('returns "just now" for less than a minute', () => {
    const result = timeAgo(Date.now() - 30 * 1000);
    expect(result).toBe('now');
  });

  it('returns minutes for less than an hour', () => {
    const result = timeAgo(Date.now() - 30 * 60 * 1000);
    expect(result).toBe('30m');
  });

  it('returns hours for less than a day', () => {
    const result = timeAgo(Date.now() - 5 * 60 * 60 * 1000);
    expect(result).toBe('5h');
  });

  it('returns days for older timestamps', () => {
    const result = timeAgo(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(result).toBe('3d');
  });
});

describe('domainFromUrl', () => {
  it('extracts domain from URL', () => {
    const result = domainFromUrl('https://www.example.com/path');
    expect(result).toBe('example.com');
  });

  it('removes www prefix', () => {
    const result = domainFromUrl('https://www.example.com');
    expect(result).toBe('example.com');
  });

  it('handles URLs without www', () => {
    const result = domainFromUrl('https://example.com');
    expect(result).toBe('example.com');
  });

  it('returns original string on invalid URL', () => {
    const result = domainFromUrl('not-a-url');
    expect(result).toBe('not-a-url');
  });
});

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    const result = escapeHtml('A & B');
    expect(result).toBe('A &amp; B');
  });

  it('escapes less than', () => {
    const result = escapeHtml('<div>');
    expect(result).toBe('&lt;div&gt;');
  });

  it('escapes quotes', () => {
    const result = escapeHtml('"hello"');
    expect(result).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    const result = escapeHtml("it's");
    expect(result).toBe('it&#39;s');
  });

  it('handles null and undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});
