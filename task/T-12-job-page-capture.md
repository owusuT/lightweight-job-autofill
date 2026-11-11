# Job Page Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Glassdoor job on the current page to the Best Jobs side panel, scored with the existing local `scoreJob` model against the saved profile.

**Architecture:** The side panel asks the active tab's vanilla content script for a raw job; the content script reads Glassdoor DOM by `data-test`/`id` anchors; the side panel converts it with pure helpers, scores it, merges it into the list, and persists it to `chrome.storage.local.capturedJobs`.

**Tech Stack:** Chrome MV3, vanilla content script, React 18 + TypeScript + Vite, Vitest + jsdom.

**Spec:** `plan/job-page-capture.md`

## Global Constraints

- Do not run `git commit`; the owner has not asked for commits.
- Do not add `scripting`, `cookies`, or new host permissions.
- Do not add AI scoring; the rating is `scoreJob` only.
- Keep `contentScript.js` vanilla. It cannot import TypeScript.
- Extraction anchors: `data-test`, `id` prefixes, `class*="..."` partials, href patterns. Never full hashed classes like `JobCard_jobTitle__4_O4L`.
- Storage: `chrome.storage.local.capturedJobs`, `Job[]`, cap 50, dedupe by `url`.
- Salary text keeps the currency symbol: combine `SalaryEstimate_medianEstimate` and `SalaryEstimate_payPeriod` as `"£51k /yr Median"`.
- Captured jobs bypass the age filter and Min stars: hiding an explicitly captured job read as a broken capture.

## Review Focus

- Results page has several cards and no description; capture must still succeed and must pick one card, not throw.
- Unsupported page (no job title) must return `{ success: false, error }`, not a half-built job.
- Re-adding the same URL must keep one entry and show "Updated".
- An old captured job (e.g. `18d`) must stay visible when Age is set to 7 days.
- `£51k` and `£51,000` salary text must both count as salary info.

---

### Task 1: Pure capture helpers

**Files:**
- Create: `src/shared/jobCapture.ts`
- Test: `src/shared/jobCapture.test.ts`

**Interfaces:**
- Consumes: `Job` from `src/shared/types.ts`.
- Produces:
  - `interface RawPageJob { title: string; company?: string; location?: string; url: string; ageLabel?: string; salary?: string; description?: string; remote?: boolean }`
  - `parseAgeLabel(label: string, now?: number): number | undefined`
  - `rawPageJobToJob(raw: RawPageJob, now?: number): Job | null`
  - `mergeCapturedJobs(existing: Job[], incoming: Job, limit?: number): Job[]`

- [x] **Step 1: Write the failing tests**

Create `src/shared/jobCapture.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseAgeLabel, rawPageJobToJob, mergeCapturedJobs, type RawPageJob } from './jobCapture';
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

  it('returns undefined for unknown labels', () => {
    expect(parseAgeLabel('Just posted', NOW)).toBeUndefined();
    expect(parseAgeLabel('', NOW)).toBeUndefined();
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
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/shared/jobCapture.test.ts`
Expected: FAIL, cannot resolve `./jobCapture`.

- [x] **Step 3: Implement `src/shared/jobCapture.ts`**

