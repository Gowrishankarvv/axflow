import sys
from pathlib import Path

base_dir = Path(__file__).resolve().parent
for candidate in (base_dir / "src", base_dir / "resources"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from config.wsgi import application
