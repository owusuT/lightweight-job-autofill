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

async function runOnForm<T>(html: string, run: (send: (type: string, value?: unknown) => Promise<unknown>, document: Document) => Promise<T>, stored: Record<string, unknown> = {}): Promise<T> {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: 'https://careers.example.com/apply',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const listeners: Array<(message: { type: string; value?: unknown }, sender: unknown, send: (value: unknown) => void) => boolean | void> = [];

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
      local: { get: async () => stored, set: async (value: Record<string, unknown>) => Object.assign(stored, value) },
      sync: { get: async () => ({}), set: async () => {} },
    },
  };

  window.eval(source);

  for (let attempt = 0; attempt < 20 && listeners.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (listeners.length === 0) throw new Error('content script never registered a message listener');

  try {
    expect(window.document.getElementById('jolly-r-root')).toBeNull();
    return await run((type, value) => new Promise((resolve) => listeners[0]({ type, value }, {}, resolve)), window.document);
  } finally {
    dom.window.close();
  }
}

describe('generic field detection', () => {
  it('fills exact chosen employer answers and leaves unrelated profile fields alone', async () => {
    const question = "Are you currently an employee of Lowe's?";
    await runOnForm(`<label for="employee">${question}*</label>
      <select id="employee" required><option value="">Select One</option><option value="yes">Yes</option><option value="no">No</option></select>
      <label>First name <input id="first" autocomplete="given-name"></label>
      <label>What are the last 4 digits of your Social Security Number (SSN)?*<input id="identity" required></label>`, async (send, document) => {
      const scan = await send('APPLICATION_QUESTIONS') as { questions: Array<{ question: string; options: string[]; sensitive: boolean }> };
      expect(scan.questions[0]).toMatchObject({ question: `${question}*`, options: ['Yes', 'No'] });
      expect(scan.questions.find(row => row.question.includes('SSN'))?.sensitive).toBe(true);
      const result = await send('APPLICATION_APPLY_ANSWERS', {
        profile: { firstName: 'Ada', lastName: 'Lovelace' },
        answers: [{ question, origin: 'https://careers.example.com', answer: 'No' }],
      });
      expect(result).toMatchObject({ fieldsFilled: 1 });
      expect(document.querySelector<HTMLSelectElement>('#employee')?.value).toBe('no');
      expect(document.querySelector<HTMLInputElement>('#first')?.value).toBe('');
      expect(document.querySelector<HTMLInputElement>('#identity')?.value).toBe('');
    });
  });

  it('handles a Workday style Select One button with a self-referencing label', async () => {
    const question = "Do you currently reside in the same household with someone currently employed at Lowe's?";
    await runOnForm(`<label id="household-label">${question}*</label>
      <button type="button" id="household" aria-haspopup="listbox" aria-required="true" aria-controls="choices" aria-labelledby="household-label household">Select One</button>
      <div id="choices" role="listbox"><div role="option">Not applicable</div><div id="no" role="option">No</div></div>`, async (send, document) => {
      const button = document.querySelector<HTMLButtonElement>('#household');
      document.getElementById('no')?.addEventListener('click', () => { if (button) button.textContent = 'No'; });
      const result = await send('APPLICATION_APPLY_ANSWERS', {
        profile: {}, answers: [{ question, answer: 'No', origin: 'https://careers.example.com' }],
      });
      expect(result).toMatchObject({ fieldsFilled: 1 });
      expect(button?.textContent).toBe('No');
      const scan = await send('APPLICATION_QUESTIONS') as { questions: Array<{ question: string }> };
      expect(scan.questions[0].question).toBe(`${question}*`);
    });
  });

  it('uses remembered answers only for the same question and website', async () => {
    const question = "Are you currently employed?";
    await runOnForm(`<label>${question}<select id="employment"><option value="">Select One</option><option value="y">Yes</option></select></label>
      <label>Are you currently an employee of Lowe's?*<select id="lowes"><option value="">Select One</option><option value="y">Yes</option></select></label>`, async (send, document) => {
      await send('AUTOMATION_FILL', {});
      expect(document.querySelector<HTMLSelectElement>('#employment')?.value).toBe('y');
      expect(document.querySelector<HTMLSelectElement>('#lowes')?.value).toBe('');
    }, { applicationAnswers: [
      { question, answer: 'Yes', origin: 'https://careers.example.com' },
      { question: "Are you currently an employee of Lowe's?", answer: 'Yes', origin: 'https://another-employer.example.com' },
    ] });
  });

  it('keeps separate agreement notices distinct when their field labels match', async () => {
    await runOnForm(`<div data-automation-id="richText">Drug testing release</div>
      <div data-automation-id="formField-one"><label>I acknowledge<select id="drug"><option value="">Select One</option><option>Yes</option></select></label></div>
      <div data-automation-id="richText">Electronic monitoring notice</div>
      <div data-automation-id="formField-two"><label>I acknowledge<select id="monitoring"><option value="">Select One</option><option>Yes</option></select></label></div>`, async (send, document) => {
      const scan = await send('APPLICATION_QUESTIONS') as { questions: Array<{ question: string }> };
      expect(scan.questions.map(item => item.question)).toEqual(['Drug testing release\nI acknowledge', 'Electronic monitoring notice\nI acknowledge']);
      await send('APPLICATION_APPLY_ANSWERS', { profile: {}, answers: [
        { question: scan.questions[0].question, answer: 'Yes', origin: 'https://careers.example.com' },
      ] });
      expect(document.querySelector<HTMLSelectElement>('#drug')?.value).toBe('Yes');
      expect(document.querySelector<HTMLSelectElement>('#monitoring')?.value).toBe('');
    });
  });

  it('does not infer employment facts, identity details, or agreement answers from profile text', async () => {
    await runOnForm(`<input autocomplete="given-name" id="first">
      <label>What are the last 4 digits of your Social Security Number (SSN)?*<input id="ssn"></label>
      <label>What is the month and day of your date of birth?<input id="birth"></label>
      <label>Please enter your full legal name as evidence you have read and agree with the above release.*<input id="release"></label>
      <label>Do you have any current or prior work experience with ADG or FBM?<input id="history"></label>`, async (send, document) => {
      await send('AUTOMATION_FILL', { firstName: 'Ada', lastName: 'Lovelace', experience: 'Engineering' });
      expect(document.querySelector<HTMLInputElement>('#first')?.value).toBe('Ada');
      for (const id of ['ssn', 'birth', 'release', 'history']) expect(document.querySelector<HTMLInputElement>(`#${id}`)?.value).toBe('');
    });
  });
  it('automatically fills a step, preserves an existing answer, and clicks Next', async () => {
    await runOnForm(`<form>
      <label>First name <input id="first" autocomplete="given-name" required></label>
      <label>Email <input id="email" type="email" required value="custom@example.test"></label>
      <button type="button" id="next">Next</button>
      <button type="button" id="submit">Submit application</button>
    </form>`, async (send, document) => {
      let nextClicks = 0;
      let submitClicks = 0;
      document.getElementById('next')?.addEventListener('click', () => { nextClicks++; });
      document.getElementById('submit')?.addEventListener('click', () => { submitClicks++; });
      const first = await send('AUTOMATION_INSPECT') as { signature: string; missing: string[] };
      expect(first.missing).toContain('First name');
      expect(await send('AUTOMATION_ADVANCE', { signature: first.signature })).toEqual({ clicked: false });
      await send('AUTOMATION_FILL', { firstName: 'Ada', email: 'saved@example.test' } satisfies Profile);
      const filled = await send('AUTOMATION_INSPECT') as { signature: string; missing: string[] };
      expect(filled.missing).toEqual([]);
      expect(document.querySelector<HTMLInputElement>('#email')?.value).toBe('custom@example.test');
      expect(await send('AUTOMATION_ADVANCE', { signature: filled.signature })).toEqual({ clicked: true });
      expect(nextClicks).toBe(1);
      expect(submitClicks).toBe(0);
    });
  });

  it('pauses on a sign-in screen and leaves the final submit button alone', async () => {
    await runOnForm('<input type="password"><button>Submit application</button>', async send => {
      const inspection = await send('AUTOMATION_INSPECT') as { signature: string; blockers: string[]; review: boolean };
      expect(inspection.blockers[0]).toContain('sign in');
      expect(inspection.review).toBe(true);
      expect(await send('AUTOMATION_ADVANCE', { signature: inspection.signature })).toEqual({ clicked: false });
    });
  });
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
