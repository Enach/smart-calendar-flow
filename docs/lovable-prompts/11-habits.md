# Lovable prompt 11 — Habits and scheduled occurrences

You are modifying only the Paceday frontend repository. Read AGENTS.md, docs/lovable-prompts/00-global-context.md, and docs/lovable-prompts/10-qa-hardening.md first.

The backend habit contract is now available. Do not modify the backend, migrations, CI, deployment files, or dependencies in this task. Do not invent endpoints or fields.

## Frozen API contract

Use the existing API client boundary and React Query. The exact routes and JSON names are:

- GET /api/habits/templates returns a list of templates.
- GET /api/habits returns the authenticated user habits.
- POST /api/habits accepts title, duration_minutes, days_of_week, window_start, window_end, priority, and color.
- PATCH /api/habits/:id accepts any partial habit fields plus active.
- DELETE /api/habits/:id deactivates the habit and returns HTTP 204.
- GET /api/habits/:id/occurrences?from=YYYY-MM-DD&to=YYYY-MM-DD returns occurrence records.
- PATCH /api/habits/:id/occurrences/:occurrenceId accepts status: completed or scheduled and returns the updated occurrence.
- POST /api/habits/reoptimize starts asynchronous reoptimization and returns a status message. Show that the operation started; never claim that scheduling is complete before a server response.

Backend validation uses Monday=1 through Sunday=7, duration_minutes from 1 through 1440, HH:MM times, window_end after window_start, and priority from 0 through 100. Surface server validation messages with apiErrorMessage.

## API adapter and query behavior

Create or extend the appropriate module under src/api. Do not call fetch or axios from a component, page, hook, or context.

Normalize list and template responses defensively without changing the contract. Keep server response fields as the source of truth.
Use stable habit query keys for habits, templates, and occurrences by habit and date range.
Keep cached habits and occurrences visible when a refetch fails, and show an actionable error banner with Retry.
Invalidate the relevant queries after create, update, deactivate, occurrence status update, and reoptimization. Preserve unsaved form values when a mutation fails.
Keep the explicit preview fallback behavior if the repository already supports it, but never replace an HTTP 4xx or 5xx with demo habits or a fake success.

## UI behavior

Add a dedicated authenticated habits view at /app/habits, or integrate it into the existing authenticated navigation without breaking existing routes.

Implement:

- A list of active and inactive habits with title, duration, days, window, priority, color, and status.
- A create and edit form with strict client validation matching the backend. Empty days, invalid HH:MM, inverted windows, invalid duration, and invalid priority must block submission.
- Template selection that fills the draft only. Applying a template must not report success or persist until the user submits the form.
- Active and inactive behavior. Deactivation must use DELETE /api/habits/:id and respect the 204 response. If the UI offers reactivation, use PATCH with active: true.
- An occurrences view for a selected habit with a date range. Show scheduled, completed, missed, and displaced states distinctly.
- A completed occurrence action and a reopen action using PATCH with status completed or scheduled. Keep the row state server-backed.
- A Reoptimize action with stable button dimensions, pending state, server status feedback, and a refresh or invalidation path.

Do not fabricate calendar event IDs, slots, success messages, or occurrence dates. Do not use localStorage as the primary source of truth.

## Tests and acceptance criteria

Add focused adapter and UI tests for request body names, template draft behavior, validation, 204 deactivation, occurrence status mapping, cached data on refetch failure, and HTTP errors without preview fallback.

Verify:

- A user can create a habit for Sunday and the request uses day 7.
- An invalid interval is rejected before submission and the draft is preserved.
- A completed occurrence remains completed after a refetch or reoptimization-triggered refresh.
- A 409, 422, or 500 remains an actionable error.
- A network failure may show the explicit preview state only if the existing fallback policy allows it.

Run npm run lint
Run npm test
Run ./node_modules/.bin/tsc --noEmit -p tsconfig.app.json
Run npm run build

Report exact files changed, endpoints and body names used, tests run, and any unresolved backend limitation.
