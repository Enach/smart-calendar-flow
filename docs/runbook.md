# Runbook — Paceday (web)

## Local dev

```bash
cp .env.example .env
docker compose up --wait
```

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
