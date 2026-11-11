# Architecture

## Runtime map

| Surface | Source | Bundle | Chrome entry |
|---|---|---|---|
| Popup | `src/popup/` | `dist/popup.html` + hashed assets | `action.default_popup` |
| Side panel | `src/sidepanel/` | `dist/sidepanel.html` + hashed assets | `side_panel.default_path` |
| Service worker | `src/background/` | `dist/background.js` (ES module) | `background.service_worker` + `type: module` |
| Content script | `src/content/` | `dist/content.js` (single IIFE, React inlined) | `content_scripts[0].js`, `all_frames: true` |
| Styles | `src/styles/` | emitted CSS | linked from both HTML entries |
| PDF | `public/lib/pdfjs/**` | copied verbatim | `web_accessible_resources` |

The content script is bundled separately so it never shares a chunk with the extension pages. It runs on every page, so it must stay lean.

## File tree

```
src/
  popup/
    index.html
    main.tsx
    App.tsx
    components/
      ProfileTab.tsx
      ApplyTab.tsx
      HistoryTab.tsx
      ToolsTab.tsx
      StatusFooter.tsx
  sidepanel/
    index.html
    main.tsx
    App.tsx
    components/
      JobsPanel.tsx
      FilterBar.tsx
      JobCard.tsx
      ScoreBreakdown.tsx
    ai/
      AiSettings.tsx
      AiDraftModal.tsx
      AiProviderBadge.tsx
  content/
    index.tsx
    engine/
      detector.ts
      filler.ts
      orchestrator.ts
      values.ts
      networkIdle.ts
      messaging.ts
    ui/
      Dock.tsx
      Toasts.tsx
  background/
    index.ts
    modules/
      tabState.ts
      userData.ts
      ats.ts
      data.ts
      allFrames.ts
      jobs.ts
      ai.ts
      common.ts
  shared/
    messages.ts
    types.ts
    profileSchema.ts
    storage.ts
    score.ts
    password.ts
    csv.ts
    pdf.ts
    format.ts
    ai/
      providers.ts
      client.ts
      tasks.ts
      prompts.ts
      redact.ts
      cache.ts
  styles/
    theme.css
    components.css
    popup.css
    sidepanel.css
public/
  manifest.json
  lib/pdfjs/build/pdf.js
  lib/pdfjs/build/pdf.worker.js
```

## Build pipeline

- Vite with two HTML inputs (`popup`, `sidepanel`) and two script inputs (`background`, `content`).
- `base: "./"` so extension pages resolve assets relative to `dist/`.
- `build.target: "chrome116"`.
- `publicDir: "public"` copies the manifest and PDF.js into `dist/`.
- Content CSS is imported with `?inline` and injected into the shadow root. Host positioning stays in the manifest `css` entry.
- No inline scripts; MV3 CSP stays at the default.
- `dist/` is already gitignored.

Suggested `vite.config.ts` shape:

```ts
build: {
  target: "chrome116",
  rollupOptions: {
    input: {
      popup: "src/popup/index.html",
      sidepanel: "src/sidepanel/index.html",
      background: "src/background/index.ts",
      content: "src/content/index.tsx",
    },
    output: {
      entryFileNames: (chunk) =>
        chunk.name === "background" || chunk.name === "content"
          ? "[name].js"
          : "assets/[name]-[hash].js",
      chunkFileNames: "assets/[name]-[hash].js",
      assetFileNames: "assets/[name]-[hash][extname]",
    },
  },
}
```

HTML inputs emit `dist/src/popup/index.html` unless `root` handling is configured. Keep the emitted HTML paths stable (`popup.html`, `sidepanel.html`) with a small rename step or by placing the HTML at the project root. Pick one approach in Phase 1 and document it in `task/T-07`.

## Manifest target