Rules the tests pin:
- Whitespace collapse for `salary` and `description`; description `.slice(0, 8000)`.
- `parseAgeLabel` units: `h` hourly, `d` days, `w` weeks, `mo` months of 30 days, `y` years of 365 days; allow a trailing `+`; return `undefined` when no number+unit matches.
- `rawPageJobToJob` returns `null` when `title` or `url` is blank.
- `id`: `jl` query param, else `jobListingId` query param, else a simple deterministic hash of `url`.
- `postedAt`: `parseAgeLabel(ageLabel, now) ?? now`.
- `remote`: `raw.remote ?? /remote/i.test(raw.location || '')`.
- `mergeCapturedJobs`: `[incoming, ...existing.filter((j) => j.url !== incoming.url)].slice(0, limit)` with `limit = 50`.

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/shared/jobCapture.test.ts`
Expected: PASS.

---

### Task 2: Salary detection for non-dollar amounts

**Files:**
- Modify: `src/shared/score.ts:126-137`
- Test: `src/shared/score.test.ts`

**Interfaces:**
- Consumes: `scoreJob(job, profile)`.
- Produces: no new exports; `scoreSalary` keeps the `salary` part name and weight 5.

- [x] **Step 1: Write the failing test**

Append to `src/shared/score.test.ts` inside `describe('scoreJob', ...)`:

```ts
  it('counts a £ amount as salary info', () => {
    const scored = scoreJob({ ...job, description: undefined, salary: '£51k /yr Median' }, emptyProfile);
    expect(scored.breakdown.find((p) => p.name === 'salary')?.score).toBe(5);
  });

  it('counts a £ amount without a k suffix', () => {
    const scored = scoreJob({ ...job, description: undefined, salary: '£51,000' }, emptyProfile);
    expect(scored.breakdown.find((p) => p.name === 'salary')?.score).toBe(5);
  });
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/shared/score.test.ts`
Expected: the second test FAILS; the first passes via `\d+k`.

- [x] **Step 3: Implement the regex change**

In `scoreSalary`, change `hasSalary` to:

```ts
const hasSalary = /salary|compensation|[£$€]\s?\d|\d+k|\d+k-\d+k/.test(text);
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/shared/score.test.ts`
Expected: PASS.

---

### Task 3: Content script extraction + handler

**Files:**
- Modify: `contentScript.js:9-23` (message constants)
- Modify: `contentScript.js` (helpers + handler case near the existing listener at line ~1648)

**Interfaces:**
- Produces: message `CAPTURE_JOB`; response `{ success: true, job: RawPageJob } | { success: false, error: string }`.
- Consumes: nothing from Tasks 1-2 (it returns raw strings; conversion happens in Task 4).

- [x] **Step 1: Add the constant**

Add `CAPTURE_JOB: "CAPTURE_JOB",` to the `MESSAGE_TYPE` object.

- [x] **Step 2: Add `captureCurrentJob()` inside the IIFE**

Place it next to the other helper functions, before the message listener. It returns `RawPageJob` without parsing age or cleaning text.

Selector decisions (use in this order):
- Title elements: `[data-test="job-title"]`, `[data-test="jobTitle"]`, `h1`.
  For several `[data-test="job-title"]`, pick the first whose `getBoundingClientRect()` intersects the viewport, else the first.
- Card root: `titleEl.closest('[class*="JobCard"]') ?? document`.
- Company: `[data-test="employer-name"]`, `[data-test="employerName"]`, `[class*="compactEmployerName"]`, `[class*="EmployerProfile_employerName"]`; fallback `img[alt$=" Logo"]` alt with `" Logo"` removed.
- Location: `[data-test="emp-location"]`, `[data-test="location"]`, `[class*="JobDetails_location"]`.
- Age label: `[data-test="job-age"]`.
- Salary container: `[class*="SalaryEstimate_salaryEstimateNumber"]`; inside it read `[class*="SalaryEstimate_medianEstimate"]` and `[class*="SalaryEstimate_payPeriod"]`, join non-empty parts with one space.
- Description: `[data-test="jobDescriptionContent"]`, `[class*="JobDetails_jobDescription"]`, `#JobDescriptionContainer`, `[class*="jobDescription"]`; `""` when absent.
- URL: title element `href` resolved with `new URL(href, location.href).href`; else `[data-test="job-link"]` href; else `location.href`. Reject non-`http(s)`.
- Return `{ title, company, location, url, ageLabel, salary, description, remote: /remote/i.test(location) }`. Trim every text value. If `!title` return `{ success: false, error: "No job card found on this page. Open a Glassdoor job and try again." }`.

- [x] **Step 3: Add the handler case**

In the `chrome.runtime.onMessage` switch:

```js
case "CAPTURE_JOB": {
  try {
    sendResponse(captureCurrentJob());
  } catch (e) {
    sendResponse({ success: false, error: String((e && e.message) || e) });
  }
  break;
}
```

- [x] **Step 4: Syntax check**

Run: `node --check contentScript.js`
Expected: no output, exit 0.

---

### Task 4: Side panel wiring

