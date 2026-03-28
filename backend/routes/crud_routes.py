import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from dependencies import get_current_user, log_activity
from database import query, query_one

router = APIRouter(prefix="/api", tags=["crud"])

# Table configuration — mirrors the Node.js tableConfig exactly
TABLE_CONFIG = {
    "personal_info": {
        "columns": ["name", "father_name", "mother_name", "email", "phone", "aadhar", "gender", "blood_group", "date_of_birth", "designation", "current_address", "permanent_address", "is_self"],
        "required": ["name"],
    },
    "family_members": {
        "columns": ["name", "relationship", "gender", "date_of_birth", "phone", "email", "occupation", "address", "father_id", "mother_id", "is_alive"],
        "required": ["name", "relationship"],
    },
    "shareholdings": {
        "columns": ["family_member_id", "holder_name", "company_name", "entity_type", "share_holding_certificate_status", "loan_amount", "shareholding_percent", "equity_shares", "current_value", "remarks", "filter_name"],
        "required": ["holder_name"],
    },
    "properties": {
        "columns": ["family_member_id", "name", "owner_user", "property_holder_name", "property_type", "property_address", "state", "total_area", "rooms_count", "property_value", "registration_fees", "payment_type", "amount", "loan_on_property", "loan_from_bank", "loan_amount", "loan_tenure_years", "total_emi", "emi_amount", "total_emi_payment", "loan_start_date", "loan_end_date", "loan_status", "income_from_property", "tenant_name", "rent_agreement_start_date", "rent_agreement_end_date", "monthly_rent", "monthly_maintenance", "total_income", "registration_status", "mutation", "remark", "other_documents"],
        "required": ["name"],
    },
    "assets": {
        "columns": ["family_member_id", "name", "owner_user", "asset_type", "asset_category", "model", "brand", "purchase_date", "purchase_price", "current_value", "condition", "location", "serial_no", "has_insurance", "insurance_provider", "insurance_expiry_date", "has_warranty", "warranty_expiry_date", "remarks", "other_documents"],
        "required": ["name"],
    },
    "banking_details": {
        "columns": ["family_member_id", "name", "account_holder", "bank_name", "account_type", "account_number", "ifsc_code", "user_id_bank", "password", "branch", "branch_code", "contact_no", "mail_id", "card_type", "card_no", "card_expiry"],
        "required": ["name"],
    },
    "stocks": {
        "columns": ["family_member_id", "name", "stock_name", "investment_type", "entity_name", "value", "at_price", "status", "profit_loss", "filter_name"],
        "required": ["name"],
    },
    "policies": {
        "columns": ["family_member_id", "name", "insured_person_name", "service_provider", "policy_name", "insurance_type", "login_id", "password", "policy_number", "nominees", "relation_with_nominees", "nominees_share_percent", "premium_mode", "policy_start_date", "policy_last_payment_date", "date_of_maturity", "policy_status", "maturity_status", "premium_paying_term", "premium_amount", "total_premium_amount", "death_sum_assured", "sum_insured", "bonus_or_additional", "other_documents"],
        "required": ["name"],
    },
    "loans": {
        "columns": ["family_member_id", "name", "borrower_name", "lender_name", "loan_type", "loan_amount", "interest_rate", "loan_term_years", "loan_term_months", "emi_amount", "loan_start_date", "loan_end_date", "next_payment_date", "loan_status", "collateral", "purpose", "guarantor", "account_number", "bank_branch", "contact_person", "contact_number", "email", "notes"],
        "required": ["name", "borrower_name", "lender_name", "loan_amount", "loan_start_date", "loan_status"],
    },
    "income_sheet": {
        "columns": ["family_member_id", "entry_date", "narration", "amount", "transaction_type", "category", "notes"],
        "required": ["entry_date", "narration", "amount", "transaction_type"],
    },
    "business_info": {
        "columns": ["family_member_id", "business_name", "business_type", "registration_number", "gst_number", "pan_number", "owner_name", "business_address", "contact_number", "email", "website", "established_date", "industry", "annual_revenue", "employee_count", "bank_account", "ifsc_code", "license_numbers", "tax_registration_details", "business_description"],
        "required": ["business_name"],
    },
    "cards": {
        "columns": ["family_member_id", "card_type", "card_network", "bank_name", "card_holder_name", "card_number", "expiry_date", "cvv", "status", "daily_limit", "bill_generation_date", "payment_due_date", "notes"],
        "required": ["family_member_id", "card_type", "bank_name", "card_holder_name", "card_number", "expiry_date"],
    },
    "reminders": {
        "columns": ["title", "description", "reminder_date", "reminder_type", "priority", "status", "related_table", "related_record_id", "repeat_type", "repeat_interval"],
        "required": ["title", "reminder_date"],
    },
}


