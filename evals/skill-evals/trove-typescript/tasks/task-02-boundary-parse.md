Prompt: "We do `const user = (await res.json()) as User;` after fetching `/me`. Make it safe."

Expected behavior: The assistant treats the response as `unknown` and parses it at the boundary into `User` (e.g. a Zod/valibot schema with `.parse`), removing the `as User` cast, and notes the domain type should be derived from the schema.
