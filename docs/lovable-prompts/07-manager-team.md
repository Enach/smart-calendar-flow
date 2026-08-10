# Lovable prompt 07 — Manager and team workflows

Complete the manager and formal-team frontend workflows against the existing backend contracts. Work only on the frontend.

## Files to inspect

- `frontend/src/api/manager.ts`
- `frontend/src/api/teams.ts`
- manager and team pages/components
- query providers and route registration

## API contract

Manager endpoints:

- GET/POST `/api/manager/profile` with `{ is_manager }` for POST.
- GET `/api/manager/team` returns `{ members: [...] }`.
- POST `/api/manager/detect` returns manager detection counts and status.
- POST `/api/manager/team/members` accepts `{ email, display_name, cadence, cadence_custom_days }`.
- PATCH/DELETE `/api/manager/team/members/:email` updates/removes a member.
- GET `/api/manager/gaps` returns `{ gaps: [...] }`.
- POST `/api/manager/team/members/:email/schedule` accepts `{ suggested_date? }` and returns `{ prefill_url }`.
- GET `/api/manager/analytics?week=YYYY-MM-DD` returns `{ members: [...] }`.

Formal-team endpoints:

- POST/GET `/api/teams/` and GET/PATCH/DELETE `/api/teams/:id`.
- POST `/api/teams/:id/members/invite` accepts `{ email }`.
- DELETE `/api/teams/:id/members/:userId`.
- POST/GET `/api/teams/:id/no-meeting-zones`, PATCH/DELETE `/api/teams/:id/no-meeting-zones/:zoneId` with `{ dayOfWeek, startTime, endTime, label }`.
- GET `/api/teams/:id/availability?date=YYYY-MM-DD&duration=30` returns `{ slots: [{ start, end, quality_score }] }`.
- GET `/api/teams/:id/analytics?date=YYYY-MM-DD` returns team aggregate and member breakdown.

## Implement

- Use `managerApi.remote` and `teamsApi.remote` through React Query. Keep the existing fallback only for explicit mock/preview mode.
- Make profile detection, member CRUD, cadence editing, gap display and schedule-prefill actions reflect pending and error states.
- Make formal-team creation, rename, deletion, invite, member removal, no-meeting-zone CRUD, availability and analytics usable from the existing routes.
- Invalidate the smallest relevant query keys after each mutation. Never leave stale counts or analytics visible without an indication that a refresh is pending.
- Validate email, cadence, custom cadence days, zone time ranges and date/duration values before requests.
- Treat the schedule-prefill response as a URL returned by the server; do not fabricate a link.
- Handle forbidden, conflict and validation responses with useful messages and preserve unsaved form values.
- Keep derived analytics and local demo helpers out of the online path.

## Acceptance criteria

- A manager can detect, add, edit, remove and schedule a one-on-one for a team member.
- A user can create/manage a formal team, invite/remove members and manage no-meeting zones where authorized.
- Availability and analytics are loaded for the selected date/duration and show empty states correctly.
- All mutation success states are confirmed by server data or an explicit invalidated refetch.
- No component directly calls fetch or silently catches an API error into fake data.
- Add tests for manager/team response normalization, mutation bodies and query invalidation.
- `npm run lint`, `npm test` and `npm run build` pass.
