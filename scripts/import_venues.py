#!/usr/bin/env python3
"""
Import Composer venues from a curated Google Sheet (exported as xlsx).

Reads:   docs/composer_venue_sheet_curated.xlsx (first sheet)
Writes:  SQL to stdout by default, or a file if --out is given.

The script is a DUMB PASSTHROUGH. The Google Sheet has dropdown validation
on every constrained column — that's the enforcement layer. This script:
  1. Reads each row from the Venues sheet
  2. Parses values (strings, ints, floats, booleans)
  3. Splits comma-separated fields into Postgres arrays
  4. Emits an INSERT ... ON CONFLICT DO UPDATE statement

No canonical sets, no taxonomy validation, no mapping/normalization.
If a new tag appears in the sheet, it passes straight through to the DB.

Idempotent. Re-running upserts via the unique index (LOWER(name), neighborhood).

Usage:
  python3 scripts/import_venues.py --dry-run
  python3 scripts/import_venues.py --out /tmp/import.sql
  python3 scripts/import_venues.py > /tmp/import.sql
"""

from __future__ import annotations
import argparse
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from typing import Optional

# ═══════════════════════════════════════════════════════════════════════
# Paths
# ═══════════════════════════════════════════════════════════════════════

ROOT = Path(__file__).resolve().parent.parent
XLSX_PATH = ROOT / "docs" / "composer_venue_sheet_curated.xlsx"

# ═══════════════════════════════════════════════════════════════════════
# xlsx parser (stdlib only — no openpyxl required)
# ═══════════════════════════════════════════════════════════════════════

NS = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

def _col_num(ref: str) -> int:
    m = re.match(r"([A-Z]+)", ref or "")
    if not m:
        return 0
    s = m.group(1)
    n = 0
    for c in s:
        n = n * 26 + (ord(c) - 64)
    return n

def parse_xlsx(path: Path) -> list[list[str]]:
    """Return rows as a list of dense lists of strings (empty = empty)."""
    with zipfile.ZipFile(path) as z:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            with z.open("xl/sharedStrings.xml") as f:
                tree = ET.parse(f)
                for si in tree.getroot().findall("main:si", NS):
                    shared.append("".join(
                        t.text or "" for t in si.iter(
                            "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"
                        )
                    ))
        sheet_paths = sorted(n for n in z.namelist() if n.startswith("xl/worksheets/sheet"))
        # First sheet = Venues
        rows: list[list[str]] = []
        with z.open(sheet_paths[0]) as f:
            tree = ET.parse(f).getroot()
        for row in tree.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row"):
            cells: list[tuple[int, str]] = []
            for c in row.findall("main:c", NS):
                ref = c.get("r") or ""
                t = c.get("t")
                v = c.find("main:v", NS)
                inline = c.find("main:is", NS)
                if t == "s" and v is not None:
                    idx = int(v.text) if v.text and v.text.lstrip("-").isdigit() else -1
                    val = shared[idx] if 0 <= idx < len(shared) else ""
                elif t == "inlineStr" and inline is not None:
                    val = "".join(
                        x.text or "" for x in inline.iter(
                            "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"
                        )
                    )
                elif v is not None:
                    val = v.text or ""
                else:
                    val = ""
                cells.append((_col_num(ref), val))
            if not cells:
                continue
            maxc = max(c for c, _ in cells)
            dense = [""] * maxc
            for c, v in cells:
                dense[c - 1] = v
            rows.append(dense)
        return rows

# ═══════════════════════════════════════════════════════════════════════
# Parse helpers
# ═══════════════════════════════════════════════════════════════════════

def split_tags(raw: str) -> list[str]:
    """Split a comma/semicolon-separated cell and trim each token."""
    if not raw:
        return []
    return [t.strip() for t in re.split(r"[,;]", raw) if t.strip()]

