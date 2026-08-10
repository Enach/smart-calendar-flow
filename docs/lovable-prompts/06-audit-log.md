# Lovable prompt 06 — Audit log

Add a small, reliable audit-log view backed by the existing API. Work only on the frontend.

## API contract

- GET `/api/audit?limit=50` returns an array of `{ id, action, details, created_at }`.
- The existing API client method is `getAudit(limit?)`; extend the API port only if needed.

## Inspect first

Inspect the route registration in `App.tsx`, the navigation model, page layout, table/list components, date formatting utilities and API contract tests. Reuse the existing visual system.

## Implement

- Add an Audit page and route only if the application currently has an authenticated settings or admin navigation area where it belongs.
- Fetch through React Query and the API client, with a default limit of 50 and an explicit refresh action.
- Render action, readable timestamp and safe details. If details is structured data, format it safely without executing or injecting HTML.
- Provide loading, empty, error and retry states.
- Do not expose secrets, tokens, cookies or authorization headers even when the API returns unexpected details.
- Preserve the last successful list if refresh fails.
- Add pagination or a load-more control only if the existing API contract supports it; do not invent a cursor endpoint.

## Acceptance criteria

- The page never calls fetch directly and never uses localStorage as its audit store.
- The request uses the `limit` query parameter and the response is normalized in the API module.
- Invalid or missing details do not break the list.
- Timestamps are readable and consistently formatted with the rest of the application.
- The route is protected by the existing auth behavior if the app already has protected routes.
- Add tests for the response shape, details rendering and API error state.
- `npm run lint`, `npm test` and `npm run build` pass.
