# Lovable prompt 01 — Real API first

Harden the frontend API boundary so the product has a reliable online and offline feedback loop. Work only in the frontend repository.

## Inspect first

Read `frontend/src/api/client.ts`, `frontend/src/api/contract.ts`, `frontend/src/api/types.ts`, the health/auth hooks, the app shell and the current mock/fallback implementation. Identify every place where a component calls fetch directly or silently replaces an API error with demo data.

## Implement

- Keep one network boundary through the existing API client and adapters.
- Ensure `GET /api/health` and `GET /api/auth/status` drive the connected/disconnected state.
- When the backend is reachable, render server data and surface non-success responses as actionable UI errors.
- When the backend is unavailable, preserve the existing local fallback only where it already exists and label the state clearly as preview/offline.
- Keep loading, retry, empty and error states distinct.
- Do not clear valid cached data merely because a refetch failed.
- Make mutations invalidate the relevant React Query keys after success.
- Add or update focused API contract tests rather than broad snapshot tests.

## Acceptance criteria

- No new component contains direct fetch or axios usage.
- An API 401/403/409/410/422/500 response is not presented as successful demo data.
- A network failure shows a retry action and an explicit offline or preview indicator.
- Health/auth state does not cause an infinite request loop.
- Existing mock mode still lets Lovable preview the application.
- `npm run lint`, `npm test`, `npm run build` and the TypeScript check pass.
- Lovable reports every direct-network call it found and how it was migrated or intentionally left unchanged.
