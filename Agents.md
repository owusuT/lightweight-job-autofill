# Agents.md

This file is maintained automatically by the Go_manager mode.

## Change Log (most recent first)

- **2026-11-07 - Ollama (custom provider) points at the LAN server**
  - `src/shared/ai/tasks.ts`: `DEFAULT_CONFIG.providers.custom.baseUrl` is now `http://192.168.0.102:11434`.
  - `src/shared/ai/providers.ts`: `createProvider` fallback uses the same URL; the `custom` provider label is "Ollama (local)" in both the metadata and `CustomProvider`. `CustomProvider.listModels()` now calls `${baseUrl}/v1/models` and returns the server's model ids (empty list on failure). Default model is `qwen2.5:7b`.
  - `public/manifest.json`: added `http://192.168.0.102/*` and `http://localhost/*` host permissions so the service worker can call Ollama. Chrome match patterns cannot include ports.
  - `src/sidepanel/components/AiSettings.tsx`: base-URL placeholder updated.
  - Tests: new `src/shared/ai/providers.test.ts` (2: parses model ids, returns [] when offline).
  - Verified: `npx tsc --noEmit`; 137 tests / 16 files; `npm run build`.
  - Not verified: live call to the LAN Ollama server. A saved `aiConfig` in sync storage still overrides these defaults; edit the Base URL field in the panel or clear `aiConfig`. A saved `custom.model` also overrides the new default.
  - Affected: `src/shared/ai/tasks.ts`, `src/shared/ai/providers.ts`, `src/shared/ai/providers.test.ts` (new), `src/sidepanel/components/AiSettings.tsx`, `public/manifest.json`, `plan/react-migration/02-ai-provider-layer.md`, `AGENTS.md`.

- **2026-11-06 - LinkedIn search pages and Clear added**
  - Root cause: `currentJobId` on a LinkedIn `/jobs/search/` URL made the page look like a detail page. Routing captured the open detail pane, and the canonical-URL rewrite replaced card URLs, so Add page returned the pane or the list URL instead of the visible result cards.
  - `contentScript.js`: new `isLinkedInSearch` path check. Search pages capture `linkedInCards()` first and fall back to `linkedInDetail()` only when no cards exist. The canonical-URL rewrite now runs only when `isDetail && !isLinkedInSearch`. `cardRootFor` falls back to `el.closest("li")` when no ancestor has a job link or posted-age text, so linkless LinkedIn list items capture.
  - `src/sidepanel/components/FilterBar.tsx`: "Clear added" button shown only when captured jobs exist. `src/sidepanel/App.tsx`: `clearAddedJobs()` removes `storage.local.capturedJobs` and resets captured state without touching search results.
  - Tests: `src/shared/contentScriptCapture.test.ts` now 19 (search-results prefers cards over an open detail pane; linkless list item); new `src/sidepanel/components/FilterBar.test.tsx` 2 (clears added, hides when empty). Removed an unused test fixture that failed `tsc`.
  - Verified: `node --check contentScript.js` clean; `npx tsc --noEmit` clean; 135 tests / 15 files pass; `npm run build` succeeds and copies the updated content script.
  - Docs: `plan/job-page-capture.md` and `task/T-12-job-page-capture.md` explain the new routing and fallback. `task/current-tasks.md` and `plan/react-migration/06-implementation-status.md` (§7c and the phase table) are updated.
  - Not verified: live signed-in LinkedIn search page with an open detail pane.
  - Affected: `contentScript.js`, `src/sidepanel/components/FilterBar.tsx`, `src/sidepanel/components/FilterBar.test.tsx` (new), `src/sidepanel/App.tsx`, `src/shared/contentScriptCapture.test.ts`, `plan/job-page-capture.md`, `task/T-12-job-page-capture.md`, `task/current-tasks.md`, `plan/react-migration/06-implementation-status.md`, `AGENTS.md`.

- **2026-11-03 — Current LinkedIn and Glassdoor Add page cards**
  - Root cause: the supplied LinkedIn card has no job link, and its text joins to `herePosted 1 week ago`. `cardRootFor` required a word boundary before `posted`, missed the card root, fell back to the dismiss button, and returned `No job found`. Removing only the leading boundary restores the posted-age root signal.
  - Root cause: the current Glassdoor title link contains `JobCard_jobTitle`, so `titleEl.closest('[class*="JobCard"]')` selected the link itself and captured only the title. The root search now starts at `titleEl.parentElement`. Salary capture now also accepts `[data-test="detailSalary"]`.
  - Tests: `src/shared/contentScriptCapture.test.ts` now has the supplied linkless LinkedIn card with `currentJobId` and the supplied Glassdoor card with company, location, age, URL, and employer-provided salary.
  - Verified: `node --check contentScript.js` clean; `npx tsc --noEmit` clean; 131 tests / 14 files pass; `npm run build` succeeds and copies the updated content script.
  - Docs: `plan/job-page-capture.md` now explains both root causes, the capture flow, and supported-page limits; `task/T-12-job-page-capture.md` has the dated addendum.
  - Support remains host-specific. LinkedIn, Indeed, and Glassdoor use adapters. Other boards use the generic best-effort path, and capture reads only the top frame.
  - Not verified: live signed-in LinkedIn and Glassdoor runs.
  - Affected: `contentScript.js`, `src/shared/contentScriptCapture.test.ts`, `plan/job-page-capture.md`, `task/T-12-job-page-capture.md`, `AGENTS.md`.

- **2026-11-01 — Wizard auto-advance on Open + Autofill**
  - `contentScript.js`: new `clickContinue()` + `CLICK_CONTINUE` message. Clicks a visible Continue/Next button (`data-testid` `continue-button`/`hp-continue-button-*` preferred), refuses anything whose label matches submit/finish/complete/apply, prefers the canonical `continue-button` test id, and never touches hidden/disabled buttons.
  - `src/sidepanel/App.tsx`: `openAndFill` loops up to 6 steps — `ALL_FRAMES_FILL`; if a step fills 0 fields, `CLICK_CONTINUE` and retry after 1.5 s. Stops and toasts as soon as a step gets fields filled ("Review them, then Continue"), so the user reviews every filled step; the final submit is always manual.
  - `src/shared/messages.ts`, `src/sidepanel/api.ts` (`clickContinue(tabId)`): message plumbing.
  - Tests: `contentScriptCapture.test.ts` 15 (clicks continue-button not submit, clicks Next, refuses submit-only page).
  - Verified: `node --check contentScript.js`; `npx tsc --noEmit` clean; 129 tests / 14 files pass; `npm run build` succeeds and `dist/contentScript.js` contains `CLICK_CONTINUE`.
  - Not verified: live smartapply wizard walk.
  - Affected: `contentScript.js`, `src/shared/messages.ts`, `src/sidepanel/api.ts`, `src/sidepanel/App.tsx`, `src/shared/contentScriptCapture.test.ts`, `AGENTS.md`.


