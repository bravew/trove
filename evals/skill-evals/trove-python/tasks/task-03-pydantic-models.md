# Task: Design Pydantic v2 request/response models

Create Pydantic models for a user profile API:
1. `UserCreateRequest` — name (required), email (required, validated), bio (optional, max 500 chars)
2. `UserResponse` — includes id, created_at, all fields from create request
3. `UserListResponse` — paginated list with total count, page, page_size, items
4. Use Pydantic v2 patterns (model_config, field_validator, ConfigDict)
5. Add example values for OpenAPI documentation
