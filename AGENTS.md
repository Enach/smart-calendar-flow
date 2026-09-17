# Lovable frontend instructions

This repository is the Paceday web frontend connected to Lovable. Follow these instructions for every change.

## Scope

- Modify the frontend only.
- Do not edit the backend repository, database migrations, deployment configuration, CI workflows or dependencies unless the user explicitly requests it.
- The backend HTTP contract is the OpenAPI bundle in the backend repository (`Enach/clockwise-like`, `contracts/openapi/openapi.yaml`). It is frozen here. Do not invent endpoints, fields or request body names. If a change needs something the contract does not already have, stop and say so: the contract changes in the backend repository first, then the types are regenerated here.
- Files in `src/api/generated/` are generated from that contract and are read-only. Never edit them and never hand-write a type or zod schema that duplicates one. `make openapi` regenerates them; `src/api/generated/README.md` explains the rest.
- Do not add direct fetch or axios calls inside React components. Use the existing API client, adapters and React Query hooks.
- Do not use localStorage as the primary source of truth.
- Preserve explicit mock/preview fallback behavior, but never replace a real API error with fake success data when the backend is reachable.

## Lovable prompt workflow

Before changing code, read docs/lovable-prompts/00-global-context.md and then read the one feature prompt relevant to the task. Execute one numbered feature prompt at a time, in order, unless the user explicitly chooses another prompt.

Available prompts are indexed in docs/lovable-prompts/README.md.

When the user asks for a feature, first state the files and API contracts you will inspect. After editing, report the behavior changed, exact files changed, endpoints and request shapes used, commands run, and unresolved issues.

## Verification

Run this from the repository root after frontend changes:

- make verify

It runs lint, typecheck, openapi-check, test and coverage in that order and stops at the first failure. `openapi-check` fails when `src/api/generated/` no longer matches the backend contract: regenerate with `make openapi`, never by editing the files. The backend repository exposes the same `make verify`.

While iterating, the individual commands still work:

- npm run lint
- npm run typecheck
- npm test
- npm run build

Do not claim a check passed if it could not run. Keep changes small enough to review and commit after each validated feature.
