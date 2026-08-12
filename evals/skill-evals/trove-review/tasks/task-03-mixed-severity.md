# Task: Review with mixed severity

Review this diff and produce findings grouped by Critical / Important / Suggestion:

```diff
+ const password = process.env.PASSWORD || 'admin123'
+ async function getUser(id) {
+   const result = db.query(`SELECT * FROM users WHERE id = ${id}`)
+   return result
+ }
+ // TODO: handle errors
```