def split_roles(raw: str) -> list[str]:
    """Split on pipe, comma, or semicolon — covers all common formats."""
    if not raw:
        return []
    return [t.strip().lower() for t in re.split(r"[|,;]", raw) if t.strip()]

def parse_bool(raw: str) -> Optional[bool]:
    v = (raw or "").strip().lower()
    if v in ("yes", "true", "1"):
        return True
    if v in ("no", "false", "0"):
        return False
    return None

def parse_int(raw: str) -> Optional[int]:
    try:
        return int(str(raw).strip())
    except (ValueError, TypeError):
        return None

def parse_float(raw: str) -> Optional[float]:
    try:
        return float(str(raw).strip())
    except (ValueError, TypeError):
        return None

def parse_date(raw: str) -> Optional[str]:
    """Parse a date value — handles both ISO strings and Excel serial numbers."""
    s = (raw or "").strip()
    if not s:
        return None
    # Already an ISO date string (YYYY-MM-DD)?
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s
    # Excel serial number (days since 1899-12-30)?
    try:
        from datetime import datetime, timedelta
        serial = float(s)
        dt = datetime(1899, 12, 30) + timedelta(days=serial)
        return dt.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return None

def trim(raw: str) -> str:
    return (raw or "").strip()

# ═══════════════════════════════════════════════════════════════════════
# Per-row processing — dumb passthrough, no validation
# ═══════════════════════════════════════════════════════════════════════

def process_venue(
    raw: dict,
    stats: Counter,
    errors: list[str],
) -> Optional[dict]:
    name = trim(raw.get("name", ""))
    if not name:
        return None  # empty row

    neighborhood = trim(raw.get("neighborhood", "")).lower()
    if not neighborhood:
        errors.append(f"{name}: missing neighborhood — skipped")
        stats["skipped_no_neighborhood"] += 1
        return None

    # Coords are structurally required — geo functions crash on None.
    lat = parse_float(raw.get("latitude", ""))
    lng = parse_float(raw.get("longitude", ""))
    if lat is None or lng is None:
        errors.append(f"{name}: missing coords — skipped")
        stats["skipped_no_coords"] += 1
        return None

    # outdoor_seating — pass through as text, normalize casing only
    os_raw = trim(raw.get("outdoor_seating", "")).lower()
    outdoor_seating: Optional[str] = os_raw if os_raw else None

    stats["parsed"] += 1

    return {
        "name": name,
        "neighborhood": neighborhood,
        "category": trim(raw.get("category", "")).lower() or None,
        "price_tier": parse_int(raw.get("price_tier", "")),
        "vibe_tags": split_tags(raw.get("vibe_tags", "")),
        "occasion_tags": split_tags(raw.get("occasion_tags", "")),
        "stop_roles": split_roles(raw.get("stop_roles", "")),
        "duration_hours": parse_int(raw.get("duration_hours", "")),
        "outdoor_seating": outdoor_seating,
        "reservation_difficulty": parse_int(raw.get("reservation_difficulty", "")),
        "reservation_url": trim(raw.get("reservation_url", "")) or None,
        "maps_url": trim(raw.get("maps_url", "")) or None,
        "curation_note": trim(raw.get("curation_note", "")),
        "awards": trim(raw.get("awards", "")) or None,
        "curated_by": trim(raw.get("curated_by", "")).lower() or None,
        "signature_order": trim(raw.get("signature_order", "")) or None,
        "address": trim(raw.get("address", "")) or None,
        "latitude": lat,
        "longitude": lng,
        "active": parse_bool(raw.get("active", "")) if raw.get("active", "").strip() else True,
        "notes": trim(raw.get("notes", "")) or None,
        "hours": trim(raw.get("hours", "")) or None,
        "last_verified": parse_date(raw.get("last_verified", "")),
        "happy_hour": trim(raw.get("happy_hour", "")) or None,
        "dog_friendly": parse_bool(raw.get("dog_friendly", "")),
        "kid_friendly": parse_bool(raw.get("kid_friendly", "")),
        "wheelchair_accessible": parse_bool(raw.get("wheelchair_accessible", "")),
        "cash_only": parse_bool(raw.get("cash_only", "")),
        "quality_score": parse_int(raw.get("quality_score", "")) or 7,
        "curation_boost": parse_int(raw.get("curation_boost", "")) or 0,
    }

