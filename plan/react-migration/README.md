# React Migration — Project Guideline

Status: partially implemented. Build pipeline and side panel are live in `dist/`; React popup and React content dock are pending. Details: `06-implementation-status.md`.
Owner: project maintainer.
Scope: convert jolly R from a vanilla MV3 popup to a React + TypeScript extension, add a Chrome Side Panel for best jobs with computed ratings, and add a user-selectable AI provider layer.

## Decisions (locked)

| Decision | Choice |
|---|---|
| UI framework | React 18 + TypeScript, built with Vite |
| Where React runs | Popup, side panel, and the in-page dock (mounted in Shadow DOM) |
| Fill engine | Plain TypeScript DOM modules, not React (React cannot fill host-page inputs) |
| Side view | Native Chrome Side Panel (`chrome.sidePanel`), Chrome 116+ |
| Rating source | Deterministic computed match score, 0-100 mapped to 1-5 stars |
| Job source | Arbeitnow job board API, fetched from the background service worker |
| AI providers | OpenAI, Anthropic, OpenRouter, Custom OpenAI-compatible |
| AI key storage | `chrome.storage.local` only, never synced, never exposed to content scripts |
| AI model selection | Per task: cover letter, answers, profile tailoring, form questions |
| AI picker surface | Side panel only |
| AI execution | Background service worker; no provider SDKs, raw `fetch` |
| AI autonomy | Draft-only; the user reviews and applies each output explicitly |

## Non-goals

- No rewrite of the form-filling heuristics. The engine is extracted, not redesigned.
- No AI job re-ranking. Ratings stay deterministic and work with no API key.
- No auto-submit, no silent AI fills, no auto-accepted consent or EEO answers.
- No new backend service. Keys stay in the browser.
- No mobile or Firefox support.

## Phase map

| Phase | Task file | Goal | Estimate | Status |
|---|---|---|---|---|
| 1 | `task/T-07-toolchain-and-shared.md` | Vite/TS/Vitest toolchain, `dist` build, shared modules | 3-4h | DONE |
| 2 | `task/T-08-background-jobs-ai.md` | Background to TS, JobService, AiModule, side-panel plumbing | 5-6h | DONE (compiles, ships as `dist/background.js`) |
| 3 | `task/T-09-react-popup.md` | React popup at parity with the current popup | 6-8h | DONE (§7d); `dist/popup.html` is the React build |
| 4 | `task/T-10-sidepanel-jobs-ai.md` | Jobs side panel, ratings, provider and per-task model UI | 9-11h | DONE (see doc 06 §7a) |
| 5 | `task/T-11-content-dock-cleanup.md` | React dock, AI question capture, orphan cleanup, docs | 8-10h | DONE except the React dock rewrite (owner opted out); AI capture/apply (§7b), cleanup, and docs are complete |

Total: roughly 31-39 focused hours.

## Guideline documents

1. `01-architecture.md` — runtime map, build pipeline, file tree, manifest, messages, storage.
2. `02-ai-provider-layer.md` — provider adapters, settings, prompts, safety, cost control.
3. `03-jobs-scoring-sidepanel.md` — job data, scoring weights, side panel UX.
4. `04-build-test-and-verification.md` — scripts, test matrix, QA checklists, risks.
5. `05-design-system.md` — Obsidian & Platinum visual language.
6. `06-implementation-status.md` — what actually shipped, fixes applied, verification evidence, gaps.

## Compatibility contract

These must not change during the migration:

- Storage keys and shapes: `userProfile` (sync), `appHistory`, `sharedPDFData`, `coverLetterFile`, `savedCreds`, `config` (local).
- All message types in `background.js` today: `GET_USER_PROFILE`, `SAVE_USER_PROFILE`, `GET_APP_HISTORY`, `ADD_APPLICATION`, `GET_ATS_STATUS`, `ATS_ENABLE`, `ATS_APPLICATION_COMPLETE`, `CONTENT_SCRIPT_LOAD`, `ALL_FRAMES_FILL`, `ALL_FRAMES_MANUAL`, `ALL_FRAMES_DETECT`, `ALL_FRAMES_CLEAR`, `OPEN_POPUP`.
- Autofill behavior recorded in `Agents.md`: cross-frame fill, combobox scoping, EEO radio/checkbox groups, SPA retry, resume and cover-letter attachment.
- Popup dimensions: 380 x 640.

## Conventions

- One source of truth for message names, profile fields, and storage helpers in `src/shared/`.
- No comments in code unless they explain a non-obvious constraint.
- Pure logic (scoring, password, CSV, prompt building) is unit tested.
- Every phase ends in a state that loads from `dist/` in Chrome.
- Do not delete a working surface until its replacement passes the phase checklist.
