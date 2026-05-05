import os
import sys
from pathlib import Path
from django.core.asgi import get_asgi_application

base_dir = Path(__file__).resolve().parents[1]
for candidate in (base_dir / "src", base_dir / "resources"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
application = get_asgi_application()
