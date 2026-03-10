import json
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from dependencies import get_current_user
from database import query, query_one, execute

router = APIRouter(prefix="/api/reminders", tags=["reminders"])


def _row_to_dict(row) -> dict | None:
    if row is None:
        return None
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
        elif isinstance(v, memoryview):
            d[k] = bytes(v).decode("utf-8", errors="replace")
    return d


def _rows_to_list(rows) -> list[dict]:
    return [_row_to_dict(r) for r in rows]


# ─── Get all reminders ─────────────────────────────────────────────
@router.get("/")
async def get_reminders(user: dict = Depends(get_current_user)):
    rows = await query(
        """SELECT r.*,
                  COALESCE(json_agg(json_build_object(
                      'id', rf.id,
                      'filename', rf.filename,
                      'original_name', rf.original_name,
                      'file_size', rf.file_size,
                      'mime_type', rf.mime_type,
                      'uploaded_at', rf.uploaded_at
                  )) FILTER (WHERE rf.id IS NOT NULL), '[]') as files
           FROM reminders r
           LEFT JOIN reminder_files rf ON r.id = rf.reminder_id
           GROUP BY r.id
           ORDER BY r.reminder_date ASC"""
    )
    return {"data": _rows_to_list(rows)}


# ─── Create reminder ───────────────────────────────────────────────
@router.post("/", status_code=201)
async def create_reminder(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()

    title = body.get("title")
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    row = await query_one(
        """INSERT INTO reminders (
               user_id, title, description, reminder_date, reminder_type,
               priority, status, related_table, related_record_id,
               repeat_type, repeat_interval
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING *""",
        user["id"],
        title,
        body.get("description"),
        body.get("reminder_date"),
        body.get("reminder_type", "General"),
        body.get("priority", "Medium"),
        body.get("status", "Pending"),
        body.get("related_table"),
        body.get("related_record_id"),
        body.get("repeat_type", "None"),
        body.get("repeat_interval"),
    )

    return {"success": True, "data": _row_to_dict(row)}


# ─── Update reminder ───────────────────────────────────────────────
@router.put("/{reminder_id}")
async def update_reminder(reminder_id: str, request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()

    row = await query_one(
        """UPDATE reminders
           SET title = $2,
               description = $3,
               reminder_date = $4,
               reminder_type = $5,
               priority = $6,
               status = $7,
               related_table = $8,
               related_record_id = $9,
               repeat_type = $10,
               repeat_interval = $11,
               updated_at = NOW()
           WHERE id = $1
           RETURNING *""",
        reminder_id,
        body.get("title"),
        body.get("description"),
        body.get("reminder_date"),
        body.get("reminder_type", "General"),
        body.get("priority", "Medium"),
        body.get("status", "Pending"),
        body.get("related_table"),
        body.get("related_record_id"),
        body.get("repeat_type", "None"),
        body.get("repeat_interval"),
    )

    if row is None:
        raise HTTPException(status_code=404, detail="Reminder not found")

    return {"success": True, "data": _row_to_dict(row)}


# ─── Delete reminder ───────────────────────────────────────────────
@router.delete("/{reminder_id}")
async def delete_reminder(reminder_id: str, user: dict = Depends(get_current_user)):
    # Delete associated files first
    await execute("DELETE FROM reminder_files WHERE reminder_id = $1", reminder_id)

    row = await query_one(
        "DELETE FROM reminders WHERE id = $1 RETURNING id",
        reminder_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Reminder not found")

    return {"success": True, "message": "Reminder deleted successfully"}


# ─── Get due reminders ─────────────────────────────────────────────
@router.get("/due")
async def get_due_reminders(user: dict = Depends(get_current_user)):
    now = datetime.utcnow()

    rows = await query(
        """SELECT r.*,
                  COALESCE(json_agg(json_build_object(
                      'id', rf.id,
                      'filename', rf.filename,
                      'original_name', rf.original_name,
                      'file_size', rf.file_size,
                      'mime_type', rf.mime_type,
                      'uploaded_at', rf.uploaded_at
                  )) FILTER (WHERE rf.id IS NOT NULL), '[]') as files
           FROM reminders r
           LEFT JOIN reminder_files rf ON r.id = rf.reminder_id
           WHERE (r.status = 'Active' OR r.status = 'Pending')
           AND r.reminder_date <= $1
           AND (
               r.notification_sent = false
               OR r.notification_sent IS NULL
               OR (r.snooze_until IS NOT NULL AND r.snooze_until <= $1)
           )
           GROUP BY r.id
           ORDER BY r.reminder_date ASC""",
        now,
    )

    return _rows_to_list(rows)


# ─── Mark reminder as completed ────────────────────────────────────
@router.post("/{reminder_id}/complete")
async def complete_reminder(reminder_id: str, user: dict = Depends(get_current_user)):
    row = await query_one(
        """UPDATE reminders
           SET status = 'Completed',
               notification_sent = true,
               updated_at = NOW()
           WHERE id = $1
           RETURNING *""",
        reminder_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Reminder not found")

    return {
        "success": True,
        "reminder": _row_to_dict(row),
        "message": "Reminder marked as completed",
    }


# ─── Mark reminder as notified ─────────────────────────────────────
@router.post("/{reminder_id}/notified")
async def notified_reminder(reminder_id: str, user: dict = Depends(get_current_user)):
    row = await query_one(
        """UPDATE reminders
           SET notification_sent = true,
               updated_at = NOW()
           WHERE id = $1
           RETURNING *""",
        reminder_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Reminder not found")

    return _row_to_dict(row)


# ─── Snooze reminder ───────────────────────────────────────────────
@router.post("/{reminder_id}/snooze")
async def snooze_reminder(reminder_id: str, request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    minutes = body.get("minutes", 5)

    snooze_until = datetime.utcnow() + timedelta(minutes=minutes)

    row = await query_one(
        """UPDATE reminders
           SET snooze_count = snooze_count + 1,
               snooze_until = $2,
               notification_sent = false,
               updated_at = NOW()
           WHERE id = $1
           RETURNING *""",
        reminder_id,
        snooze_until,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Reminder not found")

    return {
        "success": True,
        "reminder": _row_to_dict(row),
        "message": f"Reminder snoozed for {minutes} minutes",
    }


# ─── Schedule reminder ─────────────────────────────────────────────
@router.post("/{reminder_id}/schedule")
async def schedule_reminder(reminder_id: str, request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    reminder_date = body.get("reminder_date")

    if not reminder_date:
        raise HTTPException(status_code=400, detail="reminder_date is required")

    row = await query_one(
        """UPDATE reminders
           SET reminder_date = $2,
               notification_sent = false,
               snooze_until = NULL,
               updated_at = NOW()
           WHERE id = $1
           RETURNING *""",
        reminder_id,
        reminder_date,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Reminder not found")

    return {
        "success": True,
        "reminder": _row_to_dict(row),
        "message": f"Reminder scheduled for {reminder_date}",
    }


# ─── Reminder file operations ──────────────────────────────────────
@router.get("/{reminder_id}/files")
async def get_reminder_files(reminder_id: str, user: dict = Depends(get_current_user)):
    rows = await query(
        """SELECT id, filename, original_name, file_size, mime_type, uploaded_at
           FROM reminder_files
           WHERE reminder_id = $1
           ORDER BY uploaded_at DESC""",
        reminder_id,
    )
    return _rows_to_list(rows)


@router.delete("/files/{file_id}")
async def delete_reminder_file(file_id: str, user: dict = Depends(get_current_user)):
    row = await query_one(
        """SELECT rf.*
           FROM reminder_files rf
           JOIN reminders r ON rf.reminder_id = r.id
           WHERE rf.id = $1""",
        file_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="File not found")

    await execute("DELETE FROM reminder_files WHERE id = $1", file_id)

    return {"success": True, "message": "File deleted successfully"}
