#!/usr/bin/env python3
"""
Import Composer venues from Reid's curated xlsx into Supabase.

Reads:   reids_claude/Composer-main 2/curated/composer_venue_sheet_v1.1.xlsx
Writes:  SQL to stdout by default, or a file if --out is given.

Applies every normalization approved in the 2026-04-13 import audit:

  - Neighborhood error-row fixes (8 venues with bad slugs like `nyc` / `queens` / `lower-manhattan`)
  - Vibe tag mapping (81 raw tags → canonical 25, rest preserved in raw_vibe_tags)
  - Stop role lossy map (`drinks` → opener+closer, `activity`/`coffee` → opener)
  - Occasion mapping (25 → 6 canonical; non-occasion values dropped)
  - Category augmentation (park/bookstore/museum/cinema/etc → implied scored vibe tag)
  - `cash_only` vibe tag → `cash_only` boolean column
  - Separator normalization (", " vs "," in tag columns)
  - Pipe splitting on `stop_role`

Idempotent. Re-running overwrites via ON CONFLICT using the unique index
(LOWER(name), neighborhood) created by the 2026-04-13 migration.

Usage:
  python3 scripts/import_venues.py --dry-run
       Prints counts summary only. No SQL emitted.

  python3 scripts/import_venues.py --out supabase/imports/20260413_venue_data.sql
       Writes SQL to a file.

  python3 scripts/import_venues.py > /tmp/import.sql
       Writes SQL to stdout.
"""

from __future__ import annotations
import argparse
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path
from typing import Optional

# ═══════════════════════════════════════════════════════════════════════
# Paths
# ═══════════════════════════════════════════════════════════════════════

ROOT = Path(__file__).resolve().parent.parent
XLSX_PATH = ROOT / "reids_claude" / "Composer-main 2" / "curated" / "composer_venue_sheet_v1.1.xlsx"

# ═══════════════════════════════════════════════════════════════════════
# Canonical taxonomy — mirrors src/config/* and the CLAUDE.md contract.
# If these drift, the TS type and the SQL import will disagree.
# ═══════════════════════════════════════════════════════════════════════

CANONICAL_NEIGHBORHOODS = {
    "west_village", "greenwich_village", "east_village", "lower_east_side",
    "east_village_les", "bowery", "soho_nolita", "nolita", "noho", "tribeca",
    "little_italy", "hudson_square",
    "chelsea", "flatiron", "nomad", "gramercy_kips_bay", "kips_bay",
    "murray_hill", "midtown", "midtown_west", "midtown_east",
    "midtown_hells_kitchen", "koreatown",
    "chinatown", "fidi", "battery_park_city",
    "upper_west_side", "upper_east_side", "harlem", "west_harlem",
    "washington_heights",
    "williamsburg", "greenpoint", "east_williamsburg",
    "dumbo", "brooklyn_heights", "fort_greene", "clinton_hill", "cobble_hill",
    "carroll_gardens", "gowanus", "red_hook", "park_slope", "prospect_heights",
    "prospect_lefferts", "crown_heights", "bed_stuy", "flatbush_plg",
    "sunset_park", "gravesend", "sheepshead_bay", "columbia_waterfront",
    "astoria", "long_island_city", "sunnyside", "jackson_heights", "flushing",
    "ridgewood", "howard_beach", "south_ozone_park",
    "arthur_avenue", "bronx", "bronx_fordham", "bronx_concourse",
    "mott_haven", "staten_island", "stapleton_heights", "city_island",
}

CANONICAL_OCCASIONS = {
    "first_date", "dating", "couple", "friends", "solo",
}

# All 6 raw venue roles the sheet can use. The app's scoring layer
# maps these to the 3 composition roles (opener/main/closer) via
# ROLE_EXPANSION in lib/scoring.ts. No lossy mapping here — store raw.
CANONICAL_STOP_ROLES = {"opener", "main", "closer", "drinks", "activity", "coffee"}