- **2026-11-01 — Open + Autofill follows the "Apply now" link**
  - Root cause: `openAndFill` opened the job *listing* URL and filled there; the application form lives behind `a[data-testid="viewjob-indeed-apply"]` on `smartapply.indeed.com`, which was never opened.
  - `contentScript.js`: new `findApplyUrl()` (Indeed smartapply/`primary-apply-action` selectors, generic `Apply now`-labeled link fallback) exposed via a new `FIND_APPLY_URL` message. `src/shared/messages.ts`, `src/sidepanel/api.ts` (`findApplyUrl(tabId)`) mirror it.
  - `src/sidepanel/App.tsx`: `openAndFill` opens the listing, resolves the apply URL (3 retries, 1 s apart, for slow hydration), navigates the same tab to it, waits for load, then runs `ALL_FRAMES_FILL`.
  - Tests: `contentScriptCapture.test.ts` 12 (Indeed smartapply link from owner-supplied markup, generic fallback, no-link page). Also restored the missing `noJob` fixture.
  - Verified: `node --check contentScript.js`; `npx tsc --noEmit` clean; 126 tests / 14 files pass; `npm run build` succeeds.
  - Not verified: live Chrome pass on a real Indeed job.
  - Affected: `contentScript.js`, `src/shared/messages.ts`, `src/sidepanel/api.ts`, `src/sidepanel/App.tsx`, `src/shared/contentScriptCapture.test.ts`, `AGENTS.md`.


- **2026-11-01 — Feed postedAt: Unix seconds, not milliseconds**
  - Root cause of "20759D" age chips: Arbeitnow returns `created_at` as Unix seconds (number); `new Date(number)` read it as milliseconds, landing every feed job in Jan 1970. Side effect: feed jobs failed the age filter, which is why the results list was empty.
  - `src/background/modules/jobs.ts`: new `parsePostedAt()` — numeric input below 1e12 is seconds and is multiplied by 1000; ms and ISO strings still parse; fallback is now. `created_at` type widened to `string | number`.
  - Tests: `jobs.test.ts` 11 (numeric-seconds normalization; ISO case kept).
  - Verified: `npx tsc --noEmit` clean; 123 tests / 14 files pass; `npm run build` succeeds. Not verified: live Arbeitnow response shape.
  - Affected: `src/background/modules/jobs.ts`, `src/background/modules/jobs.test.ts`, `AGENTS.md`. Stale `jobCache` entries keep bad postedAt values until the cache refreshes.

- **2026-11-01 — Compact age labels**
  - `src/shared/format.ts`: `timeAgo` returns `now`/`30m`/`5h`/`3d` (dropped the "ago" suffix) everywhere it is used (job card chips, popup history, tools). Tests updated; 122 tests / 14 files pass; `npm run build` succeeds.
  - Affected: `src/shared/format.ts`, `src/shared/format.test.ts`, `AGENTS.md`.


- **2026-11-01 — Job ranking uses the uploaded resume**
  - `src/shared/score.ts`: new `withResumeInfo(profile, resumeInfo)` merges the resume's extracted skills and position into the scoring profile (deduped; manual profile values win). `src/sidepanel/App.tsx` loads `sharedPDFData.resumeInfo` on mount, memoizes `scoringProfile`, and uses it for feed scoring, captured-job re-scoring, and Add page scoring.
  - Tests: `score.test.ts` 16 (merge/dedupe/profile-wins/resume-position fallback/score increase).
  - Verified: `npx tsc --noEmit` clean; 122 tests / 14 files; `npm run build`. Not verified: live panel with a real uploaded resume.
  - Affected: `src/shared/score.ts`, `src/shared/score.test.ts`, `src/sidepanel/App.tsx`, `AGENTS.md`.

- **2026-11-01 — Add page captures every job card, not just the first**
  - `contentScript.js`: card adapters refactored from "first card in viewport" to root-parameterized builders — `linkedInCardFrom`/`linkedInCards` (dismiss buttons as seeds, `/jobs/view/` links fallback), `indeedCardFrom`/`indeedCards` (beacon/slider/`a[data-jk]` seeds mapped back to the beacon root), `genericJob`→`genericJobs` (one job per `[data-test="job-title"]`, `JobCard`-scoped; single `h1` page stays one job). `CAPTURE_JOB` now returns `{ success, job, jobs }` (deduped by URL; `job` = first). JSON-LD only merges into a single captured job; canonical URL rewrite only for single-job detail pages.
  - `src/shared/jobCapture.ts`: `mergeCapturedJobs(existing, incoming)` accepts a `Job` or `Job[]`, deduping within the batch and against stored URLs. `src/sidepanel/api.ts`: `CaptureJobResponse.jobs`. `src/sidepanel/App.tsx`: Add page scores/merges/persists every captured job; toast is "Captured N jobs from this page (M new)" for batches, unchanged for single jobs.
  - Tests: `contentScriptCapture.test.ts` 9 (new two-card fixtures for LinkedIn/Indeed/Glassdoor); `jobCapture.test.ts` 20 (batch merge + intra-batch dedupe).
  - Verified: `node --check contentScript.js`; `npx tsc --noEmit` clean; 118 tests / 14 files pass; `npm run build` succeeds and `dist/contentScript.js` contains the multi-card adapters.
  - Not verified: live Chrome pass on a results page.
  - Affected: `contentScript.js`, `src/shared/jobCapture.ts`, `src/shared/jobCapture.test.ts`, `src/shared/contentScriptCapture.test.ts`, `src/sidepanel/api.ts`, `src/sidepanel/App.tsx`, docs.

- **2026-11-01 — Captured jobs bypass Min stars**
  - Root cause of "Add page pulls nothing": capture succeeded (toast showed `Updated "…" — 45/100, 2.5★`) but `src/sidepanel/App.tsx` hid it at Min stars 3.5; captured jobs bypassed only the age filter.
  - Fix: captured URLs now bypass Min stars as well (order swap in the visibility memo) — an explicitly captured job must never filter itself out. Docs updated in `plan/job-page-capture.md`, `task/T-12-job-page-capture.md`, `plan/react-migration/06-implementation-status.md`.
  - Verified: `npx tsc --noEmit`, 113 tests / 14 files, `npm run build`. Not verified: live Chrome.
  - Affected: `src/sidepanel/App.tsx`, docs, `AGENTS.md`.

- **2026-11-01 — Generic field detection for unfamiliar sites**
  - `contentScript.js`: `_getLabel()` now reads `aria-labelledby` (joined ids), `aria-label`, `label[for]`, wrapping labels, placeholder, fieldset `legend` (fallback), then bounded nearby text (up to 3 preceding siblings, skipping blocks that contain controls, max 120 chars).
  - `_classify()` adds `autocomplete`, `data-automation-id`, and `data-testid` to the matched text (camelCase split for automation ids). Standard `autocomplete` tokens map directly to field types via `AUTOCOMPLETE_FIELDS` (`organization title`→position, `organization`→company, address parts, `given name`, `family name`, `postal code`, `country name`, `tel`, `url`). "Email Address" now returns `email` before the generic address rule; `post code` matches ZIP.
  - Fixed `years_experience` matching `professional experience`, which stole the experience textarea.
  - New `src/shared/contentScriptDetection.test.ts` drives the real `DETECT_FORMS` handler in jsdom against an unfamiliar form (aria-labelledby, legend, autocomplete, data-automation-id, nearby text, hidden trap) and asserts 10 field types plus the hidden field's exclusion.
  - Docs: design `docs/superpowers/specs/2026-11-01-generic-field-detection-design.md`; plan `docs/superpowers/plans/2026-11-01-generic-field-detection.md`.
  - Verified: `node --check contentScript.js`; `npx tsc --noEmit` clean; 113 tests / 14 files pass; `npm run build` succeeds and `dist/contentScript.js` contains the new sources.
  - Not verified: manual Fill on a live unfamiliar ATS page.
  - Affected: `contentScript.js`, `src/shared/contentScriptDetection.test.ts` (new), `docs/superpowers/**`, `AGENTS.md`, `task/current-tasks.md`.

