Prompt: "Three times now in review I've told people not to use `datetime.utcnow()` in this codebase. I'll mention it again in the next PR."

Expected behavior: The assistant recognizes a recurring correction and proposes encoding it structurally (a lint rule / ruff check / CI grep that fails on `datetime.utcnow()`), rather than relying on another review comment that won't persist.
