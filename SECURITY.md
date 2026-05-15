# Security Policy

## Supported scope

This project is designed as a local-only helper that binds to `127.0.0.1` by default. It is not intended to be exposed to the public internet, shared over tunnels, or run on untrusted machines.

## Sensitive data handling

The app handles user-provided booking-system cookies. Cookies are login credentials and must be treated as secrets.

When opening an issue, discussion, pull request, or security report:

- Do **not** paste cookies, full request headers, HAR files, packet captures, screenshots, or logs that contain cookies.
- Redact values such as `Cookie`, `Set-Cookie`, `WXOpenId`, session IDs, tokens, phone numbers, student IDs, and order identifiers.
- Prefer reproductions that use test mode, mock data, or clearly fake placeholder credentials.

## Reporting a vulnerability

Please report suspected security issues privately to the repository maintainers instead of posting public issues. Include:

- A short description of the problem and impact.
- Steps to reproduce with all secrets redacted.
- Your environment: OS, Python version, browser, and commit/tag.
- Whether the issue requires non-default host binding or public exposure.

If private reporting is not configured on GitHub, contact the maintainers through the least-public channel available and do not include live credentials in the first message.

## Operational guidance

- Run the service only on trusted local machines.
- Keep the default `127.0.0.1` binding unless you fully understand the risks.
- Do not publish logs, exported configs, screenshots, or captures without checking for secrets.
- Follow school venue-booking rules and avoid high-frequency or abusive traffic.
