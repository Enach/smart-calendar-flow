# ADR 0001: Tech stack and deployment shape

- Status: proposed
- Date: <YYYY-MM-DD>
- Project: Paceday

## Context

Bootstrapping Paceday from existing code. Need to lock the deployment shape and primary language/runtime so subsequent ADRs can build on it.

## Decision

- Deployment target: **Docker Compose** (single-host, multi-service).
- CI: **GitHub Actions on self-hosted runners**, maximally parallel.
- Coverage gate: **≥ 70%**.
- SAST: **CodeQL**; DAST: **OWASP ZAP baseline**.
- Git protocol: **SSH** (`git@github.com:Enach/smart-calendar-flow.git`).

## Consequences

- Positive: one-command bring-up; no cloud lock-in; reproducible.
- Negative: scale-out requires future ADR (e.g., compose → k8s).
- Neutral: self-hosted runner availability is a hard dependency.

## Alternatives considered

- Kubernetes from day one — rejected as premature for current scale.
- GitHub-hosted runners — rejected per project requirement (self-hosted).
