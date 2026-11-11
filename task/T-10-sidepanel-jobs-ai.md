# T-10 — Jobs Side Panel, Ratings, AI Settings

Phase 4 of the React migration. Guideline: `plan/react-migration/README.md`.

Status: DONE (see `plan/react-migration/06-implementation-status.md` §7 and §7a)
Depends on: T-08, T-09
Estimate: 9-11 hours

Completion note: all steps are implemented except the "insert draft into page" path (needs a field picker and the T-11 AI apply handlers) and component tests. Files shipped: `src/sidepanel/{App.tsx,api.ts,sidepanel.css}`, `src/sidepanel/components/{FilterBar,JobCard,Stars,AiSettings}.tsx`, root `sidepanel.html`. Verification: `tsc --noEmit` clean, 66 tests pass, `npm run build` succeeds.

## Goal

Ship the Chrome Side Panel: best jobs ranked by the computed match score with stars and reasons, plus the provider and per-task model picker with draft generation.

## Steps

### Panel shell and jobs

- [ ] 1. Create `src/sidepanel/index.html`, `main.tsx`, `App.tsx` with header (brand, provider badge, AI button), `FilterBar`, and `JobsPanel`.
- [ ] 2. Style for 320-520px width in `src/styles/sidepanel.css`.
- [ ] 3. `useJobs()`: load `jobPrefs`, auto-search with `profile.position` when no saved query, call `GET_JOBS`, score with `scoreJob`, sort by total then recency then title.
- [ ] 4. `FilterBar`: keyword input, remote toggle, visa toggle, minimum stars, maximum age; persist every change to `jobPrefs`.
- [ ] 5. `JobCard`: title, company, location, remote/visa badges, posted age, star row with numeric score, top reason chips, Open, Open + Autofill, Draft cover letter.
- [ ] 6. `ScoreBreakdown`: expandable seven-part view with `points/max` and each reason.
- [ ] 7. Star component: five SVG stars with half-step clipping, accessible label including both the 5-point and 100-point score.
- [ ] 8. Empty, loading skeleton, no-results, network error with retry, and stale-cache banner states.
- [ ] 9. "Open + Autofill": activate or create the job tab, wait for load, send `ALL_FRAMES_FILL`, show `fieldsFilled` and `framesReached` in a toast.

### AI settings

- [ ] 10. `AiSettings` modal: four provider cards with masked key input, reveal toggle, model dropdown, free-text override, custom base URL, Test connection button, status dot.
- [ ] 11. Per-task model table for `cover_letter`, `answers`, `tailor`, `form_question`, each `Inherit` or explicit provider and model.
- [ ] 12. Privacy block: fields sent per task, keys stored locally, Clear keys with confirmation, session usage totals.
- [ ] 13. `useAiConfig()`: load sanitized settings, save config and keys separately, test connections, list models (live for OpenRouter).
- [ ] 14. `AiProviderBadge` in the header showing `Provider · model` and opening the modal.

### Drafting

- [ ] 15. `AiDraftModal`: prompt preview, Generate, Regenerate (cache bypass), editable textarea, Copy, Save as draft, Insert into page.
- [ ] 16. Wire `cover_letter` and `tailor` from `JobCard`; `tailor` returns JSON and renders summary and skills as separate editable blocks.
- [ ] 17. Surface mapped AI errors inline in the modal (no raw errors, no key fragments).
- [ ] 18. Add component tests: `JobCard` stars and breakdown, `AiSettings` validation and masking, per-task override resolution.

## Deliverables

- `src/sidepanel/**`
- `src/styles/sidepanel.css`
- Component tests for jobs and AI settings

## Acceptance criteria

- Every item in the Phase 4 manual QA list in `04-build-test-and-verification.md` passes.
- Panel opens from the popup button on Chrome 116+.
- Jobs are sorted by score; stars always agree with the numeric score.
- Each provider saves, tests, and reports a mapped error when misconfigured.
- Per-task model choice overrides the provider default.
- Drafts never reach a form without an Apply click.
- `npm run typecheck` and `npm test` pass.

## Out of scope

- AI re-ranking of jobs.
- Streaming responses.
- Manual user star overrides (add later if requested).
