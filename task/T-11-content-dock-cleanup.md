# T-11 — React Content Dock, AI Question Capture, Cleanup

Phase 5 of the React migration. Guideline: `plan/react-migration/README.md`.

Status: DONE except the React dock rewrite (owner opted out; the vanilla content script dock stays)
Depends on: T-08, T-09, T-10
Estimate: 8-10 hours

## Goal

Move the in-page UI to React without touching fill behavior, add review-first AI drafting for free-text application questions, remove legacy files, and update docs.

## Steps

### Engine extraction

- [ ] 1. Split `contentScript.js` into `engine/detector.ts`, `engine/filler.ts`, `engine/orchestrator.ts`, `engine/values.ts`, `engine/networkIdle.ts`, `engine/messaging.ts`. Move code, do not rewrite logic.
- [ ] 2. Preserve: combobox scoping with visibility checks, EEO radio and checkbox group fills, option label resolution, SPA render waits, resume and cover-letter attachment, all-frames message handlers.
- [ ] 3. Keep message names from `src/shared/messages.ts`; do not retype strings.

### React dock

- [ ] 4. Create `content/index.tsx`: idempotent init, shadow host, `createRoot`, mount `Dock` and `Toasts`, with the existing frame-stub behavior for subframes.
- [ ] 5. Rebuild the tucked sliver, hover tab, expanded panel, Fill / Scan / Clear actions, and cross-frame toast totals in `ui/Dock.tsx` and `ui/Toasts.tsx`.
- [ ] 6. Inject `contentScript.css` via `?inline` into the shadow root; keep host positioning in the manifest `css` entry.
- [ ] 7. Route dock actions through `ALL_FRAMES_FILL`, `ALL_FRAMES_DETECT`, and `ALL_FRAMES_CLEAR` exactly as today.

### AI question capture

- [x] 8. Detect unmatched free-text fields (textarea and text inputs with question-like labels) and expose them as `AI_QUESTION_CANDIDATES`.
- [x] 9. Add `AI_APPLY_ANSWER` so the side panel can set one field value and dispatch the correct input/change events.
- [x] 10. In the side panel, list captured questions with per-field Generate and Apply. Never batch-apply.
- [x] 11. Exclude EEO, consent, legal, and file fields from AI question capture.
- [x] 12. Add close button (×) to side panel header and filter bar that clears state (drafts, toasts) and calls `chrome.sidePanel.close()`.

### Cleanup and docs

- [x] 12. Remove `popup.html`, `popup.js`, `background.js`, `contentScript.js`, `content.js`, `popup-broken.js`, `popup-fixed.js`, `styles/popup.css`, `database-manager.js`, `job-application-data.js`, `injectScript.js`, `injectScriptHandler.js`, or archive them under `legacy/`. This closes T-05.
  - Done: vanilla `popup.js`, `styles/popup.css`, root `manifest.json`, and stale root `background.js` deleted; `popup.html` is now the React entry. `contentScript.js` stays vanilla by owner decision (it is still the shipping engine and dock).
- [x] 13. Update `README.md` for the React architecture, side panel, ratings, and AI providers.
- [x] 14. Update `Agents.md` with a migration entry and the new file map.
- [x] 15. Bump `manifest.version` to `3.0.0` and update `task/current-tasks.md` statuses.

## Deliverables

- `src/content/**`
- `src/sidepanel` question list and apply flow
- Updated `README.md`, `Agents.md`, `task/current-tasks.md`
- Legacy files removed or archived

## Acceptance criteria

- Every item in the Phase 5 manual QA list in `04-build-test-and-verification.md` passes.
- Fill field counts and cross-frame totals match the pre-migration build on the recorded harnesses.
- Dock is a React component and no vanilla DOM builder remains.
- AI drafts apply one field at a time, only after a click.
- No orphan file references remain; `rg` checks in the QA list return nothing.
- `npm run typecheck`, `npm test`, and `npm run build` pass.

## Out of scope

- Further fill-recipe improvements.
- Auto-submit or unattended application flows.

## Completion notes (2026-11-01)

- Owner decision: no React dock rewrite and no engine extraction. `contentScript.js` remains the vanilla engine plus dock.
- Verification: `npx tsc --noEmit` clean; `npm test` 98 tests / 12 files; `npm run build` emits the React `dist/popup.html`, `dist/sidepanel.html`, `dist/background.js`, and `dist/manifest.json` (3.0.0), and copies `contentScript.js`, `contentScript.css`, `lib/pdf-processor.js`, `lib/pdfjs/build/`.
- Remaining: manual Chrome QA (load `dist/` unpacked and run the Phase 5 checklist). Steps 1-7 stay unchecked by design.
