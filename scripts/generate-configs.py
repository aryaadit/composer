#!/usr/bin/env python3
"""
Generate TypeScript config files from the Composer venue sheet.

Reads reference data from the live Google Sheet (Master Reference tab)
and emits typed config files to src/config/generated/. These files are
committed to git so production builds don't need live sheet access.

Workflow:
  1. Update the appropriate column in the Master Reference tab
  2. Run: npm run generate-configs
  3. Verify: npx tsc --noEmit
  4. Commit the updated src/config/generated/*.ts files

Auth: uses GOOGLE_SHEETS_CLIENT_EMAIL + GOOGLE_SHEETS_PRIVATE_KEY
from .env.local, or falls back to the service account JSON file.

Usage:
  python3 scripts/generate-configs.py
"""

from __future__ import annotations
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "src" / "config" / "generated"

# Single source of truth for taxonomy. Update sheet, then run npm run generate-configs.
SHEET_ID = "139gp-s2sBbEZbi4-6mrsMlhKykpoGWvuQdboMaAt20o"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
KEY_FILE = ROOT / "docs" / "palate-composer-67baf1d883e3.json"


# ═══════════════════════════════════════════════════════════════════════
# Google Sheets client
# ═══════════════════════════════════════════════════════════════════════

def get_sheets_service():
    """Build an authenticated Google Sheets v4 service.

    Tries env vars first (same as import_venues_v2.py), falls back to
    the service account JSON file for local dev.
    """
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
    except ImportError:
        print("ERROR: google-api-python-client not installed.")
        print("Run: pip3 install google-api-python-client google-auth")
        sys.exit(1)

    client_email = os.environ.get("GOOGLE_SHEETS_CLIENT_EMAIL")
    private_key = os.environ.get("GOOGLE_SHEETS_PRIVATE_KEY", "").replace("\\n", "\n")

    if client_email and private_key:
        creds = Credentials.from_service_account_info(
            {
                "client_email": client_email,
                "private_key": private_key,
                "type": "service_account",
                "token_uri": "https://oauth2.googleapis.com/token",
            },
            scopes=SCOPES,
        )
    elif KEY_FILE.exists():
        creds = Credentials.from_service_account_file(str(KEY_FILE), scopes=SCOPES)
    else:
        print("ERROR: No Google Sheets credentials found.")
        print("Set GOOGLE_SHEETS_CLIENT_EMAIL + GOOGLE_SHEETS_PRIVATE_KEY in .env.local,")
        print(f"or place the service account JSON at {KEY_FILE}.")
        sys.exit(1)

    return build("sheets", "v4", credentials=creds)


def read_sheet_column(service, tab: str, col: str) -> list[str]:
    """Read a single column from a sheet tab, skipping the header rows.

    The Master Reference tab has:
      Row 1 = note
      Row 2 = column headers
      Row 3+ = values
    """
    result = service.spreadsheets().values().get(
        spreadsheetId=SHEET_ID,
        range=f"{tab}!{col}3:{col}",
    ).execute()
    values = []
    for row in result.get("values", []):
        val = (row[0] if row else "").strip()
        if val:
            values.append(val)
    return values


# ═══════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════

def is_slug(s: str) -> bool:
    """True if the string looks like a snake_case slug (not a display label)."""
    return bool(s) and bool(re.fullmatch(r"[a-z0-9_]+", s))


def split_csv(s: str) -> list[str]:
    """Split a comma-separated cell, trim each token, drop empties."""
    return [t.strip() for t in s.split(",") if t.strip()]


# ═══════════════════════════════════════════════════════════════════════
# Structured config constants — editorial/product decisions
#
# These mappings represent curation choices (how neighborhoods are
# grouped for the UI, how vibes map to venue tags, budget tier ranges).
# They don't change when venue data changes — only when the founders
# make a product decision. Maintained here, not derived from the sheet.
# ═══════════════════════════════════════════════════════════════════════

