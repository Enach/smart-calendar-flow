# Lovable prompt 03 — Scheduling links

Make the scheduling-links area production-shaped against the frozen backend contract. Work only on the frontend.

## Files to inspect

- `frontend/src/pages/Links.tsx`
- all components under `frontend/src/components/links/`
- `frontend/src/api/schedulingLinks.ts`
- `frontend/src/api/client.ts`
- routing and existing dialog, form and clipboard components

## API contract

- GET `/api/scheduling-links/` returns `{ owned, shared }`.
- POST `/api/scheduling-links/` accepts `{ title, duration_options, days_of_week, window_start_time, window_end_time, buffer_before, buffer_after, min_notice_minutes, usage_type, max_uses, active? }`.
- GET/PATCH/DELETE `/api/scheduling-links/:id` use the scheduling-link DTO.
- POST `/api/scheduling-links/:id/hosts` accepts `{ email }`.
- GET `/api/scheduling-links/host-invites` returns `{ link_id, link_title, owner_name, owner_email, invited_at }` items.
- POST `/api/scheduling-links/host-invites/:id/accept` and `/decline` update an invitation.
- POST `/api/scheduling-links/:id/leave` returns 204.
- GET `/api/scheduling-links/:id/bookings` returns bookings for the link.

The DTO includes `id`, `owner_id`, `title`, `slug`, `durations`, `days`, `window_start`, `window_end`, `buffer_before`, `buffer_after`, `min_notice_minutes`, `usage_type`, `max_uses`, `uses_count`, `active`, `hosts`, `created_at`, `is_owner` and `my_status`.

## Implement

- Keep all request/response translation in `schedulingLinks.ts` or the existing API port.
- Make create and edit forms use explicit controlled values and validate: title, at least one duration, valid weekday list, start before end, non-negative buffers, positive notice and valid max uses for single-use links.
- Render owned and shared links separately with ownership/status badges.
- Allow an owner to edit, activate/deactivate, delete, copy the public `/book/:slug` URL, add hosts and inspect bookings.
- Allow an invited host to accept, decline or leave. Do not show owner-only actions to a shared host.
- Show invite loading, empty, success, conflict, forbidden and validation states.
- Invalidate links, invite and booking queries after every successful mutation.
- Make copy-to-clipboard report success or failure; never pretend the copy succeeded.

## Acceptance criteria

- The exact backend body names above are sent; do not send frontend-only names such as `duration` or `days` in the POST/PATCH body.
- Reopening an edited link displays the server response, not stale local form state.
- A 409 or 422 response leaves the form open with a useful message.
- A 204 leave/delete response completes without a JSON parse error.
- Public URL generation is deterministic from the returned slug.
- Add or update tests for body mapping, normalization, ownership actions and invite mutation invalidation.
- `npm run lint`, `npm test` and `npm run build` pass.
