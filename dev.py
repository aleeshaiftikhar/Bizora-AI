#!/usr/bin/env python3
"""
Starts BOTH the Python backend and the React dev server with one command:

    python dev.py

Then open http://localhost:5173  (press Ctrl+C once to stop everything).

First run: it installs the React packages automatically (needs Node.js).
If Node.js is not installed, it starts only the backend, which serves the
ready-built React app at http://localhost:8000
"""
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
CLIENT = os.path.join(ROOT, "client")
IS_WIN = os.name == "nt"


def stop(proc):
    """Stop a process and everything it started (npm starts child processes)."""
    if proc.poll() is not None:
        return
    try:
        if IS_WIN:
            subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True)
        else:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    except Exception:
        try:
            proc.terminate()
        except Exception:
            pass


def start(cmd, cwd):
    kwargs = {} if IS_WIN else {"start_new_session": True}
    return subprocess.Popen(cmd, cwd=cwd, **kwargs)


def main():
    npm = shutil.which("npm")
    procs = []

    print("\n  Bizora AI: starting...\n")
    procs.append(start([sys.executable, os.path.join(ROOT, "server.py")], ROOT))

    if not npm:
        print("  Node.js / npm was not found, so only the backend is running.")
        print("  Open http://localhost:8000  (ready-built app)")
        print("  To edit the React code, install Node.js from https://nodejs.org and run this again.\n")
        url = "http://localhost:8000"
    else:
        if not os.path.isdir(os.path.join(CLIENT, "node_modules")):
            print("  Installing React packages (first time only, this takes a minute)...\n")
            if subprocess.run([npm, "install"], cwd=CLIENT).returncode != 0:
                print("\n  npm install failed. Check your internet connection and try again.")
                stop(procs[0])
                sys.exit(1)
        procs.append(start([npm, "run", "dev"], CLIENT))
        url = "http://localhost:5173"
        print(f"\n  Open {url}   (backend runs on http://localhost:8000)\n")

    threading.Timer(3.0, lambda: webbrowser.open(url)).start()

    try:
        while all(p.poll() is None for p in procs):
            time.sleep(0.5)
        print("\n  One of the servers stopped. Shutting down the other one...")
    except KeyboardInterrupt:
        print("\n  Stopping...")
    finally:
        for p in procs:
            stop(p)
        for p in procs:
            try:
                p.wait(timeout=5)
            except Exception:
                pass


if __name__ == "__main__":
    main()