NEIGHBORHOOD_GROUPS = [
    {
        "id": "west_village",
        "label": "West Village",
        "borough": "Manhattan",
        "slugs": ["west_village"],
    },
    {
        "id": "greenwich_village",
        "label": "Greenwich Village",
        "borough": "Manhattan",
        "slugs": ["greenwich_village"],
    },
    {
        "id": "east_village_les",
        "label": "East Village / LES",
        "borough": "Manhattan",
        "slugs": ["east_village", "lower_east_side", "bowery"],
    },
    {
        "id": "soho_nolita_tribeca",
        "label": "SoHo / Nolita / Tribeca",
        "borough": "Manhattan",
        "slugs": ["soho_nolita", "nolita", "noho", "tribeca", "little_italy", "hudson_square"],
    },
    {
        "id": "chelsea_flatiron",
        "label": "Chelsea / Flatiron",
        "borough": "Manhattan",
        "slugs": ["chelsea", "flatiron", "nomad", "gramercy", "murray_hill"],
    },
    {
        "id": "midtown_hk",
        "label": "Midtown / Hell's Kitchen",
        "borough": "Manhattan",
        "slugs": ["midtown", "midtown_west", "midtown_east", "koreatown"],
    },
    {
        "id": "chinatown_fidi",
        "label": "Chinatown / FiDi",
        "borough": "Manhattan",
        "slugs": ["chinatown", "fidi", "battery_park_city", "lower_manhattan"],
    },
    {
        "id": "upper_west_side",
        "label": "Upper West Side",
        "borough": "Manhattan",
        "slugs": ["upper_west_side"],
    },
    {
        "id": "upper_east_side",
        "label": "Upper East Side",
        "borough": "Manhattan",
        "slugs": ["upper_east_side"],
    },
    {
        "id": "harlem_uptown",
        "label": "Harlem / Uptown",
        "borough": "Manhattan",
        "slugs": ["harlem", "washington_heights"],
    },
    {
        "id": "williamsburg_greenpoint",
        "label": "Williamsburg / Greenpoint",
        "borough": "Brooklyn",
        "slugs": ["williamsburg", "greenpoint", "east_williamsburg", "bushwick"],
    },
    {
        "id": "brooklyn",
        "label": "DUMBO / Brooklyn",
        "borough": "Brooklyn",
        "slugs": ["dumbo", "brooklyn_heights", "fort_greene", "clinton_hill", "cobble_hill", "carroll_gardens", "gowanus", "red_hook", "park_slope", "prospect_heights", "prospect_lefferts", "crown_heights", "bed_stuy", "sunset_park", "columbia_waterfront"],
    },
    {
        "id": "outer_boroughs",
        "label": "Queens / Bronx / SI",
        "borough": "Outer",
        "slugs": ["astoria", "long_island_city", "sunnyside", "jackson_heights", "flushing", "ridgewood", "howard_beach", "south_ozone_park", "arthur_avenue", "bronx", "bronx_fordham", "bronx_concourse", "mott_haven", "staten_island", "stapleton_heights", "city_island", "nyc", "queens"],
    },
]

VIBE_SCORING_MATRIX = {
    "food_forward": {"label": "Food-Forward", "tags": ["food_forward", "tasting", "dinner", "bistro"]},
    "drinks_led": {"label": "Drinks-Led", "tags": ["cocktail_forward", "wine_bar", "speakeasy", "drinks"]},
    "activity_food": {"label": "Activity + Food", "tags": ["activity", "comedy", "karaoke", "games", "bowling"]},
    "walk_explore": {"label": "Walk & Explore", "tags": ["walk", "gallery", "bookstore", "market", "park"]},
    "mix_it_up": {"label": "Mix It Up", "tags": []},
}

BUDGET_TIERS = [
    {"slug": "casual", "label": "Casual ($)", "tiers": [1]},
    {"slug": "nice_out", "label": "Nice Out ($$)", "tiers": [2]},
    {"slug": "splurge", "label": "Splurge ($$$)", "tiers": [3]},
    {"slug": "all_out", "label": "All Out ($$$$)", "tiers": [4]},
    {"slug": "no_preference", "label": "No Preference", "tiers": [1, 2, 3, 4]},
]

