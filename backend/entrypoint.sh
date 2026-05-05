#!/bin/sh
set -e
echo "Starting Django"

python --version
python -m django --version

# Run migrations (will skip if already applied)
echo "Running migrations..."
python manage.py migrate --noinput || {
    echo "WARNING: Migrations failed, but continuing..."
}

echo "Collecting static files..."
python manage.py collectstatic --noinput || echo "WARNING: Static file collection failed"

echo "Starting Gunicorn..."
exec gunicorn timetrack.wsgi:application \
  --bind 0.0.0.0:${PORT:-10000} \
  --workers 1 \
  --threads 2 \
  --timeout 120 \
  --access-logfile - \
  --error-logfile - \
  --log-level info \
  --capture-output
