# -*- coding: utf-8 -*-
"""TJU court booking core.

This module preserves the original Python execution advantages:
- requests.Session for stable HTTP calls
- threading.Event for unified launch and stop-on-success
- optional ntplib time sync
- callback-based logging for web UI streaming
"""
from __future__ import annotations

import json
import threading
import time
import urllib.parse
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional, Tuple

import requests

try:
    import ntplib  # type: ignore
    NTP_ENABLED = True
except Exception:
    NTP_ENABLED = False

LogFn = Callable[[str, str], None]


@dataclass
class FieldItem:
    FieldNo: str
    FieldName: str
    BeginTime: str
    Endtime: str
    Price: str = "0"


@dataclass
class PrecheckResult:
    ok: bool
    status: str
    reason: str
    http_status: Optional[int] = None


@dataclass
class TimeSyncResult:
    now: datetime
    offset_seconds: float = 0.0
    source: str = "local"
    samples: int = 0


@dataclass
class BookerConfig:
    cookie: str
    mode: str = "stable"  # stable / fast
    open_time: str = "21:00:00"
    target_date: str = "2025-12-07"
    fields: List[FieldItem] = field(default_factory=list)
    venue_no: str = "005"
    field_type_no: str = "017"
    user_agent: str = (
        "Mozilla/5.0 (Linux; Android 12; ALN-AL00 Build/HUAWEIALN-AL00; wv) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0 "
        "Mobile Safari/537.36 MicroMessenger/8.0.65.2960"
    )
    timeout: int = 10
    threads: Optional[int] = None
    attempts: Optional[int] = None
    dry_run: bool = False

    @property
    def resolved_threads(self) -> int:
        if self.threads is not None:
            return max(1, min(int(self.threads), 20))
        return 6 if self.mode == "stable" else 10

    @property
    def resolved_attempts(self) -> int:
        if self.attempts is not None:
            return max(1, min(int(self.attempts), 80))
        return 20 if self.mode == "stable" else 40


