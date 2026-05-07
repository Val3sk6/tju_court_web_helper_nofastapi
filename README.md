# TJU Court Web Helper 无 FastAPI 兼容版

这个版本不依赖 FastAPI / Uvicorn / Pydantic，只使用 Python 标准库提供本地网页服务，避免 Python 3.14 下 pydantic-core 编译失败。

## Windows 启动

双击 `start_windows.bat`。

或者手动：

```powershell
cd tju_court_web_helper\backend
python -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python run_server.py
```

浏览器访问：

```text
http://127.0.0.1:8787
```

## 建议

先勾选“测试模式”跑通流程，再取消测试模式实战。
