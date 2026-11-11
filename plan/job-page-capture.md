# Design: Capture the job on the current page into Best Jobs

Date: 2026-11-01
Updated: 2026-11-03
Status: implemented (T-12; manual Chrome check pending)

## Intent

The user browses a job on Glassdoor, LinkedIn, or Indeed and wants it in the
Best Jobs side panel, ranked against the saved profile, without waiting for the
Arbeitnow feed to carry it.

## Goals

- One button, "Add page", captures every job card on a results page, or the single job on a detail page.
- Works on job detail pages and on search-result cards for Glassdoor, LinkedIn,
  and Indeed.
- The job is scored with the existing local `scoreJob` model against the saved
  profile (position, skills, location, remote, recency, visa, salary).
- The captured job appears in Best Jobs immediately and survives reopening the
  panel.

## Non-goals

- No AI scoring, no per-job AI call.
- No universal scraper. LinkedIn, Indeed, and Glassdoor have host adapters.
  Other job boards use a best-effort generic path.
- No new host permissions, no `scripting` permission, no background fetch.

## Constraints

- `contentScript.js` is vanilla and is copied in by `npm run build`; it cannot
  import TypeScript. Extraction lives there.
- Class names on all three sites are hashed (`JobCard_jobTitle__4_O4L`,
  LinkedIn `b6bayf`, Indeed `job_seen_beacon` churn). Extraction keys off
  JSON-LD, `data-test`/`data-testid`, `aria-label`, `id` prefixes, and href
  patterns. Never full hashed classes.
- The saved profile is the resume-derived data: popup resume upload fills
  position, skills, and experience, so `scoreJob` already ranks "from resume".

## Approach (owner picked option 1)

Side panel button → active tab → content script reads the job → side panel
scores and persists.

## Decisions

- Rating is the existing deterministic `scoreJob`. No AI.
- A detail page returns one job. A results page returns every card the host
  adapter recognizes.
- Persist to `chrome.storage.local.capturedJobs` as `Job[]`, capped at 50.
  Re-score against the current profile on every panel open.
- Captured jobs skip the age filter so an explicit add cannot silently
  disappear; they also bypass Min stars, since hiding an explicitly captured
  job reads as a broken capture.
- Dedupe by `url`. Re-adding the same URL updates it and shows "Already in
  list".

## How it works

1. `src/sidepanel/components/FilterBar.tsx`: add an "Add page" button next to
   Go, disabled while adding.
2. `src/sidepanel/api.ts`: `captureCurrentJob()` queries the active tab and
   sends `CAPTURE_JOB` to its top frame.
3. `src/shared/messages.ts`: add `CAPTURE_JOB`.
4. `contentScript.js`: `captureCurrentJob()` dispatches by host and by page type.
   - **Detail pages** read the `JobPosting` JSON-LD block first (`@graph` and
     arrays supported). JSON-LD supplies title, company, location, salary,
     description (HTML stripped), `datePosted` as `postedAt`, and remote from
     `jobLocationType`. DOM fields fill anything JSON-LD omits.
   - **LinkedIn detail:** `h1` (ignoring the `aria-hidden` duplicate), company
     `a[href*="/company/"]`, location from the top-card description, description
     from `#job-details` / `.show-more-less-html__markup` / `.description__text`,
     `time[datetime]` for the date.
   - **LinkedIn card:** title from `button[aria-label="Dismiss <title> job"]`,
     the nearest ancestor with a card link or posted-age text as the root,
     company and location from the card's `<p>` lines, age from `Posted … ago`.
   - **Indeed detail:** `[data-testid="jobsearch-JobInfoHeader-title"]`,
     `inlineHeader-companyName`, `inlineHeader-companyLocation`,
     `#salaryInfoAndJobType`, `#jobDescriptionText`.
   - **Indeed card:** `div.job_seen_beacon[data-jk]`, `h2.jobTitle span[title]`,
     `company-name`, `text-location`, `attribute_snippet_testid`, `span.date`.
   - **Glassdoor card:** title from `[data-test="job-title"]`, root from the
     title's parent matching `[class*="JobCard"]`, company from
     `compactEmployerName` or `employer-name`, location from `emp-location`,
     salary from `SalaryEstimate_salaryEstimateNumber` or `detailSalary`, age
     from `job-age`.
   - Returns every job the host adapter recognizes; returns
     `{ success, job, jobs, error? }`; the handler is synchronous.
