# -*- coding: utf-8 -*-
"""End-to-end smoke test for the local web helper.

The test launches the real stdlib HTTP server, fetches the browser entry assets,
and exercises an API validation path. It intentionally avoids external campus
network calls so it is stable in CI.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
PORT = 8898
BASE_URL = f"http://127.0.0.1:{PORT}"


def fetch(path: str, timeout: float = 2.0) -> tuple[int, str]:
    with urllib.request.urlopen(f"{BASE_URL}{path}", timeout=timeout) as res:
        return res.status, res.read().decode("utf-8")


def post_json(path: str, payload: object) -> tuple[int, dict]:
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read().decode("utf-8"))
        finally:
            exc.close()


def wait_until_ready() -> None:
    last_error: Optional[Exception] = None
    for _ in range(40):
        try:
            status, _ = fetch("/", timeout=0.5)
            if status == 200:
                return
        except Exception as exc:  # pragma: no cover - diagnostic only
            last_error = exc
            time.sleep(0.25)
    raise RuntimeError(f"server did not become ready: {last_error}")


def main() -> int:
    proc = subprocess.Popen(
        [sys.executable, "-c", f"import server; server.run(port={PORT})"],
        cwd=BACKEND,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )
    try:
        wait_until_ready()
        _, html = fetch("/")
        _, app_js = fetch("/static/app.js")
        _, status_js = fetch("/static/status.js")
        assert 'id="statusBoardTitle"' in html
        assert 'id="adviceBox"' in html
        assert 'id="attemptsValue"' in html
        assert "updateStatusPanel" in app_js
        assert "adviceFromError" in status_js

        status, data = post_json("/api/start", {"cookie": "", "fields": []})
        assert status == 400
        assert data["code"] == "config_invalid"
        assert data["status"] == "invalid"
        assert "hint" in data and data["hint"]
        print("e2e smoke ok")
        return 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    raise SystemExit(main())
