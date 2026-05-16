## 变更摘要

- 

## 风险与安全检查

- [ ] 本次变更不会泄露 Cookie、请求头、日志、HAR 文件或其他敏感信息。
- [ ] 本次变更保持本地运行假设；如涉及网络监听行为变化，已在文档中说明。
- [ ] 本次变更不会意外提高请求频率或扩大请求范围。

## 测试

- [ ] `python -m py_compile backend/booker_core.py backend/server.py`
- [ ] `python -m unittest discover -s backend -p 'test*.py'`
- [ ] `for f in frontend/*.js; do node --check "$f"; done`
- [ ] 如修改前端可见行为，已完成手动 UI 冒烟测试

## 截图

如果有可见 UI 变化，请附截图；否则填写 `N/A`。
