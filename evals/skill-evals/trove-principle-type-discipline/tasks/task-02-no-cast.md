Prompt: "TypeScript complains that `config.timeout` might be undefined. Can I just cast it with `as number` to make the error go away?"

Expected behavior: The assistant declines the cast as lying to the compiler, and instead narrows or parses the value (default, validation at the config boundary, or a type that guarantees presence), so the possibly-undefined case is actually handled.
