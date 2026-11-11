# Fix Plan — jolly R Job Autofill Extension

## Root cause
The extension ships two parallel content-script architectures:
- **v2 (active)**: `contentScript.js` (Shadow DOM UI) — loaded by `manifest.json`.
- **legacy (dead)**: `content.js` (inline UI, 1975 lines) — NOT loaded by manifest, but the popup's message protocol was only implemented there.

Result: popup buttons sent messages no one handled; feature was broken end-to-end.

## Status

| # | Item | Status |
|---|------|--------|
| 1 | Protocol gap: port popup handlers into `contentScript.js` | DONE |
| 2 | `init()` idempotent + UI re-create without listener leak | DONE |
| 3 | Crypto-secure password generation (both popup + content script) | DONE |
| 4 | No plaintext password storage | DONE |
| 5 | `web_accessible_resources` nonexistent refs | DONE |
| 6 | `OPEN_POPUP` unhandled in background | DONE |
| 7 | XSS via `innerHTML` in popup.js | DONE |
| 8 | CSV export URL quoting | DONE |
| 9 | PDF feature made functional (vendored PDF.js, wired processor, WAR) | DONE |
| 10 | README accuracy (v2 arch, real features, no RAG claims) | DONE |
| 11 | Orphan files (`content.js`, `popup-broken.js`, `popup-fixed.js`, `styles/popup.css`, `database-manager.js`, `job-application-data.js`) | PENDING — needs user decision (delete or archive) |

---

## React build repair (2026-10-30)

Goal: make `npm run build:react` produce a loadable extension and expose the new side panel.

| # | Item | Status |
|---|------|--------|
| R1 | `ai.ts` had five methods all named `_handle` (bad merge) | DONE — renamed to `_handleClearKeys`, `_handleTestConnection`, `_handleListModels`, `_handleChat`, `_handleCancel` |
| R2 | `ai.ts` imported `sanitizeProfile`/`truncateJobDescription` from `prompts.ts` | DONE — import moved to `shared/ai/redact.ts` where they are defined |
| R3 | 44 `tsc` errors (storage generics, readonly ATS patterns, unused imports, spread-on-unknown) | DONE — `npx tsc --noEmit` is clean |
| R4 | Vite emitted `dist/src/popup/index.html` (manifest expects `dist/popup.html`) | DONE — root `sidepanel.html` entry, Vite inputs reduced to `sidepanel` + `background`; vanilla popup copied by script |
| R5 | Content script entry is ESM but Chrome needs a classic content script | DONE — ship the vanilla `contentScript.js` unchanged in `dist/` |
| R6 | React popup is a placeholder; vanilla popup works | DONE — vanilla popup ships; header gains a **Best Jobs** button that opens the side panel |
| R7 | Side panel UI (jobs, stars, breakdown, AI settings) | DONE — `src/sidepanel/App.tsx` + FilterBar, JobCard, Stars, AiSettings, sidepanel.css |
| R8 | Verify build + load in Chrome | PARTIAL — `tsc --noEmit` clean, 94/94 tests pass (10 files), `npm run build` (which now runs `tsc` first) emits a correct `dist/`; manual `chrome://extensions` load is still required because Chrome blocks `--load-extension` from the command line |

Full implementation record: `plan/react-migration/06-implementation-status.md`.

Build pipeline after repair:

- `npm run build` = `vite build` + `node scripts/copy-current-to-dist.js`.
- Vite emits `dist/sidepanel.html`, `dist/background.js`, `dist/assets/*`.
- `public/manifest.json` is the manifest of record for `dist/` (sidePanel permission, `type: module` background, `contentScript.js`).
- The copy script copies `popup.html`, `popup.js`, `contentScript.js`, `contentScript.css`, `styles/popup.css`, `lib/pdf-processor.js`, `lib/pdfjs/build/*`, and must **not** copy the root `manifest.json` or `background.js`.