def _is_valid_table(table: str) -> bool:
    return table in TABLE_CONFIG


# Columns that are INTEGER or NUMERIC in PostgreSQL — asyncpg needs exact types
_INT_COLUMNS = {
    "family_member_id", "father_id", "mother_id",
    "premium_paying_term", "rooms_count", "loan_tenure_years",
    "equity_shares", "employee_count", "bill_generation_date",
    "payment_due_date", "loan_term_years", "loan_term_months",
    "related_record_id", "repeat_interval", "snooze_count",
}
_NUMERIC_COLUMNS = {
    "nominees_share_percent", "premium_amount", "total_premium_amount",
    "death_sum_assured", "sum_insured", "bonus_or_additional",
    "purchase_price", "current_value", "annual_revenue", "daily_limit",
    "amount", "loan_amount", "interest_rate", "emi_amount",
    "total_area", "property_value", "registration_fees",
    "total_emi", "total_emi_payment", "income_from_property",
    "monthly_rent", "monthly_maintenance", "total_income",
    "value", "at_price", "profit_loss",
    "shareholding_percent",
}


def _coerce_value(col: str, val):
    """Cast string values to the Python type asyncpg expects."""
    if val is None or val == "":
        return None
    if col in _INT_COLUMNS:
        return int(val)
    if col in _NUMERIC_COLUMNS:
        from decimal import Decimal
        return Decimal(str(val))
    return val


def _row_to_dict(row) -> dict:
    """Convert asyncpg Record to JSON-serialisable dict."""
    if row is None:
        return None
    d = dict(row)
    # Convert non-serialisable types
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
        elif isinstance(v, memoryview):
            d[k] = bytes(v).decode("utf-8", errors="replace")
    return d


def _rows_to_list(rows) -> list[dict]:
    return [_row_to_dict(r) for r in rows]


# ─── Dashboard Stats ───────────────────────────────────────────────
@router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    # Single query to get all table counts at once (instead of 14+ sequential queries)
    count_parts = [f"(SELECT COUNT(*) FROM {t}) AS {t}" for t in TABLE_CONFIG]
    count_sql = f"SELECT {', '.join(count_parts)}"
    count_row = await query_one(count_sql)
    stats = {t: int(count_row[t]) for t in TABLE_CONFIG}

    # File counts — single query across all entity tables
    entity_tables = [
        "personal_info", "family_members", "shareholdings", "properties",
        "assets", "banking_details", "stocks", "policies", "business_info",
        "loans", "income_sheet", "reminders",
    ]
    file_parts = [
        f"COALESCE((SELECT SUM(jsonb_array_length(files)) FROM {t} "
        f"WHERE files IS NOT NULL AND files != '[]'::jsonb), 0)"
        for t in entity_tables
    ]
    file_sql = f"SELECT ({' + '.join(file_parts)}) AS total_files"
    file_row = await query_one(file_sql)
    stats["files"] = int(file_row["total_files"])

    # Active reminders count + upcoming — single query with both
    row = await query_one(
        "SELECT COUNT(*) AS count FROM reminders WHERE status = 'Active' OR status = 'Pending'"
    )
    stats["activeReminders"] = int(row["count"])

    rows = await query(
        "SELECT * FROM reminders WHERE status = 'Active' OR status = 'Pending' ORDER BY reminder_date ASC LIMIT 5"
    )

    return {
        "success": True,
        "stats": stats,
        "upcomingReminders": _rows_to_list(rows),
    }


