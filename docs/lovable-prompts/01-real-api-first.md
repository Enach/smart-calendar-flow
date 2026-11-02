# Lovable prompt 01 — Real API first

Harden the frontend API boundary so the product has a reliable online and offline feedback loop. Work only in the frontend repository.

## Inspect first

Read `frontend/src/api/client.ts`, `frontend/src/api/contract.ts`, `frontend/src/api/types.ts`, the health/auth hooks, the app shell and the explicit demo (`src/demo/`, `src/api/demoGate.ts`). Identify every place where a component calls fetch directly or silently replaces an API error with demo data.

## Implement

- Keep one network boundary through the existing API client and adapters.
- Ensure `GET /api/health` and `GET /api/auth/status` drive the connected/disconnected state.
- When the backend is reachable, render server data and surface non-success responses as actionable UI errors.
- When the backend is unavailable, show "Can't reach Paceday" with a retry; never switch to demo or preview data (PAC-83).
- Keep loading, retry, empty and error states distinct.
- Do not clear valid cached data merely because a refetch failed.
- Make mutations invalidate the relevant React Query keys after success.
- Add or update focused API contract tests rather than broad snapshot tests.

## Acceptance criteria

- No new component contains direct fetch or axios usage.
- An API 401/403/409/410/422/500 response is not presented as successful demo data.
- A network failure shows a retry action and an explicit offline or preview indicator.
- Health/auth state does not cause an infinite request loop.
- The Lovable preview can still be explored through the explicit demo entry on the sign-in screen (non-production builds only).
- `npm run lint`, `npm test`, `npm run build` and the TypeScript check pass.
- Lovable reports every direct-network call it found and how it was migrated or intentionally left unchanged.
