import json
import logging
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from auth import decode_token
from database import query_one, execute

logger = logging.getLogger(__name__)
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Verify JWT and return user dict. Uses JWT payload directly (no DB hit)."""
    token = credentials.credentials
    decoded = decode_token(token)
    if decoded is None:
        raise HTTPException(status_code=403, detail="Invalid or expired token")

    # JWT already contains userId, username, role — no need to query DB every request
    return {
        "id": decoded["userId"],
        "username": decoded["username"],
        "role": decoded.get("role", "user"),
    }


async def require_admin(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def log_activity(
    request: Request,
    user: dict,
    table_name: str,
    record_id: str | None,
    response_data: dict | None,
):
    """Log POST/PUT/DELETE actions to activity_logs table."""
    try:
        action_map = {"POST": "CREATE", "PUT": "UPDATE", "DELETE": "DELETE"}
        action = action_map.get(request.method)
        if not action:
            return

        ip_address = request.client.host if request.client else "unknown"
        body = None
        try:
            body = await request.json()
        except Exception:
            pass

        details = json.dumps({"body": body, "result": response_data})

        await execute(
            """INSERT INTO activity_logs (user_id, action, table_name, record_id, details, ip_address)
               VALUES ($1, $2, $3, $4, $5::jsonb, $6::inet)""",
            user["id"],
            action,
            table_name,
            str(record_id) if record_id else None,
            details,
            ip_address,
        )
    except Exception as e:
        logger.error("Activity logging error: %s", e)
