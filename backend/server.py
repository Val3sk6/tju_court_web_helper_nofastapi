# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import mimetypes
import queue
import threading
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from booker_core import BookerConfig, CourtBooker, FieldItem

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
DEFAULT_TARGET_DAYS = 7
JOB_RETENTION = timedelta(minutes=10)
LOCAL_ORIGIN_HOSTS = {"127.0.0.1", "localhost"}


@dataclass
class Job:
    booker: CourtBooker
    queue: "queue.Queue[Dict[str, str]]"
    thread: threading.Thread
    created_at: datetime
    finished_at: Optional[datetime] = None

    def status(self) -> str:
        return str(self.booker.result.get("status") or "idle")

    def phase(self) -> str:
        status = self.status()
        if self.thread.is_alive():
            return "running"
        if status == "success":
            return "success"
        if status in {"login", "cookie_invalid", "invalid"}:
            return "blocked"
        if status == "stopped":
            return "stopped"
        return "finished"

    def snapshot(self, job_id: str) -> Dict[str, object]:
        finished_at = self.finished_at
        end = finished_at or datetime.now()
        return {
            "job_id": job_id,
            "alive": self.thread.is_alive(),
            "status": self.status(),
            "phase": self.phase(),
            "result": self.booker.result,
            "created_at": self.created_at.isoformat(timespec="seconds"),
            "finished_at": finished_at.isoformat(timespec="seconds") if finished_at else None,
            "duration_seconds": round((end - self.created_at).total_seconds(), 3),
        }


JOBS: Dict[str, Job] = {}
JOBS_LOCK = threading.Lock()


def default_target_date() -> str:
    return (date.today() + timedelta(days=DEFAULT_TARGET_DAYS)).isoformat()


def optional_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
    if value == "":
        return None
    return int(value)


def as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def clamped_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return max(minimum, min(number, maximum))


def build_config(payload: Dict[str, Any]) -> BookerConfig:
    raw_fields = payload.get("fields", [])
    if not isinstance(raw_fields, list):
        raw_fields = []

    fields = [
        FieldItem(
            FieldNo=str(f.get("FieldNo", "")).strip(),
            FieldName=str(f.get("FieldName", "")).strip(),
            BeginTime=str(f.get("BeginTime", "")).strip(),
            Endtime=str(f.get("Endtime", "")).strip(),
            Price=str(f.get("Price", "0")).strip() or "0",
        )
        for f in raw_fields
        if isinstance(f, dict)
    ]
    default_ua = BookerConfig(cookie="x").user_agent
    return BookerConfig(
        cookie=str(payload.get("cookie", "")).strip(),
        mode=str(payload.get("mode", "stable")).strip() or "stable",
        open_time=str(payload.get("open_time", "21:00:00")).strip() or "21:00:00",
        target_date=str(payload.get("target_date") or default_target_date()).strip(),
        fields=fields,
        venue_no=str(payload.get("venue_no", "005")).strip() or "005",
        field_type_no=str(payload.get("field_type_no", "017")).strip() or "017",
        user_agent=str(payload.get("user_agent") or default_ua),
        timeout=clamped_int(payload.get("timeout"), default=10, minimum=1, maximum=30),
        threads=optional_int(payload.get("threads")),
        attempts=optional_int(payload.get("attempts")),
        dry_run=as_bool(payload.get("dry_run", False)),
    )


def cleanup_finished_jobs() -> None:
    cutoff = datetime.now() - JOB_RETENTION
    with JOBS_LOCK:
        stale_ids = [
            job_id
            for job_id, job in JOBS.items()
            if job.finished_at is not None and job.finished_at < cutoff
        ]
        for job_id in stale_ids:
            JOBS.pop(job_id, None)


def get_job(job_id: str) -> Optional[Job]:
    cleanup_finished_jobs()
    with JOBS_LOCK:
        return JOBS.get(job_id)


