# Implementation Status — React Build Repair and Side Panel

Date: 2026-10-30
Status: buildable and loadable from `dist/`; side panel implemented; React popup and React content dock still pending.

## 1. Why the new features were not visible

The repository carried two parallel architectures:

| Surface | Before this change | After this change |
|---|---|---|
| Popup | Vanilla `popup.html` + `popup.js` (working) | React popup in `src/popup/**` with all four tabs at parity (T-09); vanilla files removed |
| Content script | Vanilla `contentScript.js` (working, 70 KB) | Unchanged vanilla content script |
| Background | Vanilla `background.js` (no jobs or AI) | TypeScript port compiled to `dist/background.js` (jobs + AI included) |
| Side panel | React placeholder `App.tsx` (3 lines) | Implemented Jobs and AI settings UI |
| Build | `npm run build` copied vanilla files only; `npm run build:react` crashed | `npm run build` runs Vite + copies the vanilla surfaces |

The "new items" were stubs. `src/popup/App.tsx`, `src/sidepanel/App.tsx`, and `src/content/index.tsx` were placeholder text. The Vite build also failed, so even the stubs were never compiled.

## 2. Root causes fixed in the React build

| # | Problem | Fix |
|---|---|---|
| 1 | `src/background/modules/ai.ts` contained five methods all named `_handle` (bad merge) | Renamed to `_handleClearKeys`, `_handleTestConnection`, `_handleListModels`, `_handleChat`, `_handleCancel`; return type corrected to `boolean` |
| 2 | `ai.ts` imported `sanitizeProfile` and `truncateJobDescription` from `shared/ai/prompts.ts`, which never exported them | Imports moved to `shared/ai/redact.ts` where both exist |
| 3 | `prompts.ts` assigned `fetch`-typed profile values into `Record<string, string>` | Only `typeof value === "string"` values are copied |
| 4 | `redact.ts` index assignment across `string` and `boolean` profile fields failed strict typing | Sanitized object built as `Record<string, unknown>` then cast to `Partial<Profile>` |
| 5 | `format.ts` indexed an inline escape map with a `string` key | Hoisted `HTML_ESCAPES: Record<string, string>` |
| 6 | `shared/ai/cache.ts` and `background/modules/jobs.ts` used the storage generic incorrectly (`getLocal<{ aiCache?: CacheData }>` made `result.aiCache` another wrapper) | Generics changed to the value type (`getLocal<CacheData>`, `getLocal<Record<string, JobCacheEntry>>`) |
| 7 | `cache.ts` accepted `Record<string, unknown>` but callers pass `Partial<Profile>` | Signature widened to `object` |
| 8 | `tabState.ts` spread an `unknown` frame state and exposed mutable ATS patterns | `frameStates` typed `Map<number, Record<string, unknown>>`; `detectAts` returns `readonly string[]`; unused import removed |
| 9 | `common.ts` read `port.error`, which is not on `chrome.runtime.Port` | Removed; `chrome.runtime.lastError` is still consumed |
| 10 | `allFrames.ts` set `success` twice in one object literal and had unused imports | `success` computed once, then spread; unused imports removed |
| 11 | `ats.ts` passed an untyped message into `_onContentScriptLoad` and destructured an unused `fieldInfo` | Cast to `{ value?: { windowUrl?: string } }`; unused destructure removed |
| 12 | `test/setup.ts` imported an unused `expect` | Removed |

Result: `npx tsc --noEmit` exits clean.

## 3. Build pipeline

### Commands

| Command | Behavior |
|---|---|
| `npm install` | Installs React 18, Vite 5, TypeScript 5.5, Vitest 2, Chrome types |
| `npm run build` | `tsc --noEmit`, then `vite build`, then `node scripts/copy-current-to-dist.js` |
| `npm run build:react` | Vite build only (background + side panel) |
| `npm run dev` | Vite build in watch mode |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest run (98 tests) |

### Vite inputs (`vite.config.ts`)

| Input | Source | Output |
|---|---|---|
| `popup` | `popup.html` (repo root, React entry) | `dist/popup.html` + hashed JS/CSS in `dist/assets/` |
| `sidepanel` | `sidepanel.html` (repo root) | `dist/sidepanel.html` + hashed JS/CSS in `dist/assets/` |
| `background` | `src/background/index.ts` | `dist/background.js` (ES module) |

