from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import (
    hash_password,
    verify_password,
    create_token,
    generate_totp_secret,
    totp_provisioning_uri,
    verify_totp,
    qr_svg_data_uri,
    create_2fa_token,
    decode_2fa_token,
)
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
        "SELECT id, username, email, password_hash, full_name, role, is_active, totp_enabled FROM users WHERE username = $1",
        body.username,
    )
    if row is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not row["is_active"]:
        raise HTTPException(status_code=403, detail="Account is disabled")

    if not row["password_hash"] or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # 2FA gate — password OK, but require an authenticator code before the JWT.
    if row["totp_enabled"]:
        return {"twoFARequired": True, "twoFAToken": create_2fa_token(row["id"])}

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


# ─── Authenticator-app (TOTP) two-factor ─────────────────────────
class TwoFAVerifyRequest(BaseModel):
    twoFAToken: str
    code: str


class TwoFACodeRequest(BaseModel):
    code: str


@router.post("/2fa/verify")
async def totp_verify(body: TwoFAVerifyRequest):
    """Step 2 of login: verify the authenticator code, then issue the JWT."""
    uid = decode_2fa_token(body.twoFAToken)
    if uid is None:
        raise HTTPException(status_code=401, detail="2FA session expired — please log in again")
    row = await query_one(
        "SELECT id, username, email, full_name, role, is_active, totp_secret, totp_enabled FROM users WHERE id = $1",
        uid,
    )
    if row is None or not row["totp_enabled"] or not row["totp_secret"]:
        raise HTTPException(status_code=401, detail="Two-factor is not set up")
    if not row["is_active"]:
        raise HTTPException(status_code=403, detail="Account is disabled")
    if not verify_totp(row["totp_secret"], body.code):
        raise HTTPException(status_code=401, detail="Invalid code")
    token = create_token(row["id"], row["username"], row["role"])
    return {
        "success": True,
        "token": token,
        "user": {
            "id": row["id"], "username": row["username"], "email": row["email"],
            "fullName": row["full_name"], "role": row["role"],
        },
    }


@router.get("/2fa/status")
async def totp_status(user: dict = Depends(get_current_user)):
    row = await query_one("SELECT totp_enabled FROM users WHERE id = $1", user["id"])
    return {"enabled": bool(row and row["totp_enabled"])}


@router.post("/2fa/setup")
async def totp_setup(user: dict = Depends(get_current_user)):
    """Return the enrollment secret + QR (not active until confirmed). Reuses an
    existing un-confirmed secret so re-opening the dialog shows the SAME QR
    (otherwise a re-scan would be needed each time)."""
    row = await query_one("SELECT email, totp_secret, totp_enabled FROM users WHERE id = $1", user["id"])
    if row and row["totp_enabled"]:
        raise HTTPException(status_code=400, detail="2FA is already enabled — disable it first to re-enroll")
    secret = row["totp_secret"] if (row and row["totp_secret"]) else generate_totp_secret()
    if not (row and row["totp_secret"]):
        await execute("UPDATE users SET totp_secret = $1 WHERE id = $2", secret, user["id"])
    account = row["email"] if row and row["email"] else user["username"]
    uri = totp_provisioning_uri(secret, account)
    return {"secret": secret, "otpauthUri": uri, "qrSvg": qr_svg_data_uri(uri)}


@router.post("/2fa/enable")
async def totp_enable(body: TwoFACodeRequest, user: dict = Depends(get_current_user)):
    row = await query_one("SELECT totp_secret, totp_enabled FROM users WHERE id = $1", user["id"])
    if not row or not row["totp_secret"]:
        raise HTTPException(status_code=400, detail="Start setup first")
    if row["totp_enabled"]:
        return {"success": True, "message": "Already enabled"}
    if not verify_totp(row["totp_secret"], body.code):
        raise HTTPException(status_code=401, detail="Invalid code — check your authenticator app")
    await execute("UPDATE users SET totp_enabled = TRUE WHERE id = $1", user["id"])
    return {"success": True, "message": "Two-factor authentication enabled"}


@router.post("/2fa/disable")
async def totp_disable(body: TwoFACodeRequest, user: dict = Depends(get_current_user)):
    row = await query_one("SELECT totp_secret, totp_enabled FROM users WHERE id = $1", user["id"])
    if not row or not row["totp_enabled"]:
        return {"success": True, "message": "2FA is not enabled"}
    if not verify_totp(row["totp_secret"], body.code):
        raise HTTPException(status_code=401, detail="Invalid code")
    await execute("UPDATE users SET totp_secret = NULL, totp_enabled = FALSE WHERE id = $1", user["id"])
    return {"success": True, "message": "Two-factor authentication disabled"}


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
