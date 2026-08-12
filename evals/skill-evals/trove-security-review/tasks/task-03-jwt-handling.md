# Task: JWT handling review

Review this JWT verification middleware:

```ts
const token = req.headers.authorization
const payload = jwt.decode(token)
req.user = payload
next()
```

List every issue (signature verification, algorithm pinning, expiry check, etc.) with severity and the specific fix.