```json
{
  "manifest_version": 3,
  "name": "jolly R — AI Job Autofill",
  "version": "3.0.0",
  "minimum_chrome_version": "116",
  "permissions": ["storage", "tabs", "webNavigation", "scripting", "alarms", "cookies", "sidePanel"],
  "host_permissions": [
    "https://api.openai.com/*",
    "https://api.anthropic.com/*",
    "https://openrouter.ai/*",
    "https://www.arbeitnow.com/*"
  ],
  "background": { "service_worker": "background.js", "type": "module" },
  "side_panel": { "default_path": "sidepanel.html" },
  "action": { "default_popup": "popup.html", "default_title": "jolly R" },
  "content_scripts": [
    {
      "matches": ["http://*/*", "https://*/*"],
      "js": ["content.js"],
      "css": ["contentScript.css"],
      "run_at": "document_idle",
      "all_frames": true
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["contentScript.css", "lib/pdfjs/build/pdf.js", "lib/pdfjs/build/pdf.worker.js"],
      "matches": ["*://*/*"]
    }
  ]
}
```

Note: today's manifest uses `"*://*/*"` host permissions. The migration narrows it to the four endpoints above. If the custom AI base URL must be arbitrary, keep `"*://*/*"` and document the trade-off. Decide in Phase 2 and update this document.

## Message contract

All names move to `src/shared/messages.ts`; the strings stay identical.

Existing: `CONTENT_SCRIPT_LOAD`, `TAB_ACTIVATED`, `USER_DATA_UPDATE`, `ATS_ENABLE`, `ATS_START_APPLY_FLOW`, `ATS_AUTO_FILL_STATUS`, `ATS_POPUP_MODE_SET`, `ATS_FILL_FIELD`, `ATS_APPLICATION_COMPLETE`, `GET_USER_PROFILE`, `SAVE_USER_PROFILE`, `GET_APP_HISTORY`, `ADD_APPLICATION`, `GET_ATS_STATUS`, `ALL_FRAMES_FILL`, `ALL_FRAMES_MANUAL`, `ALL_FRAMES_DETECT`, `ALL_FRAMES_CLEAR`, `OPEN_POPUP`.

New: `GET_JOBS`, `AI_TEST_CONNECTION`, `AI_LIST_MODELS`, `AI_CHAT`, `AI_CANCEL`, `AI_GET_SETTINGS`, `AI_SET_SETTINGS`, `AI_CLEAR_KEYS`, `AI_QUESTION_CANDIDATES`, `AI_APPLY_ANSWER`.

Response shapes are documented in `02-ai-provider-layer.md` and `03-jobs-scoring-sidepanel.md`.

## Storage schema

| Key | Area | Shape |
|---|---|---|
| `userProfile` | sync | existing profile object, unchanged field names |
| `appHistory` | local | array, max 200, newest first |
| `sharedPDFData` | local | `{ base64, name, type, resumeText?, resumeInfo?, processedAt? }` |
| `coverLetterFile` | local | `{ base64, name, type }` |
| `savedCreds` | local | `{ [domain]: { id, savedAt } }` |
| `config` | local | `{ autoFill, showButton, theme }` |
| `jobCache` | local | `{ [queryKey]: { fetchedAt, jobs: Job[] } }`, 15 min TTL |
| `aiKeys` | local | `{ openai?, anthropic?, openrouter?, custom? }` |
| `aiConfig` | sync | provider models, task models, maxTokens, temperature |
| `aiCache` | local | max 50 entries, 24h TTL |
| `jobPrefs` | local | `{ query, remote, visa, minStars, maxAgeDays }` |

Secrets live only in `aiKeys`. `AI_GET_SETTINGS` must never return that key.

## State hooks

- `useProfile()` — load/save through `SAVE_USER_PROFILE` and `GET_USER_PROFILE`.
- `useHistory()` — `GET_APP_HISTORY`, returns `{ history, stats }`.
- `useAtsStatus()` — `GET_ATS_STATUS`, plus a listener for `ATS_AUTO_FILL_STATUS`.
- `useStatus()` — the footer toast that replaces `setStatus` in `popup.js`.
- `useChromeStorage<T>(key, area)` — typed adapter, no direct `chrome.storage` calls in components.
- `useJobs()` — search, cache, score, sort.
- `useAiConfig()` — sanitized settings, provider test, per-task models.

## Legacy removal

Delete after Phase 5 parity checks: `popup.html`, `popup.js`, `background.js`, `contentScript.js`, `content.js`, `popup-broken.js`, `popup-fixed.js`, `styles/popup.css`, `database-manager.js`, `job-application-data.js`, `injectScript.js`, `injectScriptHandler.js`.

`contentScript.css` is retained as an input (imported for the shadow root and listed in the manifest for host positioning).