# Scored vibe tags (14) — participate in exact-match scoring in lib/scoring.ts
CANONICAL_SCORED_VIBE_TAGS = {
    "food_forward", "tasting", "dinner", "bistro",
    "cocktail_forward", "wine_bar", "speakeasy", "drinks",
    "activity", "comedy", "karaoke", "games", "bowling",
    "walk", "gallery", "bookstore", "market", "park",
}

# Cross-cutting tags (8) — valid on venues, NOT scored
CANONICAL_CROSS_CUTTING_VIBE_TAGS = {
    "romantic", "conversation_friendly", "group_friendly", "late_night",
    "casual", "upscale", "outdoor", "classic",
}

ALL_CANONICAL_VIBE_TAGS = CANONICAL_SCORED_VIBE_TAGS | CANONICAL_CROSS_CUTTING_VIBE_TAGS

# ═══════════════════════════════════════════════════════════════════════
# Approved mappings from the 2026-04-13 audit
# ═══════════════════════════════════════════════════════════════════════

# (lowercased venue name, original slug) -> new slug. Uses lowercase +
# curly-quote normalization for matching to handle copy/paste drift.
NEIGHBORHOOD_ERROR_FIX = {
    ("elis wine bar & restaurant", "nyc"): "upper_west_side",
    ("tartina", "nyc"): "upper_west_side",
    ("bar b", "nyc"): "park_slope",
    ("governors island", "nyc"): "fidi",
    ("coqodaq", "queens"): "flushing",
    ("port sa'id", "lower-manhattan"): "hudson_square",
    ("nobody told me", "lower-manhattan"): "dumbo",
    ("alamo drafthouse lower manhattan", "lower-manhattan"): "fidi",
}

# Reid's stop_role values → canonical StopRole[]. "Lossy map + preserve raw".
STOP_ROLE_MAP = {
    "opener": ["opener"],
    "main": ["main"],
    "closer": ["closer"],
    "drinks": ["opener", "closer"],
    "activity": ["opener"],
    "coffee": ["opener"],
}

# Reid's occasion_fit values → canonical Occasion or None (= drop)
OCCASION_MAP = {
    "first_date": "first-date",
    "first-date": "first-date",
    "second_date": "second-date",
    "second-date": "second-date",
    "dating": "dating",
    "couple": "established",
    "friends": "friends",
    "solo": "solo",
    "date": "dating",
    "group": "friends",
    "celebration": "established",
    "anniversary": "established",
    "special-occasion": "established",
    "special-night": "established",
    "established": "established",
    "late_night_crew": "friends",
    "hang": "friends",
    "casual": "friends",
    "unwind": "friends",
    # Explicit drops (documented for the summary):
    "rainy-day": None,
    "morning": None,
    "coffee": None,
    "work": None,
    "family": None,
    "snack": None,
    "dinner": None,
    "lunch": None,
    "drinks": None,
    "cocktails": None,
}

# Bucket 1 — Reid's tags that ARE canonical scored or cross-cutting
# (passes through untouched). Auto-derived from taxonomy; listed here for
# clarity.
BUCKET_1_DIRECT_HITS = ALL_CANONICAL_VIBE_TAGS

# Bucket 2 — semantic map from Reid's tag → canonical. Raw is always preserved.
VIBE_TAG_MAP = {
    "grown-up": "upscale",
    "date-ready": "romantic",
    "cultural": "gallery",
    "intimate": "romantic",
    "cozy": "conversation_friendly",
    "cocktails": "cocktail_forward",
    "low-lit": "romantic",
    "pasta-forward": "food_forward",
    "wine-forward": "wine_bar",
    "social": "group_friendly",
    "omakase": "tasting",
    "group-friendly": "group_friendly",   # hyphen → underscore
    "late-night": "late_night",           # hyphen → underscore
    "shareable": "group_friendly",
    "refined": "upscale",
    "high-touch": "upscale",
    "cocktail-program": "cocktail_forward",
    "date-night": "romantic",
    "laid-back": "casual",
    "meat-forward": "food_forward",
    "lively": "group_friendly",
    "vibrant": "group_friendly",
    "convivial": "group_friendly",
    "family-style": "group_friendly",
    "rooftop": "outdoor",
    "wine_forward": "wine_bar",
    "elevated": "upscale",
    # User-added per audit: classic → new canonical, hidden → speakeasy
    "classic": "classic",
    "hidden": "speakeasy",
}

