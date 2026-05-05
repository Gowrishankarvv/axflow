from __future__ import annotations

import os

env = os.environ.get("DJANGO_ENV", "").strip().lower()

if env in {"prod", "production"}:
    from .production import *  # noqa: F401,F403
else:
    from .local import *  # noqa: F401,F403

