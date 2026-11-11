# Jobs, Ratings, and the Side Panel

## Job source

Arbeitnow job board API.

- `GET https://www.arbeitnow.com/api/job-board-api?search=<q>&remote=<bool>&visa_sponsorship=<bool>&limit=<n>`
- No key, no auth.
- Fetch from the background service worker, never from the popup or content script.
- Arbeitnow is Europe-weighted; state this in the empty state and settings copy.

Raw shape (per `API_DOCUMENTATION.md`):

```json
{
  "data": [{
    "id": "123",
    "title": "Senior Software Engineer",
    "company_name": "Tech Corp",
    "location": "Berlin, Germany",
    "remote": true,
    "visa_sponsorship": true,
    "description": "…",
    "url": "https://apply.example.com/job/123",
    "created_at": "2024-01-15T10:00:00Z"
  }]
}
```

## Normalized model

```ts
type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  visaSponsorship: boolean;
  description: string;
  url: string;
  createdAt: number;
  source: "arbeitnow";
};

type ScoredJob = {
  job: Job;
  total: number;      // 0-100
  stars: number;      // 1-5, .5 steps
  breakdown: ScorePart[];
};

type ScorePart = {
  key: "title" | "skills" | "location" | "remote" | "recency" | "visa" | "salary";
  label: string;
  points: number;
  max: number;
  reason: string;
};
```

## Scoring

Pure function in `src/shared/score.ts`. Deterministic. No network. Works with an empty profile (returns neutral scores).

| Key | Max | Rule |
|---|---|---|
| `title` | 30 | Token overlap between `profile.position` plus skill tokens and the job title. Exact role phrase gets the full 30. Partial overlap scales linearly. |
| `skills` | 25 | Share of profile skills found in tags or description, capped at 25. |
| `location` | 15 | Same city/state: 15. Same country: 10. Remote job when the profile wants remote: 15. Otherwise 3. |
| `remote` | 10 | Job remote and profile workType is Remote or Hybrid: 10. Job remote, profile on-site: 4. Job not remote, profile remote: 0. |
| `recency` | 10 | Posted under 3 days: 10. Under 7: 7. Under 14: 4. Under 30: 2. Older: 0. |
| `visa` | 5 | Sponsorship needed and offered: 5. Needed and not offered: 0. Not needed: 5 neutral. |
| `salary` | 5 | Description mentions salary, compensation, or a currency range: 5. |

Stars: `total / 20`, rounded to the nearest 0.5, clamped to 1-5.
Tie-break: recency, then `title` points, then title alphabetically so the order is stable.

Each part carries a short `reason` for display, for example:
`{ key: "title", points: 24, max: 30, reason: "React and TypeScript appear in the title" }`.

Skills tokenization: lowercase, split on commas, semicolons, slashes, and whitespace; drop tokens shorter than 2 characters; de-duplicate.

Location parsing: split the Arbeitnow `location` string on commas; compare the first token to `profile.city` and the last token to `profile.country`. Remote jobs skip city matching.

## Background endpoints

### `GET_JOBS`

Request: `{ query: string, remote?: boolean, visa?: boolean, limit?: number }`

Behavior:

1. Build a cache key `query|remote|visa|limit`.
2. Return `jobCache[key]` when younger than 15 minutes.
3. Otherwise fetch, normalize, drop entries without `title` or `url`, de-duplicate by `url`, cap at 100.
4. Write the cache and return `{ success, jobs, fetchedAt, cached }`.
5. On HTTP or network failure return `{ success: false, error, jobs: [] }` and leave any stale cache in place so the panel can offer "Showing cached results".

## Side panel layout

Width: Chrome controls it, design for 320-520px.

```
+------------------------------------------------+
| jolly R            [OpenAI · gpt-4o-mini] [AI] |
+------------------------------------------------+
| [ Search role or keyword…            ] [Go]    |
| Remote [x]  Visa [ ]  Min stars [3v]  Age [14d]|
+------------------------------------------------+
| 24 jobs · sorted by match                      |
|                                                |
| Senior React Engineer          4.5 stars  92   |
| Tech Corp · Berlin, Germany · remote           |
| [React in title] [Remote] [2d ago]             |
| [Open] [Open + Autofill] [Draft letter]        |
+------------------------------------------------+
```

Components:

- `FilterBar`: query input, remote and visa toggles, minimum stars, maximum age. Persists to `jobPrefs`.
- `JobsPanel`: owns loading, error, empty, and cached states. Auto-searches with `profile.position` on first open when `jobPrefs.query` is empty.
- `JobCard`: title, company, location, remote and visa badges, posted age, star row with numeric total, reason chips, actions.
- `ScoreBreakdown`: expandable list of all seven parts with `points/max` bars and reasons.
- `AiProviderBadge`: opens the AI settings modal.

## Star rendering

Five SVG stars with a clipped overlay for half stars, plus the numeric score. Use `aria-label="Match score 4.5 out of 5, 92 out of 100"`. Never rely on color alone; the numeric score is always visible.

## Actions

- **Open**: `chrome.tabs.create({ url: job.url })`.
- **Open + Autofill**: find an existing tab with the same URL, activate it; otherwise create it. Wait for `document_idle`, then send `ALL_FRAMES_FILL` through the background with the saved profile. Show the returned `fieldsFilled` and `framesReached` in a toast.
- **Draft cover letter** and **Tailor profile**: delegate to the AI layer (see `02-ai-provider-layer.md`).

## Opening the panel

- `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })` in the background so the toolbar icon still opens the popup.
- Popup header gets a "Best Jobs" button that calls `chrome.sidePanel.open({ windowId })` inside the click handler. This requires a user gesture, which the button click provides.
- Chrome 116+ required; set `minimum_chrome_version`.

## Empty and error states

| State | Copy |
|---|---|
| No profile | "Add your role and skills in the popup to rank jobs." with a button to open the popup |
| Loading | Skeleton cards, 3 rows |
| No results | "No jobs matched. Try fewer filters." |
| Network error | "Could not reach the job board." plus a Retry button |
| Cached only | "Showing cached results from <time>." banner above the list |

## Tests

Unit (`src/shared/score.test.ts`):

- Exact title match scores the full 30.
- Skills overlap scales and caps at 25.
- Remote preference combinations produce the expected points.
- Recency boundaries at 3, 7, 14, and 30 days.
- Visa matrix, including the neutral case.
- Empty profile yields a stable neutral score.
- Stars map correctly at 1, 3, 4.5, and 5, including rounding.

Integration (background, fetch mocked):

- Normalization drops entries without a title or URL.
- Duplicate URLs collapse.
- Cache hit avoids a second fetch.
- Stale cache is preserved on failure.