# Bucket 4 — logistics tags that DON'T belong in vibe_tags; move out.
LOGISTICS_TAGS = {
    "cash_only": "cash_only",  # sets cash_only=true on the venue row
    "byob": None,              # skip for MVP
}

# Category augmentation — if a row's `category` matches a key here, add
# the listed canonical scored tags to its vibe_tags so category-heavy
# venues (parks, cinemas, museums) score under the right user vibe.
CATEGORY_VIBE_AUGMENT = {
    "park": ["park"],
    "bookstore": ["bookstore"],
    "food_hall": ["market"],
    "museum": ["gallery"],
    "comedy_club": ["comedy"],
    "cinema": ["activity"],
    "jazz_club": ["activity"],
    "music_venue": ["activity"],
    "theater": ["activity"],
    "spa_bathhouse": ["activity"],
}

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
# Normalization helpers
# ═══════════════════════════════════════════════════════════════════════

def normalize_quote(s: str) -> str:
    """Replace curly apostrophes with straight, lowercase, trim."""
    return (s or "").replace("\u2019", "'").lower().strip()

def split_tags(raw: str) -> list[str]:
    """Split a vibe_tags / occasion_fit cell on either ', ' or ',' and trim."""
    if not raw:
        return []
    return [t.strip() for t in re.split(r"[,;]", raw) if t.strip()]

def split_roles(raw: str) -> list[str]:
    """Reid uses pipe `|` for multi-role rows; also accept comma/space just in case."""
    if not raw:
        return []
    return [t.strip().lower() for t in re.split(r"[|,;]", raw) if t.strip()]

def parse_bool(raw: str) -> Optional[bool]:
    v = (raw or "").strip().lower()
    if v in ("yes", "true", "1"):
        return True
    if v in ("no", "false", "0"):
        return False
    return None  # "unknown", empty, anything else

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

# ═══════════════════════════════════════════════════════════════════════
# Per-venue normalization. Returns a dict of DB columns or None if the row
# should be dropped. Also returns a list of issue tags for the summary.
# ═══════════════════════════════════════════════════════════════════════

