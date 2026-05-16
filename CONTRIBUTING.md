# 贡献指南

感谢你愿意改进本项目。本项目面向中文使用者，Issue、PR、修改日志和用户可见文档优先使用中文。

## 开始之前

- 请先阅读 `README.md`、`SECURITY.md` 和 `CHANGELOG.md`。
- 本项目会处理预约系统 Cookie。提交 Issue、PR、日志、截图、抓包或导出配置前，请确认已经删除 Cookie、请求头、Token、学号、手机号、订单号等敏感信息。
- 本项目默认仅用于可信本机环境，不鼓励公网暴露、内网穿透共享或违反学校预约规则的使用方式。

## 本地开发环境

后端依赖位于 `backend/requirements.txt`。推荐使用虚拟环境：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows 使用 .venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

启动本地服务：

```bash
python run_server.py
```

启动后访问：

```text
http://127.0.0.1:8787
```

## 提交前检查

提交 PR 前请至少运行：

```bash
python -m py_compile backend/booker_core.py backend/server.py tools/build_package.py
python -m unittest discover -s backend -p 'test*.py'
for f in frontend/*.js; do node --check "$f"; done
```

如果修改了前端可见行为，请手动打开页面做一次冒烟测试；涉及 UI 变化时，建议在 PR 中附截图。

## 本地打包验证

如修改了启动入口、静态资源路径或打包脚本，请额外验证打包命令：

```bash
python tools/build_package.py --onedir
```

打包产物位于 `dist/`，提交 PR 前请不要把 `build/`、`dist/` 或 `*.spec` 加入版本库。

## 修改日志

用户可见变化请更新 `CHANGELOG.md` 的“未发布”部分，并使用中文描述。建议按以下分类记录：

- `新增`：新功能、新文件、新入口。
- `变更`：行为调整、文案调整、交互调整。
- `修复`：Bug 修复。
- `安全`：与 Cookie、日志脱敏、本地访问边界相关的改动。

## 代码与协作约定

- 前端逻辑按职责放入 `frontend/api.js`、`config.js`、`fields.js`、`logs.js`、`status.js` 等模块，避免重新堆回单个大文件。
- 后端 API 错误尽量返回结构化 JSON，并保留清晰的 `detail` / `code` 字段。
- 不要在导出配置、日志、测试 fixture 或文档示例中包含真实 Cookie。
- 改动请求频率、并发、发射时机、Cookie 处理、安全边界时，请在 PR 中明确说明风险。