# Stop role expansion — which abstract roles serve as which concrete roles
STOP_ROLE_EXPANSION = {
    "opener": ["opener"],
    "main": ["main"],
    "closer": ["closer"],
    "drinks": ["opener", "closer"],
    "activity": ["opener"],
    "coffee": ["opener"],
}


# ═══════════════════════════════════════════════════════════════════════
# Sheet readers — pull flat value lists from Master Reference
# ═══════════════════════════════════════════════════════════════════════

# Master Reference column mapping (row 2 headers):
# A = neighborhood, B = category, C = price_tier, D = vibe_tags,
# E = occasion_tags, F = stop_roles, G = time_blocks, H = outdoor_seating,
# I = reservation_difficulty, J = curated_by, K = reservation_platform

def read_neighborhoods(service) -> list[str]:
    """All neighborhood slugs from column A."""
    raw = read_sheet_column(service, "Master Reference", "A")
    return [v for v in raw if is_slug(v)]


def read_categories(service) -> list[str]:
    """All category slugs from column B."""
    raw = read_sheet_column(service, "Master Reference", "B")
    return [v for v in raw if is_slug(v)]


def read_vibe_tags(service) -> list[str]:
    """All vibe tag slugs from column D."""
    raw = read_sheet_column(service, "Master Reference", "D")
    return [v for v in raw if is_slug(v)]


def read_occasions(service) -> list[str]:
    """All occasion tag slugs from column E."""
    raw = read_sheet_column(service, "Master Reference", "E")
    return [v for v in raw if is_slug(v)]


def read_stop_roles(service) -> list[str]:
    """All stop role slugs from column F."""
    raw = read_sheet_column(service, "Master Reference", "F")
    return [v for v in raw if is_slug(v)]


# ═══════════════════════════════════════════════════════════════════════
# TypeScript emitters
# ═══════════════════════════════════════════════════════════════════════

HEADER = (
    "// AUTO-GENERATED — DO NOT EDIT\n"
    f"// Source: Google Sheet {SHEET_ID}\n"
    f"// Generated: {datetime.now(timezone.utc).isoformat()}\n\n"
)


def quote(s: str) -> str:
    return f'"{s}"'


def emit_string_array(name: str, values: list[str], as_const: bool = False) -> str:
    items = ", ".join(quote(v) for v in values)
    suffix = " as const" if as_const else ""
    type_ann = "" if as_const else ": string[]"
    return f"export const {name}{type_ann} = [{items}]{suffix};\n"


def emit_vibes(service) -> str:
    all_tags = read_vibe_tags(service)

    # Scored tags = union of all tags in the scoring matrix
    scored_set: set[str] = set()
    for entry in VIBE_SCORING_MATRIX.values():
        scored_set.update(entry["tags"])

    scored = [t for t in all_tags if t in scored_set]
    cross_cutting = [t for t in all_tags if t not in scored_set]

    lines = [HEADER]

    # VIBE_VENUE_TAGS
    lines.append("export const VIBE_VENUE_TAGS: Record<string, string[]> = {\n")
    for slug, entry in VIBE_SCORING_MATRIX.items():
        tags = ", ".join(quote(t) for t in entry["tags"])
        lines.append(f"  {slug}: [{tags}],\n")
    lines.append("};\n\n")

    # VIBE_DISPLAY_LABELS
    lines.append("export const VIBE_DISPLAY_LABELS: Record<string, string> = {\n")
    for slug, entry in VIBE_SCORING_MATRIX.items():
        lines.append(f"  {slug}: {quote(entry['label'])},\n")
    lines.append("};\n\n")

    # Scored + cross-cutting arrays
    lines.append(emit_string_array("SCORED_VIBE_TAGS", scored))
    lines.append("\n")
    lines.append(emit_string_array("CROSS_CUTTING_VIBE_TAGS", cross_cutting))

    return "".join(lines)


