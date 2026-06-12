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
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "src" / "config" / "generated"


def _load_dotenv() -> None:
    """Populate os.environ from .env.local. Env-set values win (setdefault)."""
    env_file = ROOT / ".env.local"
    if not env_file.exists():
        return
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                val = val.strip().strip('"')
                os.environ.setdefault(key.strip(), val)


_load_dotenv()

# Single source of truth for which sheet to read. Sourced from env
# (.env.local locally, Vercel env vars in production). No hardcoded
# fallback — sheet swaps require only env changes, not code edits.
SHEET_ID = os.environ.get("GOOGLE_SHEET_ID") or ""
if not SHEET_ID:
    raise SystemExit(
        "GOOGLE_SHEET_ID not set in environment. Set it in .env.local."
    )

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


def get_supabase():
    """Build a Supabase client for venue count queries."""
    try:
        from supabase import create_client
        return create_client(
            os.environ["NEXT_PUBLIC_SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    except ImportError:
        print("WARNING: supabase-py not installed, venue counts will be 0")
        return None
    except KeyError:
        print("WARNING: Supabase env vars not set, venue counts will be 0")
        return None


def fetch_venue_counts_by_neighborhood(supabase) -> dict[str, int]:
    """Fetch active venue counts grouped by neighborhood slug."""
    if supabase is None:
        return {}
    all_rows = []
    page_size = 1000
    offset = 0
    while True:
        res = supabase.table("composer_venues_v2") \
            .select("neighborhood") \
            .eq("active", True) \
            .range(offset, offset + page_size - 1) \
            .execute()
        all_rows.extend(res.data)
        if len(res.data) < page_size:
            break
        offset += page_size
    counts: dict[str, int] = {}
    for row in all_rows:
        slug = row.get("neighborhood")
        if slug:
            counts[slug] = counts.get(slug, 0) + 1
    return counts


def fetch_stop_role_counts(supabase) -> dict[str, int]:
    """Fetch observed stop_role occurrences across active venues.

    `stop_roles` is a TEXT[] in Postgres — one venue can carry multiple
    roles, and a count of N means N venue-row mentions of that role
    (not N distinct venues). The number is supplementary error-message
    context for the vocabulary gate, not load-bearing on scoring.

    Returns {} when Supabase is unavailable — the gate still runs
    against the canonical sheet vocabulary; the row-count display
    falls back to 0 for unknown values.
    """
    if supabase is None:
        return {}
    counts: dict[str, int] = {}
    page_size = 1000
    offset = 0
    while True:
        res = supabase.table("composer_venues_v2") \
            .select("stop_roles") \
            .eq("active", True) \
            .range(offset, offset + page_size - 1) \
            .execute()
        for row in res.data:
            for role in (row.get("stop_roles") or []):
                if role:
                    counts[role] = counts.get(role, 0) + 1
        if len(res.data) < page_size:
            break
        offset += page_size
    return counts


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
    # Manhattan
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
        "id": "chelsea",
        "label": "Chelsea",
        "borough": "Manhattan",
        "slugs": ["chelsea"],
    },
    {
        "id": "flatiron_nomad",
        "label": "Flatiron / NoMad",
        "borough": "Manhattan",
        "slugs": ["flatiron", "nomad"],
    },
    {
        "id": "gramercy_murray_hill",
        "label": "Gramercy / Murray Hill",
        "borough": "Manhattan",
        "slugs": ["gramercy", "murray_hill", "gramercy_kips_bay"],
    },
    {
        "id": "midtown_west",
        "label": "Hell's Kitchen / Midtown West",
        "borough": "Manhattan",
        "slugs": ["midtown_west"],
    },
    {
        "id": "midtown_east",
        "label": "Midtown East",
        "borough": "Manhattan",
        "slugs": ["midtown_east"],
    },
    {
        "id": "koreatown",
        "label": "Koreatown",
        "borough": "Manhattan",
        "slugs": ["koreatown"],
    },
    {
        "id": "chinatown",
        "label": "Chinatown",
        "borough": "Manhattan",
        "slugs": ["chinatown"],
    },
    {
        "id": "fidi_lower_manhattan",
        "label": "FiDi / Lower Manhattan",
        "borough": "Manhattan",
        "slugs": ["fidi", "lower_manhattan", "battery_park_city"],
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
    # Brooklyn
    {
        "id": "williamsburg_greenpoint",
        "label": "Williamsburg / Greenpoint",
        "borough": "Brooklyn",
        "slugs": ["williamsburg", "greenpoint"],
    },
    {
        "id": "east_williamsburg_bushwick",
        "label": "East Williamsburg / Bushwick",
        "borough": "Brooklyn",
        "slugs": ["east_williamsburg", "bushwick"],
    },
    {
        "id": "dumbo_brooklyn_heights",
        "label": "DUMBO / Brooklyn Heights",
        "borough": "Brooklyn",
        "slugs": ["dumbo", "brooklyn_heights", "cobble_hill", "carroll_gardens"],
    },
    {
        "id": "fort_greene_clinton_hill",
        "label": "Fort Greene / Clinton Hill",
        "borough": "Brooklyn",
        "slugs": ["fort_greene", "clinton_hill"],
    },
    {
        "id": "park_slope_prospect",
        "label": "Park Slope / Prospect",
        "borough": "Brooklyn",
        "slugs": ["park_slope", "prospect_heights", "prospect_lefferts", "gowanus"],
    },
    {
        "id": "bed_stuy_crown_heights",
        "label": "Bed-Stuy / Crown Heights",
        "borough": "Brooklyn",
        "slugs": ["bed_stuy", "crown_heights"],
    },
    {
        "id": "south_brooklyn",
        "label": "South Brooklyn",
        "borough": "Brooklyn",
        "slugs": ["red_hook", "sunset_park", "columbia_waterfront", "sheepshead_bay", "gravesend"],
    },
    # Outer
    {
        "id": "astoria_lic",
        "label": "Astoria / LIC",
        "borough": "Queens",
        "slugs": ["astoria", "long_island_city", "sunnyside"],
    },
    {
        "id": "queens",
        "label": "Queens",
        "borough": "Queens",
        "slugs": ["flushing", "jackson_heights", "ridgewood", "howard_beach", "south_ozone_park", "queens"],
    },
    {
        "id": "bronx_si",
        "label": "Bronx / Staten Island",
        "borough": "Outer",
        "slugs": ["bronx", "bronx_fordham", "bronx_concourse", "mott_haven", "arthur_avenue", "city_island", "staten_island", "stapleton_heights"],
    },
]

VIBE_SCORING_MATRIX = {
    "food_forward": {"label": "Food-Forward", "tags": ["food_forward", "tasting", "dinner", "bistro"]},
    "drinks_led": {"label": "Drinks-Led", "tags": ["cocktail_forward", "wine_bar", "speakeasy", "drinks"]},
    "activity_food": {"label": "Activity + Food", "tags": ["activity", "comedy", "karaoke", "games", "bowling"]},
    "mix_it_up": {"label": "Mix It Up", "tags": []},
}
# walk_explore ("Stroll") removed 2026-05-22 — produced low-confidence
# itineraries (sparse venue coverage for walk/gallery/bookstore tags) and
# was misleading users into expecting a different kind of night. Its
# venue tags (walk, gallery, bookstore, market, park) drop out of the
# scored vibe set; they remain in venue.vibe_tags for cross-cutting use.

# Budget tier sets are downward-permissive: a user picking nice_out is OK
# with nice_out OR cheaper venues. Picking splurge accepts splurge or one
# step down. The +15 scoring bonus still only fires on exact-primary-tier
# match (see BUDGET_PRIMARY_TIER in src/config/budgets.ts), so the bucket's
# "center of mass" still dominates the ranking. Thin-pool upward widening
# (route.ts) adds one tier above when the filter cuts the pool too thin.
BUDGET_TIERS = [
    {"slug": "casual", "label": "Casual ($)", "tiers": [1]},
    {"slug": "nice_out", "label": "Nice Out ($$)", "tiers": [1, 2]},
    {"slug": "splurge", "label": "Splurge ($$$)", "tiers": [2, 3]},
    {"slug": "all_out", "label": "All Out ($$$$)", "tiers": [3, 4]},
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

# Canonical composition roles. Always accepted by the vocabulary gate
# even if STOP_ROLE_EXPANSION is ever edited to remove their identity
# entries — these three are load-bearing on planStopMix and removing
# them from the gate would let a sheet typo silently invisibly drop
# every main-role venue.
CANONICAL_STOP_ROLES = {"opener", "main", "closer"}


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


def emit_neighborhoods(
    service,
    venue_counts: dict[str, int] | None = None,
    itineraries_by_group: dict[str, dict[str, int]] | None = None,
) -> str:
    all_hoods = read_neighborhoods(service)
    counts = venue_counts or {}
    itin = itineraries_by_group or {}

    lines = [HEADER]

    # Type
    lines.append(
        "export interface NeighborhoodGroup {\n"
        "  label: string;\n"
        "  borough: string;\n"
        "  slugs: string[];\n"
        "  venueCount: number;\n"
        "  /** Native composability per budget tier — count of distinct\n"
        "   *  (main, stop1) pairs that satisfy ALL hard filters with NO\n"
        "   *  relaxation, NO cascade, NO widening, NO degradation, for\n"
        "   *  Friday evening (strictest common slot). Baked by\n"
        "   *  scripts/native-composability.ts via generate-configs.py.\n"
        "   *  Drives the visibility predicate in src/config/group-visibility.ts. */\n"
        "  itinerariesByTier: {\n"
        "    casual: number;\n"
        "    nice_out: number;\n"
        "    splurge: number;\n"
        "  };\n"
        "}\n\n"
    )

    # NEIGHBORHOOD_GROUPS
    lines.append("export const NEIGHBORHOOD_GROUPS: Record<string, NeighborhoodGroup> = {\n")
    for g in NEIGHBORHOOD_GROUPS:
        slugs = ", ".join(quote(s) for s in g["slugs"])
        venue_count = sum(counts.get(s, 0) for s in g["slugs"])
        tiers = itin.get(g["id"], {"casual": 0, "nice_out": 0, "splurge": 0})
        lines.append(
            f"  {g['id']}: {{\n"
            f"    label: {quote(g['label'])},\n"
            f"    borough: {quote(g['borough'])},\n"
            f"    slugs: [{slugs}],\n"
            f"    venueCount: {venue_count},\n"
            f"    itinerariesByTier: {{ "
            f"casual: {tiers['casual']}, "
            f"nice_out: {tiers['nice_out']}, "
            f"splurge: {tiers['splurge']} "
            f"}},\n"
            f"  }},\n"
        )
    lines.append("};\n\n")

    # ALL_NEIGHBORHOODS
    lines.append(emit_string_array("ALL_NEIGHBORHOODS", all_hoods))

    # BAKE_VERSION — short SHA-256 of the load-bearing inputs (group
    # definitions + per-slug venue counts + per-group composability
    # tiers). Travels on the neighborhood_options_shown analytics event
    # so we can attribute picker behavior to a specific bake when the
    # taxonomy churns. Same inputs → same hash; any material change
    # (new group, slug move, venue count delta, tier shift) flips it.
    bake_inputs = json.dumps(
        {
            "groups": [
                {"id": g["id"], "slugs": g["slugs"]}
                for g in NEIGHBORHOOD_GROUPS
            ],
            "counts": counts,
            "itineraries_by_group": itin,
            "all_hoods": all_hoods,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    bake_version = hashlib.sha256(bake_inputs.encode("utf-8")).hexdigest()[:12]
    lines.append(f"export const BAKE_VERSION = {quote(bake_version)};\n")

    return "".join(lines)


def fetch_native_composability() -> dict[str, dict[str, int]]:
    """Invoke scripts/native-composability.ts --json and parse the
    itinerariesByTier dict per group.

    The TS script is the canonical owner of the composability computation —
    it reuses src/lib/scoring + src/lib/composer primitives so the bake
    reflects what production actually filters. This Python orchestrator
    just shells out and merges the result into the generated emitter.
    Failure here BLOCKS generation: a stale or missing itinerariesByTier
    silently breaks the visibility gate.
    """
    cmd = ["npx", "tsx", "scripts/native-composability.ts", "--json"]
    print(f"  invoking: {' '.join(cmd)}", file=sys.stderr)
    proc = subprocess.run(
        cmd,
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        print(proc.stderr, file=sys.stderr)
        raise SystemExit(
            f"native-composability.ts --json failed with exit {proc.returncode}"
        )
    # Forward the script's stderr (count check log) so the operator
    # sees it inline with the generate-configs progress output.
    if proc.stderr.strip():
        for line in proc.stderr.strip().splitlines():
            print(f"  {line}", file=sys.stderr)
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        print(proc.stdout[:200], file=sys.stderr)
        raise SystemExit(
            f"native-composability.ts --json produced unparseable output: {e}"
        )
    out: dict[str, dict[str, int]] = {}
    for entry in data.get("groups", []):
        gid = entry["groupId"]
        out[gid] = {
            "casual": int(entry["itinerariesByTier"]["casual"]),
            "nice_out": int(entry["itinerariesByTier"]["nice_out"]),
            "splurge": int(entry["itinerariesByTier"]["splurge"]),
        }
    return out


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
# Vocabulary gate (2026-06-10)
#
# This script is the single gate between the sheet's vocabulary and the
# generated TypeScript taxonomy. Adding a neighborhood slug to the
# Master Reference tab without also adding it to NEIGHBORHOOD_GROUPS used
# to silently produce orphan venues (no questionnaire neighborhood
# selection ever hit them). Adding a stop_role without expanding
# STOP_ROLE_EXPANSION used to silently drop the role at scoring time.
# Both classes of typo now block generation.
#
# Vibe tags are intentionally NOT validated — the vibe vocabulary is
# open while the founders decide which new tags graduate into the
# scoring matrix. Adding a vibe tag to the sheet does not require a
# matching entry in VIBE_SCORING_MATRIX; the emitter naturally splits
# scored vs cross-cutting tags.
# ═══════════════════════════════════════════════════════════════════════

def validate_vocabulary(
    sheet_neighborhoods: list[str],
    sheet_stop_roles: list[str],
    neighborhood_counts: dict[str, int],
    role_counts: dict[str, int],
    supabase_available: bool,
) -> tuple[list[str], list[str]]:
    """Run the vocabulary gates. Returns (errors, warnings).

    Errors (any → hard fail, generated files NOT written):
      - Neighborhood slugs from the sheet (Master Reference column A)
        OR carried by observed venue rows that aren't covered by any
        entry in NEIGHBORHOOD_GROUPS. The UI picker is gated by group
        membership; an orphan slug is unreachable.
      - stop_roles values from the sheet (Master Reference column F)
        OR carried by observed venue rows that STOP_ROLE_EXPANSION
        (plus the CANONICAL_STOP_ROLES defensive set) doesn't recognize.
        Unknown roles get silently dropped at scoring time.

    Warnings (info only, generation proceeds):
      - Group slugs with zero observed venue rows. These are slots
        carried for future curation (e.g. queens, gramercy_kips_bay
        as of 2026-06-10) — not wrong, just empty.

    Supplementary row counts come from Supabase. When Supabase is
    unavailable the orphan + unknown-role error checks still run using
    just the sheet vocabulary (counts default to 0 in the output); the
    zero-observed warning is skipped because we have no observed-counts
    data to drive it.
    """
    errors: list[str] = []
    warnings: list[str] = []

    # ── 1. Neighborhood grouping completeness ─────────────────────
    group_slugs: set[str] = set()
    for g in NEIGHBORHOOD_GROUPS:
        group_slugs.update(g["slugs"])

    observed_neighborhoods = (
        set(sheet_neighborhoods) | set(neighborhood_counts.keys())
    )
    orphan_neighborhoods = sorted(observed_neighborhoods - group_slugs)
    if orphan_neighborhoods:
        errors.append(
            "Neighborhood slugs not covered by any entry in NEIGHBORHOOD_GROUPS:"
        )
        for slug in orphan_neighborhoods:
            count = neighborhood_counts.get(slug, 0)
            errors.append(f"  - {slug} (rows: {count})")
        errors.append(
            "  → Add the slug to NEIGHBORHOOD_GROUPS in this script (assign it"
        )
        errors.append(
            "    to an existing UI group or create a new one), then re-run."
        )

    if supabase_available:
        nonzero_slugs = {s for s, c in neighborhood_counts.items() if c > 0}
        zero_observed = sorted(group_slugs - nonzero_slugs)
        if zero_observed:
            warnings.append(
                "Group slugs with zero observed venue rows (info — not a failure):"
            )
            for slug in zero_observed:
                warnings.append(f"  - {slug}")
            warnings.append(
                "  → Either intentional (placeholder for future coverage) or a"
            )
            warnings.append(
                "    typo in NEIGHBORHOOD_GROUPS that doesn't match a real slug."
            )

    # ── 2. Stop-role vocabulary ───────────────────────────────────
    allowed_roles = set(STOP_ROLE_EXPANSION.keys()) | CANONICAL_STOP_ROLES
    observed_roles = set(sheet_stop_roles) | set(role_counts.keys())
    unknown_roles = sorted(observed_roles - allowed_roles)
    if unknown_roles:
        errors.append(
            "stop_roles values not in STOP_ROLE_EXPANSION (or the canonical set):"
        )
        for role in unknown_roles:
            count = role_counts.get(role, 0)
            errors.append(f"  - {role} (rows: {count})")
        errors.append(
            "  → Either add the role to STOP_ROLE_EXPANSION (mapping it to one"
        )
        errors.append(
            "    or more canonical roles) or correct the sheet/venue data."
        )

    return errors, warnings


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
    # .env.local already loaded at module import time (see _load_dotenv above).
    print("Connecting to Google Sheet...", file=sys.stderr)
    service = get_sheets_service()

    print("Fetching venue counts from Supabase...", file=sys.stderr)
    supabase = get_supabase()
    venue_counts = fetch_venue_counts_by_neighborhood(supabase)
    role_counts = fetch_stop_role_counts(supabase)
    print(
        f"  {sum(venue_counts.values())} active venues across {len(venue_counts)} neighborhoods",
        file=sys.stderr,
    )

    # ── Vocabulary gate ────────────────────────────────────────
    # Any sheet vocabulary value that isn't covered by NEIGHBORHOOD_GROUPS
    # or STOP_ROLE_EXPANSION blocks generation. Warnings (e.g. group
    # slugs with zero rows) print but don't fail. See CLAUDE.md
    # "generate-configs is the vocabulary gate" section.
    print("Validating vocabulary...", file=sys.stderr)
    sheet_neighborhoods = read_neighborhoods(service)
    sheet_stop_roles = read_stop_roles(service)
    errors, warnings = validate_vocabulary(
        sheet_neighborhoods,
        sheet_stop_roles,
        venue_counts,
        role_counts,
        supabase_available=supabase is not None,
    )
    for w in warnings:
        print(f"  {w}", file=sys.stderr)
    if errors:
        print(
            "\nVocabulary gate FAILED — generated files NOT written:",
            file=sys.stderr,
        )
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        return 1
    print("  ✓ vocabulary OK", file=sys.stderr)

    # ── Native composability bake ──────────────────────────────
    # Shell out to scripts/native-composability.ts --json so the
    # canonical TS computation (which reuses src/lib/scoring primitives)
    # is the single source of truth for itinerariesByTier. Folded into
    # this orchestrator so `npm run generate-configs` is the one entry
    # point for refreshing the generated taxonomy AND its composability
    # counts. The visibility gate (src/config/group-visibility.ts)
    # reads itinerariesByTier from the baked file; a stale bake silently
    # breaks the gate, so this failure mode is fatal.
    print("Baking native composability counts...", file=sys.stderr)
    itineraries_by_group = fetch_native_composability()
    print(
        f"  ✓ baked itinerariesByTier for {len(itineraries_by_group)} groups",
        file=sys.stderr,
    )

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for filename, emitter in OUTPUTS:
        if emitter == emit_neighborhoods:
            content = emitter(service, venue_counts, itineraries_by_group)
        else:
            content = emitter(service)
        out_path = OUT_DIR / filename
        out_path.write_text(content)
        lines = content.count("\n")
        print(f"  ✓ {filename:25s} ({lines} lines)", file=sys.stderr)

    print(f"\nGenerated {len(OUTPUTS)} files in {OUT_DIR.relative_to(ROOT)}/", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