`publicDir: 'public'`, so `public/manifest.json` and `public/lib/**` are copied by Vite.

### Copy script (`scripts/copy-current-to-dist.js`)

Copies the vanilla surfaces Vite does not build:

- `contentScript.js`, `contentScript.css` (still vanilla by owner decision)
- `lib/pdf-processor.js`
- `lib/pdfjs/build/*`

It deliberately does **not** copy `manifest.json` or `background.js`. Copying the root manifest overwrote the Vite manifold and dropped `sidePanel`; copying the root background overwrote the jobs/AI service worker.

### `dist/` composition

```
dist/
  manifest.json            (from public/manifest.json, version 3.0.0)
  background.js            (compiled TS background)
  sidepanel.html           (React side panel)
  assets/*.js, *.css       (side panel bundle + shared chunk)
  popup.html               (React popup)
  assets/popup-*.js/.css   (popup bundle)
  contentScript.js/.css    (vanilla content script)
  lib/pdf-processor.js
  lib/pdfjs/build/*
```

## 4. Manifest changes

`public/manifest.json` is the manifest used by `dist/`:

- Version 3.0.0, `minimum_chrome_version: 116`
- Permissions: `storage`, `tabs`, `webNavigation`, `sidePanel`
- Background: `background.js`, `"type": "module"`
- `side_panel.default_path: "sidepanel.html"`
- Content script: `contentScript.js` (vanilla engine)
- Action popup: `popup.html` (React popup)
- Host permissions limited to the four AI/job endpoints

The stale root `manifest.json` and root `background.js` were deleted; `public/manifest.json` is the only manifest.

## 5. Side panel implementation

Files added:

| File | Purpose |
|---|---|
| `sidepanel.html` | Vite HTML entry |
| `src/sidepanel/App.tsx` | Tabs, jobs state, prefs persistence, open/autofill/draft actions, draft modal |
| `src/sidepanel/api.ts` | Typed `chrome.runtime.sendMessage` wrappers for jobs, profile, and AI messages |
| `src/sidepanel/components/FilterBar.tsx` | Query, remote, visa, minimum stars, maximum age |
| `src/sidepanel/components/JobCard.tsx` | Job header, score, badges, actions, expandable breakdown |
| `src/sidepanel/components/Stars.tsx` | Five-star SVG with fractional fill and accessible label |
| `src/sidepanel/components/AiSettings.tsx` | Provider cards, keys, model lists, connection test, per-task models |
| `src/sidepanel/sidepanel.css` | Obsidian & Platinum design tokens and components |

Behavior:

- Loads `jobPrefs` from `chrome.storage.local`; writes back debounced at 250 ms.
- Loads `userProfile` through `GET_USER_PROFILE`; first search defaults to `profile.position`.
- `GET_JOBS` returns raw jobs; the panel scores each with `scoreJob` and sorts with `sortJobs`.
- Filters are applied client-side on `stars` and `postedAt` age.
- "Open" creates a tab. "Open + Autofill" creates a tab, follows the application link when available, and sends `ALL_FRAMES_FILL` with that tab's ID at each wizard step. The background fills across frames in that tab, and the toast reports the number of fields filled.
- "Draft letter" sends `AI_CHAT` with `task: "cover_letter"` and the selected job; the result opens in a copyable modal.
- AI tab reads `AI_GET_SETTINGS`, lists models with `AI_LIST_MODELS`, saves through `AI_SET_SETTINGS`, tests with `AI_TEST_CONNECTION`, and clears keys with `AI_CLEAR_KEYS`.
- Keys are never displayed back; a saved key shows a masked placeholder.

## 6. Popup and background changes

- `popup.html` is now the React entry (root file, Vite input).
- `src/popup/App.tsx`: **Best Jobs** header button calls `chrome.windows.getCurrent()` then `chrome.sidePanel.open({ windowId })` inside the click handler (required user gesture), then closes the popup.
- `src/background/index.ts`: `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })` so the toolbar icon still opens the popup.