- **2026-11-01 — T-12 fix: current Indeed card markup**
  - Live Indeed card puts `data-jk` on `a.jcs-JobTitle` (not on `.job_seen_beacon`) and renders the title as `h3.jobTitle`; added `h3` selectors and `a[data-jk]` fallbacks so the title link resolves.
  - `[data-testid="text-location"]` can contain a commute snippet (`25 min`) plus a separator; the adapter now subtracts `[data-testid="jcs-commute-snippet"]` and strips the leading separator, so location stores just `Whitsett, NC`.
  - `src/shared/contentScriptCapture.test.ts`: replaced the synthetic Indeed card fixture with the real markup supplied by the owner (slider wrapper, `h3` title, commute snippet); test asserts title/company/location/job URL and that no age/salary is invented.
  - Verified: `node --check contentScript.js`; `npx tsc --noEmit` clean; `npm test -- --run` 112 tests / 13 files pass; `npm run build` succeeds and `dist/contentScript.js` carries both new selectors.
  - Not verified: live signed-in Indeed capture.
  - Affected: `contentScript.js`, `src/shared/contentScriptCapture.test.ts`, `AGENTS.md`.

- **2026-11-01 — T-12 extension: LinkedIn + Indeed job capture (detail pages and result cards)**
  - `contentScript.js`: `captureCurrentJob()` now dispatches by host. Detail pages read `JobPosting` JSON-LD first (`@graph`/arrays, HTML description stripped, `baseSalary` formatted as `50k`-style amounts, `datePosted` as `postedAt`, `jobLocationType` as remote) and fill gaps from DOM. LinkedIn detail: `h1` read through a helper that skips the `aria-hidden` duplicate title span, company `a[href*="/company/"]`, location from the top-card description, description from `#job-details`/`.show-more-less-html__markup`/`.description__text`, `time[datetime]` date. LinkedIn cards: title from `button[aria-label="Dismiss <title> job"]`, root from the nearest ancestor with a `/jobs/view/` link, company/location from the card `<p>` lines, `Posted … ago` age. Indeed detail: `[data-testid="jobsearch-JobInfoHeader-title"]`, `inlineHeader-companyName`, `inlineHeader-companyLocation`, `#salaryInfoAndJobType`, `#jobDescriptionText`. Indeed cards: `div.job_seen_beacon[data-jk]`, `h2.jobTitle span[title]`, `company-name`, `text-location`, `attribute_snippet_testid`, `span.date`; URL built from `data-jk`. Glassdoor path unchanged. No hashed class names; unsupported pages still return `{ success: false, error }`.
  - `src/shared/jobCapture.ts`: `RawPageJob.postedAt`; `jobIdFromUrl` reads LinkedIn `/jobs/view/<slug>-<id>` or `currentJobId`, Indeed `jk`/`vjk`, then Glassdoor `jl`; new `normalizeJobUrl` canonicalizes those URLs (drops `trackingId`, `refId`, `from`, etc.); `mergeCapturedJobs` normalizes incoming and stored URLs so existing captures dedupe; `parseAgeLabel` handles `Just posted`, `Today`, `Yesterday`; `postedAt` wins over `ageLabel`.
  - Tests: `src/shared/jobCapture.test.ts` now 18 cases (LinkedIn/Indeed ids, normalization, `postedAt`, new age labels, URL dedupe); new `src/shared/contentScriptCapture.test.ts` (6) evaluates the real `contentScript.js` in jsdom with a stubbed `chrome` API against LinkedIn card, LinkedIn JSON-LD detail, Indeed card, Indeed detail, Glassdoor card, and a no-job page.
  - Verified: `npx tsc --noEmit` clean; `npm test` 112 tests / 13 files pass; `npm run build` succeeds and `dist/contentScript.js` contains the new adapters.
  - Not verified: manual Chrome run on signed-in LinkedIn or Indeed.
  - Affected: `contentScript.js`, `src/shared/jobCapture.ts`, `src/shared/jobCapture.test.ts`, `src/shared/contentScriptCapture.test.ts` (new), `plan/job-page-capture.md`, `plan/react-migration/06-implementation-status.md`, `task/T-12-job-page-capture.md`, `task/current-tasks.md`, `AGENTS.md`.

- **2026-11-01 — T-09 React popup at parity + T-11 cleanup/docs (React migration complete)**
  - `popup.html` (repo root) is now the Vite React entry: `#root`, classic `<script src="./lib/pdf-processor.js">`, module `<script src="/src/popup/main.tsx">`. Added as a `vite.config.ts` input; `copy-current-to-dist.js` no longer copies `popup.html`, `popup.js`, or `styles/popup.css`, so the React build owns `dist/popup.html`.
  - `src/popup/App.tsx`: header with "Best Jobs" (`chrome.windows.getCurrent()` → `chrome.sidePanel.open({ windowId })` → `window.close()`, with a fallback status message), manifest version badge, ARIA tablist with arrow-key navigation, footer status that auto-resets after 3s, profile load via `GET_USER_PROFILE`, active tab URL + `GET_ATS_STATUS` on mount.
  - New tabs: `src/popup/components/ProfileTab.tsx` (all 43 `PROFILE_FIELDS` + 4 `PROFILE_CHECKBOXES`, Save/Clear), `ApplyTab.tsx` (ATS bar, resume drop with `RealPDFProcessor`, cover letter, target overrides, Fill/Scan/Clear, password generator + copy), `HistoryTab.tsx` (stats, newest-first list, CSV via `src/shared/csv.ts`), `ToolsTab.tsx` (current URL, manual fill/detect/clear, detection list, credentials list/clear). `src/popup/api.ts` holds typed `chrome.runtime.sendMessage` wrappers.
  - `src/popup/popup.css` copied from the vanilla theme, plus `#root` flex layout (`max-height: 640px; overflow: hidden`) and new component classes (`.muted-note`, `.password-row`, `.history-main/.history-meta/.history-time`, `.result-box/.result-row`).
  - Deviation from `task/T-09-react-popup.md` step 11: PDF extraction reuses vendored `lib/pdf-processor.js` (`window.RealPDFProcessor`) instead of porting to `src/shared/pdf.ts`; stored shape unchanged (`sharedPDFData`, `resumeText`, `resumeInfo`). Owner opted out of the T-11 React dock rewrite, so `contentScript.js` stays vanilla.
  - Cleanup (closes T-05): deleted vanilla `popup.js`, `styles/popup.css`, stale root `manifest.json`, and stale root `background.js`; `public/manifest.json` (3.0.0) is the only manifest and `popup.html` is the React entry.
  - Tests added: `ProfileTab.test.tsx` (4: all fields/toggles render, text edit key, consent toggle, save/clear) and `App.test.tsx` (2: profile load + shell, tab switch + history empty state) with a stubbed `chrome` API.
  - Verification: `npx tsc --noEmit` clean; `npm test` 98 tests / 12 files; `npm run build` emits `dist/popup.html` (React bundle), `dist/sidepanel.html`, `dist/background.js`, `dist/manifest.json` (3.0.0), and copies `contentScript.js`, `contentScript.css`, `lib/pdf-processor.js`, `lib/pdfjs/build/`.
  - Docs: `README.md` (popup/side panel sections, file tree, checks), `INSTALLATION.md` (permissions + file tree), `plan/react-migration/{README.md,06-implementation-status.md}` (§7d, phase table), `task/{T-09,T-11,current-tasks}.md`.
  - Not verified: manual Chrome run of the React popup tabs.
  - Affected: `popup.html`, `vite.config.ts`, `scripts/copy-current-to-dist.js`, `src/popup/**` (App, api, popup.css, 4 tabs, 2 tests), `README.md`, `INSTALLATION.md`, `plan/react-migration/**`, `task/{T-05,T-09,T-11,current-tasks}.md`, `AGENTS.md`; deleted `popup.js`, `styles/popup.css`, `manifest.json`, `background.js`.

