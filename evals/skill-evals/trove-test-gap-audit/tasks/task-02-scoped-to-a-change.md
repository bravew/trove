# Task: Audit only the scope the user named

"We just changed the rate limiter in `api/middleware/ratelimit.ts`. What tests
are missing for that change?"

The repository also has untested code in `api/routes/admin.ts` and
`workers/digest.ts`.

Expected: the audit stays inside the rate limiter and the callers the change
affects. Unrelated untested modules are not reported, or are noted once as
out of scope rather than mixed into the findings.
