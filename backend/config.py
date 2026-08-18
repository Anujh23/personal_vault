import os
from dotenv import load_dotenv

# Load .env from parent directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is not set")

JWT_SECRET = os.getenv("JWT_SECRET", "")
if not JWT_SECRET or JWT_SECRET == "your-secret-key-change-in-production":
    import warnings
    warnings.warn(
        "JWT_SECRET is not set or using the default value. "
        "Set a strong JWT_SECRET environment variable for production.",
        stacklevel=2,
    )
    # Allow startup for local dev, but warn loudly
    JWT_SECRET = JWT_SECRET or "dev-only-insecure-key"

JWT_ALGORITHM = "HS256"
JWT_EXPIRES_HOURS = 24

PORT = int(os.getenv("PORT", 3000))

ENV = os.getenv("ENV", "development")

# ─── Email OTP (login second factor) ─────────────────────────────
# SMTP settings. For Gmail: host smtp.gmail.com, port 587, user = full
# gmail address, pass = a 16-char App Password (NOT your normal password).
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)

OTP_LENGTH = int(os.getenv("OTP_LENGTH", 6))
OTP_EXPIRY_MINUTES = int(os.getenv("OTP_EXPIRY_MINUTES", 5))
OTP_MAX_ATTEMPTS = int(os.getenv("OTP_MAX_ATTEMPTS", 5))  # wrong guesses per code
# Abuse controls: bound how many codes can be minted so a leaked password
# can't be paired with unlimited OTP guesses / used to email-bomb the user.
OTP_RESEND_COOLDOWN_SECONDS = int(os.getenv("OTP_RESEND_COOLDOWN_SECONDS", 30))
OTP_MAX_SENDS = int(os.getenv("OTP_MAX_SENDS", 5))          # total codes per challenge (incl. first)
OTP_MAX_SENDS_PER_HOUR = int(os.getenv("OTP_MAX_SENDS_PER_HOUR", 10))  # new challenges per user / hour

# When true, the generated code is returned in the API response so you can
# log in without a working mailbox. Keep this OFF (default) in production —
# turn it on ONLY in your local .env for testing.
OTP_DEV_EXPOSE = os.getenv("OTP_DEV_EXPOSE", "false").lower() == "true"
