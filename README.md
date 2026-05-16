# TJU Court Web Helper（无 FastAPI 兼容版）

![持续集成](https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Python](https://img.shields.io/badge/Python-3.9%2B-blue)

一个面向天津大学场馆预约系统的**本地网页助手**。项目通过浏览器页面完成参数配置与实时日志展示，由本机 Python 后端负责 Cookie 预检、时间同步、候补场地请求体构造和并发提交。

本版本不依赖 FastAPI、Uvicorn 或 Pydantic，仅使用 Python 标准库提供本地 Web 服务，以减少在较新 Python 版本中安装 Web 框架依赖时遇到的兼容性问题。

> ⚠️ 使用提醒：请遵守学校场馆预约规则与网络使用规范。Cookie 属于敏感登录凭据，请只在可信本机环境运行本项目，不要把服务暴露到公网或共享给他人使用。

## 功能特性

- **本地网页控制台**：在浏览器中填写 Cookie、目标日期、放场时间、候补场地、线程数和尝试次数。
- **Cookie 预检**：提交前可先检查 Cookie 是否疑似失效。
- **候补场地顺序**：支持配置多个候补场地，按页面顺序依次尝试。
- **两种运行模式**：`stable` 稳健模式与 `fast` 极速模式，默认线程数和尝试次数不同。
- **可选 NTP 校时**：安装 `ntplib` 后会计算网络时间偏移，并使用单调时钟等待放场时间；失败时自动回退本地时间。
- **实时日志**：后端通过 SSE 向页面推送任务日志，便于观察等待、发射、成功或失败状态。
- **测试模式**：可只跑完整流程而不真正提交预约请求，适合首次配置后自检。

## 项目结构

```text
.
├── README.md
├── LICENSE                 # MIT License 正式授权文件
├── LICENCE                 # MIT License 中文说明与英文条款
├── CONTRIBUTING.md         # 中文贡献指南
├── start_linux.sh          # Linux/macOS 启动脚本
├── start_windows.bat       # Windows 启动脚本
├── backend/
│   ├── booker_core.py      # 预约核心逻辑：校验、校时、构造请求、并发提交
│   ├── requirements.txt    # Python 依赖
│   ├── run_server.py       # 启动入口，会自动打开浏览器
│   └── server.py           # 标准库 HTTP 服务与 API 路由
└── frontend/
    ├── app.js              # 前端入口：事件绑定与页面初始化
    ├── api.js              # fetch/JSON API 封装
    ├── config.js           # 表单配置、持久化、预设与导入导出
    ├── defaults.js         # 默认值与内置预设
    ├── dom.js              # DOM 查询与共享元素引用
    ├── fields.js           # 候补场地行增删改与排序
    ├── logs.js             # 日志渲染、筛选、复制与下载
    ├── status.js           # 状态展示与任务状态映射
    ├── index.html          # 页面结构
    └── style.css           # 页面样式
```

## 环境要求

- Python 3.9+
- 可访问天津大学场馆预约系统的网络环境
- 现代浏览器（Chrome、Edge、Firefox、Safari 等）

Python 依赖：

```text
requests==2.32.3
ntplib==0.4.0
```

## 快速开始

### Windows

双击运行：

```text
start_windows.bat
```

或手动执行：

```powershell
cd tju_court_web_helper_nofastapi\backend
python -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python run_server.py
```

### Linux / macOS

```bash
chmod +x start_linux.sh
./start_linux.sh
```

或手动执行：

```bash
cd tju_court_web_helper_nofastapi/backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python run_server.py
```

启动成功后访问：

```text
http://127.0.0.1:8787
```

`run_server.py` 默认会在服务启动后自动打开浏览器。如果浏览器没有自动打开，请手动访问上面的地址。

## 页面配置说明

| 配置项 | 说明 |
| --- | --- |
| Cookie | 从已登录的场馆预约系统页面抓取的完整 Cookie。属于敏感信息，请勿泄露；页面默认遮罩显示，并提供显示/隐藏与一键清空。 |
| 模式 | `stable` 默认 6 线程、每线程 20 次；`fast` 默认 10 线程、每线程 40 次。 |
| 放场时间 | 预约系统开放目标日期场地的时间，格式为 `HH:MM:SS`，例如 `21:00:00`。 |
| 目标日期 | 希望预约的场地日期，格式为 `YYYY-MM-DD`。 |
| 并发线程 | 可留空使用模式默认值；手动填写时后端限制为 1 到 20。 |
| 每线程尝试 | 可留空使用模式默认值；手动填写时后端限制为 1 到 80。 |
| 请求超时秒 | 单次 HTTP 请求超时时间。网络较差时可适当调大。 |
| VenueNo | 场馆编号，默认 `005`。 |
| FieldTypeNo | 场地类型编号，默认 `017`。 |
| 测试模式 | 勾选后只运行流程，不向预约接口提交真实预约请求。 |
| 候补场地顺序 | 按从上到下的顺序依次尝试，建议把最想预约的场地放在最前面。 |

## 推荐使用流程

1. 启动本地服务并打开网页。
2. 在浏览器中粘贴完整 Cookie。
3. 设置目标日期、放场时间、场馆编号和场地类型编号。
4. 按优先级添加候补场地，确认 `FieldNo`、场地名、开始时间、结束时间正确。
5. 勾选**测试模式**，点击“预检 Cookie”，确认配置和 Cookie 基本可用。
6. 继续在测试模式下点击“开始等待/抢场”，观察日志流程是否符合预期。
7. 实战前取消**测试模式**，确认电脑时间、网络和 Cookie 状态。
8. 到放场时间后等待日志结果；如果成功，请立即打开微信或相关入口完成支付。

## Cookie 获取建议

Cookie 获取方式会随浏览器、系统和学校预约页面变化而不同，README 不绑定某一种抓包工具。一般思路如下：

1. 使用浏览器或手机环境登录天津大学场馆预约系统。
2. 打开浏览器开发者工具或可信的抓包工具。
3. 找到访问场馆预约页面或提交预约请求时携带的 `Cookie` 请求头。
4. 复制完整 Cookie 字符串，粘贴到网页助手的 Cookie 输入框。

注意事项：

- Cookie 可能会过期，实战前建议重新预检。
- 不要把 Cookie 提交到 Git、聊天工具、截图或公共日志中；页面默认遮罩显示 Cookie，截图前建议确认仍处于隐藏状态。
- 如果日志提示登录失效，请重新登录并重新获取 Cookie。

## 运行模式说明

| 模式 | 默认线程数 | 默认每线程尝试次数 | 适用场景 |
| --- | ---: | ---: | --- |
| `stable` | 6 | 20 | 网络一般、希望请求节奏更稳时使用。 |
| `fast` | 10 | 40 | 对速度要求更高且网络较稳定时使用。 |

手动填写线程数和尝试次数时，后端会做上限保护：线程数最多 20，每线程尝试次数最多 80。

## 接口概览

本项目的 Web API 仅供本地前端页面使用：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/check-cookie` | 根据当前配置执行 Cookie 预检。 |
| `POST` | `/api/start` | 创建并启动一个预约任务，返回 `job_id`。 |
| `POST` | `/api/stop/<job_id>` | 停止指定预约任务。 |
| `GET` | `/api/logs/<job_id>` | 通过 SSE 获取指定任务的实时日志。 |
| `GET` | `/api/status/<job_id>` | 查询指定任务是否仍在运行及当前结果。 |

接口错误会尽量返回结构化 JSON。配置不合法、请求体不是 JSON 对象、JSON 解析失败或数字字段无法转换时，会返回 HTTP `400`，并包含 `detail` 与 `code` 字段；`/api/start` 会在创建任务前完成配置校验，校验失败时不会生成 `job_id`。

## 常见问题

### 1. 浏览器打不开页面怎么办？

请确认终端中已经显示本地服务启动信息，并手动访问：

```text
http://127.0.0.1:8787
```

如果端口被占用，请先关闭旧进程后重新启动。

### 2. Cookie 预检失败怎么办？

请重新登录预约系统并重新复制完整 Cookie。还需要确认当前网络可以访问天津大学场馆预约系统。

### 3. NTP 同步失败会影响使用吗？

程序会在 NTP 同步失败时回退本地时间。NTP 可用时，后端会记录本机与网络时间的偏移量，并用该偏移量换算放场倒计时；实际等待使用单调时钟，避免系统时间临时跳变影响发射时机。建议在实战前确认电脑系统时间准确，尤其是放场前几分钟。

### 4. 测试模式会真的预约吗？

不会。测试模式下核心逻辑会走完等待、线程启动和日志流程，但不会向预约接口提交真实预约请求。

### 5. 成功后为什么还要立即支付？

预约系统通常会在生成订单后要求用户完成支付或确认。如果未及时处理，订单可能被系统回收；请以学校系统实际提示为准。

## 免责声明

- 本项目仅用于本地辅助配置、个人学习和技术交流，不保证预约成功。
- 使用者需自行确认并遵守天津大学及相关场馆的预约规则、账号规则和网络使用规范。
- 因使用本项目产生的账号、网络、预约、支付、订单或其他后果，由使用者自行承担。
- 请勿将本项目用于绕过规则、恶意高频请求、影响他人正常预约或任何未经授权的用途。

## 安全与合规

- 本项目设计为本机使用，默认访问地址为 `127.0.0.1`。
- 不要将服务绑定到公网地址，也不要通过内网穿透暴露出去。
- 不要在仓库、截图、日志或聊天记录中泄露 Cookie。
- 请遵守学校相关预约规则，不要进行恶意高频请求或影响他人正常使用。
- 本项目仅提供本地辅助配置与请求流程封装，使用者需自行承担账号、网络和预约行为相关责任。

## 开发说明

建议在提交 PR 前运行以下检查：

```bash
python -m py_compile backend/booker_core.py backend/server.py
python -m unittest discover -s backend -p 'test*.py'
for f in frontend/*.js; do node --check "$f"; done
```

仓库已提供 GitHub Actions CI、Dependabot 配置、中文 Issue/PR 模板、`SECURITY.md`、`CHANGELOG.md`、`CONTRIBUTING.md`、`LICENSE` 和 `LICENCE`。提交问题或 PR 时，请先移除 Cookie、请求头、HAR、截图和日志中的敏感信息；记录修改日志时也请使用中文描述用户可见变化。

后端核心职责：

- `backend/server.py`：处理静态页面、JSON API、任务管理和 SSE 日志推送。
- `backend/booker_core.py`：处理配置校验、Cookie 检查、时间同步、请求体构造、并发 worker 和停止逻辑。
- `backend/run_server.py`：启动本地服务并自动打开浏览器。

前端核心职责：

- `frontend/index.html`：定义配置表单和日志区域。
- `frontend/app.js`：作为 ES Module 入口，集中做事件绑定、任务启动/停止与 SSE 生命周期协调。
- `frontend/config.js`、`fields.js`、`logs.js`、`api.js`、`status.js`：分别承载配置持久化、场地行操作、日志 UI、HTTP 请求和状态映射，降低单文件维护成本。
- `frontend/style.css`：提供页面样式。

## 故障排查清单

实战前建议逐项确认：

- [ ] 已在可信本机环境运行服务。
- [ ] Cookie 是最新且完整的。
- [ ] 已先使用测试模式跑通过流程。
- [ ] 目标日期、放场时间、场馆编号、场地类型编号填写正确。
- [ ] 候补场地的 `FieldNo`、场地名、开始时间、结束时间填写正确。
- [ ] 电脑系统时间准确，网络稳定。
- [ ] 成功后可以及时进入微信或学校系统完成支付。