**Files:**
- Modify: `src/shared/messages.ts` (add `CAPTURE_JOB`)
- Modify: `src/sidepanel/api.ts` (add `CaptureJobResponse` + `captureCurrentJob()`)
- Modify: `src/sidepanel/components/FilterBar.tsx` (add `onAddPage`, `adding`)
- Modify: `src/sidepanel/App.tsx` (load/persist/merge/score/notify)

**Interfaces:**
- Consumes: `CAPTURE_JOB`, `rawPageJobToJob`, `mergeCapturedJobs`, `scoreJob`, `sortJobs`.
- Produces: nothing downstream.

- [x] **Step 1: Add the message constant**

In `src/shared/messages.ts`, add `CAPTURE_JOB: "CAPTURE_JOB",` next to `GET_JOBS`.

- [x] **Step 2: Add the API call**

In `src/sidepanel/api.ts`:

```ts
import type { RawPageJob } from "../shared/jobCapture";

export interface CaptureJobResponse {
  success: boolean;
  job?: RawPageJob;
  error?: string;
}

export async function captureCurrentJob(): Promise<CaptureJobResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { success: false, error: "No active tab." };
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tab.id!, { type: MESSAGE_TYPE.CAPTURE_JOB }, (response) => {
        void chrome.runtime.lastError;
        resolve(response ?? { success: false, error: "Could not read this page. Reload it and try again." });
      });
    } catch {
      resolve({ success: false, error: "Extension context lost. Reload the panel." });
    }
  });
}
```

- [x] **Step 3: Add the button to `FilterBar`**

Add optional props `onAddPage?: () => void` and `adding?: boolean`. In the `.search-row`, after the Go button and before the close button:

```tsx
{onAddPage && (
  <button
    className="btn btn-ghost"
    onClick={onAddPage}
    disabled={adding}
    title="Add the job on the current page"
  >
    {adding ? "…" : "Add page"}
  </button>
)}
```

- [x] **Step 4: Wire state and merge in `App.tsx`**

Add imports from `../shared/jobCapture` and `captureCurrentJob` from `./api`. Add state:

```ts
const [capturedScored, setCapturedScored] = useState<ScoredJob[]>([]);
const [capturedUrls, setCapturedUrls] = useState<Set<string>>(new Set());
const [addingJob, setAddingJob] = useState(false);
```

Inside the mount effect, after `setProfile(p)`, load persisted jobs:

```ts
const storedCaptured = await chrome.storage.local.get(["capturedJobs"]);
const rawCaptured = Array.isArray(storedCaptured.capturedJobs)
  ? (storedCaptured.capturedJobs as Job[])
  : [];
if (rawCaptured.length) {
  setCapturedScored(sortJobs(rawCaptured.map((j) => scoreJob(j, p || {}))));
  setCapturedUrls(new Set(rawCaptured.map((j) => j.url)));
}
```

Add the merged list and replace the filter input of `visible`:

```ts
const merged = useMemo(() => {
  const byUrl = new Map<string, ScoredJob>();
  for (const job of [...capturedScored, ...jobs]) {
    if (!byUrl.has(job.url)) byUrl.set(job.url, job);
  }
  return sortJobs([...byUrl.values()]);
}, [capturedScored, jobs]);

const visible = useMemo(() => {
  const now = Date.now();
  return merged.filter((job) => {
    if (job.stars < prefs.minStars) return false;
    if (capturedUrls.has(job.url)) return true;
    const postedAt = job.postedAt || now;
    return now - postedAt <= prefs.maxAgeDays * 86400000;
  });
}, [merged, prefs.minStars, prefs.maxAgeDays, capturedUrls]);
```

Use `merged.length` where the empty-state message currently checks `jobs.length`.

Add the add handler:

```ts
const addCurrentJob = async () => {
  setAddingJob(true);
  const res = await captureCurrentJob();
  setAddingJob(false);
  if (!res.success || !res.job) {
    notify(res.error || "No job found on this page.");
    return;
  }
  const job = rawPageJobToJob(res.job);
  if (!job) {
    notify("Could not read the job on this page.");
    return;
  }
  const already = capturedUrls.has(job.url);
  const scored = scoreJob(job, profile || {});
  setCapturedScored((prev) => sortJobs([scored, ...prev.filter((j) => j.url !== job.url)]));
  setCapturedUrls((prev) => new Set(prev).add(job.url));
  const stored = await chrome.storage.local.get(["capturedJobs"]);
  const current = Array.isArray(stored.capturedJobs) ? (stored.capturedJobs as Job[]) : [];
  await chrome.storage.local.set({ capturedJobs: mergeCapturedJobs(current, job) });
  notify(
    `${already ? "Updated" : "Added"} “${job.title}” — ${scored.score}/100, ${scored.stars}★`,
  );
};
```

