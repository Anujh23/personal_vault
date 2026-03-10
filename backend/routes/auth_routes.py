from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import hash_password, verify_password, create_token
from database import query_one, query, execute
from dependencies import get_current_user, require_admin

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    fullName: str | None = None
    role: str = "user"


class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str


@router.post("/login")
async def login(body: LoginRequest):
    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="Username and password required")

    row = await query_one(
        "SELECT id, username, email, password_hash, full_name, role, is_active FROM users WHERE username = $1",
        body.username,
    )
    if row is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not row["is_active"]:
        raise HTTPException(status_code=403, detail="Account is disabled")

    if not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(row["id"], row["username"], row["role"])

    return {
        "success": True,
        "token": token,
        "user": {
            "id": row["id"],
            "username": row["username"],
            "email": row["email"],
            "fullName": row["full_name"],
            "role": row["role"],
        },
    }


@router.post("/register")
async def register(body: RegisterRequest, user: dict = Depends(require_admin)):
    if not body.username or not body.email or not body.password:
        raise HTTPException(status_code=400, detail="Username, email, and password required")

    if body.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Invalid role")

    existing = await query_one(
        "SELECT id FROM users WHERE username = $1 OR email = $2",
        body.username,
        body.email,
    )
    if existing:
        raise HTTPException(status_code=409, detail="Username or email already exists")

    password_hash = hash_password(body.password)

    row = await query_one(
        """INSERT INTO users (username, email, password_hash, full_name, role)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, username, email, full_name, role, created_at""",
        body.username,
        body.email,
        password_hash,
        body.fullName,
        body.role,
    )

    return {
        "success": True,
        "user": {
            "id": row["id"],
            "username": row["username"],
            "email": row["email"],
            "fullName": row["full_name"],
            "role": row["role"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
        },
    }


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    # Fetch full user details from DB for /me endpoint
    row = await query_one(
        "SELECT id, username, email, role, full_name FROM users WHERE id = $1",
        user["id"],
    )
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "user": {
            "id": row["id"],
            "username": row["username"],
            "email": row["email"],
            "role": row["role"],
        }
    }


@router.put("/change-password")
async def change_password(body: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    if not body.currentPassword or not body.newPassword:
        raise HTTPException(status_code=400, detail="Current and new password required")

    if len(body.newPassword) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")

    row = await query_one(
        "SELECT password_hash FROM users WHERE id = $1",
        user["id"],
    )

    if not verify_password(body.currentPassword, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    new_hash = hash_password(body.newPassword)
    await execute(
        "UPDATE users SET password_hash = $1 WHERE id = $2",
        new_hash,
        user["id"],
    )

    return {"success": True, "message": "Password changed successfully"}
