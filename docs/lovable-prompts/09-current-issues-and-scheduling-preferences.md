# Lovable prompt 09 — Teams, scheduling preferences, and real API recovery

You are modifying only the Paceday frontend repository. Read AGENTS.md and 00-global-context.md first.

The backend is a separate Go repository. It currently supports formal team membership in multiple teams: a user is identified by the pair (team_id, user_id), not by user_id alone. Do not collapse the list to one team and do not use the manager's detected 1:1 roster as a formal team.

The backend has also been hardened for the current production bug:

- POST /api/scheduling-links/ returns a validation response instead of panicking when a malformed payload has no duration.
- Manager detection now scans six weeks, understands Google expanded recurring instances where RecurringEventId is set but Recurrence is empty, and infers cadence for repeated 1:1 occurrences.
- GET /api/teams/ returns every team for the authenticated user.

## 1. Multiple formal teams

Inspect src/api/teams.ts and src/pages/Team.tsx.

Acceptance criteria:

- GET /api/teams/ is the source of truth and every returned team remains visible in the team switcher.
- Selecting one team only changes the active team; it must not remove or overwrite the other teams.
- Protected Hours, Find a Time, and Analytics always use the currently selected team ID.
- A refetch error keeps the previous team list and shows a retryable error; it must not replace real data with a one-team demo state.
- A user can be a member of Team A and Team B simultaneously.
- Add the missing authenticated invite-consumption flow using:
  - GET /api/teams/invites/:token
  - POST /api/teams/invites/:token/accept
  The acceptance flow must preserve the current user session, show the team name and invited email, reject a mismatched email with the server message, and invalidate the formal-team list after success.
- Do not add a global user-to-team uniqueness rule.
- Keep managerApi.team() separate from teamsApi.remote.list().

Add focused adapter/UI tests for two teams, active-team switching, invite acceptance, and a failed refetch with cached data.

## 2. Working-hours editor

This feature must be server-backed. Do not use localStorage as the source of truth and do not silently save a frontend-only shape.

The backend settings contract for the new fields is:

- workingHours: { mode: all_days | by_day, default: { enabled, start, end }, days: { monday..sunday: { enabled, start, end } } }
- lunchBreaks: { monday..sunday: { enabled, start, end } } or an omitted/empty object when no per-day override exists

Until GET /api/settings returns these fields, do not pretend the day-by-day setting was saved. Keep the UI disabled with a clear “backend update required” message or use only the existing global work_start/work_end fields.

When the fields are available:

- Offer two modes: “Same hours every day” and “Customize by day”.
- In same-hours mode, edit one default interval.
- In day-by-day mode, show Monday through Sunday with enabled/off, start, and end controls.
- Validate HH:MM, require end after start for enabled days, and allow a day to be off.
- Preserve unsaved values if the PUT fails and show apiErrorMessage(error).
- On success, use the returned server settings to replace the draft.

## 3. Defaults, templates, and custom values

Create explicit frontend preset constants, but persist through the existing settings adapter. Do not invent a new endpoint.

Offer these choices before the detailed editor:

- Balanced: 09:00–18:00, focus minimum 60 minutes, maximum 180 minutes, daily target 180 minutes, lunch 12:30–13:30, meeting buffer 5 minutes before and after.
- Focus first: 08:30–17:30, focus minimum 90 minutes, maximum 180 minutes, daily target 240 minutes, lunch 12:00–13:00, meeting buffer 10 minutes before and after.
- Custom: expose all fields for direct editing.

Applying a template must update the draft only until the user presses the existing Save changes action. Never report success before the PUT resolves.

For lunch:

- Offer “Use the template lunch” as the default.
- Offer “Override by day” with Monday through Sunday controls.
- Each day can be protected/off and can have its own start/end.
- Reject inverted or malformed intervals.

The existing global fields remain the compatibility fallback:

- work_start / work_end
- lunch_start / lunch_end / protect_lunch
- focus_min_block_minutes / focus_max_block_minutes / focus_daily_target_minutes
- buffer_before_minutes / buffer_after_minutes

Normalize both existing snake_case fields and the backend's camelCase response fields in src/api/client.ts or a settings adapter. Do not change components to call fetch directly.

## 4. Calendar scan and onboarding polish

- Keep the scan action width and height stable while pending. Use a fixed or constrained button width and a short pending label such as “Scanning calendar…”.
- Keep the loading spinner inside the same layout box; it must not overflow or resize the card.
- The manager profile save must be awaited before navigating away from onboarding.
- Prevent a second submission while the profile save is pending.
- Surface the real backend error with apiErrorMessage(error) and preserve the selected role.
- After detection, show the server result. “No new members found” must not be shown as a success if the request failed.

## 5. Scheduling links and preview mode

- After a successful POST /api/scheduling-links/, render the returned server link and refresh the list from the server.
- A server HTTP error (4xx/5xx) must remain an error and must never be replaced by demo links.
- A genuine unreachable/network error may use the existing explicit demo fallback, but show the demo/offline banner and keep the retry path visible.
- Never show a fabricated slug, booking URL, host list, or success toast before the server response.
- Add a regression test for the flow: create succeeds, list refetch fails, the saved server data remains visible with an actionable retry state.

## Hard boundaries

- Frontend files only.
- No backend, migration, CI, deployment, or dependency changes in this Lovable task.
- Use src/api/client.ts, src/api/teams.ts, React Query, and existing error helpers.
- No direct fetch or axios from pages/components.
- Do not use localStorage as the primary source of truth.
- Do not swallow API errors or replace HTTP errors with demo data.

## Required report

Report the exact files changed, request routes and body names used, tests run, and any backend contract field that is still unavailable. Run:

- npm run lint
- npm test
- ./node_modules/.bin/tsc --noEmit -p tsconfig.app.json
- npm run build