## 7. Verification so far

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass, no output |
| `npm test` | 12 files, 98 tests pass |
| `npm run build` | Pass; emits `popup.html`, `sidepanel.html`, `background.js`, hashed assets; copy step logs the vanilla files |
| `dist/background.js` contains `GET_JOBS` and `AI_CHAT` | Confirmed |
| `dist/manifest.json` has `sidePanel` and `type: module` | Confirmed |
| Real Chrome load | **Not yet verified.** Headless Chrome ignored `--load-extension`; recent Chrome blocks loading unpacked extensions from the command line |

Manual verification steps:

1. `npm install` (once).
2. `npm run build`.
3. Open `chrome://extensions`, enable Developer mode, **Load unpacked**, select `dist/`.
4. Click the toolbar icon; the popup should still work.
5. Click **Best Jobs** in the popup header; the side panel should open.
6. Search a role; cards should show scores and stars.
7. Open the AI tab; save a key and press **Test**.

## 7a. T-10 completion pass (same day, follow-up)

Added after the first build:

| Item | Detail |
|---|---|
| Provider badge | Header shows `Provider · model`, refreshes on tab change, opens the AI tab |
| `AI_CANCEL` | Real implementation: `abortControllers: Map<requestId, AbortController>` in `ai.ts`; cancel aborts and clears the entry; the chat removes its entry in `finally` |
| Tailor output | New `parseTailorJson()` in `prompts.ts` extracts fenced or prose-wrapped JSON, validates `summary: string` and `skills: string[]`; the modal renders summary and skills as separate editable blocks and falls back to raw output when unparseable |
| Regenerate | Draft modal sends `bypassCache: true` |
| Save draft | Drafts saved to `chrome.storage.local.aiDrafts`, capped at 50 |
| Key reveal | Per-provider Show/Hide toggle on the key field |
| Model override | Model dropdown plus a free-text model id field for every provider |
| Connection status | Per-provider status dot: idle, testing (pulse), ok, error |
| Clear all keys | Confirmation dialog, then `AI_CLEAR_KEYS` with no provider |
| Session usage | `usageTotals` counters in `api.ts`, displayed in the privacy block |
| Privacy block | Lists fields sent, fields never sent, storage location, and session totals |
| Reason chips | `JobCard` shows the top two positive score reasons |
| Prompt hardening | Job text wrapped in `<job_posting>` / `<question>` / `<field>` delimiters; every system prompt says untrusted data and to ignore embedded instructions |
| Build gate | `npm run build` now runs `tsc --noEmit` before Vite |

Tests added (all passing):

- `src/shared/ai/providers.test.ts` — 14 tests: registry, key requirements, OpenAI/Anthropic/OpenRouter/custom request shapes, auth headers, Anthropic system-message split, custom URL normalization, response parsing.
- `src/shared/ai/tasks.test.ts` — 5 tests: inherit vs explicit per-task override, independence, defaults.
- `src/shared/ai/prompts.test.ts` — 13 tests: untrusted delimiters, ignore-instructions rule, EEO/consent exclusion across all four tasks, question inclusion, tailor JSON request, redaction, truncation, `parseTailorJson` variants.
- `src/background/modules/jobs.test.ts` — 10 tests with an in-memory `chrome.storage` mock and stubbed `fetch`: invalid request, field normalization, filter params, dedupe and drop-invalid, 100-job cap, HTTP error, network error, cache hit, cache key separation, TTL refresh.
- `src/shared/ai/cache.test.ts` — 11 tests: fingerprint stability/order-independence/empties, cache-key determinism and component sensitivity, round-trip, 24h expiry with deletion, 50-entry eviction, `clearCache`.
- `src/background/modules/allFrames.test.ts` — 7 tests: candidate merge with per-frame tagging, no-receiver skip, empty list, targeted apply, top-frame default, missing-token rejection, error propagation.

Test total: 10 files, 92 tests passing.

## 7b. Explicit AI insert-into-page (T-11 slice, same day)

Scope chosen by the owner: AI question capture + apply only, keeping the vanilla content script (no React dock rewrite).

