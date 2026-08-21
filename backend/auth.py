from datetime import datetime, timedelta, timezone
import base64
import io
from jose import jwt, JWTError
import bcrypt
import pyotp
import segno
from config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRES_HOURS, TOTP_ISSUER


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(10)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_token(user_id: int, username: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRES_HOURS)
    payload = {
        "userId": user_id,
        "username": username,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None


# ─── Authenticator-app (TOTP) 2FA helpers ────────────────────────
def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, account: str) -> str:
    """otpauth:// URI to encode in the QR the user scans into their app."""
    return pyotp.TOTP(secret).provisioning_uri(name=account, issuer_name=TOTP_ISSUER)


def verify_totp(secret: str, code: str) -> bool:
    """Verify a 6-digit code, allowing ±1 time-step for clock drift."""
    if not secret or not code:
        return False
    return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)


def qr_svg_data_uri(data: str) -> str:
    """Render `data` as an inline SVG QR (no image libraries, self-contained)."""
    buf = io.BytesIO()
    segno.make(data, error="m").save(buf, kind="svg", scale=5, border=2)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/svg+xml;base64,{b64}"


def create_2fa_token(user_id: int) -> str:
    """Short-lived token proving the password step passed, pending TOTP."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=5)
    return jwt.encode(
        {"userId": user_id, "purpose": "2fa", "exp": expire},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def decode_2fa_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None
    if payload.get("purpose") != "2fa":
        return None
    return payload.get("userId")
