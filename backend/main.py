import sys
import os
import asyncio
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

# Add backend dir to path so imports work
sys.path.insert(0, os.path.dirname(__file__))

from config import PORT
from database import init_pool, close_pool, query_one

from routes.auth_routes import router as auth_router
from routes.crud_routes import router as crud_router
from routes.file_routes import router as file_router
from routes.reminder_routes import router as reminder_router


# ─── Structured JSON Logging ─────────────────────────────────────
class JSONFormatter(logging.Formatter):
    """Outputs each log record as a single JSON line."""

    def format(self, record):
        log = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0]:
            log["exception"] = self.formatException(record.exc_info)
        # Attach extra fields (request_id, method, path, etc.)
        for key in ("request_id", "method", "path", "status", "duration_ms", "ip"):
            val = getattr(record, key, None)
            if val is not None:
                log[key] = val
        return json.dumps(log, default=str)


LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

root_logger = logging.getLogger()
root_logger.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
# Remove default handlers
for h in root_logger.handlers[:]:
    root_logger.removeHandler(h)

handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
root_logger.addHandler(handler)

logger = logging.getLogger("app")


# ─── DB keep-alive ────────────────────────────────────────────────
_keep_alive_task = None


async def _db_keep_alive():
    """Ping DB every hour to keep connection fresh."""
    while True:
        await asyncio.sleep(3600)
        try:
            await query_one("SELECT 1 AS ping")
            logger.info("DB keep-alive OK")
        except Exception as e:
            logger.error("DB keep-alive failed: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    global _keep_alive_task
    _keep_alive_task = asyncio.create_task(_db_keep_alive())
    logger.info("Server started on port %d", PORT)
    yield
    if _keep_alive_task:
        _keep_alive_task.cancel()
    await close_pool()
    logger.info("Server shut down")


# ─── Static file paths ───────────────────────────────────────────
_BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FRONTEND_DIR = os.path.join(_BASE, "frontend")
SRC_DIR = os.path.join(_BASE, "src")
ASSETS_DIR = os.path.join(_BASE, "assets")

app = FastAPI(title="Personal Vault API", lifespan=lifespan)


# ─── CORS ─────────────────────────────────────────────────────────
_frontend_url = os.getenv("FRONTEND_URL", "")
_allowed_origins = [_frontend_url] if _frontend_url else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ─── Security headers middleware ──────────────────────────────────
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # HSTS — only add when behind HTTPS (Render terminates TLS)
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# ─── Request logging middleware ───────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    if request.url.path == "/health":
        return await call_next(request)

    request_id = str(uuid.uuid4())[:8]
    start = time.time()
    response = await call_next(request)
    duration_ms = round((time.time() - start) * 1000, 1)

    logger.info(
        "%s %s %s %sms",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": duration_ms,
            "ip": request.client.host if request.client else "unknown",
        },
    )
    response.headers["X-Request-Id"] = request_id
    return response


# ─── Health check (verifies DB) ──────────────────────────────────
@app.get("/health")
async def health():
    try:
        row = await query_one("SELECT 1 AS ok")
        db_ok = row is not None
    except Exception:
        db_ok = False

    status = "healthy" if db_ok else "degraded"
    code = 200 if db_ok else 503
    return JSONResponse(
        status_code=code,
        content={
            "status": status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "database": "connected" if db_ok else "unreachable",
        },
    )


# ─── SPA fallback ────────────────────────────────────────────────
@app.get("/")
async def serve_index():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path, media_type="text/html")
    return JSONResponse({"message": "Personal Vault API is running"})


# ─── API routes ───────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(reminder_router)
app.include_router(file_router)
app.include_router(crud_router)


# ─── Static file routes ──────────────────────────────────────────
import mimetypes

mimetypes.init()


def _safe_path(base_dir: str, user_path: str) -> str | None:
    """Resolve path and ensure it stays within base_dir (prevent traversal)."""
    full = os.path.normpath(os.path.join(base_dir, user_path))
    if not full.startswith(os.path.normpath(base_dir)):
        return None
    if not os.path.isfile(full):
        return None
    return full


@app.get("/css/{file_path:path}")
async def serve_css(file_path: str):
    full = _safe_path(os.path.join(FRONTEND_DIR, "css"), file_path)
    if full:
        mt = mimetypes.guess_type(full)[0] or "application/octet-stream"
        return FileResponse(full, media_type=mt)
    raise HTTPException(status_code=404, detail="Not found")


@app.get("/js/{file_path:path}")
async def serve_js(file_path: str):
    full = _safe_path(os.path.join(FRONTEND_DIR, "js"), file_path)
    if full:
        mt = mimetypes.guess_type(full)[0] or "application/octet-stream"
        return FileResponse(full, media_type=mt)
    raise HTTPException(status_code=404, detail="Not found")


@app.get("/src/{file_path:path}")
async def serve_src(file_path: str):
    full = _safe_path(SRC_DIR, file_path)
    if full:
        mt = mimetypes.guess_type(full)[0] or "application/octet-stream"
        return FileResponse(full, media_type=mt)
    raise HTTPException(status_code=404, detail="Not found")


@app.get("/assets/{file_path:path}")
async def serve_assets(file_path: str):
    full = _safe_path(ASSETS_DIR, file_path)
    if full:
        mt = mimetypes.guess_type(full)[0] or "application/octet-stream"
        return FileResponse(full, media_type=mt)
    raise HTTPException(status_code=404, detail="Not found")


# ─── Global error handler ────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_id = str(uuid.uuid4())[:8]
    logger.error(
        "Unhandled error [%s]: %s",
        error_id,
        exc,
        exc_info=True,
        extra={"request_id": error_id, "path": request.url.path},
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "error_id": error_id,
        },
    )


# ─── Entry point ─────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    is_dev = os.getenv("ENV", "development") == "development"
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=PORT,
        reload=is_dev,
    )