- **2026-11-01 — T-12: capture the job on the current page into Best Jobs**
  - `src/shared/jobCapture.ts` (new) + `jobCapture.test.ts` (10 tests): `RawPageJob`, `parseAgeLabel` (`h`/`d`/`w`/`mo`/`y`, trailing `+`), `rawPageJobToJob` (id from `jl`/`jobListingId` else a URL hash, trimmed/whitespace-collapsed text, 8000-char description cap, `remote` fallback from location), `mergeCapturedJobs` (prepend, dedupe by `url`, cap 50).
  - `src/shared/score.ts`: salary detection now matches `[£$€]\s?\d` so `£51,000` counts; two new tests in `score.test.ts`.
  - `contentScript.js`: new `CAPTURE_JOB` constant, `captureCurrentJob()` (data-test / id / class* partials only — never hashed class names; first in-viewport title for results lists; nearest `[class*="JobCard"]` root), and a synchronous message handler with try/catch. Unsupported pages return `{ success: false, error }`.
  - `src/shared/messages.ts`: `CAPTURE_JOB`. `src/sidepanel/api.ts`: `captureCurrentJob()` + `CaptureJobResponse` (active tab, top frame). `src/sidepanel/components/FilterBar.tsx`: "Add page" button (`onAddPage`, `adding`). `src/sidepanel/App.tsx`: loads `capturedJobs` on mount and re-scores with the current profile, merges with search results (dedupe by URL), captured URLs bypass the age filter and Min stars, add handler scores/notifies/persists via `mergeCapturedJobs`.
  - Verified: `npx tsc --noEmit` clean; `npm test` 92 tests / 10 files pass; `npm run build` succeeds and `dist/contentScript.js` contains `CAPTURE_JOB` while `dist/assets/sidepanel-*.js` contains `capturedJobs`; jsdom harness (`%TEMP%\opencode\jr-capture-test\capture-test.js`) evaluated the real `contentScript.js` against the Glassdoor card markup and returned the expected raw job, and returned a clean error on an empty page.
  - Not verified: manual Chrome run (reload unpacked from `dist/`, Add page on a Glassdoor job and results page).
  - Affected: `contentScript.js`, `src/shared/jobCapture.ts` (new), `src/shared/jobCapture.test.ts` (new), `src/shared/score.ts`, `src/shared/score.test.ts`, `src/shared/messages.ts`, `src/sidepanel/api.ts`, `src/sidepanel/App.tsx`, `src/sidepanel/components/FilterBar.tsx`, `plan/job-page-capture.md`, `plan/react-migration/06-implementation-status.md`, `task/T-12-job-page-capture.md`, `task/current-tasks.md`, `AGENTS.md`.

- **2026-11-01 — In-page dock close: hide completely**
  - `contentScript.js`: changed dock close button from `POPUP_MODE.TUCKED` (minimize to tab) to `POPUP_MODE.HIDDEN` (completely hide); updated title from "Minimize" to "Close"; dock now disappears completely when X is pressed.
  - Affected: `contentScript.js`, `AGENTS.md`.

- **2026-11-01 — Side panel close: window.close()**
  - `src/sidepanel/App.tsx`: changed closeSidePanel() to call `window.close()` (simplest and most compatible approach per Chrome docs); removed isClosed state and conditional rendering; clears all state (drafts, picker, toasts, errors) before closing.
  - `src/sidepanel/sidepanel.css`: removed `.app.closed` styles (no longer needed).
  - Result: pressing X now actually closes the side panel using window.close(), the recommended approach for closing from within the panel page.
  - Affected: `src/sidepanel/App.tsx`, `src/sidepanel/sidepanel.css`, `AGENTS.md`.

- **2026-11-01 — Provider architecture refactor (ThreadWeaver pattern)**
  - `src/shared/ai/provider-types.ts`: new file with ThreadWeaver's LLMProvider interface, ProviderError class, ChatMessage, GenerateOptions, GenerateResult types.
  - `src/shared/ai/providers.ts`: refactored from ProviderAdapter pattern to LLMProvider class-based pattern; OpenAIProvider, AnthropicProvider, OpenRouterProvider, CustomProvider classes implementing LLMProvider; factory function createProvider(); simplified providers metadata object.
  - `src/background/modules/ai.ts`: removed _executeRequest and _mapHttpError methods; refactored _handleTestConnection, _handleListModels, _handleChat to use provider instances directly; ProviderError handling throughout; removed OpenRouter-specific model cache (now internal to OpenRouterProvider).
  - `src/shared/ai/tasks.ts`: updated DEFAULT_CONFIG to use providers metadata for default models.
  - `src/shared/ai/providers.test.ts`: deleted (test file for old adapter pattern).
  - Benefits: cleaner interface separation, better error handling with ProviderError, easier to add new providers, consistent pattern across all providers, per-provider model caching (OpenRouter), ready for streaming support via generateStream().
  - Affected: `src/shared/ai/provider-types.ts` (new), `src/shared/ai/providers.ts`, `src/background/modules/ai.ts`, `src/shared/ai/tasks.ts`, `src/shared/ai/providers.test.ts` (deleted), `AGENTS.md`.

