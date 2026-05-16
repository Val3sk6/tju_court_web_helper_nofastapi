# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from booker_core import BookerConfig, CourtBooker, FieldItem
from server import JOBS, JOBS_LOCK, Handler, Job, as_bool, build_config, clamped_int, default_target_date, frontend_dir, optional_int


class ServerConfigTests(unittest.TestCase):
    def test_build_config_defaults_target_date_and_clamps_timeout(self) -> None:
        cfg = build_config({"cookie": "abc", "timeout": 999, "fields": "bad"})

        self.assertEqual(cfg.target_date, (date.today() + timedelta(days=7)).isoformat())
        self.assertEqual(cfg.timeout, 30)
        self.assertEqual(cfg.fields, [])

    def test_build_config_filters_invalid_fields(self) -> None:
        cfg = build_config({
            "cookie": "abc",
            "fields": [
                {"FieldNo": " YMQX007 ", "FieldName": " 羽毛球07 ", "BeginTime": "09:00", "Endtime": "10:00"},
                "not-a-field",
            ],
        })

        self.assertEqual(len(cfg.fields), 1)
        self.assertEqual(cfg.fields[0].FieldNo, "YMQX007")
        self.assertEqual(cfg.fields[0].FieldName, "羽毛球07")

    def test_clamped_int_uses_default_for_invalid_values(self) -> None:
        self.assertEqual(clamped_int("bad", default=10, minimum=1, maximum=30), 10)
        self.assertEqual(clamped_int(-5, default=10, minimum=1, maximum=30), 1)
        self.assertEqual(clamped_int(99, default=10, minimum=1, maximum=30), 30)

    def test_optional_int_and_bool_coercion(self) -> None:
        self.assertIsNone(optional_int("  "))
        self.assertEqual(optional_int(" 12 "), 12)
        self.assertFalse(as_bool("false"))
        self.assertTrue(as_bool("true"))

    def test_optional_int_reports_named_field_for_invalid_values(self) -> None:
        with self.assertRaisesRegex(ValueError, "threads must be an integer"):
            optional_int("many", "threads")

    def test_default_target_date_matches_frontend_default(self) -> None:
        self.assertEqual(default_target_date(), (date.today() + timedelta(days=7)).isoformat())

    def test_frontend_dir_prefers_pyinstaller_bundle_root(self) -> None:
        with patch("server.sys._MEIPASS", "/tmp/tju-helper-bundle", create=True):
            self.assertEqual(frontend_dir(), Path("/tmp/tju-helper-bundle") / "frontend")