class Handler(BaseHTTPRequestHandler):
    server_version = "TJUHelperHTTP/1.1"

    def log_message(self, fmt: str, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def _cors(self):
        origin = self.headers.get("Origin")
        if not origin:
            return
        parsed = urlparse(origin)
        if parsed.scheme in {"http", "https"} and parsed.hostname in LOCAL_ORIGIN_HOSTS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, data: object, status: int = 200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length else b"{}"
        if not raw:
            return {}
        data = json.loads(raw.decode("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("request body must be a JSON object")
        return data

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/check-cookie":
                payload = self._read_json()
                messages: List[Dict[str, str]] = []

                def logger(level: str, msg: str):
                    messages.append({"level": level, "message": msg})

                booker = CourtBooker(build_config(payload), logger)
                result = booker.cookie_precheck()
                return self._send_json({
                    "ok": result.ok,
                    "status": result.status,
                    "reason": result.reason,
                    "http_status": result.http_status,
                    "messages": messages,
                })

            if path == "/api/start":
                payload = self._read_json()
                job_id = str(uuid.uuid4())
                log_q: "queue.Queue[Dict[str, str]]" = queue.Queue()

                def logger(level: str, msg: str):
                    log_q.put({"level": level, "message": msg})

                booker = CourtBooker(build_config(payload), logger)

                def run_job():
                    try:
                        booker.run()
                    finally:
                        with JOBS_LOCK:
                            job = JOBS.get(job_id)
                            if job:
                                job.finished_at = datetime.now()

                thread = threading.Thread(target=run_job, daemon=True)
                job = Job(booker=booker, queue=log_q, thread=thread, created_at=datetime.now())
                with JOBS_LOCK:
                    JOBS[job_id] = job
                thread.start()
                return self._send_json({"job_id": job_id, "job": job.snapshot(job_id)})

            if path.startswith("/api/stop/"):
                job_id = path.rsplit("/", 1)[-1]
                job = get_job(job_id)
                if not job:
                    return self._send_json({"detail": "job not found"}, 404)
                job.booker.stop()
                return self._send_json({"ok": True, "job": job.snapshot(job_id)})

            return self._send_json({"detail": "not found"}, 404)
        except (ValueError, json.JSONDecodeError) as exc:
            return self._send_json({"detail": str(exc)}, 400)
        except Exception as exc:
            return self._send_json({"detail": str(exc)}, 500)

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith("/api/logs/"):
            return self._serve_logs(path.rsplit("/", 1)[-1])
        if path.startswith("/api/status/"):
            return self._serve_status(path.rsplit("/", 1)[-1])
        return self._serve_static(path)

    def _serve_status(self, job_id: str):
        job = get_job(job_id)
        if not job:
            return self._send_json({"detail": "job not found"}, 404)
        return self._send_json(job.snapshot(job_id))

    def _serve_logs(self, job_id: str):
        job = get_job(job_id)
        if not job:
            return self._send_json({"detail": "job not found"}, 404)
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        try:
            while job.thread.is_alive() or not job.queue.empty():
                try:
                    item = job.queue.get(timeout=0.5)
                    line = f"data: {json.dumps(item, ensure_ascii=False)}\n\n".encode("utf-8")
                    self.wfile.write(line)
                    self.wfile.flush()
                except queue.Empty:
                    continue
            done = {"level": "done", "message": "任务结束"}
            self.wfile.write(f"data: {json.dumps(done, ensure_ascii=False)}\n\n".encode("utf-8"))
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _serve_static(self, path: str):
        if path in {"/", ""}:
            file_path = FRONTEND / "index.html"
        elif path.startswith("/static/"):
            file_path = FRONTEND / path[len("/static/"):]
        else:
            file_path = FRONTEND / path.lstrip("/")
        try:
            frontend_root = FRONTEND.resolve()
            file_path = file_path.resolve()
            try:
                file_path.relative_to(frontend_root)
            except ValueError:
                self.send_error(404, "File not found")
                return
            if not file_path.is_file():
                self.send_error(404, "File not found")
                return
            data = file_path.read_bytes()
            content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
            if file_path.suffix.lower() in {".html", ".css", ".js"}:
                content_type += "; charset=utf-8"
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as exc:
            self.send_error(500, str(exc))


def run(host: str = "127.0.0.1", port: int = 8787):
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"TJU 场地网页助手已启动：http://{host}:{port}")
    print("按 Ctrl+C 停止服务")
    httpd.serve_forever()


if __name__ == "__main__":
    run()