- **2026-11-01 — Side panel close button + OpenRouter model caching**
  - `src/sidepanel/App.tsx`: added `closeSidePanel()` function that clears all state (drafts, picker, toasts, errors) and sets `isClosed` to true, showing a centered message "Side panel closed. Click the extension icon to reopen." Chrome doesn't allow programmatic close from within the side panel, so this provides a clean "closed" state instead. Added close button (×) to header in `.header-actions` between badge and tabs.
  - `src/sidepanel/components/FilterBar.tsx`: added optional `onClose` prop to FilterBar, renders close button (×) in search row next to Go button when provided.
  - `src/sidepanel/sidepanel.css`: added `.close-btn` styles (24px, muted color, hover to platinum) and specific style for filter bar close button (20px, adjusted padding). Added `.app.closed` style for centered layout when closed.
  - `contentScript.js`: fixed race condition in `ensureUi()` where `document.body` might not exist yet; now falls back to `document.documentElement` for host attachment.
  - `src/background/modules/ai.ts`: implemented proper OpenRouter model list caching (10-minute TTL); fetches `?output_modalities=text` per OpenRouter best practices; sends API key in headers for validation; uses cached models when available; invalidates cache on key change; test connection uses cached model or fallback; updated fallback models to include stable options.
  - `src/shared/ai/tasks.ts`: updated default OpenRouter model from `anthropic/claude-3.5-sonnet:beta` to `openai/gpt-4o-mini` (stable and widely available); users can override with the "Model id override" field to use `nvidia/nemotron-3.5-super-vl:free` or any other model.
  - `task/current-tasks.md`: updated T-11 status to note close button completion.
  - `task/T-11-content-dock-cleanup.md`: marked step 12 (close button) as complete.
  - Affected: `src/sidepanel/App.tsx`, `src/sidepanel/components/FilterBar.tsx`, `src/sidepanel/sidepanel.css`, `contentScript.js`, `src/background/modules/ai.ts`, `src/shared/ai/tasks.ts`, `task/current-tasks.md`, `task/T-11-content-dock-cleanup.md`, `AGENTS.md`.

- **2026-10-30 — T-11 slice: review-first AI answer capture and apply (vanilla content script)**
  - `contentScript.js`: added `collectAiTargets()` + `applyAiAnswer()`; every visible textarea/text input/contenteditable gets a stable `data-jollyr-ai-target` token; sensitive fields (password/SSN/card/CVV/bank) are excluded; candidates return label, question, tag, `maxLength`, current value, and `required`. New `AI_QUESTION_CANDIDATES` and `AI_APPLY_ANSWER` message handlers. Apply uses the native setter (or `textContent` for contenteditable), focuses the field, and toasts "Review before submitting".
  - `src/background/modules/allFrames.ts`: `ALL_FRAMES_QUESTION_CANDIDATES` fans out and tags each candidate with its `frameId`; `ALL_FRAMES_APPLY_ANSWER` targets exactly one frame and rejects a missing token before sending.
  - `src/shared/messages.ts`: added `ALL_FRAMES_QUESTION_CANDIDATES`, `ALL_FRAMES_APPLY_ANSWER`.
  - `src/sidepanel/api.ts`: `listQuestionFields()`, `applyAnswer()`, `AiQuestionCandidate`.
  - `src/sidepanel/App.tsx`: draft modal "Insert into page" scans the active tab and shows a field picker; truncates at the field `maxLength`; applies only on an explicit click. `src/sidepanel/sidepanel.css`: picker styles.
  - Tests: `src/background/modules/allFrames.test.ts` (7) covering candidate merge/tagging, no-receiver skip, targeted apply, top-frame default, missing-token rejection, error propagation.
  - Verified: `tsc --noEmit` clean, `node --check contentScript.js` clean, 94 tests / 10 files pass, `npm run build` copies the updated content script and background (`dist/` grep confirms both new message families).
  - Scope note: owner chose AI capture/apply only, keeping the vanilla content script; React dock rewrite, orphan cleanup, and final docs remain in T-11.
  - Affected: `contentScript.js`, `src/background/modules/allFrames.ts`, `src/background/modules/allFrames.test.ts`, `src/shared/messages.ts`, `src/sidepanel/{api.ts,App.tsx,sidepanel.css}`, `plan/react-migration/{README.md,06-implementation-status.md}`, `plan/fix-plan.md`, `task/{current-tasks.md,T-11-content-dock-cleanup.md}`, `AGENTS.md`.

- **2026-10-30 — T-10 side panel completion: AI cancel, tailor, drafts, provider UI, tests**
  - `src/background/modules/ai.ts`: real `AI_CANCEL` via `abortControllers: Map<requestId, AbortController>`; `_executeRequest` accepts the controller; entries removed in `finally`.
  - `src/shared/ai/prompts.ts`: untrusted-data delimiters (`<job_posting>`, `<question>`, `<field>`), explicit ignore-embedded-instructions rule, exported `parseTailorJson()` + `TailorResult`.
  - `src/sidepanel/api.ts`: `usageTotals`, async `aiChat` with `extra`/`bypassCache` and usage accumulation, `cancelAi`.
  - `src/sidepanel/App.tsx`: provider/model badge wired to the AI tab, tailor action, task-specific draft modal (editable cover letter; structured summary/skills with raw fallback), Regenerate with `bypassCache: true`, Save draft to `storage.local.aiDrafts` (cap 50).
  - `src/sidepanel/components/JobCard.tsx`: `onTailor` button plus top-two positive reason chips.
  - `src/sidepanel/components/AiSettings.tsx`: key reveal, free-text model id override, per-provider status dots, clear-all-keys with confirm, session usage, privacy field list.
  - `src/sidepanel/sidepanel.css`: styles for header badge, reason chips, key row, status dots with pulse.
  - Tests added: `src/shared/ai/providers.test.ts` (14), `tasks.test.ts` (5), `prompts.test.ts` (13), `src/background/modules/jobs.test.ts` (10), `src/shared/ai/cache.test.ts` (11).
  - `package.json`: `build` now runs `tsc --noEmit` before Vite.
  - Verified: `npx tsc --noEmit` clean, 87 tests / 9 files pass, `npm run build` succeeds with `dist/` intact.
  - Docs: `plan/react-migration/06-implementation-status.md` §7a, `README.md` phase table, `plan/fix-plan.md` R8, `task/T-10-sidepanel-jobs-ai.md` status, `task/current-tasks.md`.
  - Affected: `src/background/modules/ai.ts`, `src/shared/ai/{prompts,providers.test,tasks.test,prompts.test,cache.test}.ts`, `src/background/modules/jobs.test.ts`, `src/sidepanel/{App.tsx,api.ts,sidepanel.css,components/JobCard.tsx,components/AiSettings.tsx}`, `package.json`, `plan/**`, `task/**`, `AGENTS.md`.

