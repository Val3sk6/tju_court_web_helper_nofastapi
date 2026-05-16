# -*- coding: utf-8 -*-
"""使用 PyInstaller 打包本地网页助手。

运行前请先安装打包依赖：
    python -m pip install pyinstaller

示例：
    python tools/build_package.py
    python tools/build_package.py --name tju-court-helper-dev --onedir
    python tools/build_package.py --name tju-court-helper --windowed
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
ENTRY = ROOT / "backend" / "run_server.py"


def ensure_utf8_stdio() -> None:
    """Force UTF-8 console output for Windows CI shells with legacy code pages."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding="utf-8")
        except (OSError, ValueError):
            # Some embedded or redirected streams may reject reconfiguration;
            # in that case keep the original stream behavior.
            pass


def pyinstaller_command(name: str, onefile: bool, clean: bool, windowed: bool) -> list[str]:
    mode = "--onefile" if onefile else "--onedir"
    add_data = f"{FRONTEND}{os.pathsep}frontend"
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        mode,
        "--name",
        name,
        "--add-data",
        add_data,
    ]
    if clean:
        cmd.append("--clean")
    if windowed:
        cmd.append("--windowed")
    cmd.append(str(ENTRY))
    return cmd


def main() -> int:
    ensure_utf8_stdio()

    parser = argparse.ArgumentParser(description="打包 TJU Court Web Helper 本地网页助手。")
    parser.add_argument("--name", default="tju-court-helper", help="输出可执行文件/目录名称。")
    parser.add_argument("--onedir", action="store_true", help="生成目录包而不是单文件包，便于调试。")
    parser.add_argument("--no-clean", action="store_true", help="不传递 PyInstaller --clean。")
    parser.add_argument(
        "--windowed",
        action="store_true",
        help="生成无控制台窗口的桌面程序；不便观察日志，建议仅在确认可用后发布。",
    )
    args = parser.parse_args()

    if not FRONTEND.is_dir() or not ENTRY.is_file():
        print("请从仓库根目录运行打包脚本，或确认 frontend/ 与 backend/run_server.py 存在。", file=sys.stderr)
        return 2

    if shutil.which("pyinstaller") is None:
        try:
            subprocess.run([sys.executable, "-m", "PyInstaller", "--version"], check=True, stdout=subprocess.DEVNULL)
        except (OSError, subprocess.CalledProcessError):
            print("未找到 PyInstaller。请先运行：python -m pip install pyinstaller", file=sys.stderr)
            return 2

    cmd = pyinstaller_command(name=args.name, onefile=not args.onedir, clean=not args.no_clean, windowed=args.windowed)
    print("运行打包命令：")
    print(" ".join(str(part) for part in cmd))
    return subprocess.call(cmd, cwd=ROOT)


if __name__ == "__main__":
    raise SystemExit(main())
