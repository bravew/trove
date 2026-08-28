---
name: trove-docker
description: "Dockerfile and Docker Compose best practices. Auto-activates on Docker files."
paths:
  - "**/Dockerfile*"
  - "**/docker-compose*.yml"
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

# Docker Conventions

## Dockerfile Best Practices

```dockerfile
# Use specific version tags, not :latest
FROM python:3.13-slim AS base

# Set working directory early
WORKDIR /app

# Copy dependency files first (cache layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code last (changes most often)
COPY . .

# Run as non-root user
RUN adduser --disabled-password --gecos '' appuser
USER appuser

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Multi-Stage Builds

Use multi-stage builds to reduce image size:

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
```

## AI Gotchas

- **Layer caching**: Order instructions from least to most frequently changing
- **COPY vs ADD**: Use `COPY` unless you need URL download or tar extraction
- **HEALTHCHECK**: Always include for production images
- **.dockerignore**: Exclude `node_modules`, `.git`, `.env`, test files
