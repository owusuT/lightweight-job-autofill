# Current Tasks

## T-01 (DONE) — Make popup actions work
Wire `DETECT_FORMS`, `GET_ATS_STATUS`, `MANUAL_FILL_FORM`, `FILL_JOB_APPLICATION`, `CLEAR_ALL_FORMS` into `contentScript.js`.

## T-02 (DONE) — Security pass
Crypto-secure passwords, no plaintext passwords in storage, XSS escaping in popup.

## T-03 (DONE) — Build/manifest integrity
Fix `web_accessible_resources`, handle `OPEN_POPUP`, CSV URL quoting.

## T-04 (DONE) — PDF feature decision
Chose option (a): vendored PDF.js, wired `RealPDFProcessor` into popup.js, added WAR entries.
Verified `pdf.js` (320KB) + `pdf.worker.js` (1MB) parse/load; `node --check` passes on all edited JS.

## T-05 (DONE) — Orphan file cleanup
Deleted `content.js`, `popup-broken.js`, `popup-fixed.js`, `styles/popup.css`, `database-manager.js`, `job-application-data.js`, `injectScript.js`, `injectScriptHandler.js`, vanilla `popup.js`, stale root `background.js`, and the stale root `manifest.json`. Closed by T-11 step 12.

## T-06 (DONE) — README accuracy
Updated to v2 architecture: contentScript.js, keep-alive port, real PDF feature; removed RAG/legacy claims; corrected file tree.

---

# React Migration (guideline: `plan/react-migration/`)

Phase-by-phase work items. Complete in order; each phase must end loadable from `dist/`.

## T-07 (DONE) — Toolchain and shared modules
`task/T-07-toolchain-and-shared.md` — Vite/TS/Vitest build, inert `dist/` port, `src/shared/` extraction, scoring module. Est. 3-4h.

## T-08 (DONE) — Background port, jobs service, AI proxy
`task/T-08-background-jobs-ai.md` — background ported to TS ESM, `GET_JOBS` + cache, four AI adapters, side panel permission. Compiles to `dist/background.js`. Details: `plan/react-migration/06-implementation-status.md`.

## T-09 (DONE) — React popup at parity
`task/T-09-react-popup.md` — Profile, Apply, History, Tools tabs in React (`src/popup/**`), entry `popup.html`, PDF extraction via vendored `lib/pdf-processor.js`. 98 tests / 12 files (4 ProfileTab + 2 popup App smoke tests). `dist/popup.html` is the React build; vanilla `popup.js` and `styles/popup.css` removed.
Not verified: manual Chrome run of the four tabs.

## T-10 (DONE) — Jobs side panel, ratings, AI settings
`task/T-10-sidepanel-jobs-ai.md` — best jobs sorted by match score, stars, breakdown, provider cards, per-task models, draft modal. Implemented in `src/sidepanel/`.
Follow-up pass closed the gaps: real `AI_CANCEL`, `parseTailorJson`, tailor modal, regenerate with cache bypass, saved drafts (`aiDrafts`), key reveal, model override, status dots, clear-all-keys, session usage, privacy list, reason chips. 94 tests / 10 files pass; `npm run build` gates on `tsc --noEmit`. Insert-into-page and component tests move to T-11 (doc 06 §7a).

## T-12 (DONE) — Capture the job on the current page
`task/T-12-job-page-capture.md` — "Add page" in Best Jobs sends `CAPTURE_JOB` to the active tab, converts and scores the raw job, merges with search results, and persists it to `chrome.storage.local.capturedJobs` (cap 50, dedupe by URL). Captured jobs bypass the age filter. 10 new capture tests + 2 salary tests; 92 tests / 10 files.
Extended same day to LinkedIn and Indeed, detail pages and result cards: JSON-LD first on detail pages, `data-testid`/aria-label/URL heuristics otherwise, canonical URL normalization for dedupe. 112 tests / 13 files.
Not verified: manual Chrome run on Glassdoor, LinkedIn, or Indeed.
2026-11-06: LinkedIn search pages now prefer result cards over an open detail pane (`currentJobId` no longer forces detail mode), linkless list items fall back to `closest("li")`, and the side panel has a "Clear added" button that removes only captured jobs. 135 tests / 15 files.

## T-11 (DONE, dock rewrite skipped by owner) — React content dock, AI questions, cleanup
`task/T-11-content-dock-cleanup.md` — engine extraction, React dock, review-first AI question apply, orphan removal, docs.
DONE: review-first AI question capture/apply (`AI_QUESTION_CANDIDATES` + `AI_APPLY_ANSWER`, token-stamped fields, per-frame fan-out, picker in the draft modal) on the vanilla content script.
DONE: side panel close button (×) in header and filter bar.
DONE: orphan cleanup (T-05 closed), README/INSTALLATION/plan docs, test-count refresh, `public/manifest.json` at 3.0.0.
SKIPPED by owner: React dock rewrite and engine extraction; `contentScript.js` stays vanilla.

## T-13 (DONE) - Generic field detection for unfamiliar sites
Design: `docs/superpowers/specs/2026-11-01-generic-field-detection-design.md`; plan: `docs/superpowers/plans/2026-11-01-generic-field-detection.md`.
- `contentScript.js`: _getLabel() adds aria-labelledby, aria-label, fieldset legend fallback, and bounded nearby text; _classify() adds autocomplete tokens (direct field map), data-automation-id/testid, and email-before-address precedence.
- Fixed `professional experience` being classified as `years_experience`; `post code` now maps to ZIP.
- New `src/shared/contentScriptDetection.test.ts` covers 10 field types plus hidden-field exclusion.
- Verified: node --check, tsc --noEmit, 113 tests / 14 files, npm run build. Not verified: live unfamiliar ATS page.
