# Runbook — Paceday (web)

## Local dev

```bash
cp .env.example .env
docker compose up --wait
```

## Error monitoring (Sentry, build-time)

Web error monitoring is **off unless the image is built with a DSN** (PAC-86):
there is no built-in default.

| Variable | Where | Effect |
|---|---|---|
| `VITE_SENTRY_DSN` | frontend **build** (Vite inlines it) | Empty/unset: monitoring off, `Sentry.init` never runs. Set: errors go to that Sentry project, `environment` = the Vite mode. |
| `NGINX_CSP_SENTRY_ORIGIN` | api repo, nginx runtime | Must be the origin (`scheme://host`) of that DSN so the CSP `connect-src` allows it. Empty by default: no Sentry origin is allowed. |

Set both together, or neither. Changing the DSN needs a rebuild of the web
image; changing the origin needs an nginx restart.

## Logs

```bash
docker compose logs -f api
```

## Reset state

```bash
docker compose down -v
```

## Common failures

| Symptom | Likely cause | Action |
|---|---|---|
| `db` unhealthy at startup | port collision | `lsof -i :5432`, change host port |
| API crash loop | bad env | `docker compose logs api`; check `.env` |
| OOM in CI | runner memory | infra-engineer: bump runner spec |

## Releases

Auto-merge to `main` produces an image tagged `:${{ github.sha }}`. Promote by updating compose `image:` reference.
