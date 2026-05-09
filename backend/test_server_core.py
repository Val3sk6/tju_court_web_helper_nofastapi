# -*- coding: utf-8 -*-
from __future__ import annotations

import unittest
from datetime import date, timedelta

from booker_core import BookerConfig, CourtBooker, FieldItem
from server import as_bool, build_config, clamped_int, default_target_date, optional_int


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


if __name__ == "__main__":
    unittest.main()
