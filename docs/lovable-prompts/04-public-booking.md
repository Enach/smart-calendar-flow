# Lovable prompt 04 — Public booking

Implement a robust public booking flow for `frontend/src/pages/PublicBooking.tsx`. Work only on the frontend and use the existing API client.

## API contract

- GET `/api/book/:slug` returns `{ slug, title, durations, hosts, min_notice_minutes, usage_type, coverage: { total, checked } }`.
- GET `/api/book/:slug/slots?date=YYYY-MM-DD&duration=30` returns `{ slots: [{ start, end }], available_dates: [] }`.
- GET `/api/book/:slug/slots` without date returns the available-date envelope.
- POST `/api/book/:slug` accepts `{ name, email, start, end, duration, notes? }` and returns the created booking.

The backend enforces minimum notice, allowed durations, link exhaustion and calendar conflicts. The UI must present those backend decisions rather than simulate availability.

## Implement

- Load link metadata first and show title, host information, allowed durations, minimum notice and single-use/recurring status.
- Load available dates through the date-less slots request, then load slots for the selected date and duration.
- Never show a slot as available until it is returned by the API.
- Keep date and duration changes race-safe: stale slot responses must not overwrite the current selection.
- Validate name, email, date, time and duration before submit.
- Show a review step before booking and a clear confirmation using the returned booking data.
- Handle 404 as an unknown link, 410 as expired/exhausted, 409 as a slot conflict with a refresh action, and 422 as a user-correctable validation or notice error.
- Keep the page usable on mobile and keyboard accessible. Do not expose internal IDs or raw server errors.
- If the existing API client lacks a public-booking method, add it to the API module and tests; do not call fetch from the page.

## Acceptance criteria

- Refreshing the page with a valid slug restores the metadata flow without fake slots.
- Changing duration reloads availability with the selected duration in the query string.
- A booking failure keeps the entered form values and explains the next action.
- The confirmation displays the server-returned start, end, duration, title and hosts.
- Loading, no dates, no slots, link expired, conflict, validation and success states are distinct.
- Add tests for the slots envelope, query parameters, booking body and 404/409/410/422 mapping.
- `npm run lint`, `npm test` and `npm run build` pass.
