# Generic Field Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify more application-form fields on unfamiliar sites from standard label, autocomplete, and automation attributes.

**Architecture:** All changes stay in the vanilla `contentScript.js` detector: richer `_getLabel()` text sources, `autocomplete`/`data-*` context in `_classify()`, and regex alias fixes. A jsdom test drives `DETECT_FORMS` against an unfamiliar form.

**Tech Stack:** vanilla JS content script, Vitest, jsdom.

**Spec:** `docs/superpowers/specs/2026-11-01-generic-field-detection-design.md`

## Global Constraints

- No new permissions, dependencies, profile fields, UI, or capture changes.
- Owner forbids commits unless explicitly requested; skip all commit steps.
- Hashed class names are never selectors.

## Review Focus

- Field with `aria-labelledby` but no `for`/name/id: expect the referenced text to classify it.
- Standard autocomplete tokens: `organization-title` must be position, not company.
- Nearby text labels: `<div>Phone Number</div><input>` must classify as phone.
- Ambiguous "Professional Experience" textarea: must be experience, not years.
- Hidden/honeypot inputs must stay excluded.

---

### Task 1: Detection fixture and failing test

**Files:**
- Create: `src/shared/contentScriptDetection.test.ts`

**Interfaces:**
- Consumes: `DETECT_FORMS` response `{ success, forms: Array<{ type, label, id, name }> }`.
- Produces: `detect(html: string): Promise<Array<{ type: string; id?: string }>>`.

- [ ] **Step 1: Write the fixture and test**

One jsdom harness modeled on `contentScriptCapture.test.ts`; fixture contains:
- `input id="f1" aria-labelledby="lbl1"` plus `<span id="lbl1">Email Address</span>`
- `<fieldset><legend>Mailing Address</legend><input id="f2"></fieldset>`
- `<input id="f3" autocomplete="given-name">`
- `<input id="f4" autocomplete="organization-title">`
- `<input id="f5" data-automation-id="applyWorkAuthorization">`
- `<label for="f6">Postal Code</label><input id="f6">`
- `<div>Phone Number</div><input id="f7">`
- `<div>Professional Experience</div><textarea id="f8"></textarea>`
- `<label for="f9">Desired Salary</label><input id="f9">`
- `<input id="f10" placeholder="Notice period">`
- hidden trap: `<div aria-hidden="true"><label for="f11">Email</label><input id="f11"></div>`

Assert types: f1 email, f2 address, f3 first_name, f4 position, f5 work_authorization, f6 zip, f7 phone, f8 experience, f9 salary, f10 availability; f11 absent.

- [ ] **Step 2: Run it**

Run: `npx vitest run src/shared/contentScriptDetection.test.ts`
Expected: FAIL on the new sources (aria-labelledby, autocomplete, nearby text, desired salary, notice period) and on f8 (`years_experience`).

### Task 2: Detector changes

**Files:**
- Modify: `contentScript.js` `_classify`, `_getLabel`, rule table

**Interfaces:**
- Produces: `_getLabel(el: Element): string`; `AUTOCOMPLETE_FIELDS: Array<[token: string, field: string]>`.

- [ ] **Step 1: Extend `_getLabel`** in order: `aria-labelledby` text, `aria-label`, `label[for]`, wrapping label, placeholder, fieldset legend, bounded nearby text (up to 3 preceding siblings, skip blocks containing controls, max 120 chars).
- [ ] **Step 2: Add `AUTOCOMPLETE_FIELDS`** (longest token first): `organization title → position`, `organization → company`, `street address → address`, `address line1 → address`, `address line2 → address_line2`, `address level1 → state`, `address level2 → city`, `postal code → zip`, `country name → country`, `given name → first_name`, `family name → last_name`, `email → email`, `tel national → phone`, `tel → phone`, `url → website`. In `_classify`, after confirm checks, return the mapped field when the `autocomplete` attribute contains the token.
- [ ] **Step 3: Add `autocomplete`, `data-automation-id`, `data-testid`** (lowercased, hyphens as spaces) to the string matched by the rules.
- [ ] **Step 4: Regex fixes** — remove `professional experience` from `years_experience`; add aliases: salary (`desired|expected salary`, `salary|compensation|pay expectation`), availability (`notice period`, `when can you start`, `available to start`, `earliest start`), education (`highest (level of )?education`, `highest degree`), linkedin (`linkedin profile`), website (`personal website`, `portfolio site`), address (`mailing address`), zip (`post ?code`).
- [ ] **Step 5: Run the fixture test**

Run: `npx vitest run src/shared/contentScriptDetection.test.ts`
Expected: PASS.

### Task 3: Verification and docs

- [ ] **Step 1:** `node --check contentScript.js`
- [ ] **Step 2:** `npx tsc --noEmit`
- [ ] **Step 3:** `npm test -- --run` — all suites pass.
- [ ] **Step 4:** `npm run build`; grep `dist/contentScript.js` for `AUTOCOMPLETE_FIELDS` and `aria-labelledby`.
- [ ] **Step 5:** Append the change to `AGENTS.md`, `task/current-tasks.md`, and the T-12/task note; no commits.
