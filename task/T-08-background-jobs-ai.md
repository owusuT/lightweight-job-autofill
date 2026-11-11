# T-08 — Background Port, Jobs Service, AI Proxy

Phase 2 of the React migration. Guideline: `plan/react-migration/README.md`.

Status: pending
Depends on: T-07
Estimate: 5-6 hours

## Goal

Port `background.js` to a bundled TypeScript ES module with identical behavior, add the Arbeitnow job service, add the AI provider proxy with local key storage, and enable the side panel.

## Steps

### Background port

- [ ] 1. Create `src/background/index.ts` and move the module registry and Chrome event listeners from `background.js` verbatim.
- [ ] 2. Port `TabStateService` to `modules/tabState.ts`, `UserDataService` to `modules/userData.ts`, `AtsModule` to `modules/ats.ts`, `DataModule` to `modules/data.ts`, `AllFramesModule` to `modules/allFrames.ts`, `CommonModule` to `modules/common.ts`.
- [ ] 3. Import message names from `src/shared/messages.ts`; do not retype strings.
- [ ] 4. Set `background.type: "module"` in the manifest and confirm the service worker registers from `dist/background.js`.
- [ ] 5. Confirm every existing message still responds, especially `ALL_FRAMES_FILL` retry behavior and its `{ success, fieldsFilled, framesReached, perFrame, error }` shape.

### Jobs

- [ ] 6. Create `modules/jobs.ts` with `GET_JOBS`: cache by `query|remote|visa|limit` in `storage.local.jobCache`, 15 minute TTL.
- [ ] 7. Normalize Arbeitnow records to `Job`, drop entries missing `title` or `url`, de-duplicate by `url`, cap at 100.
- [ ] 8. Preserve stale cache on fetch failure and return the error in the response.
- [ ] 9. Add `jobs.test.ts` with fetch mocked: normalization, dedupe, cache hit, stale-cache-on-error.

### AI

- [ ] 10. Create `src/shared/ai/providers.ts` with the four adapters from `02-ai-provider-layer.md` plus `resolveTaskModel` in `src/shared/ai/tasks.ts`.
- [ ] 11. Create `src/shared/ai/prompts.ts` and `src/shared/ai/redact.ts`; enforce the field allowlist and 4,000-character description cap.
- [ ] 12. Create `src/shared/ai/cache.ts` with a SHA-256 key, 24h TTL, 50-entry cap.
- [ ] 13. Create `modules/ai.ts` implementing `AI_GET_SETTINGS`, `AI_SET_SETTINGS`, `AI_CLEAR_KEYS`, `AI_TEST_CONNECTION`, `AI_LIST_MODELS`, `AI_CHAT`, `AI_CANCEL`.
- [ ] 14. Store keys only in `storage.local.aiKeys`; ensure `AI_GET_SETTINGS` returns booleans, never key values. Store non-secret config in `storage.sync.aiConfig`.
- [ ] 15. Add 30s timeout, `AbortController` per `requestId`, in-flight dedupe, and the normalized error codes.
- [ ] 16. Add provider request-builder tests, error-mapping tests, task-resolution tests, and prompt redaction tests.

### Side panel plumbing

- [ ] 17. Add `sidePanel` permission, `side_panel.default_path`, and `minimum_chrome_version: "116"` to the manifest.
- [ ] 18. Call `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })` on install and startup.
- [ ] 19. Decide and document whether host permissions narrow to the four endpoints or stay `*://*/*`. Update `plan/react-migration/01-architecture.md` with the choice.

## Deliverables

- `src/background/**` fully typed and bundled
- `src/shared/ai/**`
- Background tests for jobs and AI

## Acceptance criteria

- `npm run typecheck` and `npm test` pass.
- Profile save/load, history, and fill work from the bundled service worker.
- `GET_JOBS` returns normalized jobs and serves a cached response within 15 minutes.
- `AI_TEST_CONNECTION` without a key returns `NO_KEY`; with a bad key returns `AUTH`; with a valid key returns `ok`.
- No path returns key material to a caller.
- Side panel entry appears when the side panel is opened manually.

## Out of scope

- React UI for jobs or AI.
- Changing fill heuristics.
- Streaming responses.
