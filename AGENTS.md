# Lovable frontend instructions

This repository is the Paceday web frontend connected to Lovable. Follow these instructions for every change.

## Scope

- Modify the frontend only.
- Do not edit the backend repository, database migrations, deployment configuration, CI workflows or dependencies unless the user explicitly requests it.
- The backend HTTP contract is the OpenAPI bundle in the backend repository (`Enach/clockwise-like`, `contracts/openapi/openapi.yaml`). It is frozen here. Do not invent endpoints, fields or request body names. If a change needs something the contract does not already have, stop and say so: the contract changes in the backend repository first, then the types are regenerated here.
- Files in `src/api/generated/` are generated from that contract and are read-only. Never edit them and never hand-write a type or zod schema that duplicates one. `make openapi` regenerates them; `src/api/generated/README.md` explains the rest.
- Do not add direct fetch or axios calls inside React components. Use the existing API client, adapters and React Query hooks.
- Do not use localStorage as the primary source of truth.
- Never show invented data after a failure (PAC-83). A timeout, a network error, a non-JSON answer or a gateway error is shown as an error where the action happened ("Can't reach Paceday", with a manual retry for reads; "may or may not have been applied" for writes), never as mock or preview data and never as a fake success. The only made-up data is the explicit demo: non-production builds only, entered from the one "Explore a demo — made-up data" control on the sign-in screen, code under `src/demo/`, reached only through `src/api/demoGate.ts`.

## Lovable prompt workflow

Before changing code, read docs/lovable-prompts/00-global-context.md and then read the one feature prompt relevant to the task. Execute one numbered feature prompt at a time, in order, unless the user explicitly chooses another prompt.

Available prompts are indexed in docs/lovable-prompts/README.md.

When the user asks for a feature, first state the files and API contracts you will inspect. After editing, report the behavior changed, exact files changed, endpoints and request shapes used, commands run, and unresolved issues.

## Verification

Run this from the repository root after frontend changes:

- make verify

It runs lint, typecheck, design-check, openapi-check, test, demo-check and coverage in that order and stops at the first failure. `demo-check` (PAC-83) builds the web in production and development mode and fails if the production build contains any demo marker, or the development build lacks one. `openapi-check` fails when `src/api/generated/` no longer matches the backend contract: regenerate with `make openapi`, never by editing the files. The backend repository exposes the same `make verify`.

`design-check` runs the Impeccable design detector (deterministic rules for generic AI-generated UI: overused fonts, purple gradients, nested cards, gray text on colour, cramped padding, small touch targets, skipped headings and more) over `src/`. Findings that predate the gate are recorded in `.impeccable/baseline.json`; the gate fails only on new ones. When it fails:

- Fix the design. That is the expected outcome.
- Do not edit `.impeccable/baseline.json` by hand and do not run `make design-baseline` to make a failure go away. A new baseline entry must carry an `"issue": "PAC-NN"` field naming the issue that will remove it, and the gate checks this.
- Do not add an `impeccable-disable` comment without a PAC issue on the same line. The gate checks this too.

While iterating, the individual commands still work:

- npm run lint
- npm run typecheck
- npm test
- npm run build

Do not claim a check passed if it could not run. Keep changes small enough to review and commit after each validated feature.
