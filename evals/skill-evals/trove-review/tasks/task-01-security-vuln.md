# Task: Review code with SQL injection vulnerability

Review the following Python code for issues:

```python
from fastapi import APIRouter, Query

router = APIRouter()

@router.get("/users/search")
async def search_users(db: AsyncSession, name: str = Query(...)):
    query = f"SELECT * FROM users WHERE name LIKE '%{name}%'"
    result = await db.execute(text(query))
    return result.fetchall()

@router.post("/users/{user_id}/update")
async def update_user(user_id: int, data: dict, db: AsyncSession):
    user = await db.get(User, user_id)
    for key, value in data.items():
        setattr(user, key, value)
    await db.commit()
    return {"status": "updated"}
```

Provide a thorough code review.
