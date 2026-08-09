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
| 11 | Orphan files (`content.js`, `popup-broken.js`, `popup-fixed.js`, `styles/popup.css`, `database-manager.js`, `job-application-data.js`) | PENDING — needs user decision (delete vs archive) |
