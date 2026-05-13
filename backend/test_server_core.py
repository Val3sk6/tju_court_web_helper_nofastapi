# -*- coding: utf-8 -*-
from __future__ import annotations

import threading
import unittest
from datetime import date, datetime, timedelta
from unittest.mock import patch

from booker_core import BookerConfig, CourtBooker, FieldItem
from server import Job, as_bool, build_config, clamped_int, default_target_date, optional_int


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

    def test_default_target_date_matches_frontend_default(self) -> None:
        self.assertEqual(default_target_date(), (date.today() + timedelta(days=7)).isoformat())


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

    def test_job_snapshot_exposes_status_metadata(self) -> None:
        booker = CourtBooker(BookerConfig(cookie="abc"))
        booker.result["status"] = "stopped"
        job = Job(booker=booker, queue=None, thread=threading.Thread(), created_at=datetime.now())  # type: ignore[arg-type]

        snapshot = job.snapshot("job-1")

        self.assertEqual(snapshot["job_id"], "job-1")
        self.assertEqual(snapshot["status"], "stopped")
        self.assertEqual(snapshot["phase"], "stopped")
        self.assertFalse(snapshot["alive"])


if __name__ == "__main__":
    unittest.main()