def normalize_venue(
    raw: dict,
    stats: Counter,
    errors: list[str],
) -> Optional[dict]:
    name = (raw.get("name") or "").strip()
    if not name:
        return None  # empty row

    original_slug = (raw.get("neighborhood") or "").strip().lower()
    if not original_slug:
        errors.append(f"{name}: missing neighborhood — dropped")
        stats["dropped_missing_neighborhood"] += 1
        return None

    # 1. Neighborhood error-row fix
    fix_key = (normalize_quote(name), original_slug)
    neighborhood = NEIGHBORHOOD_ERROR_FIX.get(fix_key, original_slug)
    if neighborhood != original_slug:
        stats["error_row_fixed"] += 1

    if neighborhood not in CANONICAL_NEIGHBORHOODS:
        errors.append(f"{name}: unknown neighborhood '{neighborhood}' — dropped")
        stats["dropped_unknown_neighborhood"] += 1
        return None

    # 2. latitude/longitude required
    lat = parse_float(raw.get("latitude"))
    lng = parse_float(raw.get("longitude"))
    if lat is None or lng is None:
        errors.append(f"{name}: missing/invalid coords ({raw.get('latitude')}, {raw.get('longitude')}) — dropped")
        stats["dropped_bad_coords"] += 1
        return None

    # 3. price_tier
    price_tier = parse_int(raw.get("price_tier"))
    if price_tier not in (1, 2, 3, 4):
        errors.append(f"{name}: invalid price_tier '{raw.get('price_tier')}' — dropped")
        stats["dropped_bad_tier"] += 1
        return None

    # 4. Stop roles — store raw values (no mapping, scoring handles expansion)
    raw_role_str = (raw.get("stop_roles") or "").strip()
    role_tokens = split_roles(raw_role_str)
    stop_roles: list[str] = []
    for token in role_tokens:
        if token in CANONICAL_STOP_ROLES and token not in stop_roles:
            stop_roles.append(token)
        elif token:
            errors.append(f"{name}: unknown stop_role '{token}' — skipped")
            stats["unknown_stop_role_token"] += 1

    if not stop_roles:
        errors.append(f"{name}: no valid stop_roles — dropped")
        stats["dropped_no_roles"] += 1
        return None

    # 5. Occasion tags — sheet values are already canonical, just validate
    raw_occ = split_tags(raw.get("occasion_tags", ""))
    occasion_tags: list[str] = []
    for tag in raw_occ:
        t = tag.strip().lower()
        if t in CANONICAL_OCCASIONS and t not in occasion_tags:
            occasion_tags.append(t)
        elif t:
            stats["unknown_occasion"] += 1

    # 6. Vibe tags — Bucket 1/2/3 + Bucket 4 (logistics) + category augmentation
    raw_vibe_list = split_tags(raw.get("vibe_tags", ""))
    vibe_tags: list[str] = []
    cash_only: Optional[bool] = None

    for tag in raw_vibe_list:
        t = tag.strip().lower()
        if not t:
            continue
        # Bucket 4: logistics
        if t in LOGISTICS_TAGS:
            if LOGISTICS_TAGS[t] == "cash_only":
                cash_only = True
                stats["cash_only_flagged"] += 1
            else:
                stats["vibe_logistics_skipped"] += 1
            continue
        # Bucket 1: direct canonical hit
        if t in BUCKET_1_DIRECT_HITS:
            if t not in vibe_tags:
                vibe_tags.append(t)
            stats["vibe_bucket1_direct"] += 1
            continue
        # Bucket 2: semantic map
        if t in VIBE_TAG_MAP:
            mapped = VIBE_TAG_MAP[t]
            if mapped not in vibe_tags:
                vibe_tags.append(mapped)
            stats["vibe_bucket2_mapped"] += 1
            continue
        # Bucket 3: drop from canonical, preserve in raw
        stats["vibe_bucket3_dropped"] += 1

    # Category augmentation — add implied scored tags
    category = (raw.get("category") or "").strip().lower()
    aug_tags = CATEGORY_VIBE_AUGMENT.get(category, [])
    for at in aug_tags:
        if at not in vibe_tags:
            vibe_tags.append(at)
    if aug_tags:
        stats["category_augmented"] += 1

    # outdoor_seating — normalize to 'yes'/'no'/'unknown' text enum
    os_raw = (raw.get("outdoor_seating") or "").strip().lower()
    outdoor_seating: Optional[str] = None
    if os_raw in ("yes", "true", "1"):
        outdoor_seating = "yes"
    elif os_raw in ("no", "false", "0"):
        outdoor_seating = "no"
    elif os_raw == "unknown" or os_raw:
        outdoor_seating = "unknown"

    return {
        "name": name,
        "neighborhood": neighborhood,
        "category": category or None,
        "price_tier": price_tier,
        "vibe_tags": vibe_tags,
        "occasion_tags": occasion_tags,
        "stop_roles": stop_roles,
        "duration_hours": parse_int(raw.get("duration_hours")),
        "outdoor_seating": outdoor_seating,
        "reservation_difficulty": parse_int(raw.get("reservation_difficulty")),
        "reservation_url": (raw.get("reservation_url") or "").strip() or None,
        "maps_url": (raw.get("maps_url") or "").strip() or None,
        "curation_note": (raw.get("curation_note") or "").strip(),
        "awards": (raw.get("awards") or "").strip() or None,
        "curated_by": (raw.get("curated_by") or "").strip().lower() or None,
        "signature_order": (raw.get("signature_order") or "").strip() or None,
        "address": (raw.get("address") or "").strip() or None,
        "latitude": lat,
        "longitude": lng,
        "active": parse_bool(raw.get("active", "")) or True,
        "notes": (raw.get("notes") or "").strip() or None,
        "hours": (raw.get("hours") or "").strip() or None,
        "last_verified": (raw.get("last_verified") or "").strip() or None,
        "happy_hour": (raw.get("happy_hour") or "").strip() or None,
        "dog_friendly": parse_bool(raw.get("dog_friendly", "")),
        "kid_friendly": parse_bool(raw.get("kid_friendly", "")),
        "wheelchair_accessible": parse_bool(raw.get("wheelchair_accessible", "")),
        "cash_only": cash_only if cash_only else parse_bool(raw.get("cash_only", "")),
        "quality_score": parse_int(raw.get("quality_score")) or 7,
        "curation_boost": parse_int(raw.get("curation_boost")) or 0,
    }

