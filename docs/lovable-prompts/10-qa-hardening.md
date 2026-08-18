# Lovable prompt 10 — QA hardening after Prompt 09

You are modifying only the Paceday frontend repository. Read AGENTS.md and docs/lovable-prompts/00-global-context.md first.

The last contract-accurate QA pass passed lint, tests, TypeScript, and build, but found four frontend defects. Fix only these defects in this task. Do not start a new feature.

## 1. Preserve authentication during a transient API outage

Inspect src/contexts/AuthContext.tsx and the existing typed API error helpers.

When /api/auth/me fails because the backend is unreachable, do not clear the last known user and do not redirect to the landing page. Keep the current session state as stale or temporarily unavailable, and expose a retry path if the current architecture supports it.

Only clear the authenticated user for an explicit authentication response such as HTTP 401 or 403. Preserve the existing behavior for a successful response.

Do not treat every caught error as an authentication failure. Do not log tokens or credentials.

Add a focused test for: known user plus network failure keeps the user; known user plus 401 clears the user.

## 2. Normalize event attendees safely

Inspect src/api/client.ts, the getEvents adapter, src/api/types.ts, and src/lib/eventOwnership.ts.

GET /api/events may return attendees as string values or attendee objects. The adapter must never call string methods on an object.

Normalize the attendee collection to the string representation expected by the existing ownership logic, preferring an attendee email when present and using a safe display fallback only when appropriate. Preserve attendee_details or the richer server field for views that use it. Do not fabricate addresses.

Add tests for string attendees, object attendees, missing attendees, and mixed arrays. A malformed attendee must not crash the dashboard.

## 3. Accept both team list response shapes

Inspect src/api/teams.ts and every consumer of teamsApi.remote.list and teamsApi.remote.create.

GET /api/teams/ and the create response must accept both a bare array and an envelope with a teams property. Normalize both into the existing Team type. Keep the existing query keys and explicit mock fallback semantics.

HTTP errors must remain errors. Only an unreachable backend may use the existing preview fallback.

Add adapter tests for both payload shapes and for a real HTTP error not becoming demo data.

## 4. Make RequireAuth use the server profile

Inspect src/components/RequireAuth.tsx, the existing manager profile API and hooks, and the authenticated route flow.

The onboarding gate must not rely only on local storage. Once the authenticated session is known, use the server manager profile as the source of truth. A user with a completed server profile must go directly to the app, even if the local onboarding marker is missing.

Handle loading without a redirect loop. Handle a real profile API error with the existing error semantics and retry path. Do not hide HTTP errors behind mock onboarding data.

Add tests for profile complete, profile incomplete, profile loading, and profile request failure.

## Boundaries

Frontend files only. No backend, migration, CI, deployment or dependency changes.
Use the existing API client, adapters, React Query and error helpers. No direct fetch or axios in components. Do not use localStorage as the primary source of truth.
Preserve cached data while a refetch fails where the existing UI already supports cached data.

## Verification

Run npm run lint
Run npm test
Run ./node_modules/.bin/tsc --noEmit -p tsconfig.app.json
Run npm run build

Report exact files changed, tests added, routes inspected, and any remaining limitation. Do not claim the final booking POST was verified unless the stub or real backend successfully exercises it.
