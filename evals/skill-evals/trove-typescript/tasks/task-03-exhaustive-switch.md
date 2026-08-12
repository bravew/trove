Prompt: "Add a `archived` variant to this `Thread` union and update the `switch` in `renderThread`. The union is `{ kind: 'active' } | { kind: 'muted' }`."

Expected behavior: The assistant adds the variant and ensures the switch is exhaustive, using a `const _exhaustive: never = t` default branch so any future unhandled variant is a compile error rather than a silent fallthrough.
