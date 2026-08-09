# Agents.md

This file is maintained automatically by the Go_manager mode.

## Change Log (most recent first)

- **2026-08-09 — All-frames messaging centralized in background + combobox scoping for Greenhouse embed**
  - Root cause for the still-unfilled QuinStreet/Greenhouse embed: the popup's all-frames logic was duplicated in `popup.js` and could report "Filled 0" on slow SPA hydration; `fillCombobox` searched the whole document for `[role="option"]`, so an intl-tel phone widget's country list could win over the React-Select `country` combobox's own flyout; the `candidate-location` async combobox had no classifier rule; in-page dock buttons still ran top-frame-only.
  - `background.js`: added `AllFramesModule` (registered last in `backgroundModules`) as the single implementation of cross-frame messaging. `_enumerateFrames()` always adds frameId 0; `_sendToFrame()` uses `chrome.tabs.sendMessage(tabId, msg, { frameId })` swallowing `lastError` for frames with no receiver; `_activeTabId()` falls back to the active tab query. New messages: `ALL_FRAMES_FILL → FILL_JOB_APPLICATION` (profile IS `value` directly, auto-loaded via `userData.getProfile()` when omitted), `ALL_FRAMES_MANUAL → MANUAL_FILL_FORM` (group options as value), `ALL_FRAMES_DETECT → DETECT_FORMS` (concatenates `forms` from all frames), `ALL_FRAMES_CLEAR → CLEAR_ALL_FORMS` (broadcast). Response shape: `{ success, fieldsFilled, framesReached, perFrame, error }`; `success = fieldsFilled > 0` for fills. SPA retry: when a fill returns 0 fields it re-round-trips up to 3× with 1.5 s gaps (total ~4 passes) so a slow-hydrating iframe still gets filled.
  - `popup.js`: removed the now-redundant `sendToActiveTabAllFrames()` / `mergeFillResults()` (replaced with a comment pointing at the background service). Fill Application → `sendToBackground("ALL_FRAMES_FILL", profile)`; Manual Fill → `sendToBackground("ALL_FRAMES_MANUAL", {fillPersonal, fillAddress, fillProfessional})`; both Clear buttons → `ALL_FRAMES_CLEAR`; `detectFormsOnPage` → `ALL_FRAMES_DETECT` (lists fields + "across N frame(s)"); `checkAtsStatus` → `GET_ATS_STATUS` via background. Status text: `Filled N fields across M frames ✓` or `No form found — page may still be loading. Try again in a few seconds.` when `fieldsFilled === 0 && framesReached === 0`.
  - `contentScript.js`: `fillCombobox()` now scopes option lookup to the widget itself — `isVisible()` skips `aria-hidden`, `offsetParent === null`, or zero client rects; `pickFrom(widgetRoot)` (root = `.select__control` parent, else element parent) is tried before any document-wide fallback, so unrelated visible option lists (intl-tel country list) can't hijack the pick. Async/server-driven search (Greenhouse location) covered by the type→wait→click path with a longer 12×200 ms option wait. SPA render-wait extended from 5×300 ms to 10×500 ms in both `AutofillOrchestrator.run()` and the `DETECT_FORMS` handler (background retries on top of that).
  - `contentScript.js` classifier + value map: new `location` rule (`\b(location|where are you based|work location|located)\b`); `buildValueMap` emits `location: profile.address || [city, state].join(", ")`; `FIELD_GROUPS.address` includes `location` so `candidate-location` (a Greenhouse async combobox) now fills.
  - `contentScript.js` dock routing: the in-page `jollyR:triggerFill` / `scanFields` / `clearForms` events now send `ALL_FRAMES_FILL` / `ALL_FRAMES_DETECT` / `ALL_FRAMES_CLEAR` through the background service (toasts show cross-frame totals; still-loading hint when no frame was reached), so the dock fills embedded forms too — not just the popup.
  - Verified: (1) Node VM unit tests for `AllFramesModule` (12/12): both-frame targeting with `frameId`, raw profile passthrough (not `{profile}`), auto-load when value omitted, MANUAL broadcast, retry-stops-on-fill, DETECT concatenation, CLEAR broadcast, no-receiver skip, no-active-tab error. (2) Headless Chrome over localhost HTTP: iframe-embedded form harness → subframe `fieldsFilled: 4` with `firstName`/"Grace", gender combobox/"Female", race select/"White", location combobox/"New York, NY" (parent 0); combobox scoping harness (visible intl-tel country list decoy) → country "United States" from its own flyout, decoy `phoneListClicked: false`; async location harness (options injected 300 ms after typing) → "New York, NY". Harnesses in `%TEMP%\opencode\jr-combobox-test\` (`bg-allframes-test.js`, `test-server.py`, `parent.html`, `iframe-form.html`, `scoping-test.html`, `async-location-test.html`); note `popup-frames-test.js` there is stale (tests the deleted popup helpers).
  - Reminder: after loading this round in `chrome://extensions`, hard-refresh the QuinStreet careers tab so the new content script + background service take effect.
  - Affected: `background.js`, `popup.js`, `contentScript.js`, `AGENTS.md`.

