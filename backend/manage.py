#!/usr/bin/env python3
import os
import sys
from dotenv import load_dotenv
from pathlib import Path

def main():
    load_dotenv()
    base_dir = Path(__file__).resolve().parent
    src_dir = base_dir / "src"
    resources_dir = base_dir / "resources"
    for candidate in (src_dir, resources_dir):
        if str(candidate) not in sys.path:
            sys.path.insert(0, str(candidate))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    try:
        from django.core.management import execute_from_command_line
    except Exception as exc:
        raise
    # from django.db import connections
    # connections['default'].cursor()
    # print("DB connected!")
    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()
