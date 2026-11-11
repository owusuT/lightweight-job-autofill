# Generic field detection for unfamiliar sites

## Intent

Raise autofill hit rate on job-application forms the extension has no site-specific adapter for, without increasing wrong-value fills. Add page stays job capture only.

## Goals

- Read more label sources so unlabeled-looking custom fields are classified.
- Use standard `autocomplete` tokens and `data-automation-id`/`data-testid` as classification context.
- Fix false matches in existing rules found while reviewing them.
- Prove the mapping with a jsdom fixture of an unfamiliar form.

## Non-goals

- Section-aware classification (References/Education/Employment scoping).
- contenteditable or shadow-DOM support.
- New profile fields, UI changes, AI changes, or capture changes.

## Constraints

- `contentScript.js` stays vanilla; no imports, no new permissions.
- Existing fill behavior, hidden-field checks, and consent opt-ins stay unchanged.
- Additions must be covered by the existing jsdom harness style used in `contentScriptCapture.test.ts`.

## Approach

1. `_getLabel(el)` gains, in order: joined `aria-labelledby` text, `aria-label`, `label[for]`, wrapping `<label>`, fieldset `<legend>` (fallback only), placeholder, then bounded nearby text (up to 3 preceding siblings, short text only).
2. `_classify(el)` adds `autocomplete` (hyphens as spaces) and `data-automation-id`/`data-testid` to the matched string. `autocomplete` maps directly to a field type before text rules, so `organization-title` is `position`, not `company`.
3. Expand existing regexes with common aliases (e.g. desired/expected salary, notice period, highest degree, LinkedIn profile, personal website, mailing address, post code).
4. Fix `years_experience` matching `professional experience`, which currently steals the experience textarea; keep `years ... experience` and `yrs ... experience`.
5. New `src/shared/contentScriptDetection.test.ts` drives `DETECT_FORMS` against a form using each new source and asserts the resulting `type` per input.

## Verification

- `node --check contentScript.js`
- `npx tsc --noEmit`
- `npm test -- --run`
- `npm run build`, confirm `dist/contentScript.js` is updated
- Manual: reload `dist/` unpacked and run Fill on one unfamiliar application page

## Out of scope for this pass

Section scoping and custom controls; reconsider only after a real page still misses fields.