# ═══════════════════════════════════════════════════════════════════════
# SQL emission
# ═══════════════════════════════════════════════════════════════════════

def sql_str(s: Optional[str]) -> str:
    """Quote a string for PG. NULL if None or empty."""
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

# Columns we INSERT, in order. These must match the VALUES tuple below.
# Matches the v2 schema (20260419_venue_schema_v2.sql).
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

# All columns update on re-import (upsert). quality_score and
# curation_boost now come from the sheet, not admin-only.
UPDATE_COLS = [c for c in INSERT_COLS if c != "name" and c != "neighborhood"]

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
-- Idempotent: re-running upserts via the (LOWER(name), neighborhood)
-- unique index on composer_venues.
-- All columns (including quality_score and curation_boost) update on
-- re-import — the sheet is the single source of truth.

BEGIN;

INSERT INTO composer_venues (
    """ + ", ".join(INSERT_COLS) + """
) VALUES
"""
    values_lines = []
    for v in venues:
        # One comment line above each tuple for human review.
        values_lines.append(f"-- {v['name']} ({v['neighborhood']}, tier {v['price_tier']})\n" + venue_to_values_tuple(v))
    body = ",\n".join(values_lines)

    update_clause = ",\n  ".join(f"{c} = EXCLUDED.{c}" for c in UPDATE_COLS)

    footer = f"""
ON CONFLICT (LOWER(name), neighborhood) DO UPDATE SET
  {update_clause};

COMMIT;