- **2026-10-30 — Priority fixes: data safety, fill reliability, security, cleanup**
  - `background.js`: `getHistory()` no longer defaults to 100 (was silently truncating reads); history is trimmed only on write at `MAX_HISTORY = 200`; `getStats()` and popup history/CSV exclude `status: "filled"` entries; `GET_ATS_STATUS` resolves `message.value.tabId` and detects ATS from `chrome.tabs.get` for popup callers; `detectAts` now compares hostnames (including subdomains) and handles path patterns such as `linkedin.com/jobs`; removed the 0.4-minute heartbeat alarm, `onStartup` clear, and load `console.log`; added `APPLICATION_SUBMITTED`; `FORM_FILLED` keeps the old `ATS_APPLICATION_COMPLETE` string as an alias.
  - `contentScript.js`: classifier score uses `m[0].length`; added `email_confirm`, `phone_confirm`, and `address_line2`; detector stores every element per field type (`Map<string, Entry[]>`) and skips hidden/unrendered fields via `isFillable`; added `setNativeValue`, `base64ToFile` (no `fetch(data:)`), and `hasStoredCredential`; selects/clear use the native setter; combobox options are scoped to `aria-controls`/`aria-owns`/widget root with Escape-and-clear on miss; account creation is opt-in (`config.autoCreateAccounts`), signup-only, and skipped when credentials exist for the host; fills report `FORM_FILLED`, and a form `submit` records `APPLICATION_SUBMITTED`; panel rows update incrementally; dynamic UI text uses `textContent`; dock/dialog/toast got ARIA labels.
  - `popup.js` / `popup.html` / `styles/popup.css`: moved the 340-line inline stylesheet to `styles/popup.css`; added tablist/tab/tabpanel roles plus arrow-key navigation; ATS check sends the active tab id; added the Account Creation opt-in toggle; history and CSV show submissions only.
  - `manifest.json` / `public/manifest.json`: removed unused `alarms`, `cookies`, and `scripting`; dropped the `injectScript` content script and web resource; corrected the description.
  - `lib/pdf-processor.js`: caches the in-flight PDF.js load promise to prevent duplicate script tags; safe `unknown` error messages.
  - Deleted verified orphans: `content.js`, `popup-broken.js`, `popup-fixed.js`, `database-manager.js`, `job-application-data.js`, `injectScript.js`, `injectScriptHandler.js`.
  - Mirrored fixes in `src/background/modules/userData.ts`, `ats.ts`, `tabState.ts`, `common.ts`, `index.ts`, `src/shared/messages.ts`, `types.ts`; registered `AiModule`; fixed async handler return types; added `@types/node`, `typecheck`, and `test:run`-style scripts; copy script now includes `manifest.json`, `styles/popup.css`, and `lib/pdf-processor.js`.
  - `README.md` rewritten to match the shipping extension.
  - Verified `node --check` on all edited JS, JSON parse for manifests/package, and `npm run build` (copies the shipping files into `dist/`). Vitest and `tsc` were not run because `node_modules` is not installed.
  - Affected: `background.js`, `contentScript.js`, `popup.js`, `popup.html`, `styles/popup.css`, `manifest.json`, `public/manifest.json`, `lib/pdf-processor.js`, `scripts/copy-current-to-dist.js`, `src/**`, `package.json`, `tsconfig.node.json`, `README.md`, deleted orphan files, `Agents.md`.

- **2026-10-30 — T-07: Toolchain and shared modules completed**
  - Created `package.json` with React 18, Vite 5, TypeScript 5.5, Vitest 2, and Chrome type dependencies.
  - Added `tsconfig.json` with strict mode, Chrome types, and ES2020 target.
  - Configured `vite.config.ts` with four build inputs (popup, sidepanel, background, content) and proper output naming.
  - Created `public/manifest.json` with MV3 permissions including sidePanel, and host permissions for AI APIs and Arbeitnow.
  - Set up build script to copy current extension files to `dist/` for inert port, then overlay React build later.
  - Created `src/shared/messages.ts` consolidating all MESSAGE_TYPE constants from background/popup/content plus new AI messages.
  - Created `src/shared/profileSchema.ts` with PROFILE_FIELDS and PROFILE_CHECKBOXES arrays.
  - Created `src/shared/types.ts` with TypeScript interfaces for Profile, ApplicationEntry, Job, ScoredJob, ScorePart, AiConfig, AiKeys.
  - Created `src/shared/storage.ts` with typed helpers for Chrome storage (getSync, setSync, getLocal, setLocal, removeLocal).
  - Extracted `generateStrongPassword` to `src/shared/password.ts`, CSV export to `src/shared/csv.ts`, and format helpers to `src/shared/format.ts`.
  - Created `src/shared/score.ts` implementing the seven-part scoring model (title, skills, location, remote, recency, visa, salary) with star calculation and stable sorting.
  - Added Vitest configuration with jsdom environment and wrote 18 tests covering password generation, CSV export, scoring logic, and format helpers.
  - Added design system document `plan/react-migration/05-design-system.md` (Obsidian & Platinum Atelier) for UI reference.
  - Acceptance criteria met: `npm run build` succeeds, extension loads from `dist/` unchanged, tests pass, no duplicated MESSAGE_TYPE definitions, shared modules have no chrome.* calls outside storage.ts.
  - Affected: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `public/manifest.json`, `scripts/copy-current-to-dist.js`, `src/shared/**`, `src/test/**`, `plan/react-migration/05-design-system.md`, `task/T-07-toolchain-and-shared.md`, `AGENTS.md`.

- **2026-10-30 — React migration + jobs side panel + AI provider layer (planning docs)**
  - Added the project guideline folder `plan/react-migration/` (`README.md`, `01-architecture.md`, `02-ai-provider-layer.md`, `03-jobs-scoring-sidepanel.md`, `04-build-test-and-verification.md`) covering the Vite + React + TypeScript target, Chrome Side Panel for best jobs with deterministic match scores, and the four-provider AI layer (OpenAI, Anthropic, OpenRouter, custom OpenAI-compatible) with per-task model selection and local-only key storage.
  - Added phase task files `task/T-07` through `task/T-11` with step checklists, acceptance criteria, and estimates; updated `task/current-tasks.md` to index them and fold T-05 orphan cleanup into T-11.
  - No source files changed in this round. Implementation starts at T-07.
  - Affected: `plan/react-migration/**`, `task/T-07..T-11`, `task/current-tasks.md`, `Agents.md`.

