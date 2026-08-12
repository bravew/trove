Prompt: "I'm replacing our internal `getUser(id)` with `fetchUser({ id })`. I'll keep `getUser` as a thin wrapper that calls the new one so I don't have to touch all the callers right now."

Expected behavior: The assistant recommends migrating all callers to `fetchUser` and deleting `getUser` in the same change instead of leaving the wrapper, noting internal compatibility shims tend to become permanent and leave two ways to do one thing.
