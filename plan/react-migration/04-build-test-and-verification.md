# Build, Test, and Verification

## Toolchain

| Tool | Purpose |
|---|---|
| Vite 5+ | Bundles popup, side panel, background, and content script |
| `@vitejs/plugin-react` | React JSX transform |
| TypeScript 5+ | Types for Chrome APIs and shared modules |
| `@types/chrome` | `chrome.*` typings |
| Vitest | Unit tests for pure logic |
| `@testing-library/react` + `jsdom` | Component smoke tests |
| ESLint + `typescript-eslint` | Optional but recommended lint gate |

## npm scripts

```json
{
  "scripts": {
    "dev": "vite build --watch",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx",
    "zip": "cd dist && tar -a -c -f ../jolly-r.zip *"
  }
}
```

`dev` uses build-watch, not HMR, because content scripts and MV3 service workers do not hot reload. After each build, reload the extension in `chrome://extensions`.

## Test matrix

| Area | Type | Location |
|---|---|---|
| Scoring and star mapping | unit | `src/shared/score.test.ts` |
| Password generator | unit | `src/shared/password.test.ts` |
| CSV export quoting | unit | `src/shared/csv.test.ts` |
| Job normalization and cache | unit with fetch mock | `src/background/modules/jobs.test.ts` |
| AI request builders (4 providers) | unit | `src/shared/ai/providers.test.ts` |
| AI error mapping | unit | `src/shared/ai/client.test.ts` |
| Task-to-model resolution | unit | `src/shared/ai/tasks.test.ts` |
| Prompt redaction and truncation | unit | `src/shared/ai/prompts.test.ts` |
| Profile form round-trip | component | `src/popup/components/ProfileTab.test.tsx` |
| Stars and score breakdown | component | `src/sidepanel/components/JobCard.test.tsx` |
| AI settings validation | component | `src/sidepanel/ai/AiSettings.test.tsx` |

Minimum bar to close a phase: `npm run typecheck` and `npm test` both pass.

## Manual QA per phase

### Phase 1 — Toolchain

1. `npm run build` produces `dist/manifest.json`, `dist/popup.html`, `dist/background.js`, `dist/content.js`.
2. Load `dist/` unpacked; the current vanilla popup still opens.
3. Open a synthetic job form and confirm the current fill button fills it. This proves the build did not alter behavior.

### Phase 2 — Background

1. Load `dist/`, open the popup, save a profile, reopen it, and confirm the values persist.
2. Run a fill on a test form and confirm the field count matches the pre-migration build.
3. Open the side panel from DevTools (`chrome.sidePanel.open` via console is not user-gesture eligible; use the temporary debug button).
4. With a mocked or real response, `GET_JOBS` returns normalized jobs and a second call within 15 minutes is served from cache.
5. `AI_TEST_CONNECTION` with no key returns `NO_KEY`.

### Phase 3 — Popup

1. Profile: all 41 fields plus 4 consent toggles save and reload.
2. Resume: upload a PDF, confirm the extracted word count and detected email appear.
3. Cover letter file upload persists.
4. Apply tab: fill, scan, clear all produce the same messages as before.
5. History: totals update after a fill; CSV downloads and opens with quoted URLs.
6. Tools: current URL, manual fill, detection list, credentials list and clear.
7. Popup is 380x640 and scrolls correctly.
8. Confirm the popup is fully keyboard navigable and every input has a label.

### Phase 4 — Side panel

1. Panel opens beside the tab on Chrome 116+.
2. Search returns jobs; remote and visa filters change results.
3. Sorted descending by score; stars match the numeric score.
4. `ScoreBreakdown` reasons match the top contributing parts.
5. "Open + Autofill" activates or creates the tab and reports the filled field count.
6. AI settings: each provider card saves, masks, and reveals its key; "Test connection" reports ok or a mapped error.
7. Per-task model override wins over `inherit`.
8. Draft modal generates text, allows editing, copies, and inserts only after Apply.

### Phase 5 — Content dock and cleanup

Reuse the harnesses named in `Agents.md`:

1. Iframe-embedded form fills in the subframe and reports cross-frame totals.
2. Combobox scoping test: a visible unrelated option list cannot hijack the pick.
3. Async location combobox: options injected 300ms after typing still fill.
4. EEO suite: label-wrapped radios, `label for` radios, selects, shared-name and distinct-name checkbox groups.
5. Resume and cover-letter file inputs receive the stored files.
6. Dock: tucked sliver, hover tab, expanded panel, Fill / Scan / Clear, toasts with totals.
7. AI question capture: unmatched free-text fields are listed, drafts generate, Apply sets one field only.
8. No orphan files remain; `rg` for `popup-broken|popup-fixed|database-manager|job-application-data|content\.js` returns nothing.

## Release checklist

1. `npm run typecheck`, `npm test`, `npm run build`.
2. Bump `manifest.version` to `3.0.0` and note the migration in `README.md`.
3. Load `dist/` unpacked and run the Phase 5 checklist once end to end.
4. Update `Agents.md` with the migration summary.
5. Update `task/current-tasks.md` statuses.
6. Tag or commit only after the user asks.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| No HMR for content scripts | Build-watch plus extension reload; document the loop in README |
| Side panel requires a gesture | Open only from a popup or panel button click |
| PDF.js worker path breaks in extension | Set `GlobalWorkerOptions.workerSrc` to `chrome.runtime.getURL`; test in Phase 3 |
| Key leakage | Keys only in the background; sanitized getters; no logs |
| Prompt injection from job postings | Delimited untrusted text, explicit ignore instruction, validated JSON, React-escaped rendering |
| AI cost runaway | Cache, 30s timeout, token caps, per-task model choice, session usage display |
| Provider CORS | All calls in the background worker with host permissions |
| Bundle bloat on every page | Content script bundled separately, no UI library, no PDF.js inside it |
| Fill regressions | Engine extracted mechanically; rerun the recorded harnesses |
| Storage migration | Keep every existing key and field name; add new keys only |

## Definition of done

- Popup, side panel, and dock are React components; no vanilla DOM building remains.
- Best jobs render in the side panel sorted by a documented, tested match score with visible stars and reasons.
- The user can connect any of the four providers, test the connection, and choose a model per task.
- AI output requires explicit user action to reach a form.
- Every phase checklist passes and the test suite is green.
