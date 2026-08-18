from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
from jose import jwt, JWTError
import bcrypt
from config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRES_HOURS, OTP_LENGTH


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


# ─── Login OTP helpers ───────────────────────────────────────────
def generate_otp(length: int = OTP_LENGTH) -> str:
    """Cryptographically secure numeric OTP as a zero-padded string."""
    return "".join(secrets.choice("0123456789") for _ in range(length))


def hash_otp(code: str) -> str:
    """Keyed hash of an OTP so plaintext codes are never stored."""
    return hmac.new(JWT_SECRET.encode("utf-8"), code.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_otp_hash(code: str, hashed: str) -> bool:
    """Constant-time comparison of a submitted code against the stored hash."""
    return hmac.compare_digest(hash_otp(code), hashed)


def mask_email(email: str) -> str:
    """Turn a@b.com into a***@b.com for display in the OTP screen."""
    try:
        local, domain = email.split("@", 1)
    except ValueError:
        return email
    if len(local) <= 2:
        masked = local[0] + "*"
    else:
        masked = local[0] + ("*" * (len(local) - 2)) + local[-1]
    return f"{masked}@{domain}"
