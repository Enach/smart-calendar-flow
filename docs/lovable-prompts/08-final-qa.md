# Lovable prompt 08 — Final QA and handoff report

Perform a final frontend-only verification pass. Do not add speculative features and do not modify the backend, CI, migrations or dependencies.

## Static checks

Run from the frontend repository root:

- `npm run lint`
- `npm test`
- `npm run build`
- `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json`

Run the existing Vitest suite and report the exact result. Inspect the final diff for direct fetch calls in components, accidental localStorage writes, mock calls in real API paths, and API body names that do not match the frozen contracts.

## Manual contract matrix

Verify or add focused tests for:

- health and auth status loading, disconnected state and retry;
- personal calendar GET, POST, PATCH, sync, preview and 204 delete;
- scheduling-link body mapping, ownership controls, host invite accept/decline/leave and 204 handling;
- public booking metadata, date-less availability, date/duration slot query, booking confirmation, 404/409/410/422 handling;
- conferencing provider status, real Zoom OAuth redirect, disconnect and event conference add/remove;
- audit list, limit parameter, safe details and refresh failure;
- manager/team mutations, date/duration availability, no-meeting-zone validation and analytics refresh.

## Online and preview behavior

Check both explicit mock/preview mode and a reachable backend. In online mode, server responses must be rendered and API errors must remain visible. In preview mode, existing fallback data may be used but must be clearly labeled. No flow may claim a remote mutation succeeded when it only changed local state.

## Required final report

Return:

1. Commands run and pass/fail result.
2. Files changed during this QA pass.
3. API contracts verified.
4. Remaining failures grouped as frontend, backend contract or environment.
5. A short manual test checklist for a human reviewer.

If a check cannot run, state the exact blocker and do not mark it passed.