Pass `onAddPage={addCurrentJob}` and `adding={addingJob}` to `<FilterBar>`.

- [x] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

---

### Task 5: Verification and docs

**Files:**
- Modify: `AGENTS.md` (change-log entry)
- Modify: `task/current-tasks.md` (index T-12)
- Modify: `plan/react-migration/06-implementation-status.md` (status row) if the jobs table is the living status

- [x] **Step 1: Run the unit suite**

Run: `npm test`
Expected: all files pass, including the new `jobCapture.test.ts` and the two new salary tests.

- [x] **Step 2: Build**

Run: `npm run build`
Expected: exit 0. Confirm `dist/contentScript.js` contains `CAPTURE_JOB` and `dist/assets/*.js` contains `capturedJobs`.

- [x] **Step 3: Fixture check for the real selectors**

Create a temporary jsdom harness outside the repo (`%TEMP%\opencode\jr-capture-test\`) that:
1. Builds a document from the owner's Glassdoor card plus the `SalaryEstimate_salaryEstimateNumber` markup.
2. Provides a `chrome` stub with `runtime.onMessage.addListener`, `runtime.sendMessage`, `runtime.getURL`, `runtime.connect`, `storage.local`, and `storage.sync`.
3. Evaluates `contentScript.js` in that jsdom window.
4. Captures the registered listener and calls it with `{ type: "CAPTURE_JOB" }`.

Expected raw job:

```json
{
  "title": "Enterprise Systems Administrator",
  "company": "DoiT",
  "location": "Remote",
  "url": "https://www.glassdoor.co.uk/job-listing/enterprise-systems-administrator-doit-international-JV_KO0,32_KE33,51.htm?jl=1010294393585",
  "ageLabel": "18d",
  "salary": "£51k /yr Median",
  "remote": true
}
```

- [x] **Step 4: Manual Chrome check**

Reload the unpacked extension from `dist/`. Open a Glassdoor job, open Best Jobs, press **Add page**. Confirm the card appears with a score/stars, the salary chip/reason reflects the salary, and the job is still there after closing and reopening the panel. Repeat on a results page and confirm the first visible card is captured with same-day age.

- [x] **Step 5: Update docs**

Add a dated `AGENTS.md` entry listing `contentScript.js`, `src/shared/jobCapture.ts`, `src/shared/jobCapture.test.ts`, `src/shared/score.ts`, `src/shared/score.test.ts`, `src/shared/messages.ts`, `src/sidepanel/api.ts`, `src/sidepanel/App.tsx`, `src/sidepanel/components/FilterBar.tsx`, `plan/job-page-capture.md`, `task/T-12-job-page-capture.md`. Add T-12 to `task/current-tasks.md`.

---

## Addendum (2026-11-01): LinkedIn + Indeed support

Scope extended to job detail pages and search-result cards on LinkedIn and Indeed, alongside Glassdoor.

- `contentScript.js`: `captureCurrentJob()` now dispatches by host. Detail pages read `JobPosting` JSON-LD first (`@graph`/arrays, HTML description stripped, `baseSalary` as `50k`-style amounts, `datePosted` as `postedAt`, `jobLocationType` as remote) and fall back to DOM fields. LinkedIn detail uses `h1` (skipping the `aria-hidden` duplicate) plus company/location/description selectors; LinkedIn cards use the `Dismiss <title> job` aria-label plus the nearest card root. Indeed uses the `data-testid` header/description/salary fields and `div.job_seen_beacon[data-jk]` cards. Glassdoor is unchanged. Hashed classes are never used.
- `src/shared/jobCapture.ts`: `RawPageJob.postedAt`; `jobIdFromUrl` reads LinkedIn `/jobs/view/<id>`/`currentJobId` and Indeed `jk`/`vjk`; new `normalizeJobUrl` canonicalizes LinkedIn/Indeed/Glassdoor URLs and `mergeCapturedJobs` normalizes both sides. `parseAgeLabel` handles `Just posted`/`Today`/`Yesterday`.
- Tests: `jobCapture.test.ts` now 18 cases; new `src/shared/contentScriptCapture.test.ts` (6) evaluates the real content script in jsdom against LinkedIn card/detail, Indeed card/detail, Glassdoor card, and a no-job page.
- Verified: `npx tsc --noEmit` clean; `npm test` 112 tests / 13 files; `npm run build` copies the updated content script.
- Not verified: manual Chrome pass on signed-in LinkedIn and Indeed.

## Addendum (2026-11-01): current Indeed card markup

- Card root still .job_seen_beacon, but data-jk lives on a.jcs-JobTitle and the title is h3.jobTitle; selectors now accept both h3 and h2 plus a[data-jk] as the link fallback.
- text-location may include a jcs-commute-snippet (25 min) before the city; the adapter removes that snippet and the leading separator.
- Fixture in contentScriptCapture.test.ts replaced with the owner's live card markup; verified node --check, tsc --noEmit, 112 tests, and npm run build.

## Addendum (2026-11-01): Add page captures every card on results pages

- `CAPTURE_JOB` now returns `{ success, job, jobs }`: all job cards on LinkedIn/Indeed/Glassdoor results pages (deduped by URL); detail pages still return one job. JSON-LD and the canonical-URL rewrite only apply to single-job captures.
- Adapters refactored to per-root builders (`linkedInCards`, `indeedCards`, `genericJobs`); `mergeCapturedJobs` accepts `Job | Job[]`; the side panel scores/persists the whole batch and toasts `Captured N jobs from this page (M new)`.
- Verified: 118 tests / 14 files, `npm run build`. Not verified: live results page.

## Addendum (2026-11-03): Current LinkedIn and Glassdoor card markup

- LinkedIn root cause: the supplied card has no per-card link, and inline text joins to `herePosted 1 week ago`. The posted-age root check required a leading word boundary, missed the card root, and fell back to the dismiss button, which produced `No job found`. Removing only the leading boundary from the `posted` pattern restores card-root detection.
- Glassdoor root cause: the current title link has its own `JobCard_jobTitle` class, so `titleEl.closest('[class*="JobCard"]')` selected the link instead of the outer card. Starting from `titleEl.parentElement` captures the outer card. The employer salary now also accepts the stable `data-test="detailSalary"` attribute.
- Tests: `contentScriptCapture.test.ts` is now 17 tests, including the supplied linkless LinkedIn card with `currentJobId` and the supplied Glassdoor card with company, location, age, URL, and employer-provided salary.
- Verified: `node --check contentScript.js`; `npx tsc --noEmit`; 131 tests / 14 files; `npm run build` copies the updated content script.
- Not verified: live signed-in LinkedIn and Glassdoor runs.
- Support remains host-specific: LinkedIn, Indeed, and Glassdoor use adapters; other boards use the generic best-effort path, and capture reads only the top frame.

## Addendum (2026-11-06): LinkedIn search pages and Clear added

- Root cause: `currentJobId` makes a LinkedIn `/jobs/search/` page look like a detail page. Routing captured the open detail pane, and the canonical-URL rewrite replaced card URLs, so Add page never returned the visible result cards.
- Fix: new `isLinkedInSearch` path check. Search pages capture `linkedInCards()` first and fall back to `linkedInDetail()` only when no cards exist. The canonical-URL rewrite runs only when `isDetail && !isLinkedInSearch`.
- Fix: `cardRootFor` falls back to `el.closest("li")` when no ancestor holds a job link or posted-age text, so linkless LinkedIn list items still capture.
- New "Clear added" button in `FilterBar`; `App.clearAddedJobs` removes `storage.local.capturedJobs` and resets captured state without touching search results.
- Tests: `contentScriptCapture.test.ts` 19 (search-results prefers cards; linkless list item), new `FilterBar.test.tsx` 2 (clears added, hides when empty).
- Verified: `node --check contentScript.js`; `npx tsc --noEmit`; 135 tests / 15 files; `npm run build`.
- Not verified: live signed-in LinkedIn search page with an open detail pane.
