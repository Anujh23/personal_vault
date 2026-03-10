import json
import base64
import time
import random
import string
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from dependencies import get_current_user
from database import query_one, execute

router = APIRouter(prefix="/files", tags=["files"])

VALID_TABLES = [
    "personal_info", "family_members", "shareholdings", "properties",
    "assets", "banking_details", "stocks", "policies", "business_info",
    "loans", "income_sheet", "reminders", "cards",
]


def _is_valid_table(table: str) -> bool:
    return table in VALID_TABLES


def _parse_files(raw) -> list:
    """Safely parse the files JSONB column."""
    if raw is None:
        return []
    if isinstance(raw, str):
        return json.loads(raw)
    if isinstance(raw, list):
        return raw
    # asyncpg returns JSONB as Python objects already
    return list(raw) if raw else []


def _generate_file_id() -> str:
    ts = int(time.time() * 1000)
    rand = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"{ts:x}{rand}"


# ─── Get files for a record ────────────────────────────────────────
@router.get("/record/{table}/{record_id}")
async def get_record_files(table: str, record_id: int, user: dict = Depends(get_current_user)):
    if not _is_valid_table(table):
        raise HTTPException(status_code=400, detail="Invalid table name")

    row = await query_one(f"SELECT files FROM {table} WHERE id = $1", record_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Record not found")

    files = _parse_files(row["files"])

    files_metadata = [
        {
            "id": f.get("id"),
            "file_name": f.get("name") or f.get("file_name"),
            "file_type": f.get("type") or f.get("file_type"),
            "file_size": f.get("size") or f.get("file_size"),
            "uploaded_at": f.get("uploaded_at"),
        }
        for f in files
    ]

    return {"files": files_metadata}


# ─── Upload file ────────────────────────────────────────────────────
@router.post("/upload/{table}/{record_id}")
async def upload_file(table: str, record_id: int, request: Request, user: dict = Depends(get_current_user)):
    if not _is_valid_table(table):
        raise HTTPException(status_code=400, detail="Invalid table name")

    row = await query_one(f"SELECT id, files FROM {table} WHERE id = $1", record_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Record not found")

    body = await request.json()
    name = body.get("name")
    data = body.get("data")

    if not name or not data:
        raise HTTPException(status_code=400, detail="File name and data are required")

    file_id = _generate_file_id()
    file_type = body.get("type", "application/octet-stream")
    file_size = body.get("size", 0)

    from datetime import datetime, timezone
    new_file = {
        "id": file_id,
        "name": name,
        "type": file_type,
        "size": file_size,
        "data": data,  # base64 encoded
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }

    current_files = _parse_files(row["files"])
    current_files.append(new_file)

    await execute(
        f"UPDATE {table} SET files = $1::jsonb WHERE id = $2",
        json.dumps(current_files),
        record_id,
    )

    return {
        "success": True,
        "message": "File uploaded successfully",
        "file": {"id": file_id, "name": name, "type": file_type, "size": file_size},
    }


# ─── Download file ──────────────────────────────────────────────────
@router.get("/download/{table}/{record_id}/{file_id}")
async def download_file(table: str, record_id: int, file_id: str, user: dict = Depends(get_current_user)):
    if not _is_valid_table(table):
        raise HTTPException(status_code=400, detail="Invalid table name")

    row = await query_one(f"SELECT files FROM {table} WHERE id = $1", record_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Record not found")

    files = _parse_files(row["files"])
    file_obj = next((f for f in files if f.get("id") == file_id), None)
    if file_obj is None:
        raise HTTPException(status_code=404, detail="File not found")

    file_data = base64.b64decode(file_obj["data"])
    file_name = file_obj.get("name") or file_obj.get("file_name", "download")
    content_type = file_obj.get("type", "application/octet-stream")

    return Response(
        content=file_data,
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{file_name}"',
            "Content-Length": str(len(file_data)),
        },
    )


# ─── Delete file ────────────────────────────────────────────────────
@router.delete("/{table}/{record_id}/{file_id}")
async def delete_file(table: str, record_id: int, file_id: str, user: dict = Depends(get_current_user)):
    if not _is_valid_table(table):
        raise HTTPException(status_code=400, detail="Invalid table name")

    row = await query_one(f"SELECT files FROM {table} WHERE id = $1", record_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Record not found")

    files = _parse_files(row["files"])
    new_files = [f for f in files if str(f.get("id")) != str(file_id)]

    if len(new_files) == len(files):
        raise HTTPException(status_code=404, detail="File not found")

    await execute(
        f"UPDATE {table} SET files = $1::jsonb WHERE id = $2",
        json.dumps(new_files),
        record_id,
    )

    return {"success": True, "message": "File deleted successfully"}


# ─── Get all files across all tables ────────────────────────────────
@router.get("/all")
async def get_all_files(user: dict = Depends(get_current_user)):
    from database import query as db_query

    all_files = []
    for table in VALID_TABLES:
        try:
            rows = await db_query(
                f"SELECT id, files FROM {table} WHERE files IS NOT NULL AND files != '[]'"
            )
            for row in rows:
                files = _parse_files(row["files"])
                for f in files:
                    all_files.append({
                        **f,
                        "table": table,
                        "record_id": str(row["id"]),
                        "name": f.get("name") or f.get("file_name"),
                        "type": f.get("type") or f.get("file_type"),
                        "size": f.get("size") or f.get("file_size"),
                    })
        except Exception:
            pass

    return {"files": all_files}
