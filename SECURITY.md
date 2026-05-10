# Security Policy

## Supported Versions

Security fixes are considered for the latest public release line.

| Version | Supported |
| --- | --- |
| `0.2.x` | Yes |
| `< 0.2.0` | No |

## Reporting a Vulnerability

Please do not post secrets, filled portfolio content, private file paths, customer data, or access tokens in public issues.

If GitHub offers private vulnerability reporting on this repository, use that route. Otherwise, open a public issue with the minimum safe reproduction and omit sensitive details. The maintainer can then coordinate a safer follow-up path if needed.

## Local Data Boundary

This project is intended to run locally through Claude Desktop's extension runtime. The MCP server does not require a hosted backend for memory storage.

Filled personal context portfolios are user data. Keep them out of public Git history and out of security reports unless a minimal synthetic fixture can reproduce the issue.
