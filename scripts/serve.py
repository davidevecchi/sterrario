#!/usr/bin/env python3
"""Serve the sterrario site locally, rebuilding data/.generated/trips.json once at startup.

Usage:
    python3 scripts/serve.py [port]

Runs build_trips.py (picking up every .gpx in data/, same as running it with
no arguments) before starting a plain static file server rooted at the
project folder, so data/.generated/trips.json is always fresh for that server run
without rebuilding on every page reload.
"""
import sys
import http.server
import subprocess
from pathlib import Path

def main():
    project_dir = Path(__file__).resolve().parent.parent
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

    subprocess.run([sys.executable, str(project_dir / "scripts" / "build_trips.py")], cwd=project_dir, check=True)

    handler = lambda *args, **kwargs: http.server.SimpleHTTPRequestHandler(*args, directory=str(project_dir), **kwargs)
    with http.server.ThreadingHTTPServer(("", port), handler) as httpd:
        print(f"\nServing {project_dir} at http://localhost:{port}")
        httpd.serve_forever()

if __name__ == "__main__":
    main()