class CourtBooker:
    BASE = "http://vfmc.tju.edu.cn"

    def __init__(self, config: BookerConfig, log_fn: Optional[LogFn] = None):
        self.cfg = config
        self.log_fn = log_fn or (lambda level, msg: print(f"[{level}] {msg}"))
        self.success = threading.Event()
        self.stop_event = threading.Event()
        self.result: Dict[str, object] = {
            "field": None,
            "time": None,
            "success_at": None,
            "orderid": None,
            "status": "idle",
            "stats": {
                "attempts": 0,
                "success": 0,
                "login": 0,
                "fail": 0,
                "error": 0,
                "dry_run": 0,
                "unknown": 0,
            },
            "last_code": None,
            "last_http_status": None,
        }
        self._lock = threading.Lock()

    @property
    def referer(self) -> str:
        return f"{self.BASE}/Views/Field/FieldOrder.html?VenueNo={self.cfg.venue_no}&FieldTypeNo={self.cfg.field_type_no}&FieldType=Field"

    @property
    def post_url(self) -> str:
        return f"{self.BASE}/Field/OrderField"

    def headers(self) -> Dict[str, str]:
        return {
            "User-Agent": self.cfg.user_agent,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": self.referer,
            "Cookie": self.cfg.cookie,
        }

    def log(self, msg: str, level: str = "info") -> None:
        stamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        self.log_fn(level, f"[{stamp}] {msg}")

    def record_attempt(self, code: str, status: object) -> None:
        with self._lock:
            stats = self.result.setdefault("stats", {})
            if isinstance(stats, dict):
                stats["attempts"] = int(stats.get("attempts", 0)) + 1
                bucket = code if code in stats else "unknown"
                stats[bucket] = int(stats.get(bucket, 0)) + 1
            self.result["last_code"] = code
            self.result["last_http_status"] = str(status)

    def validate(self) -> Tuple[bool, str]:
        if not self.cfg.cookie or "REPLACE_ME" in self.cfg.cookie:
            return False, "请先粘贴真实 Cookie。"
        if self.cfg.mode not in {"stable", "fast"}:
            return False, "mode 只能是 stable 或 fast。"
        try:
            datetime.strptime(self.cfg.open_time, "%H:%M:%S")
            datetime.strptime(self.cfg.target_date, "%Y-%m-%d")
        except ValueError:
            return False, "时间格式错误：open_time=HH:MM:SS，target_date=YYYY-MM-DD。"
        if not self.cfg.fields:
            return False, "至少需要配置一个场地。"
        for item in self.cfg.fields:
            if not all([item.FieldNo, item.FieldName, item.BeginTime, item.Endtime]):
                return False, "场地配置不完整。"
        return True, "ok"

    def cookie_precheck(self) -> PrecheckResult:
        ok, msg = self.validate()
        if not ok:
            self.log(f"❌ {msg}", "error")
            return PrecheckResult(False, "config_invalid", msg)
        try:
            r = requests.get(self.referer, headers=self.headers(), timeout=5)
            if any(k in r.text for k in ["请登录", "微信授权", "用户类型选择"]):
                reason = "Cookie 失效，请重新抓取最新 Cookie"
                self.log(f"❌ {reason}", "error")
                return PrecheckResult(False, "invalid_cookie", reason, r.status_code)
            reason = f"Cookie 检测通过，HTTP {r.status_code}"
            self.log(f"✅ {reason}", "success")
            return PrecheckResult(True, "valid", reason, r.status_code)
        except Exception as exc:
            # Some campus networks may block pre-check but still allow booking later.
            reason = f"Cookie 检测请求失败：{exc}；可继续，但建议检查网络"
            self.log(f"⚠️ {reason}", "warn")
            return PrecheckResult(True, "network_unknown", reason)

    def cookie_check(self) -> bool:
        return self.cookie_precheck().ok

    def corrected_now(self, offset_seconds: float = 0.0) -> datetime:
        return datetime.now() + timedelta(seconds=offset_seconds)

    def sync_clock(self) -> TimeSyncResult:
        if not NTP_ENABLED:
            now = self.corrected_now()
            self.log("⚠️ ntplib 未安装，使用本地时间；校时偏移=+0.0ms", "warn")
            return TimeSyncResult(now=now)

        servers = ["time.google.com", "pool.ntp.org", "time.windows.com"]
        offsets: List[float] = []
        for server in servers:
            try:
                started = time.time()
                response = ntplib.NTPClient().request(server, version=3, timeout=1)
                finished = time.time()
                local_midpoint = (started + finished) / 2
                offsets.append(float(response.tx_time) - local_midpoint)
            except Exception:
                pass

        if offsets:
            offsets.sort()
            offset = offsets[len(offsets) // 2]
            now = self.corrected_now(offset)
            self.log(
                f"✅ 时间同步：{now.strftime('%H:%M:%S.%f')[:-3]}，校时偏移={offset * 1000:+.1f}ms，样本={len(offsets)}",
                "success",
            )
            return TimeSyncResult(now=now, offset_seconds=offset, source="ntp", samples=len(offsets))

        now = self.corrected_now()
        self.log("⚠️ NTP 同步失败，使用本地时间；校时偏移=+0.0ms", "warn")
        return TimeSyncResult(now=now)

    def sync_time(self) -> datetime:
        return self.sync_clock().now

    def wait_until(self, target_time: datetime, offset_seconds: float = 0.0) -> None:
        delay = (target_time - self.corrected_now(offset_seconds)).total_seconds()
        if delay <= 0:
            return

        deadline = time.monotonic() + delay
        self.log(f"⏰ 等待 {delay:.2f}s 到 {self.cfg.open_time}")

        coarse_deadline = max(time.monotonic(), deadline - 0.4)
        while not self.stop_event.is_set():
            remaining = coarse_deadline - time.monotonic()
            if remaining <= 0:
                break
            time.sleep(min(0.1, remaining))

        while not self.stop_event.is_set():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            time.sleep(min(0.001, remaining))

    def analyze_response(self, text: str) -> Tuple[str, Optional[str]]:
        """Return the response status and the v1.2 order ID when available."""
        try:
            payload = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            payload = None

        if isinstance(payload, dict):
            resultdata = payload.get("resultdata")
            if payload.get("errorcode") == 0 and resultdata:
                return "success", str(resultdata)

        lower = text.lower()
        if any(k in text for k in ["请登录", "用户类型选择", "授权"]):
            return "login", None
        if any(k in text for k in [
            "不可预订", "请选择预定场地", "已被预约", "忙时",
            "超过预约次数", "达到预约上限", "已预约", "不可预约", "无权限",
        ]):
            return "fail", None
        if any(k in lower for k in ["success", "预约成功", "待支付", "支付", "orderid"]):
            return "success", None
        return "unknown", None

    def analyze(self, text: str) -> str:
        """Compatibility wrapper retained for callers that only need a status."""
        return self.analyze_response(text)[0]

    @staticmethod
    def validate_dateadd(dateadd: int) -> bool:
        """Validate DateAdd without changing the current website-derived behavior.

        DateAdd represents the target day offset in the website booking cycle.
        This small seam can later be extended with a GetList availability check.
        """
        return dateadd >= 0

    def build_bodies(self) -> List[Dict[str, object]]:
        today = datetime.now().date()
        target = datetime.strptime(self.cfg.target_date, "%Y-%m-%d").date()
        # DateAdd is the target-day offset used by the website booking cycle.
        dateadd_days = (target - today).days
        dateadd = str(dateadd_days)
        self.log(f"📅 目标日期 {self.cfg.target_date}，dateadd={dateadd}")
        bodies: List[Dict[str, object]] = []
        for f in self.cfg.fields:
            data = [{
                "FieldNo": f.FieldNo,
                "FieldTypeNo": self.cfg.field_type_no,
                "FieldName": f.FieldName,
                "BeginTime": f.BeginTime,
                "Endtime": f.Endtime,
                "Price": f.Price,
                "DateAdd": dateadd,
            }]
            body = urllib.parse.urlencode({
                "checkdata": json.dumps(data, ensure_ascii=False),
                "VenueNo": self.cfg.venue_no,
                "OrderType": "Field",
            })
            bodies.append({"field": f, "body": body})
        return bodies

    def post_field(
        self,
        session: requests.Session,
        body: str,
        field_name: str,
        booking_time: str = "",
    ) -> Tuple[str, object]:
        if self.cfg.dry_run:
            return "dry_run", 200
        try:
            r = session.post(self.post_url, data=body, headers=self.headers(), timeout=self.cfg.timeout)
            text = r.content.decode("utf-8", errors="replace")
            code, orderid = self.analyze_response(text)
            if code == "success":
                with self._lock:
                    self.result["field"] = field_name
                    self.result["time"] = booking_time
                    self.result["success_at"] = datetime.now().strftime("%H:%M:%S.%f")[:-3]
                    self.result["orderid"] = orderid
                    self.result["status"] = "success"
                self.success.set()
                self.stop_event.set()
            return code, r.status_code
        except Exception as exc:
            return "error", str(exc)

    def worker(self, tid: int, bodies: List[Dict[str, object]], start_event: threading.Event) -> None:
        session = requests.Session()
        start_event.wait()
        for i in range(self.cfg.resolved_attempts):
            if self.stop_event.is_set() or self.success.is_set():
                return
            for item in bodies:
                if self.stop_event.is_set() or self.success.is_set():
                    return
                field_item = item["field"]
                assert isinstance(field_item, FieldItem)
                booking_time = f"{field_item.BeginTime}-{field_item.Endtime}"
                code, status = self.post_field(session, str(item["body"]), field_item.FieldName, booking_time)
                self.record_attempt(code, status)
                self.log(
                    f"T{tid} 尝试{i:02d}\n"
                    f"{field_item.FieldName}\n"
                    f"HTTP {status}\n"
                    f"状态 {code.upper()}",
                    "success" if code == "success" else "warn" if code == "fail" else "info",
                )
                if code in {"success", "login", "fail"}:
                    if code == "login":
                        self.result["status"] = "login"
                        self.stop_event.set()
                    elif code == "fail":
                        self.result["status"] = "failed"
                        self.stop_event.set()
                    return
                if self.cfg.mode == "stable":
                    time.sleep(0.02 + tid * 0.002)
                else:
                    time.sleep(0.01)

    def run(self) -> Dict[str, Any]:
        ok, msg = self.validate()
        if not ok:
            self.result["status"] = "invalid"
            self.log(f"❌ {msg}", "error")
            return self.result

        self.result["status"] = "running"
        self.log(f"🏸 启动本地网页助手：{self.cfg.mode.upper()} 模式")
        self.log(f"线程={self.cfg.resolved_threads}，每线程尝试={self.cfg.resolved_attempts}")
        if not self.cookie_check():
            self.result["status"] = "cookie_invalid"
            return self.result

        bodies = self.build_bodies()
        self.log("🎯 场次顺序：" + " -> ".join([str(item["field"].FieldName) for item in bodies]))

        threads: List[threading.Thread] = []
        start_event = threading.Event()
        for tid in range(self.cfg.resolved_threads):
            t = threading.Thread(target=self.worker, args=(tid, bodies, start_event), daemon=True)
            t.start()
            threads.append(t)

        clock = self.sync_clock()
        target_time = datetime.strptime(f"{clock.now.date()} {self.cfg.open_time}", "%Y-%m-%d %H:%M:%S")
        self.wait_until(target_time, clock.offset_seconds)

        if self.stop_event.is_set():
            self.log("🛑 已停止，未发射请求", "warn")
            return self.result

        self.log("🚀 开始发射请求！", "success")
        start_event.set()
        for t in threads:
            t.join(timeout=30)

        if self.success.is_set():
            self.log(
                "=====================\n"
                "预约成功！\n\n"
                f"场地：\n{self.result['field']}\n\n"
                f"时间：\n{self.result['time']}\n\n"
                f"订单号：\n{self.result['orderid'] or '旧版响应未返回订单号'}\n\n"
                "请打开微信完成支付\n"
                "=====================",
                "success",
            )
        else:
            if self.result.get("status") == "running":
                self.result["status"] = "failed"
            self.log("😔 本轮未成功。建议检查 Cookie、网络、时间和候补场地顺序。", "warn")
        return self.result

    def stop(self) -> None:
        self.stop_event.set()
        self.result["status"] = "stopped"
        self.log("🛑 收到停止指令", "warn")
