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
