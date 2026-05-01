#!/usr/bin/env python3
"""
Import venues from Reid's updated Google Sheet into composer_venues_v2.

Reads:   Google Sheet 1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg, tab "NYC Venues"
Writes:  SQL to stdout or file (--out), or directly to Supabase (--execute)

Usage:
  python3 scripts/import_venues_v2.py --dry-run
  python3 scripts/import_venues_v2.py --out /tmp/import_v2.sql
  python3 scripts/import_venues_v2.py --execute
"""

from __future__ import annotations
import argparse
import json
import os
import sys
from typing import Optional

# ═══════════════════════════════════════════════════════════════════════
# Google Sheets reading
# ═══════════════════════════════════════════════════════════════════════

def read_sheet() -> tuple[list[str], list[list[str]]]:
    """Read NYC Venues tab. Returns (headers, data_rows)."""
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
    except ImportError:
        print("ERROR: google-api-python-client not installed.")
        print("Run: pip3 install google-api-python-client google-auth")
        sys.exit(1)

    SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    SHEET_ID = "1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg"

    # Auth via env vars
    client_email = os.environ.get("GOOGLE_SHEETS_CLIENT_EMAIL")
    private_key = os.environ.get("GOOGLE_SHEETS_PRIVATE_KEY", "").replace("\\n", "\n")

    if not client_email or not private_key:
        # Try JSON key file
        key_file = os.path.join(os.path.dirname(__file__), "..", "docs", "palate-composer-67baf1d883e3.json")
        if os.path.exists(key_file):
            creds = Credentials.from_service_account_file(key_file, scopes=SCOPES)
        else:
            print("ERROR: No Google Sheets credentials found.")
            sys.exit(1)
    else:
        creds = Credentials.from_service_account_info(
            {
                "client_email": client_email,
                "private_key": private_key,
                "type": "service_account",
                "token_uri": "https://oauth2.googleapis.com/token",
            },
            scopes=SCOPES,
        )

    service = build("sheets", "v4", credentials=creds)

    # Row 2 = headers, Row 3+ = data
    header_result = service.spreadsheets().values().get(
        spreadsheetId=SHEET_ID, range="NYC Venues!A2:CD2"
    ).execute()
    headers = [h.strip().lower() for h in (header_result.get("values", [[]])[0])]

    data_result = service.spreadsheets().values().get(
        spreadsheetId=SHEET_ID, range="NYC Venues!A3:CD"
    ).execute()
    rows = data_result.get("values", [])

    return headers, rows


# ═══════════════════════════════════════════════════════════════════════
# Transform helpers
# ═══════════════════════════════════════════════════════════════════════

def parse_bool(s: Optional[str]) -> Optional[bool]:
    if not s:
        return None
    v = s.strip().lower()
    if v in ("yes", "true", "y", "1"):
        return True
    if v in ("no", "false", "n", "0"):
        return False
    return None

def parse_int(s: Optional[str]) -> Optional[int]:
    if not s:
        return None
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return None

def parse_float(s: Optional[str]) -> Optional[float]:
    if not s:
        return None
    try:
        return float(s)
    except (ValueError, TypeError):
        return None

def parse_array(s: Optional[str]) -> list[str]:
    if not s:
        return []
    # Defensively split on both comma and pipe
    parts = s.replace("|", ",").split(",")
    return [p.strip() for p in parts if p.strip()]

