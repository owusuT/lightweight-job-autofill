# jolly R job autofill

A Chrome extension that fills job application forms from a profile you save once. It runs on any site, including application forms inside cross-origin iframes, and keeps a local record of applications you submit.

Current version: 2.0.0. Manifest V3.

## What it does

- Detects form fields on the page and in embedded frames (Greenhouse, Workday, Lever, iCIMS, Taleo, BambooHR, and others).
- Fills names, contact details, address, work history, education, skills, legal and eligibility questions, voluntary EEO questions, position details, and references.
- Handles plain inputs, selects, radios, checkbox groups, React-Select style comboboxes, and file uploads.
- Attaches a resume or cover letter you have stored in the popup.
- Adds an in-page dock at the bottom right with Fill, Scan, and Clear actions. The dock forwards work to every frame on the page.
- Tracks applications in a History tab. Fills are recorded separately and do not count as submissions.
- Exports application history as CSV.
- Extracts text and personal details from a PDF resume with Mozilla PDF.js.
- Generates strong passwords with `crypto.getRandomValues`.

Consent checkboxes are never accepted automatically. You enable each one in the popup.

## Install

1. Run `npm install` once, then `npm run build`.
2. Open `chrome://extensions/`.
3. Turn on Developer mode.
4. Click Load unpacked and select the `dist/` folder.
5. Pin the extension if you want quick access to the popup.

The popup and side panel are React + TypeScript built by Vite. `contentScript.js` stays vanilla and is copied into `dist/`. Migration history: `plan/react-migration/`.

## Use

### Set up a profile

1. Open the popup.
2. Fill in the Profile tab, including any consent toggles you want.
3. Click Save Profile.

### Fill an application

1. Open a job application page.
2. Click the jolly R tab at the bottom right, or open the popup.
3. Click Fill Application.
4. Check the result message. It reports fields filled and how many frames were reached.

If a page renders its form late, fill again after a few seconds. The extension retries while the form loads, but some sites take longer.

### Resume and cover letter

Upload both in the Apply tab. PDFs are parsed for text on upload. Files are stored in `chrome.storage.local` and attached to matching upload fields during a fill.

### History

The History tab shows applications, not fills. A form fill is saved as a local event. A submission is only recorded when the extension sees an explicit submit signal. Export uses the same rule.

### Account creation

Account creation is off by default. Turn it on under Tools if you want jolly R to fill signup forms. It only touches forms with a new-password field, a password confirmation field, or two or more password inputs. Login forms are skipped. If saved credentials exist for the host, it does nothing.

## Storage keys

Everything stays in Chrome storage. No backend.

| Key | Area | Contents |
| --- | --- | --- |
| `userProfile` | sync | Profile fields, legal answers, EEO answers, consent toggles |
| `config` | local | Autofill and dock settings, account creation flag |
| `appHistory` | local | Fills and submissions, capped at 200 entries |
| `sharedPDFData` | local | Resume file plus extracted text |
| `coverLetterFile` | local | Cover letter file |
| `savedCreds` | local | Account id per host. The raw password is never stored here. |

## How it works

### Background service worker (`background.js`)

- Module system for tab state, user data, ATS detection, and all-frames messaging.
- All-frames service sends fill, scan, and clear requests to every frame in the active tab and merges the results.
- Retries a fill up to three times when the first pass finds no fields, which covers slow SPA hydration.
- ATS detection compares hostnames. Path patterns such as `linkedin.com/jobs` are handled separately so `linkedin.com` alone does not match a jobs path.
- Keeps a keep-alive port open while a content script is active.

### Content script (`contentScript.js`)

- `AtsFieldDetector` scores fields from id, name, placeholder, label, aria-label, and question text. It stores every matching element per field type instead of only the first.
- `FormFiller` writes values through the native prototype setter and fires input and change events. Hidden, disabled, read-only, and zero-size fields are skipped.
- `AutofillOrchestrator` waits for network idle, scans with retries, fills each field, attaches files, then reports completion.
- `UIService` renders the dock and toasts in a Shadow DOM so page CSS cannot break it.

### Popup (`src/popup/**`)

React 18 + TypeScript. Four tabs: Profile, Apply, History, Tools. Includes the password generator, credentials list, detected field report, consent controls, resume/cover-letter upload, and the Best Jobs button.

### Side panel (`src/sidepanel/**`)

React + TypeScript. Best Jobs ranks Arbeitnow results with the local `scoreJob` model against the saved profile, plus the job captured from the current page ("Add page"). AI settings, draft generation, and explicit insert-into-page live here.

On an application page, choose **Autofill** in Best Jobs to scan the current tab and fill fields that match your saved profile, including forms embedded in iframes. Review the filled fields before submitting.

### PDF processing (`lib/pdf-processor.js`)

`RealPDFProcessor` loads the vendored PDF.js build, extracts text page by page, and pulls out name, email, phone, address, summary, experience, education, and skills.

## Field coverage

Personal: first name, last name, email, email confirmation, phone, phone confirmation.

Address: street, address line 2, city, state, ZIP, country, location.

Professional: summary, experience, education, skills, company, position, salary, availability, work type, industry, LinkedIn, website.

Application: years of experience, certifications, cover letter, referral source, referred by, why interested, references, start date, and employment type.

Legal and EEO: work authorization, sponsorship, age confirmation, gender, race, veteran status, disability status.

Consent: background check, drug screening, signature, terms. All opt-in.

## Permissions

- `storage`: profile, history, files, settings.
- `tabs`: read the active tab URL and send messages to frames.
- `webNavigation`: enumerate frames for cross-frame fills.
- Host access on all sites: the content script must run wherever an application form lives.

## Limitations

- Multi-step forms work best when each step is a normal page or a form rendered in the same document. Some wizards reset state between steps.
- CAPTCHAs and bot checks are not bypassed.
- Scanned PDFs need OCR before upload. The parser only reads embedded text.
- Highly custom widgets may need manual input. The extension returns a failed fill instead of a false success when a combobox option cannot be selected.
- The history cap is 200 entries. Older entries are dropped when a new one is written.
- Chrome and other Chromium browsers only. Firefox is not supported.

## Development

### Files

```
popup.html                 Popup entry (built by Vite)
sidepanel.html             Side panel entry (built by Vite)
public/manifest.json       Extension manifest (MV3), emitted to dist/
contentScript.js           Detection, filling, dock UI (vanilla, copied to dist/)
contentScript.css          Dock and toast styles
src/background/**          Service worker source, builds to dist/background.js
src/popup/**               Popup React app and styles
src/sidepanel/**           Side panel React app (jobs, AI settings)
src/shared/**              Types, messages, scoring, capture, AI providers, helpers
lib/pdf-processor.js       PDF text extraction and profile parsing
lib/pdfjs/build/           Vendored PDF.js and worker
scripts/copy-current-to-dist.js  Copies the vanilla shipping files into dist/
plan/react-migration/      React + TypeScript migration plan
task/                      Work items
dist/                      Built extension (load this folder unpacked)
```

### Checks

```
npm install
npm run typecheck
npm test
npm run build
node --check contentScript.js
```

`npm run build` gates on `tsc --noEmit`, runs Vite, then copies the vanilla content script and PDF assets into `dist/`.

### Manual test

1. Load the extension unpacked.
2. Open a job application with a mix of text inputs, selects, radios, and an iframe embed.
3. Run Fill from the dock.
4. Confirm the field total in the toast and that the History tab does not count the fill as a submission.

## License

MIT.
