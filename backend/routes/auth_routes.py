import logging
import math
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import (
    hash_password,
    verify_password,
    create_token,
    generate_otp,
    hash_otp,
    verify_otp_hash,
    mask_email,
)
from config import (
    OTP_LENGTH,
    OTP_EXPIRY_MINUTES,
    OTP_MAX_ATTEMPTS,
    OTP_DEV_EXPOSE,
    OTP_RESEND_COOLDOWN_SECONDS,
    OTP_MAX_SENDS,
    OTP_MAX_SENDS_PER_HOUR,
)
from database import query_one, query, execute
from dependencies import get_current_user, require_admin
from email_service import send_otp_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class VerifyOtpRequest(BaseModel):
    challenge: str
    otp: str


class ResendOtpRequest(BaseModel):
    challenge: str


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    fullName: str | None = None
    role: str = "user"


class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: str


async def _deliver_code(email: str, code: str) -> bool:
    """Email the code. Returns True if actually sent. Raises HTTPException(503)
    on a hard failure so the caller can surface it instead of stranding the user."""
    try:
        emailed = await send_otp_email(email, code, OTP_EXPIRY_MINUTES)
    except Exception as e:
        logger.error("OTP email send failed: %s", e)
        raise HTTPException(status_code=503, detail="Couldn't send the login code, please try again")

    # Not emailed AND not exposed to the client = code is undeliverable. Fail
    # loudly rather than returning a challenge the user can never complete.
    if not emailed and not OTP_DEV_EXPOSE:
        raise HTTPException(
            status_code=503,
            detail="Login codes can't be sent right now — email isn't configured",
        )
    return emailed


async def _issue_otp(user_id: int, email: str) -> dict:
    """Generate a fresh OTP for the user, store its hash, email it, and return
    the challenge payload the client needs for the verify step."""
    # Age out old rows, then bound how many codes this user can mint per hour so
    # a leaked password can't be paired with unlimited fresh codes to brute-force.
    await execute(
        "DELETE FROM login_otps WHERE user_id = $1 AND created_at < now() - interval '1 hour'",
        user_id,
    )
    recent = await query_one(
        "SELECT COUNT(*) AS c FROM login_otps WHERE user_id = $1 AND created_at > now() - interval '1 hour'",
        user_id,
    )
    if int(recent["c"]) >= OTP_MAX_SENDS_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many login attempts, please try again later")

    code = generate_otp(OTP_LENGTH)
    challenge = secrets.token_urlsafe(24)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)

    await execute(
        """INSERT INTO login_otps (id, user_id, code_hash, expires_at)
           VALUES ($1, $2, $3, $4)""",
        challenge,
        user_id,
        hash_otp(code),
        expires_at,
    )

    try:
        emailed = await _deliver_code(email, code)
    except HTTPException:
        # Don't leave an orphan row (it would also count against the hourly cap).
        await execute("DELETE FROM login_otps WHERE id = $1", challenge)
        raise

    payload = {
        "otpRequired": True,
        "challenge": challenge,
        "email": mask_email(email),
        "expiresInSeconds": OTP_EXPIRY_MINUTES * 60,
    }
    # Local-testing escape hatch — only when explicitly enabled AND no mail sent.
    if OTP_DEV_EXPOSE and not emailed:
        payload["devOtp"] = code
    return payload


@router.post("/login")
async def login(body: LoginRequest):
    """Step 1: verify username + password, then email a one-time code.

    No JWT is issued here — the client must complete /auth/verify-otp.
    """
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

    if not row["email"]:
        raise HTTPException(
            status_code=400,
            detail="No email on file for this account; cannot send a login code",
        )

    return await _issue_otp(row["id"], row["email"])


