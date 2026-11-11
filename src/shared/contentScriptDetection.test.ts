import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
// @ts-expect-error jsdom v24 ships no bundled types
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import type { Profile } from './types';

const source = readFileSync(join(process.cwd(), 'contentScript.js'), 'utf8');

const fixture = `
  <span id="lbl1">Email Address</span>
  <input id="f1" aria-labelledby="lbl1">

  <fieldset>
    <legend>Mailing Address</legend>
    <input id="f2">
  </fieldset>

  <input id="f3" autocomplete="given-name">
  <input id="f4" autocomplete="organization-title">
  <input id="f5" data-automation-id="applyWorkAuthorization">

  <label for="f6">Postal Code</label>
  <input id="f6">

  <div>Phone Number</div>
  <input id="f7">

  <div>Professional Experience</div>
  <textarea id="f8"></textarea>

  <label for="f9">Desired Salary</label>
  <input id="f9">

  <input id="f10" placeholder="Notice period">

  <div aria-hidden="true">
    <label for="f11">Email</label>
    <input id="f11">
  </div>
`;

type Field = { type: string; label?: string; id?: string; name?: string };

async function runOnForm<T>(html: string, run: (send: (type: string, value?: Profile) => Promise<unknown>, document: Document) => Promise<T>): Promise<T> {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: 'https://careers.example.com/apply',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const listeners: Array<(message: { type: string; value?: Profile }, sender: unknown, send: (value: unknown) => void) => boolean | void> = [];

  const rect = { width: 100, height: 20, right: 100, bottom: 20, left: 0, top: 0, x: 0, y: 0 };
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect;
  window.HTMLElement.prototype.getClientRects = () => [window.HTMLElement.prototype.getBoundingClientRect()] as unknown as DOMRectList;
  window.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' }) as CSSStyleDeclaration;
  (window as unknown as { CSS: { escape: (value: string) => string } }).CSS = { escape: (value: string) => value };

  window.chrome = {
    runtime: {
      onMessage: { addListener: (fn: (typeof listeners)[number]) => listeners.push(fn) },
      sendMessage: (_message: unknown, callback?: (response: unknown) => void) => {
        callback?.({ success: true });
      },
      getURL: (path: string) => `chrome-extension://test/${path}`,
      connect: () => ({
        onDisconnect: { addListener: () => {} },
        onMessage: { addListener: () => {} },
        postMessage: () => {},
        disconnect: () => {},
      }),
      lastError: undefined,
    },
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      sync: { get: async () => ({}), set: async () => {} },
    },
  };

  window.eval(source);

  for (let attempt = 0; attempt < 20 && listeners.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (listeners.length === 0) throw new Error('content script never registered a message listener');

  try {
    return await run((type, value) => new Promise((resolve) => listeners[0]({ type, value }, {}, resolve)), window.document);
  } finally {
    dom.window.close();
  }
}

describe('generic field detection', () => {
  it('classifies an unfamiliar application form from label, autocomplete, and automation context', async () => {
    const response = await runOnForm(fixture, (send) => send('DETECT_FORMS')) as { forms: Field[] };
    const forms = response.forms;
    const byId = Object.fromEntries(forms.filter((field) => field.id).map((field) => [field.id, field.type]));

    expect(byId).toMatchObject({
      f1: 'email',
      f2: 'address',
      f3: 'first_name',
      f4: 'position',
      f5: 'work_authorization',
      f6: 'zip',
      f7: 'phone',
      f8: 'experience',
      f9: 'salary',
      f10: 'availability',
    });
    expect(byId.f11).toBeUndefined();
  });

  it('scans and writes the matching profile values without guessing availability', async () => {
    await runOnForm(`
      <form>
        <input id="name" autocomplete="section-applicant name">
        <input id="applicant" autocomplete="section-name email">
        <label>Reference email <input id="reference" type="email"></label>
        <label>LinkedIn Profile <input id="social" type="url" autocomplete="url"></label>
        <label>Work authorization
          <select id="authorization"><option value="">Choose</option><option value="1">Yes</option><option value="2">No</option></select>
        </label>
        <label>Availability <input id="available"></label>
        <fieldset disabled><input id="disabled" autocomplete="email"></fieldset>
      </form>`, async (send, document) => {
      const result = await send('FILL_JOB_APPLICATION', {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.test',
        referenceContact: 'reference@example.test',
        website: 'https://portfolio.example.test',
        linkedin: 'https://www.linkedin.com/in/ada-example',
        workAuthorization: 'Yes',
      });

      expect(result).toEqual({ success: true, fieldsFilled: 5 });
      const value = (id: string) => document.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value;
      expect(value('name')).toBe('Ada Lovelace');
      expect(value('applicant')).toBe('ada@example.test');
      expect(value('reference')).toBe('reference@example.test');
      expect(value('social')).toBe('https://www.linkedin.com/in/ada-example');
      expect(value('authorization')).toBe('1');
      expect(value('available')).toBe('');
      expect(value('disabled')).toBe('');
    });
  });
});
