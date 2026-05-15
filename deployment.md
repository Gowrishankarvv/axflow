# axflow — Deployment Guide

Everything you need to deploy, update, monitor, and roll back the production
axflow site at **https://axflow.axinortech.com**.

> **Audience:** the team operating the Hostinger VPS. Treat this as a runbook,
> not a one-time setup doc.

---

## 1. The setup at a glance

```
                          Internet
                              │
                              ▼
              ┌──────────────────────────────┐
              │  Hostinger VPS (31.97.205.45) │
              │   Ubuntu 24.04 LTS            │
              └──────────────┬───────────────┘
                             │
              ┌──────────────▼─────────────────┐
              │  nginx-proxy-manager (NPM)     │  ← TLS terminator, host 80/443
              │  (jc21/nginx-proxy-manager)    │     admin UI on host :81
              └──────────────┬─────────────────┘
                             │ docker network: newtravel-backend_default
                             ▼
       ┌──────────────────────────────────────────────────┐
       │  axflow-frontend  (in-container nginx)           │
       │  • serves React production build                 │
       │  • proxies /api/* and /admin/ and /health/ to    │
       │    axflow-backend on the internal network        │
       └──────────────────────┬───────────────────────────┘
                              │ docker network: axflow_internal
                              ▼
       ┌──────────────────────────────────────────────────┐
       │  axflow-backend  (Django 4.2 + gunicorn :8000)   │
       │  • runs migrations on startup via entrypoint.sh  │
       │  • settings module: timetrack.settings           │
       └──────────────────────┬───────────────────────────┘
                              │
                              ▼
       ┌──────────────────────────────────────────────────┐
       │  axflow-db  (postgres:15-alpine)                 │
       │  • named volume: axflow_pgdata (persistent)      │
       └──────────────────────────────────────────────────┘
```

| Piece                | Value                                                  |
| -------------------- | ------------------------------------------------------ |
| Public URL           | https://axflow.axinortech.com                          |
| Server IP            | `31.97.205.45`                                         |
| Server OS            | Ubuntu 24.04 LTS                                       |
| SSH                  | `ssh root@31.97.205.45` (key auth)                     |
| Repo path on server  | `/root/axflow`                                         |
| Git remote on server | `https://github.com/Gowrishankarvv/axflow.git`         |
| Deployed branch      | `main`                                                 |
| Compose file         | `docker-compose.prod.yml`                              |
| Env file             | `/root/axflow/.env` (mode 600 — never commit, never cat to logs) |
| DB backups dir       | `/root/axflow-backups/`                                |
| Reverse proxy        | `nginx-proxy-manager` container, admin UI on host port `81` |
| Other apps on server | `newtravel-backend` (shared `newtravel-backend_default` docker network) |

---

## 2. One-time setup (already done, here for reference)

You should not need to run these again. Documented so the setup is reproducible.

```bash
# Install docker + compose plugin (Ubuntu)
curl -fsSL https://get.docker.com | sh

# Clone the repo
cd /root
git clone https://github.com/Gowrishankarvv/axflow.git
cd axflow

# Create production .env from the example, fill in real values
cp .env.prod.example .env
chmod 600 .env
# edit .env with: DJANGO_SECRET_KEY, POSTGRES_DB/USER/PASSWORD,
# ALLOWED_HOSTS, CORS_ALLOWED_ORIGINS, CSRF_TRUSTED_ORIGINS,
# ALLOWED_EMAIL_DOMAINS, optional Slack tokens

# Bring it up
docker compose -f docker-compose.prod.yml up -d --build
```

The `axflow-frontend` container joins the existing `newtravel-backend_default`
docker network (declared as `npm_network` in the compose file). That is how
nginx-proxy-manager reaches it.

In NPM's web UI (port 81), the proxy host is configured as:

- Domain: `axflow.axinortech.com`
- Scheme: `http`
- Forward hostname: `axflow-frontend`
- Forward port: `80`
- SSL: Let's Encrypt
- Force SSL: on
- HTTP/2: on
- Forward `X-Forwarded-Proto` header: on (Django uses this to know the request was HTTPS)