- **2026-08-09 — Cross-frame filling + Greenhouse-style combobox widgets**
  - Fixed: forms embedded in subframes (e.g. Greenhouse job boards as cross-origin iframes on a company careers page, like QuinStreet) were invisible to the popup. `popup.js` `sendToActiveTab()` used `chrome.tabs.sendMessage(tab.id, ...)`, which only reaches the top frame. Added `sendToActiveTabAllFrames()` (enumerates frames via `chrome.webNavigation.getAllFrames({ tabId })`, sends per-`frameId`, collects responses) and `mergeFillResults()` (sums `fieldsFilled`, keeps any success, first error). Rewired `detectFormsOnPage` (concatenates `forms` arrays from all frames), `checkAtsStatus`, the Fill Application, Manual Fill, and both Clear buttons to use the all-frames path.
  - Fixed: `contentScript.js` never created the fill pipeline in subframes — `ensureUi()` early-returned for `isFrameWindow`, so `state.autofill` stayed null and frame fills answered "Page not ready." `ensureUi()` now builds `AutofillOrchestrator` in frames with a `createFrameUiStub()` no-op UI (dock/toasts only ever render in the top frame).
  - Added: `FormFiller.fillCombobox()` for React-Select / Greenhouse style `role="combobox"` widgets (not real `<select>`s). Opens the flyout via mousedown/click on `.select__control`, clicks the matching `[role="option"]` (normalized via `_normOptionText`); falls back to typing (native setter + input event) and Enter. Dispatched from `AutofillOrchestrator.run()` and the `MANUAL_FILL_FORM` handler when `role="combobox"` or `aria-haspopup="true"`.
  - Added: SPA render-wait — `run()` and `DETECT_FORMS` retry `scan()` up to 5× every 300 ms so forms that render after network idle (React embeds) are still found.
  - Verified headlessly: (1) single-frame page with combobox + select + radio + checkbox → `fieldsFilled: 5`, combobox value "Female"; (2) iframe-embedded form (top page + subframe both running the content script) → `fieldsFilled: 3` in the subframe, text/combobox/select all set; (3) `popup.js` frame logic unit-tested in Node VM: reaches top + subframe, merges totals, skips frames with no receiver, concatenates `DETECT_FORMS` lists.
  - Affected: `contentScript.js`, `popup.js`, `AGENTS.md`.