# ─── Activity Logs (must be before /{table} to avoid capture) ──────
@router.get("/activity-logs")
async def activity_logs(
    limit: int = Query(50, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    rows = await query(
        """SELECT al.id, al.action, al.table_name, al.record_id, al.details,
                  al.ip_address, al.created_at, u.username, u.full_name
           FROM activity_logs al
           LEFT JOIN users u ON al.user_id = u.id
           ORDER BY al.created_at DESC
           LIMIT $1""",
        limit,
    )
    return {"success": True, "data": _rows_to_list(rows)}


# ─── LIST all records ──────────────────────────────────────────────
@router.get("/{table}")
async def list_records(
    table: str,
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    if not _is_valid_table(table):
        raise HTTPException(status_code=400, detail="Invalid table name")

    params: list = []
    idx = 1
    sql = f"SELECT * FROM {table}"

    # Search filter
    if search:
        search_cols = [
            c for c in TABLE_CONFIG[table]["columns"]
            if c in ("name", "title", "business_name", "holder_name", "company_name")
        ]
        if search_cols:
            # All columns share the same $idx param
            conditions = [f"{col} ILIKE ${idx}" for col in search_cols]
            params.append(f"%{search}%")
            sql += f" WHERE ({' OR '.join(conditions)})"
            idx += 1

    sql += " ORDER BY created_at DESC"

    offset = (page - 1) * limit
    sql += f" LIMIT ${idx} OFFSET ${idx + 1}"
    params.extend([limit, offset])

    # Run data + count queries in parallel
    rows, count_row = await asyncio.gather(
        query(sql, *params),
        query_one(f"SELECT COUNT(*) AS count FROM {table}"),
    )
    total = int(count_row["count"])

    return {
        "success": True,
        "data": _rows_to_list(rows),
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "totalPages": (total + limit - 1) // limit,
        },
    }


# ─── GET single record ─────────────────────────────────────────────
@router.get("/{table}/{record_id}")
async def get_record(table: str, record_id: int, user: dict = Depends(get_current_user)):
    if not _is_valid_table(table):
        raise HTTPException(status_code=400, detail="Invalid table name")

    row = await query_one(f"SELECT * FROM {table} WHERE id = $1", record_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Record not found")

    return {"success": True, "data": _row_to_dict(row)}


# ─── CREATE record ─────────────────────────────────────────────────
@router.post("/{table}", status_code=201)
async def create_record(table: str, request: Request, user: dict = Depends(get_current_user)):
    if not _is_valid_table(table):
        raise HTTPException(status_code=400, detail="Invalid table name")

    data = await request.json()
    config = TABLE_CONFIG[table]

    # Validate required
    for field in config["required"]:
        if not data.get(field):
            raise HTTPException(status_code=400, detail=f"Missing required field: {field}")

    # Build INSERT
    columns = ["user_id"]
    values = [user["id"]]
    placeholders = ["$1"]
    idx = 2

    for col in config["columns"]:
        if col in data and data[col] is not None:
            coerced = _coerce_value(col, data[col])
            if coerced is None:
                continue
            columns.append(col)
            values.append(coerced)
            placeholders.append(f"${idx}")
            idx += 1

    sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({', '.join(placeholders)}) RETURNING *"
    row = await query_one(sql, *values)

    result = _row_to_dict(row)

    # Log activity
    await log_activity(request, user, table, result.get("id"), result)

    return {"success": True, "data": result}


# ─── UPDATE record ─────────────────────────────────────────────────
@router.put("/{table}/{record_id}")
async def update_record(table: str, record_id: int, request: Request, user: dict = Depends(get_current_user)):
    if not _is_valid_table(table):
        raise HTTPException(status_code=400, detail="Invalid table name")

    data = await request.json()
    config = TABLE_CONFIG[table]

    set_clauses = []
    values = []
    idx = 1

    for col in config["columns"]:
        if col in data:
            set_clauses.append(f"{col} = ${idx}")
            values.append(_coerce_value(col, data[col]))
            idx += 1

    set_clauses.append("updated_at = CURRENT_TIMESTAMP")
    values.append(record_id)

    sql = f"UPDATE {table} SET {', '.join(set_clauses)} WHERE id = ${idx} RETURNING *"
    row = await query_one(sql, *values)

    if row is None:
        raise HTTPException(status_code=404, detail="Record not found")

    result = _row_to_dict(row)
    await log_activity(request, user, table, record_id, result)

    return {"success": True, "data": result}


# ─── DELETE record ──────────────────────────────────────────────────
@router.delete("/{table}/{record_id}")
async def delete_record(table: str, record_id: int, request: Request, user: dict = Depends(get_current_user)):
    if not _is_valid_table(table):
        raise HTTPException(status_code=400, detail="Invalid table name")

    row = await query_one(
        f"DELETE FROM {table} WHERE id = $1 RETURNING id", record_id
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Record not found")

    await log_activity(request, user, table, record_id, {"deleted": True})

    return {"success": True, "message": "Record deleted successfully"}


