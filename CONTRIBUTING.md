# Contributing

Thanks for contributing to TimeTrack.

## Prerequisites

- Docker + Docker Compose
- Node 20+ (if running frontend directly)
- Python 3.11 (if running backend directly)

## Setup

```bash
docker compose -f docker-compose.local.yml up --build
```

Backend checks:
```bash
docker compose -f docker-compose.local.yml exec backend python manage.py check
docker compose -f docker-compose.local.yml exec backend python manage.py test
```

## Branch and PR Workflow

1. Create a feature branch from `main`.
2. Keep PRs focused (single theme).
3. Include:
   - what changed
   - why it changed
   - how to verify
4. If API behavior changed, update API Truth in `README.md`.

## Codebase Rules

- Business logic belongs in `backend/src/`.
- Config/static/assets belong in `backend/resources/`.
- API modules belong in `backend/src/apps/core/api/<module>/`.
- Core model/migrations remain in `backend/src/core/` (app label `core`).

## API Change Checklist

- Update module URL/view files under `backend/src/apps/core/api/`.
- Keep naming consistent and avoid unnecessary aliases.
- Mark deprecated routes explicitly in API Truth in `README.md`.
- Classify new routes as `internal`, `customer`, or `shared`.

## Migration Rules

- Generate migrations only for real schema changes.
- Run before PR:
```bash
docker compose -f docker-compose.local.yml exec backend python manage.py makemigrations --check --dry-run
docker compose -f docker-compose.local.yml exec backend python manage.py showmigrations core
```
- Never rename app label `core` without an approved migration strategy.
- Core is dissolved at runtime (module APIs under `src/apps/core/api/*`) but DB ownership stays on app label `core`.
- Keep squashed migration as canonical baseline:
  - `backend/src/core/migrations/0001_squashed_0029_client_logo.py`
- If adding schema changes, generate forward migrations from this baseline only.

## Production Readiness Gates (Required Before Release)

- Health:
  - `/health/` must return 200.
- Security/config:
  - `DJANGO_SECRET_KEY` non-default in prod
  - `DEBUG=0` in prod
  - strict `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS`
- Data:
  - `DATABASE_URL` points to managed Postgres
  - migration runbook validated in staging
- CI:
  - backend checks + tests pass
  - frontend build passes

## Deploy Notes

- Docker image from `backend/Dockerfile`.
- Entrypoint: `backend/entrypoint.sh`.
- Gunicorn serves Django app; static/media paths are under `backend/resources/`.
- Rollback rule: if health fails post-deploy, revert to previous image and migration-safe state.

## Docs as Source of Truth

- `README.md` — architecture, API truth, runtime contracts
- `CONTRIBUTING.md` — contribution workflow, migration and release policy

## Commit Guidance

- Use clear, imperative messages:
  - `feat(api): add team summary filter by billable`
  - `refactor(core): split project routes into module urls`
  - `docs(api): classify customer vs internal routes`