- **2026-08-09 — EEO/legal radio & checkbox group fill fixes**
  - Fixed: radio groups (gender, race, veteran, disability, etc.) were never filled. `fillRadioGroup()` ended with `this.fillCheckbox(pick, true)`, but `fillCheckbox` returned `false` for any element whose type wasn't `checkbox`; the guard now accepts `radio` too (verified headlessly: `fieldsFilled` went 0 → 4 on a mixed radio/select/checkbox EEO page).
  - Fixed: EEO fields misclassified as `consent_terms` when the question contained "voluntary"/"eeo" (e.g. "Disability Status (voluntary self-identification)"). Consent rule base score is now capped (`field.startsWith("consent")`) so specific legal/EEO rules always outrank generic consent wording; also removed `voluntary|eeo` from the `consent_terms` pattern.
  - Fixed: option-label resolution only checked `opt.closest("label")`, missing `<label for="...">` sibling labels (iCIMS/Taleo style). Added `_getOptionLabel()`; also added `_normOptionText()` (collapses `/` and "or" so "Hispanic/Latino" matches "Hispanic or Latino") and `_matchesOption()` (substring + token fallback) used by `fillRadioGroup`, `fillCheckboxGroup`, and `_fillSelect`.
  - Fixed: `fillCheckboxGroup` only grouped by shared `name` (or single parent), missing multi-select groups with distinct per-option names; it now walks up to the nearest container holding several checkboxes.
  - Verified end-to-end in headless Chrome against a synthetic ATS page (label-wrapped radios, label-for radios, selects, shared-name and distinct-name checkbox groups).
  - Affected: `contentScript.js`, `AGENTS.md`.

- **2026-08-09 — EEO / legal / consent / position / experience / cover letter filling**
  - The autofill engine now fills EEO, legal/eligibility, consent checkboxes, position details, experience/certifications, cover letter (text + file), referral, and reference fields, driven by a manually expanded profile.
  - Consent checkboxes are NOT auto-accepted: the user enables per-item consent toggles in the popup (`consentBackgroundCheck`, `consentDrugScreening`, `consentSignature`, `consentTerms`), all default OFF; `buildValueMap` only emits `consent_*` booleans when the matching profile toggle is on.
  - `contentScript.js`: `buildValueMap` expanded to map `legal` (work_authorization→Yes/No, sponsorship, age_confirmation), `position` (employment_type, start_date, relocate, travel), `eeo` (gender, race, veteran_status, disability_status, with "Prefer not to say" as a selectable value), `years_experience`, `certifications`, `cover_letter`, `referral_source`, `referred_by`, `why_interested`, references fields, and `consent_*`. Added `loadStoredFile(key)` generalized from `loadStoredResume()` plus `loadStoredCoverLetter()` wrapper. `AutofillOrchestrator.run()` and the `MANUAL_FILL_FORM` handler now dispatch by control type (checkbox→`fillCheckbox`/`fillCheckboxGroup`, radio→`fillRadioGroup`, file→`fillFileUpload`, else→`fillElement`), attach the stored cover letter to `detector.coverLetterUploadFields`, and include consent + file uploads in `filled` and completion totals.
  - `popup.html`: added Profile sections (Eligibility & Legal, Position Details, EEO Voluntary with "Prefer not to say" options, Application Details incl. cover letter text, consent checkbox group with explanatory note) and a Cover Letter file-drop in the Application tab.
  - `popup.js`: `PROFILE_FIELDS` expanded with all new keys; added `PROFILE_CHECKBOXES` (consent toggles); `readProfileForm`/`fillProfileForm`/clear-profile handle checkboxes; added cover-letter upload handler storing `coverLetterFile` (base64) via `chrome.storage.local`, mirroring `sharedPDFData`.
  - Affected: `contentScript.js`, `popup.html`, `popup.js`, `AGENTS.md`.

- **2026-08-09 — Resume upload fields filled from stored resume**
  - The uploaded resume (stored as `sharedPDFData` base64 by the popup) is now actually attached to detected resume/CV `<input type="file">` fields during autofill; previously detection populated `resumeUploadFields` but nothing consumed them.
  - `contentScript.js`: added `FormFiller.fillResumeFile()` (DataTransfer-based file assignment) and `loadStoredResume()` (base64 data URL → `File`); `AutofillOrchestrator.run()` and the `MANUAL_FILL_FORM` handler now attach the resume to `detector.resumeUploadFields` and count them in completion totals.
  - Affected: `contentScript.js`.

