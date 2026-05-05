# TimeTrack

Time tracking and operations platform with:
- Django + DRF backend
- React (Vite) frontend
- JWT auth + role-based access

## Source Of Truth Docs

Read these first:
- `README.md` — architecture + runtime + API usage truth
- `CONTRIBUTING.md` — development workflow + quality gates + migration policy

## Current Architecture

- `backend/src/` — business logic
  - `backend/src/core/` — core Django app (models, migrations, serializers, permissions, management commands)
  - `backend/src/apps/core/api/` — module-based API slices (`auth`, `projects`, `tasks`, etc.)
  - `backend/src/common/` — shared utilities
- `backend/resources/` — platform/runtime resources
  - `backend/resources/config/` — Django wiring (`settings`, `urls`, `asgi`, `wsgi`)
  - `backend/resources/static*`, `backend/resources/media/`, `backend/resources/postman/`

## Tech Stack

- Backend: Django 4.2, DRF, SimpleJWT, django-filter
- DB: PostgreSQL
- Frontend: React + Vite + Tailwind + Axios
- Runtime: Docker Compose (local), Gunicorn

## Local Run

1) Start services:
```bash
docker compose -f docker-compose.local.yml up --build
```

2) Open:
- Frontend: `http://localhost:5173`
- API docs: `http://localhost:8000/api/docs/`

3) Optional superuser:
```bash
docker compose -f docker-compose.local.yml exec backend python manage.py createsuperuser
```

## Health Endpoints

- `GET /health/` — readiness + DB check (production-standard endpoint)
- `GET /readyz/` — legacy alias
- `GET /healthz/` — legacy alias

## API Truth (Current)

Base URL: `${VITE_API_URL}/api`

Consumer classes:
- `customer` (client pages): `/client/dashboard/summary/`, `/requests/*`, `/projects/` (list), `/invoices/` (list)
- `internal` (admin/manager/employee): users/org/projects/tasks/time/clock/reports/dashboard/clients/internal request-estimation flows
- `shared`: `/auth/me/`, `/auth/logout/`, `/projects/`, `/requests/`, `/requests/{id}/download_all/`, `/invoices/`

Core route groups:
- Auth: `/auth/*`
- Users: `/users/*`, `/users/light/`
- Projects: `/projects/*`, `/projects/combined/`, `/assignments/*`
- Tasks: `/tasks/*`, `/task-assignments/*`, `/tasks/my_notifications/`
- Time: `/time-entries/*`, `/time-entry/*`
- Clock: `/clock-sessions/*`
- Reports: `/reports/summary/`, `/reports/team-summary/`
- Dashboard: `/dashboard/init/`, `/dashboard/summary/`, `/dashboard/summary/aggregated/`
- Org: `/org-tree/`, `/org-hierarchy/`, `/team-management/`
- Clients: `/clients/*`, `/client/dashboard/summary/`
- Requests: `/requests/*` (+ `estimate`, `approve`, `download_all`)
- Invoices: `/invoices/*`
- App Init: `/app-initial-data/`

Deprecated/legacy aliases:
- `/readyz/`, `/healthz/` (prefer `/health/`)
- `/time-entries/start|stop|current` (prefer `/time-entry/start|stop|current`)

Non-consumed/no-op from current frontend:
- `/task-assignments/*`
- `/time-entries/summary/`
- `/time-entries/tag-summary/`
- `/org-hierarchy/`
- `/team-management/`
- `/invoices/{id}` patch/delete flows

## Migrations

Core app is squashed and active:
- `backend/src/core/migrations/0001_squashed_0029_client_logo.py`

Useful commands:
```bash
docker compose -f docker-compose.local.yml exec backend python manage.py showmigrations core
docker compose -f docker-compose.local.yml exec backend python manage.py makemigrations --check --dry-run
docker compose -f docker-compose.local.yml exec backend python manage.py migrate
```

## Development Rules

- Keep API routing module-first under `backend/src/apps/core/api/*`.
- Keep data model/migration ownership in `backend/src/core/`.
- For API changes, update the API Truth section in `README.md`.
- Do not introduce duplicate/legacy aliases unless required for backward compatibility.

## Contributing

See `CONTRIBUTING.md`.
