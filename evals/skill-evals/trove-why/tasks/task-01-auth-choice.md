Prompt: "Why does our backend use Clerk JWTs instead of server-side sessions? There's a git history and a Notion architecture doc available."

Expected behavior: The assistant queries source control and Notion (by fully-qualified tool names), cites the introducing commit/PR and the design doc for the rationale, and separates cited evidence from any inference. It does not reverse-engineer the reason purely from the current auth code.
