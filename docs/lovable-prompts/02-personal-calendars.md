# Lovable prompt 02 — Personal calendars

Implement the complete personal calendar management experience using the existing API boundary. Work only on the frontend.

## Files to inspect

- `frontend/src/components/PersonalCalendarsSection.tsx`
- `frontend/src/hooks/usePersonalCalendars.ts`
- `frontend/src/api/client.ts`
- `frontend/src/api/types.ts`
- the settings page and existing toast/dialog components

## API contract

- GET `/api/personal-calendars` returns the configured calendars.
- POST `/api/personal-calendars` accepts `{ provider, name, url, enabled }`.
- PATCH `/api/personal-calendars/:id` accepts any of `{ name, url, enabled }`.
- DELETE `/api/personal-calendars/:id` returns 204.
- POST `/api/personal-calendars/:id/sync` returns the normalized calendar.
- GET `/api/personal-calendars/:id/preview` returns a preview for the selected calendar.

The frontend normalized shape is `{ id, label, type, url?, enabled, last_synced_at? }`, where type is google, outlook or webcal. Keep provider-to-type normalization inside the API adapter.

## Implement

- Show loading, empty, connected, disabled, syncing, success and error states.
- Support adding a WebCal URL with validation and a clear explanation of the privacy implications.
- Support editing the display name, URL and enabled state through PATCH.
- Add a Sync action using the sync endpoint and disable it while pending.
- Add an optional preview action using the preview endpoint if the current API port does not expose it; extend the port/client and test it rather than calling the endpoint from the component.
- Do not assume that adding Google or Outlook returns an `auth_url`; the current backend stores the personal calendar and OAuth connection is a separate concern. Never show a fake authorization success.
- Invalidate the personal calendars query after add, edit, delete or sync. Preserve the previous list if a refetch fails.
- Confirm destructive deletion and handle HTTP 204 without trying to parse JSON.

## Acceptance criteria

- A user can add, rename, enable/disable, sync and delete a personal calendar.
- Invalid WebCal input is rejected before the request.
- Pending controls cannot be double-submitted.
- Backend validation and network errors are visible and actionable.
- No component uses localStorage as the source of truth.
- Add tests for normalization, PATCH body shape, 204 deletion and the key mutation states.
- `npm run lint`, `npm test` and `npm run build` pass.
