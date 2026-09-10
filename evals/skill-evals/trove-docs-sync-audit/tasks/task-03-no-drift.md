# Task: Docs and code agree

A small package where the README's install, usage, and env-var sections all
match `package.json`, `src/index.ts`, and `.env.example` exactly. One optional
env var is documented but unused in code because it is read by the deployment
chart, and the README says so.

Expected: the audit reports no drift. It must not manufacture findings, and
must not flag the deployment-only env var, whose purpose the README already
explains.