- **2026-08-09 — Right-edge dock: tucked sliver instead of floating pill**
  - In-page jolly R UI moved from the top-right pill to a bottom-right edge dock. Resting state is a ~10px sliver; hovering slides out a slim vertical tab; clicking pops the full panel out from the right edge; the header close (X) tucks it back in.
  - `contentScript.css`: `.jR-root` anchored to `right: 0; bottom: 8px`; `.jR-panel` uses `transform-origin: bottom right` + one-time `jR-slide-in` animation via `.open`; `.jR-trigger` restyled as a vertical dock tab (`translateX(calc(100% - 10px))` default, `translateX(0)` on hover/focus).
  - `contentScript.js`: renamed `POPUP_MODE.BUTTON` → `POPUP_MODE.TUCKED`; `_renderTrigger()` → `_renderTab()`; `_update()` tracks `_prevMode` so the slide-in only plays on the TUCKED→EXPANDED transition; host inline position changed to bottom-right.
  - Affected: `contentScript.css`, `contentScript.js`.

- **2026-08-06 — PDF feature made functional end-to-end**
  - Vendored Mozilla PDF.js at `lib/pdfjs/build/pdf.js` + `pdf.worker.js` (previously referenced but missing).
  - Added those files to `web_accessible_resources` in `manifest.json`.
  - `popup.html` now loads `lib/pdf-processor.js`.
  - `popup.js` resume upload: PDFs are now text-extracted via `RealPDFProcessor` and personal info is extracted (name/email/phone/skills/experience); stored as `sharedPDFData.resumeText` + `resumeInfo`. Non-PDF uploads still store as base64.
  - README: replaced non-existent RAG/legacy claims with the actual v2 architecture; corrected file-structure listing.
  - Affected: `manifest.json`, `popup.html`, `popup.js`, `README.md`, `lib/pdfjs/**`.

- **2026-08-06 — contentScript.js: popup protocol + idempotent init**
  - Added message handlers so the popup's actions actually work: `DETECT_FORMS`, `GET_ATS_STATUS`, `MANUAL_FILL_FORM`, `FILL_JOB_APPLICATION`, `CLEAR_ALL_FORMS` (previously handled only in the unloaded legacy `content.js`).
  - Added module-level `state` + `FIELD_GROUPS` and an `ensureUi()` helper; `init()` is now idempotent (`state.initialized` guard) so the DOM-removal monitor re-creates the UI without re-registering listeners (fixes duplicate-init/leak).
  - Extracted `buildValueMap()` + `clearFormFields()`; `AutofillOrchestrator.run()` now returns `{ fieldsFilled }` instead of `undefined`.
  - `NetworkIdleMonitor.waitForIdle()` no longer leaks its `setTimeout` on early resolve.
  - `generatePassword()` now uses `crypto.getRandomValues` (removed `Math.random`-based `rand()`).
  - `saveCredentials()` no longer stores the raw password in plaintext (stores id only when the vault isn't available).
  - Affected: `contentScript.js`.

- **2026-08-06 — popup.js: security & XSS fixes**
  - Added `escapeHtml()` and escaped all `innerHTML` interpolation of page/ATS data (history entries, detected forms, saved credentials).
  - `generateStrongPassword()` rewritten with `crypto.getRandomValues` (was `Math.random`).
  - CSV export now quotes the URL column.
  - Affected: `popup.js`.

- **2026-08-06 — background.js: OPEN_POPUP handling**
  - Added handler for the `OPEN_POPUP` message (open the extension popup) which was previously unhandled.
  - Affected: `background.js`.

- **2026-08-06 — manifest.json: web_accessible_resources cleanup**
  - Removed `images/*` and `fonts/*` entries that point to non-existent directories.
  - Affected: `manifest.json`.

## Plan Folder

A `plan/` folder must exist at the project root for storing design and approach documents.

## Task Folder

A `task/` folder must exist at the project root for tracking individual work items.
