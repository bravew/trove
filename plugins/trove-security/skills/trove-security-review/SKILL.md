---
name: trove-security-review
description: "Security review skill that checks code for common vulnerabilities. Covers OWASP Top 10, secret detection, and secure coding patterns."
when_to_use: "security review; owasp check; vulnerability audit"
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

# Security Review Guidelines

## OWASP Top 10 Checklist

### 1. Injection (SQL, NoSQL, Command)
- All queries use parameterized statements
- User input is never concatenated into queries/commands
- ORM methods are preferred over raw queries

### 2. Broken Authentication
- Passwords hashed with bcrypt/argon2 (not MD5/SHA1)
- Session tokens are cryptographically random
- Failed login attempts are rate-limited

### 3. Sensitive Data Exposure
- Secrets stored in env vars / secret managers (never in code)
- PII is encrypted at rest
- HTTPS enforced for all endpoints

### 4. Broken Access Control
- Authorization checked on every endpoint
- Users can only access their own resources
- Admin endpoints have explicit role checks

### 5. Security Misconfiguration
- CORS origins are explicitly listed (not `*`)
- Debug mode is disabled in production
- Default credentials are changed

## Secret Detection Patterns

Flag any occurrences of:
- API keys, tokens, passwords in source code
- `.env` files committed to git
- Hardcoded connection strings with credentials
- Private keys or certificates in repos

For systematic secret detection across the whole tree, hand off to
**`trove-secret-scan`** — it's this skill's `benefits-from` for that
specific reason. Use it as a delegated, bounded sub-agent (input:
"scan everything under `src/` for secret patterns"; expected output:
file:line + pattern type or "clean"). See
[docs/orchestration.md](../../docs/orchestration.md) for delegation
phrasing.

## Output Format

```markdown
## Security Review

### 🔴 Critical Vulnerabilities
- [file:line] [CWE-XXX] Description and fix

### 🟡 Security Warnings
- [file:line] Description and recommendation

### ✅ Security Positives
- Good practices observed
```