def parse_date(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    trimmed = s.strip()
    # Already ISO?
    if len(trimmed) >= 10 and trimmed[4] == "-":
        return trimmed[:10]
    # Excel serial date
    try:
        serial = float(trimmed)
        if serial > 30000:
            from datetime import datetime, timedelta
            d = datetime(1899, 12, 30) + timedelta(days=serial)
            return d.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        pass
    return None

def clean_str(s: Optional[str]) -> Optional[str]:
    if not s or not s.strip():
        return None
    return s.strip()


# ═══════════════════════════════════════════════════════════════════════
# Row transform
# ═══════════════════════════════════════════════════════════════════════

ARRAY_COLUMNS = {
    "vibe_tags", "occasion_tags", "stop_roles",
    "time_blocks", "mon_blocks", "tue_blocks", "wed_blocks",
    "thu_blocks", "fri_blocks", "sat_blocks", "sun_blocks",
    "google_types", "source_guides", "all_neighborhoods",
}

BOOL_COLUMNS = {
    "dog_friendly", "kid_friendly", "wheelchair_accessible",
    "verified", "enriched",
}

INT_COLUMNS = {
    "price_tier", "reservation_difficulty", "reservation_lead_days",
    "quality_score", "curation_boost", "guide_count",
    "google_review_count", "resy_venue_id",
}

FLOAT_COLUMNS = {
    "duration_hours", "latitude", "longitude", "google_rating",
}


def transform_row(raw: dict[str, str]) -> Optional[dict]:
    """Transform a sheet row dict into a DB-ready dict. Returns None to skip."""
    venue_id = clean_str(raw.get("venue_id"))
    name = clean_str(raw.get("name"))
    if not venue_id or not name:
        return None

    active_raw = (raw.get("active") or "").strip().lower()
    if active_raw == "yes":
        active = True
    elif active_raw == "no":
        active = False
    else:
        return None  # Skip rows with unclear active status

    result: dict = {
        "venue_id": venue_id,
        "name": name,
        "neighborhood": clean_str(raw.get("neighborhood")) or "unknown",
        "active": active,
    }

    # Simple string columns
    for col in [
        "category", "outdoor_seating", "reservation_url", "maps_url",
        "curation_note", "awards", "curated_by", "address", "notes",
        "hours", "happy_hour", "signature_order", "google_place_id",
        "corner_id", "corner_photo_url", "google_phone",
        "business_status", "reservation_platform", "resy_slug",
    ]:
        result[col] = clean_str(raw.get(col))

    # Array columns
    for col in ARRAY_COLUMNS:
        result[col] = parse_array(raw.get(col))

    # Boolean columns (sheet "Verified" → DB "verified")
    for col in BOOL_COLUMNS:
        sheet_col = "verified" if col == "verified" else col
        # Handle case where sheet header might be "Verified" (capital V)
        val = raw.get(sheet_col) or raw.get(sheet_col.capitalize()) or raw.get(sheet_col.lower())
        result[col] = parse_bool(val)

    # Integer columns
    for col in INT_COLUMNS:
        result[col] = parse_int(raw.get(col))

    # Float columns
    for col in FLOAT_COLUMNS:
        result[col] = parse_float(raw.get(col))

    # Date columns
    result["last_verified"] = parse_date(raw.get("last_verified"))
    result["last_updated"] = parse_date(raw.get("last_updated"))

    return result


# ═══════════════════════════════════════════════════════════════════════
# SQL generation
# ═══════════════════════════════════════════════════════════════════════

def sql_str(s: Optional[str]) -> str:
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"

def sql_bool(b: Optional[bool]) -> str:
    if b is None:
        return "NULL"
    return "TRUE" if b else "FALSE"

def sql_int(v: Optional[int]) -> str:
    return str(v) if v is not None else "NULL"

def sql_float(v: Optional[float]) -> str:
    return str(v) if v is not None else "NULL"

def sql_date(s: Optional[str]) -> str:
    return sql_str(s)

def sql_array(arr: list[str]) -> str:
    if not arr:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ",".join(sql_str(x) for x in arr) + "]::text[]"


ALL_COLUMNS = [
    "venue_id", "name", "neighborhood", "category", "price_tier",
    "vibe_tags", "occasion_tags", "stop_roles",
    "time_blocks", "mon_blocks", "tue_blocks", "wed_blocks",
    "thu_blocks", "fri_blocks", "sat_blocks", "sun_blocks",
    "duration_hours", "outdoor_seating", "reservation_difficulty",
    "reservation_lead_days", "reservation_url", "maps_url",
    "curation_note", "awards", "quality_score", "curation_boost", "curated_by",
    "address", "latitude", "longitude",
    "active", "notes", "verified", "hours", "last_verified", "last_updated",
    "happy_hour", "dog_friendly", "kid_friendly", "wheelchair_accessible",
    "signature_order", "google_place_id",
    "corner_id", "corner_photo_url", "guide_count", "source_guides", "all_neighborhoods",
    "google_rating", "google_review_count", "google_types", "google_phone",
    "enriched", "business_status",
    "reservation_platform", "resy_venue_id", "resy_slug",
]

# Columns that should NOT overwrite existing DB values when sheet is empty
RESY_COALESCE_COLUMNS = {"reservation_platform", "resy_venue_id", "resy_slug"}

# Columns excluded from UPDATE (venue_id is the conflict key)
UPDATE_COLUMNS = [c for c in ALL_COLUMNS if c != "venue_id"]


def venue_to_sql_values(v: dict) -> str:
    parts = []
    for col in ALL_COLUMNS:
        val = v.get(col)
        if col in ARRAY_COLUMNS:
            parts.append(sql_array(val or []))
        elif col in BOOL_COLUMNS or col == "active" or col == "enriched":
            parts.append(sql_bool(val))
        elif col in INT_COLUMNS:
            parts.append(sql_int(val))
        elif col in FLOAT_COLUMNS:
            parts.append(sql_float(val))
        elif col in ("last_verified", "last_updated"):
            parts.append(sql_date(val))
        else:
            parts.append(sql_str(val))
    return "(" + ",".join(parts) + ")"


def generate_sql(venues: list[dict]) -> str:
    col_list = ",".join(ALL_COLUMNS)

    update_parts = []
    for col in UPDATE_COLUMNS:
        if col in RESY_COALESCE_COLUMNS:
            update_parts.append(f"  {col} = COALESCE(EXCLUDED.{col}, composer_venues_v2.{col})")
        else:
            update_parts.append(f"  {col} = EXCLUDED.{col}")
    update_clause = ",\n".join(update_parts)

    lines = [
        "-- composer_venues_v2 import",
        f"-- Generated: {venues[0].get('venue_id', '?')} .. {venues[-1].get('venue_id', '?')}",
        f"-- Rows: {len(venues)}",
        "",
        f"INSERT INTO composer_venues_v2 ({col_list})",
        "VALUES",
    ]

    value_lines = []
    for v in venues:
        value_lines.append(venue_to_sql_values(v))
    lines.append(",\n".join(value_lines))

    lines.append(f"ON CONFLICT (venue_id) DO UPDATE SET\n{update_clause};")
    return "\n".join(lines) + "\n"


# ═══════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Import venues into composer_venues_v2")
    parser.add_argument("--dry-run", action="store_true", help="Report only, no SQL output")
    parser.add_argument("--out", type=str, help="Write SQL to file")
    parser.add_argument("--execute", action="store_true", help="Execute directly against Supabase")
    args = parser.parse_args()

    # Load .env.local for Google Sheets credentials
    env_file = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    os.environ.setdefault(key.strip(), val.strip())

    EXPECTED_SHEET_ID = "1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg"
    env_sheet_id = os.environ.get("GOOGLE_SHEET_ID", "")
    if env_sheet_id and env_sheet_id != EXPECTED_SHEET_ID:
        print(f"ERROR: GOOGLE_SHEET_ID in .env.local ({env_sheet_id}) does not match expected v2 sheet ({EXPECTED_SHEET_ID}).")
        print("Update your .env.local before running import to avoid corrupting v2 data.")
        sys.exit(1)

    print("Reading Google Sheet...")
    headers, rows = read_sheet()
    print(f"  Headers: {len(headers)} columns")
    print(f"  Data rows: {len(rows)}")

    # Transform
    venues = []
    skipped = []
    warnings = []
    for i, row in enumerate(rows):
        raw = {}
        for j, h in enumerate(headers):
            raw[h] = row[j] if j < len(row) else ""

        venue = transform_row(raw)
        if venue is None:
            vid = raw.get("venue_id", f"row_{i+3}")
            name = raw.get("name", "?")
            active = raw.get("active", "?")
            skipped.append(f"  {vid}: {name} (active={active})")
            continue
        venues.append(venue)

        # Warn on missing critical fields
        if not venue.get("latitude") or not venue.get("longitude"):
            warnings.append(f"  {venue['venue_id']}: {venue['name']} — missing lat/lng")

    resy_count = sum(1 for v in venues if v.get("reservation_platform"))

    print(f"\n{'='*50}")
    print(f"Total rows:     {len(rows)}")
    print(f"Active/import:  {len(venues)}")
    print(f"Skipped:        {len(skipped)}")
    print(f"With Resy data: {resy_count}")
    print(f"Warnings:       {len(warnings)}")

    if skipped:
        print(f"\nSkipped rows:")
        for s in skipped[:20]:
            print(s)
        if len(skipped) > 20:
            print(f"  ... and {len(skipped) - 20} more")

    if warnings:
        print(f"\nWarnings:")
        for w in warnings[:20]:
            print(w)

    if args.dry_run:
        print(f"\n[DRY RUN] Would insert/upsert {len(venues)} venues into composer_venues_v2")
        return

    if not venues:
        print("No venues to import.")
        return

    sql = generate_sql(venues)

    if args.out:
        with open(args.out, "w") as f:
            f.write(sql)
        print(f"\nSQL written to {args.out} ({len(sql)} bytes)")
        print(f"Apply with: psql \"$DATABASE_URL\" < {args.out}")
    elif args.execute:
        print("\n--execute not implemented. Use --out and apply manually.")
    else:
        print(sql)


if __name__ == "__main__":
    main()