| Layer | Change |
|---|---|
| `contentScript.js` | `collectAiTargets()` scans visible textarea/input/contenteditable controls, skips sensitive fields (password, SSN, card, CVV, bank), stamps each with a stable `data-jollyr-ai-target` token, and returns label, question, tag, `maxLength`, current value, and `required`. `applyAiAnswer(token, text)` writes through the native setter, handles `contenteditable`, and toasts "Review before submitting". New `AI_QUESTION_CANDIDATES` / `AI_APPLY_ANSWER` handlers with try/catch. |
| `src/background/modules/allFrames.ts` | `ALL_FRAMES_QUESTION_CANDIDATES` fans out to every frame and tags candidates with `frameId`; `ALL_FRAMES_APPLY_ANSWER` targets exactly one frame via `chrome.tabs.sendMessage(..., { frameId })` and rejects a missing token before sending. |
| `src/shared/messages.ts` | Added `ALL_FRAMES_QUESTION_CANDIDATES` and `ALL_FRAMES_APPLY_ANSWER`. |
| `src/sidepanel/api.ts` | `listQuestionFields()` and `applyAnswer(candidate, text)` plus the `AiQuestionCandidate` type. |
| `src/sidepanel/App.tsx` | Draft modal gains "Insert into page": scans the active tab, shows a field picker with label/tag/required/max/current-text, truncates at the field's `maxLength` with a notice, applies only on the explicit click, then closes the modal. |
| `src/sidepanel/sidepanel.css` | `.field-picker`, `.field-list`, `.field-item`, `.field-name`, `.field-meta` |

Safety: no field is written until the user clicks a specific candidate; there is no automatic targeting by classifier guess.

Still deferred:

- React content dock rewrite (deliberately out of scope; the vanilla content script ships).
- Component tests for `JobCard` / `AiSettings` — the popup now has `ProfileTab` and `App` tests, but these two side-panel components still have none.
- `cancelAi` is not wired to a visible Cancel button yet; the background path is implemented.

## 7c. Capture the job on the current page (T-12, same day)

Design: `plan/job-page-capture.md`. Rating is the existing local `scoreJob`; no AI, no new permissions.

| Layer | Change |
|---|---|
| `src/shared/jobCapture.ts` | `RawPageJob` (+ `postedAt`), `parseAgeLabel` (`h`/`d`/`w`/`mo`/`y`, trailing `+`, `Just posted`/`Today`/`Yesterday`), `rawPageJobToJob` (id from `jl`/`jobListingId`/LinkedIn id/Indeed `jk` else URL hash, normalized URL, 8000-char description cap, `remote` derived from location), `normalizeJobUrl`, `mergeCapturedJobs` (prepend, dedupe by normalized URL, cap 50). |
| `src/shared/score.ts` | Salary regex now counts `[£$€]\s?\d`, so `£51,000` scores as salary info. |
| `contentScript.js` | New `CAPTURE_JOB` message + `captureCurrentJob()`. Detail pages read `JobPosting` JSON-LD first (`@graph`, HTML description, salary as `50k`, `datePosted` as `postedAt`) then DOM. LinkedIn detail: `h1` without the `aria-hidden` duplicate, company/location/description selectors. LinkedIn cards: `button[aria-label="Dismiss <title> job"]` + nearest card root. Indeed: `data-testid` header/description/salary fields and `div.job_seen_beacon[data-jk]` cards. Glassdoor unchanged. Never hashed classes. Returns `{ success, job?, error? }`; unsupported pages return an error, never a half-built job. |
| `src/sidepanel/api.ts` | `captureCurrentJob()` queries the active tab and sends `CAPTURE_JOB` to the top frame. |
| `src/sidepanel/components/FilterBar.tsx` | "Add page" button next to Go. |
| `src/sidepanel/App.tsx` | Loads `capturedJobs` on mount and re-scores with the current profile; merges with search results (dedupe by URL); captured URLs bypass the age filter and Min stars (an explicitly captured job must never filter itself out); adding re-scores, shows "Added"/"Updated" with score and stars, and persists the capped array. |

2026-11-06: on LinkedIn `/jobs/search/` pages, `currentJobId` no longer forces detail mode. Routing captures `linkedInCards()` first and falls back to the open detail pane only when no cards exist; the canonical-URL rewrite is skipped on search pages. `cardRootFor` falls back to the card's `closest("li")` for linkless list items. "Clear added" in `FilterBar` calls `App.clearAddedJobs`, which removes only `storage.local.capturedJobs`. Tests: 135 / 15.

## 7d. React popup at parity (T-09) and cleanup (T-11, same day)

