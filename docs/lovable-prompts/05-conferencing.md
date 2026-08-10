# Lovable prompt 05 — Conferencing and event links

Finish the conferencing integration in settings and event details. Work only on the frontend.

## API contract

- GET `/api/conference/providers` returns provider status objects with provider, connected, email, enabled and auto_with.
- OAuth starts at `/api/auth/zoom` through the existing `api.zoomConnectUrl()` helper.
- POST `/api/conference/zoom/disconnect` returns 204.
- POST `/api/events/:id/conference` accepts `{ provider, url? }` and returns `{ provider, url, label? }`.
- DELETE `/api/events/:id/conference` returns 204.

Supported providers are google_meet, zoom, teams and custom. Inspect `ConferencingSection.tsx`, `EventDetailView.tsx`, `EventDrawer.tsx`, `MeetingLinkRow.tsx` and the API client before editing.

## Implement

- Query provider status through the API client and render connected, disconnected, connecting, disconnecting and error states.
- In real API mode, clicking Connect Zoom must navigate to `api.zoomConnectUrl()`; it must not call a mock success helper or claim OAuth succeeded locally.
- Preserve mock behavior only when the existing explicit mock mode is active.
- Let the user disconnect Zoom through the 204 endpoint and invalidate provider status afterward.
- For event conferencing, allow adding a connected provider or a validated custom URL, and allow removal.
- Disable providers that are unavailable and explain why. Do not send a custom URL for providers that do not require one.
- Keep existing event details intact when a conference mutation fails.
- Handle 204 responses without JSON parsing and surface 401/403/409/422 errors.

## Acceptance criteria

- There is no unconditional `mockZoomConnect()` path in real API mode.
- Provider cards reflect server state after refresh and after disconnect.
- Add/remove conference actions use the exact endpoint bodies above.
- A custom URL must be a valid http or https URL before submission.
- An error cannot leave the UI claiming that a provider or event link was changed.
- Add focused tests for OAuth URL selection, provider normalization, conference body mapping and 204 removal.
- `npm run lint`, `npm test` and `npm run build` pass.
