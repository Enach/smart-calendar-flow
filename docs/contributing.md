# Contributing — Paceday

## Branching

- `main` is protected; merges via squash only.
- Feature branches: `feat/<task-id>-<slug>`.
- Fix: `fix/<task-id>-<slug>`. Chore: `chore/<task-id>-<slug>`.
- A change paired with the api repo (`Enach/clockwise-like`) uses the exact same
  branch name in both repos: CI checks this repo against the api branch of the
  same name, else against api `main`, never a sibling that only shares the
  `pac-N` (`scripts/ci/pair-branch.sh`; the rule is in the api repo's
  `docs/factory/README.md`, "Paired branches"). In the api repo, "Re-run failed
  jobs" reuses the old pairing: after this half changes, use "Re-run all jobs"
  there. Here the pairing is a step of `verify`, so any re-run recomputes it.

## PR requirements

- Title: `[<task-id>] <imperative summary>`.
- Body: links the Anytype Task, summary, test plan, screenshots if UI.
- Coauthor: `Co-Authored-By: Craft Agent <agents-noreply@craft.do>` when an agent wrote the code.
- A `prompts/<task-id>.md` file capturing the originating prompt is mandatory for code changes.

## Required checks (set via `gh api`)

`lint`, `typecheck`, `unit`, `coverage` (≥ 70%), `build`, `integration`, `sast`, `dast`.

## Auto-merge

PRs auto-merge once required checks pass and ≥ 1 review approves. Dependabot patch/minor auto-merge on green; majors open a triage issue.

## Local setup

See [runbook](./runbook.md).