@router.post("/verify-otp")
async def verify_otp(body: VerifyOtpRequest):
    """Step 2: verify the emailed code and issue the JWT."""
    if not body.challenge or not body.otp:
        raise HTTPException(status_code=400, detail="Challenge and code required")

    row = await query_one(
        """SELECT o.id, o.user_id, o.code_hash, o.expires_at, o.attempts, o.consumed,
                  u.username, u.email, u.full_name, u.role, u.is_active
           FROM login_otps o
           JOIN users u ON u.id = o.user_id
           WHERE o.id = $1""",
        body.challenge,
    )
    # 410 Gone = this challenge is dead, client should restart login.
    # 401 = retryable wrong code (challenge still alive).
    if row is None or row["consumed"]:
        raise HTTPException(status_code=410, detail="This code is no longer valid, please log in again")

    if not row["is_active"]:
        raise HTTPException(status_code=403, detail="Account is disabled")

    now = datetime.now(timezone.utc)
    if row["expires_at"] < now:
        await execute("UPDATE login_otps SET consumed = TRUE WHERE id = $1", body.challenge)
        raise HTTPException(status_code=410, detail="Code has expired, please log in again")

    if row["attempts"] >= OTP_MAX_ATTEMPTS:
        await execute("UPDATE login_otps SET consumed = TRUE WHERE id = $1", body.challenge)
        raise HTTPException(status_code=429, detail="Too many attempts, please log in again")

    if not verify_otp_hash(body.otp, row["code_hash"]):
        # Authoritative, race-safe increment; burn the code once the cap is hit.
        bumped = await query_one(
            "UPDATE login_otps SET attempts = attempts + 1 WHERE id = $1 AND NOT consumed RETURNING attempts",
            body.challenge,
        )
        if bumped and bumped["attempts"] >= OTP_MAX_ATTEMPTS:
            await execute("UPDATE login_otps SET consumed = TRUE WHERE id = $1", body.challenge)
            raise HTTPException(status_code=429, detail="Too many attempts, please log in again")
        raise HTTPException(status_code=401, detail="Invalid code")

    # Success — atomically burn the code so a concurrent/replayed request can't reuse it.
    claimed = await query_one(
        "UPDATE login_otps SET consumed = TRUE WHERE id = $1 AND NOT consumed RETURNING id",
        body.challenge,
    )
    if claimed is None:
        raise HTTPException(status_code=410, detail="This code is no longer valid, please log in again")

    token = create_token(row["user_id"], row["username"], row["role"])

    return {
        "success": True,
        "token": token,
        "user": {
            "id": row["user_id"],
            "username": row["username"],
            "email": row["email"],
            "fullName": row["full_name"],
            "role": row["role"],
        },
    }


@router.post("/resend-otp")
async def resend_otp(body: ResendOtpRequest):
    """Issue a fresh code for an in-progress login (same challenge session)."""
    if not body.challenge:
        raise HTTPException(status_code=400, detail="Challenge required")

    row = await query_one(
        """SELECT o.id, o.consumed, o.expires_at, o.sends, o.last_sent_at,
                  u.email, u.is_active
           FROM login_otps o
           JOIN users u ON u.id = o.user_id
           WHERE o.id = $1""",
        body.challenge,
    )
    if row is None or row["consumed"]:
        raise HTTPException(status_code=410, detail="Session expired, please log in again")

    if not row["is_active"]:
        raise HTTPException(status_code=403, detail="Account is disabled")

    now = datetime.now(timezone.utc)

    # Don't revive an expired challenge — force a fresh login.
    if row["expires_at"] < now:
        await execute("UPDATE login_otps SET consumed = TRUE WHERE id = $1", body.challenge)
        raise HTTPException(status_code=410, detail="Session expired, please log in again")

    # Hard cap on codes per challenge (throttles brute-force + email bombing).
    if row["sends"] >= OTP_MAX_SENDS:
        raise HTTPException(status_code=429, detail="Too many codes requested, please log in again")

    # Cooldown between resends.
    elapsed = (now - row["last_sent_at"]).total_seconds()
    if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
        wait = int(math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed))
        raise HTTPException(status_code=429, detail=f"Please wait {wait}s before requesting another code")

    code = generate_otp(OTP_LENGTH)
    expires_at = now + timedelta(minutes=OTP_EXPIRY_MINUTES)
    await execute(
        """UPDATE login_otps
           SET code_hash = $1, expires_at = $2, attempts = 0,
               sends = sends + 1, last_sent_at = now()
           WHERE id = $3""",
        hash_otp(code),
        expires_at,
        body.challenge,
    )

    emailed = await _deliver_code(row["email"], code)

    payload = {
        "success": True,
        "email": mask_email(row["email"]),
        "expiresInSeconds": OTP_EXPIRY_MINUTES * 60,
    }
    if OTP_DEV_EXPOSE and not emailed:
        payload["devOtp"] = code
    return payload


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
