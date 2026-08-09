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

## T-05 (OPEN) — Orphan file cleanup
`content.js`, `popup-broken.js`, `popup-fixed.js`, `styles/popup.css`, `database-manager.js`, `job-application-data.js` are not referenced by `popup.html`/`manifest.json`.
Owner: needs user decision (delete vs archive).

## T-06 (DONE) — README accuracy
Updated to v2 architecture: contentScript.js, keep-alive port, real PDF feature; removed RAG/legacy claims; corrected file tree.