-- Verification (read-only — run after commit).
SELECT count(*) AS total_venues FROM composer_venues;
SELECT neighborhood, count(*) FROM composer_venues GROUP BY neighborhood ORDER BY 2 DESC LIMIT 15;
SELECT count(*) AS tier4_venues FROM composer_venues WHERE price_tier = 4;
SELECT count(*) AS with_signature_order FROM composer_venues WHERE signature_order IS NOT NULL;
"""
    return header + body + footer

# ═══════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="Print summary, skip SQL emission")
    ap.add_argument("--out", type=Path, help="Write SQL to this file (default: stdout)")
    args = ap.parse_args()

    if not XLSX_PATH.exists():
        print(f"ERROR: xlsx not found at {XLSX_PATH}", file=sys.stderr)
        return 1

    rows = parse_xlsx(XLSX_PATH)
    if len(rows) < 2:
        print("ERROR: xlsx has no data rows", file=sys.stderr)
        return 1

    # Row 1 = category group headers, row 2 = column headers, rest = data.
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
    normalized: list[dict] = []
    for raw in raw_venues:
        n = normalize_venue(raw, stats, errors)
        if n is not None:
            normalized.append(n)

    # ── Dedupe on (lower(name), neighborhood) ──────────────────────────
    # The unique index uses this exact key; ON CONFLICT cannot affect a row
    # twice within one INSERT statement, so any same-key rows in the source
    # sheet must collapse before emitting SQL. Last occurrence wins (Reid's
    # most recent edit).
    seen: dict[tuple[str, str], int] = {}
    deduped: list[dict] = []
    for v in normalized:
        key = (v["name"].lower(), v["neighborhood"])
        if key in seen:
            prior_index = seen[key]
            errors.append(
                f"{v['name']} ({v['neighborhood']}): duplicate row, keeping latest"
            )
            deduped[prior_index] = v
            stats["deduped"] += 1
        else:
            seen[key] = len(deduped)
            deduped.append(v)
    normalized = deduped

    # ── Summary ───────────────────────────────────────────────────────
    print("=" * 72, file=sys.stderr)
    print(f"IMPORT SUMMARY — {XLSX_PATH.name}", file=sys.stderr)
    print("=" * 72, file=sys.stderr)
    print(f"Populated venue rows in sheet:        {len(raw_venues):>4}", file=sys.stderr)
    print(f"Normalized & passed validation:       {len(normalized):>4}", file=sys.stderr)
    print(f"Dropped (missing neighborhood):       {stats['dropped_missing_neighborhood']:>4}", file=sys.stderr)
    print(f"Dropped (unknown neighborhood):       {stats['dropped_unknown_neighborhood']:>4}", file=sys.stderr)
    print(f"Dropped (bad coords):                 {stats['dropped_bad_coords']:>4}", file=sys.stderr)
    print(f"Dropped (bad price_tier):             {stats['dropped_bad_tier']:>4}", file=sys.stderr)
    print(f"Dropped (no valid stop roles):        {stats['dropped_no_roles']:>4}", file=sys.stderr)
    print("", file=sys.stderr)
    print("── Normalizations applied ─────────────────────────────", file=sys.stderr)
    print(f"Neighborhood error-row fixes:         {stats['error_row_fixed']:>4}", file=sys.stderr)
    print(f"Stop roles lossy-mapped:              {stats['stop_role_lossy_map']:>4}", file=sys.stderr)
    print(f"Unknown stop_role tokens skipped:     {stats['unknown_stop_role_token']:>4}", file=sys.stderr)
    print(f"Unknown occasions dropped:            {stats['unknown_occasion']:>4}", file=sys.stderr)
    print(f"Non-occasion occasion values dropped: {stats['occasion_dropped']:>4}", file=sys.stderr)
    print(f"Vibe bucket 1 (direct hits):          {stats['vibe_bucket1_direct']:>4}", file=sys.stderr)
    print(f"Vibe bucket 2 (semantic maps):        {stats['vibe_bucket2_mapped']:>4}", file=sys.stderr)
    print(f"Vibe bucket 3 (dropped from canon):   {stats['vibe_bucket3_dropped']:>4}", file=sys.stderr)
    print(f"Cash-only flags set:                  {stats['cash_only_flagged']:>4}", file=sys.stderr)
    print(f"Category augmentations applied:       {stats['category_augmented']:>4}", file=sys.stderr)
    print(f"Duplicates collapsed (same key):      {stats['deduped']:>4}", file=sys.stderr)

    if errors:
        print("", file=sys.stderr)
        print(f"── Issues ({len(errors)}) ─────────────────────────────", file=sys.stderr)
        for e in errors[:25]:
            print(f"  {e}", file=sys.stderr)
        if len(errors) > 25:
            print(f"  … and {len(errors) - 25} more", file=sys.stderr)

    if args.dry_run:
        print("", file=sys.stderr)
        print("Dry run — no SQL emitted.", file=sys.stderr)
        return 0

    sql = emit_sql(normalized)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(sql)
        print(f"\nSQL written to {args.out} ({len(sql):,} bytes)", file=sys.stderr)
    else:
        sys.stdout.write(sql)
    return 0

if __name__ == "__main__":
    sys.exit(main())
