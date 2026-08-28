---
name: trove-python
description: "Python/FastAPI coding conventions and best practices. Auto-activates when working with Python files. Covers async patterns, type hints, SQLAlchemy, Pydantic, logging, and error handling."
paths:
  - "**/*.py"
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

# Python / FastAPI Conventions

## Imports

- **Top-level imports only** — never inline imports inside functions
- Organization: stdlib → third-party → local (isort-compatible)
- Use `from __future__ import annotations` when needed for forward refs

## Type Hints

- All function signatures must have type hints (params + return)
- Use `from typing import` for complex types (`Optional`, `Union`, etc.)
- Pydantic models for all request/response schemas
- Prefer `X | None` over `Optional[X]` (Python 3.10+)

## Async Patterns (CRITICAL)

Never call blocking I/O in async functions:

```python
# BAD — blocks the event loop
async def get_user(user_id: str):
    response = requests.get(f"/users/{user_id}")  # BLOCKING!
    time.sleep(1)  # BLOCKING!

# GOOD — non-blocking
async def get_user(user_id: str):
    async with httpx.AsyncClient() as client:
        response = await client.get(f"/users/{user_id}")
    await asyncio.sleep(1)
```

- Use `httpx.AsyncClient` for HTTP (not `requests`)
- Use `asyncio.sleep` for delays (not `time.sleep`)
- Use `async with` for context managers (DB sessions, HTTP clients)

## Logging

```python
# INFO/DEBUG — f-strings are fine (fast path, no Sentry indexing needed)
logger.info(f"Processing user {user_id}")

# WARNING/ERROR — static message + extra dict (enables Sentry grouping)
logger.warning("Payment failed", extra={"user_id": user_id, "amount": amount})

# EXCEPTION — use in except blocks (auto-captures stack trace)
try:
    await process()
except Exception:
    logger.exception("Processing failed", extra={"user_id": user_id})
```

Never use `sentry_sdk.capture_exception()` — use `logger.exception()` instead.

## SQLAlchemy Async

```python
# Always use async session context manager
async with get_async_session() as session:
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

# Eager loading to avoid N+1
stmt = select(User).options(selectinload(User.posts)).where(User.id == user_id)
```

## Error Handling

- Use specific exception types, not bare `except:`
- FastAPI: raise `HTTPException` with appropriate status codes
- Service layer: raise domain-specific exceptions
- Never silently swallow exceptions

## Pydantic Models

```python
class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: str | None = None
    created_at: datetime
```

## AI Gotchas

- **httpx vs requests**: Always use `httpx.AsyncClient` in async code
- **datetime**: Use `datetime.now(tz=UTC)` not `datetime.utcnow()` (deprecated)
- **Pydantic v2**: Use `model_config = ConfigDict(...)` not `class Config:`
- **SQLAlchemy 2.0**: Use `select()` not `session.query()`