---

## 3. The standard update workflow

This is the **everyday recipe**. Use it whenever you want the latest `main`
deployed.

```bash
ssh root@31.97.205.45
cd /root/axflow

# (a) Snapshot the DB before anything touches schema
TS=$(date -u +%Y%m%dT%H%M%SZ)
docker exec axflow-db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --clean --if-exists --no-owner --no-privileges' \
  | gzip -9 > /root/axflow-backups/axflow-db-pre-deploy-${TS}.sql.gz
ls -lh /root/axflow-backups/axflow-db-pre-deploy-${TS}.sql.gz   # sanity check

# (b) Note where you are so rollback is easy
git rev-parse HEAD > /root/axflow-backups/last-deployed-sha-${TS}.txt

# (c) Pull and rebuild
git pull --ff-only
docker compose -f docker-compose.prod.yml up -d --build

# (d) Watch the boot — Ctrl+C once you see "Booting worker" with no errors
docker compose -f docker-compose.prod.yml logs -f backend
```

### What "success" looks like in the logs

```
Running migrations...
  Applying core.0014_ticket... OK            ← any migrations apply cleanly
[INFO] Starting gunicorn 22.0.0
[INFO] Listening at: http://0.0.0.0:8000
[INFO] Booting worker with pid: 16
GET /health/ HTTP/1.1" 200                   ← healthcheck is passing
```

If you see `Traceback` or `django.db.utils.ProgrammingError` during the
migration step — **stop and roll back** (section 5).

### Then smoke-test from outside

```bash
curl -sS -o /dev/null -w "%{http_code}  %{time_total}s\n" https://axflow.axinortech.com/
curl -sS https://axflow.axinortech.com/health/
```

Expect `200  ~0.5s` and `{"status": "ok", "checks": {"database": "ok"}}`.

> **Heads up — the first 1–2 requests right after a rebuild may take ~20s.**
> nginx-proxy-manager keeps a connection pool to the previous frontend
> container; when that container is replaced, NPM needs a moment to learn the
> new IP. This is **normal** and self-heals in under a minute. If it persists,
> see Troubleshooting.

---

## 4. Common operations

```bash
# See what's running
docker ps --filter "name=axflow"

# Tail logs (Ctrl+C to exit; doesn't stop the container)
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend

# Restart just the backend (e.g. after editing .env)
docker compose -f docker-compose.prod.yml up -d --force-recreate backend

# Open a Django shell on prod (read-only inspection only, please)
docker exec -it axflow-backend python manage.py shell

# Open a psql shell on the DB
docker exec -it axflow-db psql -U axflow -d axflow

# Run a one-off management command
docker exec -it axflow-backend python manage.py createsuperuser

# Collect static files (rarely needed — entrypoint handles it)
docker exec -it axflow-backend python manage.py collectstatic --noinput

# Disk usage check (DB and images grow over time)
df -h /
docker system df
```

---

## 5. Rollback procedure

Use this if a deploy goes bad: bad migration, broken API, frontend won't load.

```bash
ssh root@31.97.205.45
cd /root/axflow

# (a) Find the previous good commit
cat /root/axflow-backups/last-deployed-sha-*.txt | tail -5

# (b) Check out that commit and rebuild
git checkout <previous-sha>
docker compose -f docker-compose.prod.yml up -d --build

# (c) If migrations also need to be reverted, restore the DB dump from
#     IMMEDIATELY BEFORE the bad deploy:
ls -lt /root/axflow-backups/*.sql.gz | head -3
zcat /root/axflow-backups/axflow-db-pre-deploy-<TS>.sql.gz \
  | docker exec -i axflow-db psql -U axflow -d axflow
```

After restoring:

```bash
docker compose -f docker-compose.prod.yml restart backend
curl -sS https://axflow.axinortech.com/health/
```

> Note: restoring the DB will **wipe data created since the backup**. Only do
> it if the schema is incompatible with the previous code — otherwise just
> reverting the code is enough.

---

## 6. Backups — what we have and what we don't