class BookerCoreTests(unittest.TestCase):
    def test_analyze_classifies_common_responses(self) -> None:
        booker = CourtBooker(BookerConfig(cookie="abc"))

        self.assertEqual(booker.analyze("请登录后继续"), "login")
        self.assertEqual(booker.analyze("该场地已被预约"), "fail")
        self.assertEqual(booker.analyze('{"success": true, "orderId": 123}'), "success")
        self.assertEqual(booker.analyze("unrecognized response"), "unknown")

    def test_dry_run_post_field_does_not_need_network(self) -> None:
        cfg = BookerConfig(
            cookie="abc",
            fields=[FieldItem("YMQX007", "羽毛球07", "09:00", "10:00")],
            dry_run=True,
        )
        booker = CourtBooker(cfg)

        code, status = booker.post_field(session=None, body="", field_name="羽毛球07")  # type: ignore[arg-type]

        self.assertEqual((code, status), ("dry_run", 200))

    def test_cookie_precheck_reports_config_invalid(self) -> None:
        booker = CourtBooker(BookerConfig(cookie=""))

        result = booker.cookie_precheck()

        self.assertFalse(result.ok)
        self.assertEqual(result.status, "config_invalid")

    def test_cookie_precheck_reports_network_unknown(self) -> None:
        cfg = BookerConfig(
            cookie="abc",
            fields=[FieldItem("YMQX007", "羽毛球07", "09:00", "10:00")],
        )
        booker = CourtBooker(cfg)

        with patch("booker_core.requests.get", side_effect=TimeoutError("blocked")):
            result = booker.cookie_precheck()

        self.assertTrue(result.ok)
        self.assertEqual(result.status, "network_unknown")

    def test_cookie_precheck_reports_invalid_cookie(self) -> None:
        class Response:
            text = "请登录"
            status_code = 200

        cfg = BookerConfig(
            cookie="abc",
            fields=[FieldItem("YMQX007", "羽毛球07", "09:00", "10:00")],
        )
        booker = CourtBooker(cfg)

        with patch("booker_core.requests.get", return_value=Response()):
            result = booker.cookie_precheck()

        self.assertFalse(result.ok)
        self.assertEqual(result.status, "invalid_cookie")
        self.assertEqual(result.http_status, 200)

    def test_sync_clock_uses_median_ntp_offset(self) -> None:
        class Response:
            def __init__(self, tx_time: float) -> None:
                self.tx_time = tx_time

        class Client:
            tx_times = iter([100.3, 101.4, 102.5])

            def request(self, _server: str, version: int, timeout: int) -> Response:
                if version != 3 or timeout != 1:
                    raise AssertionError("unexpected NTP request options")
                return Response(next(Client.tx_times))

        class NtpModule:
            @staticmethod
            def NTPClient() -> Client:
                return Client()

        logs = []
        booker = CourtBooker(BookerConfig(cookie="abc"), lambda level, msg: logs.append((level, msg)))

        with patch("booker_core.NTP_ENABLED", True), \
                patch("booker_core.ntplib", NtpModule, create=True), \
                patch("booker_core.time.time", side_effect=[100.0, 100.2, 101.0, 101.2, 102.0, 102.2]):
            result = booker.sync_clock()

        self.assertEqual(result.source, "ntp")
        self.assertEqual(result.samples, 3)
        self.assertAlmostEqual(result.offset_seconds, 0.3, places=6)
        self.assertTrue(any("校时偏移=+300.0ms" in msg for _, msg in logs))

    def test_wait_until_uses_monotonic_deadline(self) -> None:
        booker = CourtBooker(BookerConfig(cookie="abc", open_time="21:00:00"))
        base = datetime(2026, 5, 15, 20, 59, 59)

        with patch.object(booker, "corrected_now", return_value=base), \
                patch("booker_core.time.monotonic", side_effect=[10.0, 10.0, 10.6, 10.6, 11.0]) as monotonic, \
                patch("booker_core.time.sleep") as sleep:
            booker.wait_until(base + timedelta(seconds=1), offset_seconds=0.25)

        self.assertGreaterEqual(monotonic.call_count, 5)
        sleep.assert_called_once()
        self.assertAlmostEqual(sleep.call_args.args[0], 0.001, places=6)

    def test_job_snapshot_exposes_status_metadata(self) -> None:
        booker = CourtBooker(BookerConfig(cookie="abc"))
        booker.result["status"] = "stopped"
        job = Job(booker=booker, queue=None, thread=threading.Thread(), created_at=datetime.now())  # type: ignore[arg-type]

        snapshot = job.snapshot("job-1")

        self.assertEqual(snapshot["job_id"], "job-1")
        self.assertEqual(snapshot["status"], "stopped")
        self.assertEqual(snapshot["phase"], "stopped")
        self.assertFalse(snapshot["alive"])


class ApiStartValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        with JOBS_LOCK:
            JOBS.clear()
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.httpd.server_address
        self.base_url = f"http://{host}:{port}"

    def tearDown(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=2)
        with JOBS_LOCK:
            JOBS.clear()

    def post_json(self, path: str, data: object) -> tuple[int, dict]:
        body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}{path}",
            data=body,
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

    def post_raw(self, path: str, body: bytes) -> tuple[int, dict]:
        req = urllib.request.Request(
            f"{self.base_url}{path}",
            data=body,
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

    def test_start_rejects_invalid_config_before_creating_job(self) -> None:
        status, data = self.post_json("/api/start", {"cookie": "", "fields": []})

        self.assertEqual(status, 400)
        self.assertEqual(data["code"], "config_invalid")
        self.assertEqual(data["status"], "invalid")
        self.assertIn("Cookie", data["detail"])
        self.assertNotIn("job_id", data)
        with JOBS_LOCK:
            self.assertEqual(JOBS, {})

    def test_start_reports_invalid_integer_field_as_400(self) -> None:
        status, data = self.post_json("/api/start", {
            "cookie": "abc",
            "threads": "many",
            "fields": [{"FieldNo": "YMQX007", "FieldName": "羽毛球07", "BeginTime": "09:00", "Endtime": "10:00"}],
        })

        self.assertEqual(status, 400)
        self.assertEqual(data["code"], "invalid_integer")
        self.assertEqual(data["fields"], ["threads"])
        self.assertEqual(data["detail"], "threads must be an integer")
        with JOBS_LOCK:
            self.assertEqual(JOBS, {})

    def test_post_rejects_malformed_json_with_explicit_error_code(self) -> None:
        status, data = self.post_raw("/api/start", b"{")

        self.assertEqual(status, 400)
        self.assertEqual(data["code"], "invalid_json")
        self.assertEqual(data["detail"], "request body must be valid JSON")


if __name__ == "__main__":
    unittest.main()
