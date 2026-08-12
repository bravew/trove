# Task: Security review of authentication endpoint

Review the following code for security vulnerabilities:

```python
import hashlib
from fastapi import APIRouter, Response

router = APIRouter()

@router.post("/auth/login")
async def login(username: str, password: str, response: Response, db: AsyncSession):
    password_hash = hashlib.md5(password.encode()).hexdigest()
    user = await db.execute(
        text(f"SELECT * FROM users WHERE username='{username}' AND password_hash='{password_hash}'")
    )
    user = user.first()
    if user:
        response.set_cookie("session", user.id, httponly=False)
        return {"message": "Login successful", "token": user.api_key}
    return {"message": "Invalid credentials"}

@router.get("/auth/reset-password")
async def reset_password(email: str, db: AsyncSession):
    user = await db.execute(select(User).where(User.email == email))
    user = user.scalar_one_or_none()
    if user:
        new_password = str(user.id) + "reset2024"
        user.password_hash = hashlib.md5(new_password.encode()).hexdigest()
        await db.commit()
        return {"new_password": new_password}
    return {"message": "If account exists, password has been reset"}
```

Conduct a thorough security review identifying all vulnerabilities.
