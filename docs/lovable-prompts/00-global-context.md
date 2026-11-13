# Lovable prompt 00 — Global context

You are modifying only the Paceday frontend in the existing repository. The frontend is a Vite React TypeScript application. The backend is a separate Go repository and its HTTP contracts are frozen for this work.

## Hard boundaries

- Edit frontend code only.
- Do not edit the backend, database migrations, CI workflows, deployment files, or package dependencies unless a later prompt explicitly asks for it.
- Do not create a new API endpoint or invent a response field.
- Do not add direct fetch calls inside React components.
- Do not make localStorage the primary source of truth.
- Do not replace real API behavior with mock data when the API is reachable.
- Sign-in is provider-only (PAC-98): Google, Microsoft and company SSO, started by the server's `/api/auth/*` provider routes. The server has no password sign-in: no password or registration route (`/api/auth/login` and `/api/auth/register` do not exist) and no stored password. Never add a password field, a "Create account" password form or a call to such a route on the sign-in surfaces without an owner decision (PAC-98); `make verify` (signin-guard) fails if one comes back.
- Never show invented data after a failure (PAC-83). A timeout, a network error, a non-JSON answer or a gateway error is shown as an error where the action happened ("Can't reach Paceday", with a manual retry for reads; "may or may not have been applied" for writes), never as mock or preview data and never as a fake success. The only made-up data is the explicit demo: non-production builds only, entered from the one "Explore a demo — made-up data" control on the sign-in screen, code under `src/demo/`, reached only through `src/api/demoGate.ts`.

## Existing frontend boundary

Inspect these files before editing:

- frontend/src/api/client.ts
- frontend/src/api/types.ts
- frontend/src/api/contract.ts
- frontend/src/api/manager.ts
- frontend/src/api/teams.ts
- frontend/src/api/schedulingLinks.ts
- frontend/src/hooks/
- frontend/src/pages/
- frontend/src/components/

Use the existing api client, adapters and React Query hooks. All requests go through the API base path `/api` and include cookies. Preserve strict JSON and HTTP 204 handling already implemented by the client.

## Current verification commands

From the frontend repository root, run `npm run lint`, `npm test` and `npm run build`. Also run `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json` when TypeScript changes are made. Use the existing Vitest tests and add focused tests for new adapter or state behavior.

## Frozen API contracts

- Health: GET `/api/health`; auth status: GET `/api/auth/status`; disconnect: DELETE `/api/auth/disconnect`.
- Personal calendars: GET/POST `/api/personal-calendars`, PATCH/DELETE `/api/personal-calendars/:id`, POST `/api/personal-calendars/:id/sync`, GET `/api/personal-calendars/:id/preview`.
- Scheduling links: GET `/api/scheduling-links/`, GET/PATCH/DELETE `/api/scheduling-links/:id`, POST `/api/scheduling-links/`, POST `/api/scheduling-links/:id/hosts`, GET `/api/scheduling-links/host-invites`, POST `/api/scheduling-links/host-invites/:id/accept`, POST `/api/scheduling-links/host-invites/:id/decline`, POST `/api/scheduling-links/:id/leave`, GET `/api/scheduling-links/:id/bookings`.
- Public booking: GET `/api/book/:slug`, GET `/api/book/:slug/slots`, POST `/api/book/:slug`.
- Conferencing: GET `/api/conference/providers`, POST `/api/conference/zoom/disconnect`, OAuth at `/api/auth/zoom`, POST/DELETE `/api/events/:id/conference`.
- Audit: GET `/api/audit?limit=...`.
- Manager: GET/POST `/api/manager/profile`, GET `/api/manager/team`, POST `/api/manager/detect`, POST/PATCH/DELETE `/api/manager/team/members` and `/api/manager/team/members/:email`, GET `/api/manager/gaps`, POST `/api/manager/team/members/:email/schedule`, GET `/api/manager/analytics`.
- Formal teams: POST/GET `/api/teams/`, GET/PATCH/DELETE `/api/teams/:id`, POST `/api/teams/:id/members/invite`, DELETE `/api/teams/:id/members/:userId`, CRUD `/api/teams/:id/no-meeting-zones`, GET `/api/teams/:id/availability`, GET `/api/teams/:id/analytics`.

## Required response format

Before making changes, state the implementation plan and list the files you will inspect. After making changes, report:

1. Summary of behavior changed.
2. Exact files changed.
3. Exact endpoints and request shapes used.
4. Tests and commands run with their result.
5. Any remaining uncertainty or backend limitation.

Do not claim a feature is complete unless the acceptance criteria in the feature prompt are demonstrably satisfied.