- **2026-08-09 — All-frames messaging centralized in background + combobox scoping for Greenhouse embed**
  - Root cause for the still-unfilled QuinStreet/Greenhouse embed: the popup's all-frames logic was duplicated in `popup.js` and could report "Filled 0" on slow SPA hydration; `fillCombobox` searched the whole document for `[role="option"]`, so an intl-tel phone widget's country list could win over the React-Select `country` combobox's own flyout; the `candidate-location` async combobox had no classifier rule; in-page dock buttons still ran top-frame-only.
  - `background.js`: added `AllFramesModule` (registered last in `backgroundModules`) as the single implementation of cross-frame messaging. `_enumerateFrames()` always adds frameId 0; `_sendToFrame()` uses `chrome.tabs.sendMessage(tabId, msg, { frameId })` swallowing `lastError` for frames with no receiver; `_activeTabId()` falls back to the active tab query. New messages: `ALL_FRAMES_FILL → FILL_JOB_APPLICATION` (profile IS `value` directly, auto-loaded via `userData.getProfile()` when omitted), `ALL_FRAMES_MANUAL → MANUAL_FILL_FORM` (group options as value), `ALL_FRAMES_DETECT → DETECT_FORMS` (concatenates `forms` from all frames), `ALL_FRAMES_CLEAR → CLEAR_ALL_FORMS` (broadcast). Response shape: `{ success, fieldsFilled, framesReached, perFrame, error }`; `success = fieldsFilled > 0` for fills. SPA retry: when a fill returns 0 fields it re-round-trips up to 3× with 1.5 s gaps (total ~4 passes) so a slow-hydrating iframe still gets filled.
  - `popup.js`: removed the now-redundant `sendToActiveTabAllFrames()` / `mergeFillResults()` (replaced with a comment pointing at the background service). Fill Application → `sendToBackground("ALL_FRAMES_FILL", profile)`; Manual Fill → `sendToBackground("ALL_FRAMES_MANUAL", {fillPersonal, fillAddress, fillProfessional})`; both Clear buttons → `ALL_FRAMES_CLEAR`; `detectFormsOnPage` → `ALL_FRAMES_DETECT` (lists fields + "across N frame(s)"); `checkAtsStatus` → `GET_ATS_STATUS` via background. Status text: `Filled N fields across M frames ✓` or `No form found — page may still be loading. Try again in a few seconds.` when `fieldsFilled === 0 && framesReached === 0`.
  - `contentScript.js`: `fillCombobox()` now scopes option lookup to the widget itself — `isVisible()` skips `aria-hidden`, `offsetParent === null`, or zero client rects; `pickFrom(widgetRoot)` (root = `.select__control` parent, else element parent) is tried before any document-wide fallback, so unrelated visible option lists (intl-tel country list) can't hijack the pick. Async/server-driven search (Greenhouse location) covered by the type→wait→click path with a longer 12×200 ms option wait. SPA render-wait extended from 5×300 ms to 10×500 ms in both `AutofillOrchestrator.run()` and the `DETECT_FORMS` handler (background retries on top of that).
  - `contentScript.js` classifier + value map: new `location` rule (`\b(location|where are you based|work location|located)\b`); `buildValueMap` emits `location: profile.address || [city, state].join(", ")`; `FIELD_GROUPS.address` includes `location` so `candidate-location` (a Greenhouse async combobox) now fills.
  - `contentScript.js` dock routing: the in-page `jollyR:triggerFill` / `scanFields` / `clearForms` events now send `ALL_FRAMES_FILL` / `ALL_FRAMES_DETECT` / `ALL_FRAMES_CLEAR` through the background service (toasts show cross-frame totals; still-loading hint when no frame was reached), so the dock fills embedded forms too — not just the popup.
  - Verified: (1) Node VM unit tests for `AllFramesModule` (12/12): both-frame targeting with `frameId`, raw profile passthrough (not `{profile}`), auto-load when value omitted, MANUAL broadcast, retry-stops-on-fill, DETECT concatenation, CLEAR broadcast, no-receiver skip, no-active-tab error. (2) Headless Chrome over localhost HTTP: iframe-embedded form harness → subframe `fieldsFilled: 4` with `firstName`/"Grace", gender combobox/"Female", race select/"White", location combobox/"New York, NY" (parent 0); combobox scoping harness (visible intl-tel country list decoy) → country "United States" from its own flyout, decoy `phoneListClicked: false`; async location harness (options injected 300 ms after typing) → "New York, NY". Harnesses in `%TEMP%\opencode\jr-combobox-test\` (`bg-allframes-test.js`, `test-server.py`, `parent.html`, `iframe-form.html`, `scoping-test.html`, `async-location-test.html`); note `popup-frames-test.js` there is stale (tests the deleted popup helpers).
  - Reminder: after loading this round in `chrome://extensions`, hard-refresh the QuinStreet careers tab so the new content script + background service take effect.
  - Affected: `background.js`, `popup.js`, `contentScript.js`, `AGENTS.md`.

- **2026-08-09 — Cross-frame filling + Greenhouse-style combobox widgets**
  - Fixed: forms embedded in subframes (e.g. Greenhouse job boards as cross-origin iframes on a company careers page, like QuinStreet) were invisible to the popup. `popup.js` `sendToActiveTab()` used `chrome.tabs.sendMessage(tab.id, ...)`, which only reaches the top frame. Added `sendToActiveTabAllFrames()` (enumerates frames via `chrome.webNavigation.getAllFrames({ tabId })`, sends per-`frameId`, collects responses) and `mergeFillResults()` (sums `fieldsFilled`, keeps any success, first error). Rewired `detectFormsOnPage` (concatenates `forms` arrays from all frames), `checkAtsStatus`, the Fill Application, Manual Fill, and both Clear buttons to use the all-frames path.
  - Fixed: `contentScript.js` never created the fill pipeline in subframes — `ensureUi()` early-returned for `isFrameWindow`, so `state.autofill` stayed null and frame fills answered "Page not ready." `ensureUi()` now builds `AutofillOrchestrator` in frames with a `createFrameUiStub()` no-op UI (dock/toasts only ever render in the top frame).
  - Added: `FormFiller.fillCombobox()` for React-Select / Greenhouse style `role="combobox"` widgets (not real `<select>`s). Opens the flyout via mousedown/click on `.select__control`, clicks the matching `[role="option"]` (normalized via `_normOptionText`); falls back to typing (native setter + input event) and Enter. Dispatched from `AutofillOrchestrator.run()` and the `MANUAL_FILL_FORM` handler when `role="combobox"` or `aria-haspopup="true"`.
  - Added: SPA render-wait — `run()` and `DETECT_FORMS` retry `scan()` up to 5× every 300 ms so forms that render after network idle (React embeds) are still found.
  - Verified headlessly: (1) single-frame page with combobox + select + radio + checkbox → `fieldsFilled: 5`, combobox value "Female"; (2) iframe-embedded form (top page + subframe both running the content script) → `fieldsFilled: 3` in the subframe, text/combobox/select all set; (3) `popup.js` frame logic unit-tested in Node VM: reaches top + subframe, merges totals, skips frames with no receiver, concatenates `DETECT_FORMS` lists.
  - Affected: `contentScript.js`, `popup.js`, `AGENTS.md`.

- **2026-08-09 — EEO/legal radio & checkbox group fill fixes**
  - Fixed: radio groups (gender, race, veteran, disability, etc.) were never filled. `fillRadioGroup()` ended with `this.fillCheckbox(pick, true)`, but `fillCheckbox` returned `false` for any element whose type wasn't `checkbox`; the guard now accepts `radio` too (verified headlessly: `fieldsFilled` went 0 → 4 on a mixed radio/select/checkbox EEO page).
  - Fixed: EEO fields misclassified as `consent_terms` when the question contained "voluntary"/"eeo" (e.g. "Disability Status (voluntary self-identification)"). Consent rule base score is now capped (`field.startsWith("consent")`) so specific legal/EEO rules always outrank generic consent wording; also removed `voluntary|eeo` from the `consent_terms` pattern.
  - Fixed: option-label resolution only checked `opt.closest("label")`, missing `<label for="...">` sibling labels (iCIMS/Taleo style). Added `_getOptionLabel()`; also added `_normOptionText()` (collapses `/` and "or" so "Hispanic/Latino" matches "Hispanic or Latino") and `_matchesOption()` (substring + token fallback) used by `fillRadioGroup`, `fillCheckboxGroup`, and `_fillSelect`.
  - Fixed: `fillCheckboxGroup` only grouped by shared `name` (or single parent), missing multi-select groups with distinct per-option names; it now walks up to the nearest container holding several checkboxes.
  - Verified end-to-end in headless Chrome against a synthetic ATS page (label-wrapped radios, label-for radios, selects, shared-name and distinct-name checkbox groups).
  - Affected: `contentScript.js`, `AGENTS.md`.