# ═══════════════════════════════════════════════════════════════════════
# SQL emission
# ═══════════════════════════════════════════════════════════════════════

def sql_str(s: Optional[str]) -> str:
    if s is None or s == "":
        return "NULL"
    return "'" + s.replace("'", "''") + "'"

def sql_text_array(arr: Optional[list[str]]) -> str:
    if not arr:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ",".join(sql_str(x) for x in arr) + "]::text[]"

def sql_int(v: Optional[int]) -> str:
    return str(v) if v is not None else "NULL"

def sql_float(v: Optional[float]) -> str:
    return repr(v) if v is not None else "NULL"

def sql_bool(v: Optional[bool]) -> str:
    if v is True:
        return "true"
    if v is False:
        return "false"
    return "NULL"

def sql_date(v: Optional[str]) -> str:
    if not v:
        return "NULL"
    return sql_str(v) + "::date"

# Columns we INSERT, in order. Must match venue_to_values_tuple.
INSERT_COLS = [
    "name", "neighborhood", "category", "price_tier",
    "vibe_tags", "occasion_tags", "stop_roles",
    "duration_hours", "outdoor_seating", "reservation_difficulty",
    "reservation_url", "maps_url",
    "curation_note", "awards", "curated_by", "signature_order",
    "address", "latitude", "longitude",
    "active", "notes", "hours", "last_verified",
    "happy_hour", "dog_friendly", "kid_friendly", "wheelchair_accessible",
    "cash_only", "quality_score", "curation_boost",
]

UPDATE_COLS = [c for c in INSERT_COLS if c not in ("name", "neighborhood")]

def venue_to_values_tuple(v: dict) -> str:
    return (
        "("
        f"{sql_str(v['name'])},"
        f"{sql_str(v['neighborhood'])},"
        f"{sql_str(v['category'])},"
        f"{sql_int(v['price_tier'])},"
        f"{sql_text_array(v['vibe_tags'])},"
        f"{sql_text_array(v['occasion_tags'])},"
        f"{sql_text_array(v['stop_roles'])},"
        f"{sql_int(v['duration_hours'])},"
        f"{sql_str(v['outdoor_seating'])},"
        f"{sql_int(v['reservation_difficulty'])},"
        f"{sql_str(v['reservation_url'])},"
        f"{sql_str(v['maps_url'])},"
        f"{sql_str(v['curation_note'])},"
        f"{sql_str(v['awards'])},"
        f"{sql_str(v['curated_by'])},"
        f"{sql_str(v['signature_order'])},"
        f"{sql_str(v['address'])},"
        f"{sql_float(v['latitude'])},{sql_float(v['longitude'])},"
        f"{sql_bool(v['active'])},"
        f"{sql_str(v['notes'])},"
        f"{sql_str(v['hours'])},"
        f"{sql_date(v['last_verified'])},"
        f"{sql_str(v['happy_hour'])},"
        f"{sql_bool(v['dog_friendly'])},"
        f"{sql_bool(v['kid_friendly'])},"
        f"{sql_bool(v['wheelchair_accessible'])},"
        f"{sql_bool(v['cash_only'])},"
        f"{sql_int(v['quality_score'])},"
        f"{sql_int(v['curation_boost'])}"
        ")"
    )