def emit_neighborhoods(service) -> str:
    all_hoods = read_neighborhoods(service)

    lines = [HEADER]

    # Type
    lines.append(
        "export interface NeighborhoodGroup {\n"
        "  label: string;\n"
        "  borough: string;\n"
        "  slugs: string[];\n"
        "}\n\n"
    )

    # NEIGHBORHOOD_GROUPS
    lines.append("export const NEIGHBORHOOD_GROUPS: Record<string, NeighborhoodGroup> = {\n")
    for g in NEIGHBORHOOD_GROUPS:
        slugs = ", ".join(quote(s) for s in g["slugs"])
        lines.append(
            f"  {g['id']}: {{\n"
            f"    label: {quote(g['label'])},\n"
            f"    borough: {quote(g['borough'])},\n"
            f"    slugs: [{slugs}],\n"
            f"  }},\n"
        )
    lines.append("};\n\n")

    # ALL_NEIGHBORHOODS
    lines.append(emit_string_array("ALL_NEIGHBORHOODS", all_hoods))

    return "".join(lines)


def emit_stop_roles(_service) -> str:
    lines = [HEADER]

    # ROLE_EXPANSION
    lines.append("export const ROLE_EXPANSION: Record<string, string[]> = {\n")
    for role, serves in STOP_ROLE_EXPANSION.items():
        serves_str = ", ".join(quote(s) for s in serves)
        lines.append(f"  {role}: [{serves_str}],\n")
    lines.append("};\n\n")

    # ALL_STOP_ROLES
    all_roles = list(STOP_ROLE_EXPANSION.keys())
    lines.append(emit_string_array("ALL_STOP_ROLES", all_roles, as_const=True))

    return "".join(lines)


def emit_budgets(_service) -> str:
    lines = [HEADER]

    lines.append(
        "export interface BudgetTier {\n"
        "  label: string;\n"
        "  tiers: number[];\n"
        "}\n\n"
    )

    lines.append("export const BUDGET_TIERS: Record<string, BudgetTier> = {\n")
    for t in BUDGET_TIERS:
        tier_nums = ", ".join(str(n) for n in t["tiers"])
        lines.append(
            f"  {t['slug']}: {{\n"
            f"    label: {quote(t['label'])},\n"
            f"    tiers: [{tier_nums}],\n"
            f"  }},\n"
        )
    lines.append("};\n")

    return "".join(lines)


def emit_occasions(service) -> str:
    tags = read_occasions(service)
    return HEADER + emit_string_array("OCCASIONS", tags, as_const=True)


def emit_categories(service) -> str:
    cats = read_categories(service)
    return HEADER + emit_string_array("CATEGORIES", cats, as_const=True)


# ═══════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════

OUTPUTS: list[tuple[str, callable]] = [
    ("vibes.ts", emit_vibes),
    ("neighborhoods.ts", emit_neighborhoods),
    ("stop-roles.ts", emit_stop_roles),
    ("budgets.ts", emit_budgets),
    ("occasions.ts", emit_occasions),
    ("categories.ts", emit_categories),
]


def main() -> int:
    # Load .env.local for Google Sheets credentials
    env_file = ROOT / ".env.local"
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    # Strip surrounding quotes from values
                    val = val.strip().strip('"')
                    os.environ.setdefault(key.strip(), val)

    print("Connecting to Google Sheet...", file=sys.stderr)
    service = get_sheets_service()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for filename, emitter in OUTPUTS:
        content = emitter(service)
        out_path = OUT_DIR / filename
        out_path.write_text(content)
        lines = content.count("\n")
        print(f"  ✓ {filename:25s} ({lines} lines)", file=sys.stderr)

    print(f"\nGenerated {len(OUTPUTS)} files in {OUT_DIR.relative_to(ROOT)}/", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