- **2026-08-09 — EEO / legal / consent / position / experience / cover letter filling**
  - The autofill engine now fills EEO, legal/eligibility, consent checkboxes, position details, experience/certifications, cover letter (text + file), referral, and reference fields, driven by a manually expanded profile.
  - Consent checkboxes are NOT auto-accepted: the user enables per-item consent toggles in the popup (`consentBackgroundCheck`, `consentDrugScreening`, `consentSignature`, `consentTerms`), all default OFF; `buildValueMap` only emits `consent_*` booleans when the matching profile toggle is on.
  - `contentScript.js`: `buildValueMap` expanded to map `legal` (work_authorization→Yes/No, sponsorship, age_confirmation), `position` (employment_type, start_date, relocate, travel), `eeo` (gender, race, veteran_status, disability_status, with "Prefer not to say" as a selectable value), `years_experience`, `certifications`, `cover_letter`, `referral_source`, `referred_by`, `why_interested`, references fields, and `consent_*`. Added `loadStoredFile(key)` generalized from `loadStoredResume()` plus `loadStoredCoverLetter()` wrapper. `AutofillOrchestrator.run()` and the `MANUAL_FILL_FORM` handler now dispatch by control type (checkbox→`fillCheckbox`/`fillCheckboxGroup`, radio→`fillRadioGroup`, file→`fillFileUpload`, else→`fillElement`), attach the stored cover letter to `detector.coverLetterUploadFields`, and include consent + file uploads in `filled` and completion totals.
  - `popup.html`: added Profile sections (Eligibility & Legal, Position Details, EEO Voluntary with "Prefer not to say" options, Application Details incl. cover letter text, consent checkbox group with explanatory note) and a Cover Letter file-drop in the Application tab.
  - `popup.js`: `PROFILE_FIELDS` expanded with all new keys; added `PROFILE_CHECKBOXES` (consent toggles); `readProfileForm`/`fillProfileForm`/clear-profile handle checkboxes; added cover-letter upload handler storing `coverLetterFile` (base64) via `chrome.storage.local`, mirroring `sharedPDFData`.
  - Affected: `contentScript.js`, `popup.html`, `popup.js`, `AGENTS.md`.

- **2026-08-09 — Resume upload fields filled from stored resume**
  - The uploaded resume (stored as `sharedPDFData` base64 by the popup) is now actually attached to detected resume/CV `<input type="file">` fields during autofill; previously detection populated `resumeUploadFields` but nothing consumed them.
  - `contentScript.js`: added `FormFiller.fillResumeFile()` (DataTransfer-based file assignment) and `loadStoredResume()` (base64 data URL → `File`); `AutofillOrchestrator.run()` and the `MANUAL_FILL_FORM` handler now attach the resume to `detector.resumeUploadFields` and count them in completion totals.
  - Affected: `contentScript.js`.

- **2026-08-09 — Right-edge dock: tucked sliver instead of floating pill**
  - In-page jolly R UI moved from the top-right pill to a bottom-right edge dock. Resting state is a ~10px sliver; hovering slides out a slim vertical tab; clicking pops the full panel out from the right edge; the header close (X) tucks it back in.
  - `contentScript.css`: `.jR-root` anchored to `right: 0; bottom: 8px`; `.jR-panel` uses `transform-origin: bottom right` + one-time `jR-slide-in` animation via `.open`; `.jR-trigger` restyled as a vertical dock tab (`translateX(calc(100% - 10px))` default, `translateX(0)` on hover/focus).
  - `contentScript.js`: renamed `POPUP_MODE.BUTTON` → `POPUP_MODE.TUCKED`; `_renderTrigger()` → `_renderTab()`; `_update()` tracks `_prevMode` so the slide-in only plays on the TUCKED→EXPANDED transition; host inline position changed to bottom-right.
  - Affected: `contentScript.css`, `contentScript.js`.

- **2026-08-06 — PDF feature made functional end-to-end**
  - Vendored Mozilla PDF.js at `lib/pdfjs/build/pdf.js` + `pdf.worker.js` (previously referenced but missing).
  - Added those files to `web_accessible_resources` in `manifest.json`.
  - `popup.html` now loads `lib/pdf-processor.js`.
  - `popup.js` resume upload: PDFs are now text-extracted via `RealPDFProcessor` and personal info is extracted (name/email/phone/skills/experience); stored as `sharedPDFData.resumeText` + `resumeInfo`. Non-PDF uploads still store as base64.
  - README: replaced non-existent RAG/legacy claims with the actual v2 architecture; corrected file-structure listing.
  - Affected: `manifest.json`, `popup.html`, `popup.js`, `README.md`, `lib/pdfjs/**`.

- **2026-08-06 — contentScript.js: popup protocol + idempotent init**
  - Added message handlers so the popup's actions actually work: `DETECT_FORMS`, `GET_ATS_STATUS`, `MANUAL_FILL_FORM`, `FILL_JOB_APPLICATION`, `CLEAR_ALL_FORMS` (previously handled only in the unloaded legacy `content.js`).
  - Added module-level `state` + `FIELD_GROUPS` and an `ensureUi()` helper; `init()` is now idempotent (`state.initialized` guard) so the DOM-removal monitor re-creates the UI without re-registering listeners (fixes duplicate-init/leak).
  - Extracted `buildValueMap()` + `clearFormFields()`; `AutofillOrchestrator.run()` now returns `{ fieldsFilled }` instead of `undefined`.
  - `NetworkIdleMonitor.waitForIdle()` no longer leaks its `setTimeout` on early resolve.
  - `generatePassword()` now uses `crypto.getRandomValues` (removed `Math.random`-based `rand()`).
  - `saveCredentials()` no longer stores the raw password in plaintext (stores id only when the vault isn't available).
  - Affected: `contentScript.js`.

- **2026-08-06 — popup.js: security & XSS fixes**
  - Added `escapeHtml()` and escaped all `innerHTML` interpolation of page/ATS data (history entries, detected forms, saved credentials).
  - `generateStrongPassword()` rewritten with `crypto.getRandomValues` (was `Math.random`).
  - CSV export now quotes the URL column.
  - Affected: `popup.js`.

- **2026-08-06 — background.js: OPEN_POPUP handling**
  - Added handler for the `OPEN_POPUP` message (open the extension popup) which was previously unhandled.
  - Affected: `background.js`.

- **2026-08-06 — manifest.json: web_accessible_resources cleanup**
  - Removed `images/*` and `fonts/*` entries that point to non-existent directories.
  - Affected: `manifest.json`.

## Executing Changes (standard loop)

1. Edit source. `contentScript.js` is vanilla JS (no imports); React lives in `src/` and builds with Vite.
2. `node --check contentScript.js` after touching it.
3. `npx tsc --noEmit` after touching `src/`.
4. `npm test -- --run` — all suites must pass before shipping.
5. `npm run build` — runs tsc, Vite, and the copy script; ships to `dist/`.
6. Manual check: chrome://extensions → reload the unpacked extension (from `dist/`), then **hard-refresh the target tab** — content scripts from older builds survive page refreshes.
7. Record every change in the Change Log above: root cause, files, verification, and what was not verified.
8. Never commit unless the owner explicitly asks.

## Plan Folder

A `plan/` folder must exist at the project root for storing design and approach documents.

## Task Folder

A `task/` folder must exist at the project root for tracking individual work items.