5. `src/shared/jobCapture.ts`: `jobIdFromUrl` reads LinkedIn
   `/jobs/view/<id>` or `currentJobId`, Indeed `jk`/`vjk`, and Glassdoor `jl`.
   `normalizeJobUrl` canonicalizes those URLs (dropping `trackingId`, `refId`,
   `from`, etc.) so re-adding the same job dedupes. `mergeCapturedJobs`
   normalizes both incoming and stored URLs. `postedAt` from JSON-LD wins over
   the age label.
6. `src/sidepanel/App.tsx`:
   - Load `capturedJobs` on mount, score with the profile, merge with search
     results (dedupe by URL).
   - On add: score, merge into the list, persist the capped array, toast the
     title and score.
   - Track captured URLs so they bypass the age filter.

## Why the current selectors changed

Capture cannot depend on complete generated class names. LinkedIn's current
card uses hashed classes, has no job link, and places its inline text next to
neighbouring text. Its `textContent` becomes `herePosted 1 week ago`. The old
leading `\b` before `posted` required a word boundary and failed, so card-root
selection climbed back to the dismiss button. Removing only that leading
boundary restores the posted-age signal without adding a hashed selector.

The current Glassdoor title link has a class containing `JobCard`. Calling
`closest('[class*="JobCard"]')` from the title therefore selected the link
itself, leaving company, location, salary, and age outside the card root.
Starting the search at the title's parent selects the outer card. The employer
salary also uses `data-test="detailSalary"` instead of the older salary class,
so the adapter accepts that stable attribute.

Both fixes use application structure and stable attributes. The regression
fixtures use the supplied LinkedIn and Glassdoor markup.

LinkedIn search pages can also show a detail pane. `currentJobId` in the URL
used to mark the whole page as a detail page, so capture returned the open
pane, or rewrote the list URL to the pane's URL, instead of the visible result
cards. Routing now checks the pathname first: `/jobs/search/` and
`/jobs/search-results/` capture `linkedInCards()` and fall back to the detail
pane only when no cards exist. The canonical-URL rewrite is skipped on those
pages. If a card root has neither a job link nor a posted-age line,
`cardRootFor` falls back to its `closest("li")`, which captures linkless list
items.

## Supported pages and limits

Capture is not universal. These are the supported paths:

- **LinkedIn:** known detail pages and result cards, including cards without a
  `/jobs/view/` link. Card capture remains layout-dependent.
- **Indeed:** known `viewjob` detail pages and result cards. The adapter accepts
  both `h2` and `h3` job-title markup.
- **Glassdoor:** known detail pages and result cards, including the current
  `JobCard_jobCardContent` layout and employer-provided salary.
- **Other job boards:** `genericJobs()` looks for `data-test="job-title"` or
  `data-test="jobTitle"`, with the first `h1` as a single-job fallback. Expect
  title-only capture or no capture on unfamiliar layouts.
- **Embedded frames:** capture reads the active tab's top frame only.

Known limits:

- DOM changes and A/B tests can break any card adapter.
- Results cards usually have no description, so skills-based scoring is lower.
- LinkedIn cards without a job id or per-card link share the page URL and
  deduplicate to one captured job.
- Detail-page coverage depends on readable `JobPosting` JSON-LD or recognized
  DOM selectors; generic boards do not get a universal JSON-LD path.

## Verification

- `src/shared/contentScriptCapture.test.ts` runs the real `contentScript.js` in
  jsdom and asserts LinkedIn cards, a linkless LinkedIn card with
  `currentJobId`, a LinkedIn search-results page that prefers its cards over an
  open detail pane, a linkless LinkedIn list item, LinkedIn JSON-LD detail,
  Indeed cards, Indeed detail, the current Glassdoor card with employer salary,
  and the no-job error.
- `src/sidepanel/components/FilterBar.test.tsx` covers the "Clear added" button.
- `src/shared/jobCapture.test.ts` covers ids, URL normalization, `postedAt`, and
  dedupe.
- `npx tsc --noEmit`, `npm test`, `npm run build`.
- Manual: press Add page on a LinkedIn results page, a LinkedIn job page, an
  Indeed results page, an Indeed `viewjob` page, and a current Glassdoor results
  card. Confirm the card, score, salary where present, and persistence across
  panel reopen.

## Left to the builder

- A "From page" chip on captured cards.
- Manual Chrome pass on signed-in LinkedIn, Indeed, and current Glassdoor cards.
