## Summary

- 

## Risk / safety notes

- [ ] This change does not expose cookies, request headers, logs, HAR files, or other sensitive data.
- [ ] This change preserves local-only assumptions or documents any change to networking behavior.
- [ ] This change does not increase request volume unexpectedly.

## Testing

- [ ] `python -m py_compile backend/booker_core.py backend/server.py`
- [ ] `python -m unittest discover -s backend -p 'test*.py'`
- [ ] `for f in frontend/*.js; do node --check "$f"; done`
- [ ] Manual UI smoke test, if frontend behavior changed

## Screenshots

Add screenshots for visible UI changes, or write `N/A`.