def emit_sql(venues: list[dict]) -> str:
    header = """\
-- Composer venue import — v2 schema
-- Generated by scripts/import_venues.py
-- Idempotent upsert via (LOWER(name), neighborhood) unique index.
-- The sheet is the single source of truth — all columns update on re-import.

BEGIN;

INSERT INTO composer_venues (
    """ + ", ".join(INSERT_COLS) + """
) VALUES
"""
    values_lines = []
    for v in venues:
        values_lines.append(
            f"-- {v['name']} ({v['neighborhood']}, tier {v['price_tier']})\n"
            + venue_to_values_tuple(v)
        )
    body = ",\n".join(values_lines)

    update_clause = ",\n  ".join(f"{c} = EXCLUDED.{c}" for c in UPDATE_COLS)

    footer = f"""
ON CONFLICT (LOWER(name), neighborhood) DO UPDATE SET
  {update_clause};

COMMIT;

-- Verification
SELECT count(*) AS total_venues FROM composer_venues;
SELECT neighborhood, count(*) FROM composer_venues GROUP BY neighborhood ORDER BY 2 DESC LIMIT 15;
"""
    return header + body + footer

# ═══════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════

def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--dry-run", action="store_true", help="Print summary only")
    ap.add_argument("--out", type=Path, help="Write SQL to this file")
    args = ap.parse_args()

    if not XLSX_PATH.exists():
        print(f"ERROR: xlsx not found at {XLSX_PATH}", file=sys.stderr)
        return 1

    rows = parse_xlsx(XLSX_PATH)
    if len(rows) < 2:
        print("ERROR: xlsx has no data rows", file=sys.stderr)
        return 1

    # Row 0 = title/group headers, row 1 = column headers, row 2+ = data.
    header = rows[1]
    data = rows[2:]
    hi = {h.strip().lower(): i for i, h in enumerate(header) if h}

    def cell(row: list[str], key: str) -> str:
        k = key.lower()
        if k not in hi or hi[k] >= len(row):
            return ""
        return row[hi[k]].strip() if isinstance(row[hi[k]], str) else str(row[hi[k]])

    raw_venues = []
    for r in data:
        if not r or not cell(r, "name"):
            continue
        raw_venues.append({h: cell(r, h) for h in header if h})

    stats: Counter = Counter()
    errors: list[str] = []
    venues: list[dict] = []
    for raw in raw_venues:
        v = process_venue(raw, stats, errors)
        if v is not None:
            venues.append(v)

    # Dedupe on (lower(name), neighborhood) — ON CONFLICT can't handle
    # two rows with the same key in a single INSERT. Last row wins.
    seen: dict[tuple[str, str], int] = {}
    deduped: list[dict] = []
    for v in venues:
        key = (v["name"].lower(), v["neighborhood"])
        if key in seen:
            deduped[seen[key]] = v
            stats["deduped"] += 1
        else:
            seen[key] = len(deduped)
            deduped.append(v)
    venues = deduped

    # ── Summary ───────────────────────────────────────────────────────
    print("=" * 60, file=sys.stderr)
    print(f"IMPORT — {XLSX_PATH.name}", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    print(f"Rows in sheet:     {len(raw_venues):>4}", file=sys.stderr)
    print(f"Parsed OK:         {len(venues):>4}", file=sys.stderr)
    print(f"Skipped (no hood): {stats['skipped_no_neighborhood']:>4}", file=sys.stderr)
    print(f"Skipped (no coords): {stats['skipped_no_coords']:>4}", file=sys.stderr)
    print(f"Duplicates:        {stats['deduped']:>4}", file=sys.stderr)

    if errors:
        print("", file=sys.stderr)
        print(f"── Issues ({len(errors)}) ──", file=sys.stderr)
        for e in errors[:25]:
            print(f"  {e}", file=sys.stderr)
        if len(errors) > 25:
            print(f"  … and {len(errors) - 25} more", file=sys.stderr)

    if args.dry_run:
        print("\nDry run — no SQL emitted.", file=sys.stderr)
        return 0

    sql = emit_sql(venues)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(sql)
        print(f"\nSQL written to {args.out} ({len(sql):,} bytes)", file=sys.stderr)
    else:
        sys.stdout.write(sql)
    return 0

if __name__ == "__main__":
    sys.exit(main())