| Layer | Change |
|---|---|
| `popup.html` (root) | React entry: `#root`, `lib/pdf-processor.js` classic script, module script for `src/popup/main.tsx`. Added to `vite.config.ts` inputs, so `dist/popup.html` is the React build. |
| `src/popup/App.tsx` | Shell: header with **Best Jobs** (`chrome.sidePanel.open({ windowId })`) and manifest version badge, ARIA tablist with arrow-key navigation, content area, footer status with 3s auto-reset. Loads the profile via `GET_USER_PROFILE` and the active tab URL + `GET_ATS_STATUS` on mount. |
| `src/popup/components/ProfileTab.tsx` | All seven sections from `PROFILE_FIELDS` (43) + `PROFILE_CHECKBOXES` (4); Save/Clear. |
| `src/popup/components/ApplyTab.tsx` | ATS bar, resume drop with `RealPDFProcessor` extraction, cover-letter drop, target overrides, Fill / Scan / Clear, password generator + copy. |
| `src/popup/components/HistoryTab.tsx` | Stats, newest-first list with ATS badge and field count, CSV export via `src/shared/csv.ts`. |
| `src/popup/components/ToolsTab.tsx` | Current URL, manual fill / detect / clear, detection list, credentials list + clear. |
| `src/popup/api.ts` | Typed `chrome.runtime.sendMessage` wrappers for profile, history, ATS, fills, detect, clear, credentials. |
| `src/popup/popup.css` | Copy of the vanilla theme, plus `#root` flex layout and new component classes. |
| Cleanup | Deleted vanilla `popup.js`, `styles/popup.css`, root `manifest.json`, stale root `background.js`. `public/manifest.json` is the only manifest. `contentScript.js` stays vanilla by owner decision. |

Tests added: `src/popup/components/ProfileTab.test.tsx` (4: all fields/toggles render, text edit key, consent toggle, save/clear wiring) and `src/popup/App.test.tsx` (2: profile load + shell render, tab switch + history empty state) with a stubbed `chrome` API.

Deviation from `task/T-09-react-popup.md` step 11: PDF extraction reuses `lib/pdf-processor.js` instead of a `src/shared/pdf.ts` port; the stored shape is unchanged.

Manual QA still pending: load `dist/` unpacked and exercise the four tabs.

## 8. Known gaps and risks

| Area | Status | Note |
|---|---|---|
| React popup (T-09) | DONE (§7d) | All four tabs at parity; not yet exercised in a real Chrome popup |
| React content dock (T-11) | Not started | Vanilla `contentScript.js` is the shipping engine and is copied into `dist/` |
| AI question capture/apply | DONE (§7b) | Field tokens in the vanilla content script, per-frame fan-out in the background, explicit picker in the draft modal |
| Job page capture (T-12) | DONE (§7c) | Glassdoor, LinkedIn, and Indeed, on detail pages and result cards. LinkedIn search pages prefer result cards over an open detail pane; "Clear added" removes only captured jobs. Detail pages use JSON-LD when present; cards are heuristic. Results-list captures lack a description, so skills/salary parts score low until the detail page is captured |
| `AI_CANCEL` | DONE | AbortController registry; background path implemented, no visible Cancel button yet |
| Background replacement | Behavioral risk | The TS port replaces the vanilla service worker. Storage keys (`userProfile`, `appHistory`) and message names match, but the popup should be smoke-tested after loading |
| `public/lib/build/pdf.js` | Duplicate | Vite copies it to `dist/lib/build`; the manifest references `dist/lib/pdfjs/build`. Harmless but removable |
| Job source | Limitation | Arbeitnow is Europe-weighted; stated in the panel empty state |
| Chrome command-line loading | Environment limit | Verification must be manual via `chrome://extensions` |

## 9. Compatibility contract check

| Contract item | Status |
|---|---|
| Storage keys and shapes | Preserved by `UserDataService` (`userProfile` sync, `appHistory` local) |
| Message types | All vanilla types plus `GET_JOBS` and AI messages |
| Cross-frame fill, combobox scoping, EEO groups, SPA retry, resume/cover letter | Preserved; `contentScript.js` stays vanilla, with only the additive AI target/apply handlers added |
| Popup dimensions | Preserved (vanilla popup CSS untouched except header button) |
