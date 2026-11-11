# T-07 — Toolchain and Shared Modules

Phase 1 of the React migration. Guideline: `plan/react-migration/README.md`.

Status: completed
Depends on: none
Estimate: 3-4 hours

## Goal

Stand up a Vite + React + TypeScript build that produces a loadable `dist/` without changing current behavior, then extract the duplicated constants and helpers into `src/shared/`.

## Steps

- [ ] 1. Create `package.json`, install `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `jsdom`, `@testing-library/react`, `@types/chrome`, `@types/react`, `@types/react-dom`.
- [ ] 2. Add `tsconfig.json` (strict, `types: ["chrome"]`, `jsx: react-jsx`) and `vite.config.ts` with the four inputs described in `01-architecture.md`.
- [ ] 3. Add `public/manifest.json` pointing at the eventual bundle names, but temporarily copy today's `popup.html`, `popup.js`, `background.js`, `contentScript.js`, and `contentScript.css` into `dist/` so the extension loads unchanged.
- [ ] 4. Verify `npm run build` then load `dist/` unpacked; save a profile and run a fill on a test form to prove the build is inert.
- [ ] 5. Create `src/shared/messages.ts` with every `MESSAGE_TYPE` string copied verbatim from `background.js`, `popup.js`, and `contentScript.js`.
- [ ] 6. Create `src/shared/profileSchema.ts` with `PROFILE_FIELDS` and `PROFILE_CHECKBOXES` copied from `popup.js`.
- [ ] 7. Create `src/shared/types.ts` with `Profile` (all fields from the schema), `ApplicationEntry`, `Job`, `ScoredJob`, `ScorePart`, `AiConfig`, `AiKeys`.
- [ ] 8. Create `src/shared/storage.ts` with typed `getSync`, `setSync`, `getLocal`, `setLocal`, `removeLocal` helpers. Keep existing keys.
- [ ] 9. Move `generateStrongPassword` to `src/shared/password.ts` and `exportHistoryCSV` row building to `src/shared/csv.ts`; move `domainFromUrl` and `timeAgo` to `src/shared/format.ts`.
- [ ] 10. Create `src/shared/score.ts` implementing the seven-part scoring model from `03-jobs-scoring-sidepanel.md`, returning `{ total, stars, breakdown }`.
- [ ] 11. Add Vitest config and tests: password (length, character classes, uniqueness), CSV quoting, score boundaries, stars mapping, format helpers.

## Deliverables

- `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`
- `src/shared/{messages,types,profileSchema,storage,score,password,csv,format}.ts`
- `public/manifest.json`
- Tests for every shared pure module

## Acceptance criteria

- `npm run build` succeeds and `dist/manifest.json` exists.
- The extension loads from `dist/` and the pre-migration popup and fill still work.
- `npm test` passes with at least 15 tests.
- No duplicated `MESSAGE_TYPE` definition remains in new code.
- `src/shared/` has no `chrome.*` call outside `storage.ts`.

## Out of scope

- React components.
- Background rewrites.
- Any manifest permission change beyond what already exists.
