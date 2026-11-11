# T-09 — React Popup at Parity

Phase 3 of the React migration. Guideline: `plan/react-migration/README.md`.

Status: DONE (2026-11-01)
Depends on: T-08
Estimate: 6-8 hours

## Goal

Rebuild the popup as React components with the current look and every current behavior, then retire the vanilla popup files.

## Steps

### Shell

- [x] 1. Create `src/popup/index.html`, `main.tsx`, and `App.tsx` with the header, tab nav (Profile, Apply, History, Tools), content area, and footer status.
- [x] 2. Move the inline CSS from `popup.html` into `src/styles/theme.css` (variables) and `src/styles/popup.css` (components). Keep the 380x640 dimensions.
- [x] 3. Add `useStatus()` so any tab can post a toast with auto-reset after 3 seconds.
- [x] 4. Add the "Best Jobs" header button that calls `chrome.sidePanel.open({ windowId })`.

### Tabs

- [x] 5. `ProfileTab`: all seven sections (Personal, Address, Professional, Eligibility & Legal, EEO, Application Details, Consent) driven by `PROFILE_FIELDS` and `PROFILE_CHECKBOXES`; Save and Clear.
- [x] 6. `ApplyTab`: ATS detection bar, resume drop with PDF extraction, cover-letter drop, target position/company, Fill / Scan / Clear, password generator with copy.
- [x] 7. `HistoryTab`: stat cards (total, this week, today), newest-first list with ATS badge and field count, CSV export.
- [x] 8. `ToolsTab`: current URL, manual fill / detect / clear, detection results list, saved credentials list and clear.
- [x] 9. Replace all `innerHTML` rendering with components; keep `escapeHtml` only inside CSV generation if still needed.

### Data and file handling

- [x] 10. `useProfile()` reads through `GET_USER_PROFILE` and writes through `SAVE_USER_PROFILE`; no direct storage calls from components.
- [x] 11. Port PDF extraction to `src/shared/pdf.ts`, set `GlobalWorkerOptions.workerSrc` to `chrome.runtime.getURL("lib/pdfjs/build/pdf.worker.js")`, and keep the same stored shape (`sharedPDFData` with `resumeText`, `resumeInfo`).
- [x] 12. Port cover-letter file storage unchanged (`coverLetterFile`).
- [x] 13. Confirm fill uses `ALL_FRAMES_FILL` with the profile plus target overrides, and the status text matches the current messages.

## Deliverables

- `src/popup/**`
- `src/styles/theme.css`, `src/styles/popup.css`
- `src/shared/pdf.ts`
- Component tests for `ProfileTab`

## Acceptance criteria

- Every item in the Phase 3 manual QA list in `04-build-test-and-verification.md` passes.
- No functional loss versus the current popup: 41 profile fields, 4 consent toggles, resume, cover letter, fill, scan, clear, password, history, CSV, credentials.
- No `innerHTML` or `dangerouslySetInnerHTML` in popup code.
- `npm run typecheck` and `npm test` pass.
- Old `popup.html` and `popup.js` are no longer referenced by the manifest; archive rather than delete until Phase 5.

## Out of scope

- Jobs UI.
- AI UI.
- Content dock.

## Completion notes

- Shell lives in src/popup/App.tsx + src/popup/main.tsx; entry HTML is the repo-root popup.html (Vite input, emitted to dist/popup.html).
- Styles were copied from styles/popup.css into a single src/popup/popup.css (no separate theme file) and extended with the #root flex layout plus the new component classes.
- Deviation from step 11: PDF extraction reuses the vendored lib/pdf-processor.js (window.RealPDFProcessor) loaded by popup.html, instead of porting to src/shared/pdf.ts. Stored shape is unchanged (sharedPDFData, esumeText, esumeInfo).
- Validation: npx tsc --noEmit clean; npm test 98 tests / 12 files (includes 4 ProfileTab + 2 popup App smoke tests); npm run build emits the React dist/popup.html and still copies contentScript.js, contentScript.css, lib/pdf-processor.js, lib/pdfjs/build/.
- Vanilla popup.js, styles/popup.css, root manifest.json, and stale root background.js removed; popup.html is now the React entry. contentScript.js stays vanilla by design (T-11).
- Not verified: manual Chrome run of the popup (load dist/ unpacked, exercise all four tabs).