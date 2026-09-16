# `src/api/generated` — generated, committed, read-only

Everything in this directory is produced from the backend's OpenAPI bundle,
which lives in the **api** repo (`Enach/clockwise-like`) at
`contracts/openapi/openapi.yaml`. This repo consumes the contract; it never
defines it (`docs/factory/README.md` §1).

| file | generator | what it is |
|---|---|---|
| `types.ts` | `openapi-typescript` | request/response/schema TypeScript types, zero runtime cost |
| `schemas.ts` | `typed-openapi --runtime zod` | standalone zod schemas for validating responses at runtime |

## Regenerate

```sh
make openapi          # needs ../clockwise-like checked out
make openapi CONTRACT=/path/to/openapi.yaml
make openapi-check    # gate: fails if these files drift from the contract
```

`make verify` runs `openapi-check`, so a stale file fails the build rather than
rotting quietly.

## Rules

- **Do not edit these files.** If a generated type is wrong, the contract is
  wrong: fix it in the api repo, merge that, regenerate here
  (`docs/factory/README.md` §3, rule 3).
- **Do not add a field or an endpoint that the contract does not have.** The
  ordering is fixed: backend contract merges → types regenerate → frontend
  implements. A frontend change that needs a field the merged contract lacks is
  blocked, not patched.
- The generated code is excluded from eslint (a lint autofix here would be an
  edit to generated code) but **is** typechecked, which is the point of
  generating it: `make typecheck` fails if a hand-written call site disagrees
  with the contract.

## Why these two generators

`openapi-typescript` is the obvious choice for types: it reads OpenAPI 3.1
directly and emits types with no runtime dependency.

For zod, the constraint is this repo's existing shape. `src/api/client.ts` is a
1,400-line hand-written client behind the `ApiPort` interface in
`src/api/contract.ts`, with mock fallbacks, and `src/contracts/managerTeam.ts`
already validates wire shapes with plain zod objects. So the generator has to
produce **schemas that sit next to that client**, not a client of its own:

- `openapi-zod-client` (named in the factory doc's table) generates a
  [zodios](https://github.com/ecyrbe/zodios) client. Adopting it would add a
  runtime HTTP client that competes with `client.ts` for the same job, and
  `ApiPort` would no longer be the single seam the tests mock.
- `ts-to-zod` derives zod from TypeScript, so it would run on `types.ts` and
  lose every format the contract carries — `format: uuid`, `format: email`,
  `format: date-time` are all just `string` by then. The existing hand-written
  contract uses exactly those refinements, so that is a real loss.
- `typed-openapi --runtime zod` emits a plain module of exported schema
  constants derived from the OpenAPI document, keeping formats and required-ness,
  with no client runtime to install. Validation stays opt-in per call site,
  exactly as `managerTeam.ts` does it today.

Migrating `src/contracts/managerTeam.ts` onto the generated schemas is a
separate, spec'd change — hand-written contracts and generated ones coexist
until then, the same way handwritten and generated handlers coexist in the
backend (`contracts/openapi/MIGRATION.md`).