| What                       | Where                                  | Frequency              |
| -------------------------- | -------------------------------------- | ---------------------- |
| Pre-deploy DB snapshots    | `/root/axflow-backups/*.sql.gz`        | Every deploy (manual)  |
| Postgres data volume       | docker volume `axflow_pgdata`          | Persists across restarts |
| Media files                | docker volume `axflow_media`           | Persists across restarts |
| Static files               | docker volume `axflow_static`          | Persists across restarts |
| **Off-server backups**     | ⚠️ **NONE** yet                        | TODO                   |
| **Scheduled backups**      | ⚠️ **NONE** yet                        | TODO                   |

### Recommended TODO: nightly off-server backup

Stick this in `/etc/cron.d/axflow-backup` (rsync to another host, or upload to
S3/Hetzner Storage Box / Backblaze B2):

```cron
30 2 * * * root TS=$(date -u +\%Y\%m\%dT\%H\%M\%SZ); docker exec axflow-db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' | gzip -9 > /root/axflow-backups/axflow-db-nightly-${TS}.sql.gz && find /root/axflow-backups -name 'axflow-db-nightly-*.sql.gz' -mtime +14 -delete
```

…and then a separate `rclone` / `rsync` step to ship the file off-box.

---

## 7. Troubleshooting

### Site returns 502 Bad Gateway

NPM cannot reach the frontend container. Check:

```bash
docker ps --filter "name=axflow-frontend"      # is it up?
docker logs --tail 30 axflow-frontend          # any errors?
docker network inspect newtravel-backend_default | grep -A2 axflow-frontend
```

If the frontend is not on `newtravel-backend_default`, recreate it:
`docker compose -f docker-compose.prod.yml up -d --force-recreate frontend`.

### Site is slow for the first 20s after a deploy, then fine

Normal — NPM keepalive pool is dropping the old container's IP. Wait one minute.
If it persists past 5 min, restart NPM:

```bash
docker restart nginx-proxy-manager
```

### Backend logs show `relation "..." does not exist` after a deploy

Migration didn't run, or ran partially. Check:

```bash
docker exec -it axflow-backend python manage.py showmigrations | grep -v '\[X\]'
docker exec -it axflow-backend python manage.py migrate
```

If that fails, **roll back** (section 5) and dig into the migration locally
before re-attempting.

### `/health/` returns 200 but `/admin/` 500s

Likely a Python import error in a newly added app. Check `docker logs
axflow-backend` for the traceback. Migration may have succeeded but the app
itself is broken — roll back the code only (you don't need to restore DB).

### Disk is filling up

```bash
docker system df                # see image / container / volume usage
docker image prune -f           # remove dangling images
docker builder prune -f         # remove old build cache (can free GBs)
du -sh /root/axflow-backups/*   # consider pruning old backups
```

---

## 8. Security notes

- **SSH:** key-only auth is set up. Lock it down further by editing
  `/etc/ssh/sshd_config`:
  ```
  PasswordAuthentication no
  PermitRootLogin prohibit-password
  ```
  Then `systemctl reload ssh`. Test with a *new* shell before closing the
  current one.
- **Firewall:** `ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp;
  ufw enable`. Keep port `81` (NPM admin) firewalled or behind a tunnel —
  don't expose it publicly.
- **Secrets:** `/root/axflow/.env` holds the Django `SECRET_KEY`, Postgres
  password, and Slack tokens. Do **not** `cat` it into chat or commit it. If
  it's ever exposed, rotate all values and rebuild.
- **Updates:** run `apt update && apt upgrade -y` on the host monthly; restart
  if a kernel update is pending. Docker images pin to versioned tags
  (`postgres:15-alpine`, `python:3.11-slim`) — bump them deliberately, don't
  pull `:latest` blind.

---

## 9. Quick reference

```bash
# The one command everyone forgets:
ssh root@31.97.205.45 'cd /root/axflow && git pull && docker compose -f docker-compose.prod.yml up -d --build'

# The one command everyone needs at 2 AM:
ssh root@31.97.205.45 'docker compose -f /root/axflow/docker-compose.prod.yml logs --tail 100 backend'
```
