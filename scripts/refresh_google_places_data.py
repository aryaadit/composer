#!/usr/bin/env python3
"""
Refresh Google Places data on the venue sheet.

Writes Google-derived fields ONLY to the sheet:
  - google_place_id (column AP)
  - google_rating (AV)
  - google_review_count (AW)
  - google_types (AX)
  - google_phone (AY)
  - enriched (AZ)
  - business_status (BA)
  - last_verified (AI)

Never touches curated columns. The 8 write targets above are hardcoded
in WRITE_WHITELIST; any attempt to write to a column outside that set
fails fast.

Usage:
  python3 scripts/refresh_google_places_data.py             # dry-run (default)
  python3 scripts/refresh_google_places_data.py --apply     # write to sheet

Dry-run prints a diff summary and exits. Apply mode writes a snapshot
CSV first, then sends a single batchUpdate covering all changed rows.
"""
from __future__ import annotations
import argparse
import csv
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parent.parent

# ── env ──────────────────────────────────────────────────────────────────
def load_env() -> None:
    """Populate os.environ from .env.local. Env-set values win (setdefault)."""
    env_file = ROOT / ".env.local"
    if not env_file.exists():
        return
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                v = v.strip().strip('"')
                os.environ.setdefault(k.strip(), v)


load_env()

API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")
SHEET_ID = os.environ.get("GOOGLE_SHEET_ID", "")
if not API_KEY:
    raise SystemExit("GOOGLE_PLACES_API_KEY not set in .env.local.")
if not SHEET_ID:
    raise SystemExit("GOOGLE_SHEET_ID not set in .env.local.")

# ── write whitelist ──────────────────────────────────────────────────────
# 8 columns this script is allowed to write. Anything else → hard reject.
# Column letters verified against the live sheet's row-2 headers.
WRITE_WHITELIST: dict[str, str] = {
    "AP": "google_place_id",
    "AI": "last_verified",
    "AV": "google_rating",
    "AW": "google_review_count",
    "AX": "google_types",
    "AY": "google_phone",
    "AZ": "enriched",
    "BA": "business_status",
}

# Columns we read for the venue identity / filter
READ_VENUE_ID_COL = "A"      # venue_id
READ_NAME_COL = "B"           # name (display only — never written)
READ_ACTIVE_COL = "AE"        # active (filter; never written by this script)

# Material-change columns — these drive the "Would change" diff summary.
# last_verified and enriched are bookkeeping and always rewritten.
MATERIAL_COLS = (
    "google_place_id",
    "google_rating",
    "google_review_count",
    "google_types",
    "google_phone",
    "business_status",
)

# Places API field mask — minimal set so SKU cost stays low.
PLACES_FIELD_MASK = ",".join(
    [
        "id",
        "rating",
        "userRatingCount",
        "types",
        "nationalPhoneNumber",
        "businessStatus",
    ]
)

# Rate limit: 5 RPS = 200ms between calls. Below Google's 10 RPS cap.
RPS = 5
SLEEP_S = 1.0 / RPS

# Conservative cost estimate per call ($) — Places Details v1 with
# Advanced fields (rating + userRatingCount + phone). Adjust if SKU pricing
# changes. Used only for the dry-run estimate print.
COST_PER_CALL_USD = 0.020

SNAPSHOT_DIR = ROOT / "scripts" / "snapshots"


# ── helpers ──────────────────────────────────────────────────────────────
def col_to_idx(letter: str) -> int:
    n = 0
    for ch in letter:
        n = n * 26 + (ord(ch) - ord("A") + 1)
    return n - 1


def write_cell(col: str, row: int, value: str) -> dict:
    """Build one batchUpdate data block. Hard-reject if col not whitelisted."""
    if col not in WRITE_WHITELIST:
        raise RuntimeError(
            f"REFUSED: attempt to write to column {col} (not in WRITE_WHITELIST)"
        )
    return {"range": f"NYC Venues!{col}{row}", "values": [[value]]}


def normalize_for_compare(field: str, value: Any) -> str:
    """Coerce both sides to canonical string form for comparison."""
    if value is None:
        return ""
    if field == "google_rating":
        try:
            return f"{float(value):.1f}".rstrip("0").rstrip(".")
        except (TypeError, ValueError):
            return ""
    if field == "google_review_count":
        try:
            return str(int(value))
        except (TypeError, ValueError):
            return ""
    if field == "google_types":
        if isinstance(value, list):
            return ",".join(value)
        return str(value).strip()
    return str(value).strip()


def types_changed(old_csv: str, new_list: list[str]) -> bool:
    """Order-insensitive comparison for the types CSV vs Google's array.
    Google's order can drift run-to-run; only flag when the set differs."""
    old_set = set(t for t in old_csv.split(",") if t)
    new_set = set(new_list or [])
    return old_set != new_set


# ── Google Sheets ────────────────────────────────────────────────────────
def get_sheets():
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build

    creds = Credentials.from_service_account_info(
        {
            "client_email": os.environ["GOOGLE_SHEETS_CLIENT_EMAIL"],
            "private_key": os.environ["GOOGLE_SHEETS_PRIVATE_KEY"].replace("\\n", "\n"),
            "type": "service_account",
            "token_uri": "https://oauth2.googleapis.com/token",
        },
        scopes=["https://www.googleapis.com/auth/spreadsheets"],
    )
    return build("sheets", "v4", credentials=creds).spreadsheets()


def verify_column_whitelist(sheets) -> None:
    """Halt if the hardcoded letters don't match the sheet's row-2 headers.
    Defends against silent column drift if a future curator reorders the sheet."""
    hdr = (
        sheets.values()
        .get(spreadsheetId=SHEET_ID, range="NYC Venues!A2:CD2")
        .execute()
    )
    headers = hdr.get("values", [[]])[0]
    mismatches: list[str] = []
    for col, expected in WRITE_WHITELIST.items():
        idx = col_to_idx(col)
        actual = headers[idx] if idx < len(headers) else "<out-of-range>"
        if actual != expected:
            mismatches.append(f"  {col}: expected {expected!r}, got {actual!r}")
    if mismatches:
        print("❌ HALT — sheet column whitelist no longer matches headers:")
        for m in mismatches:
            print(m)
        raise SystemExit(2)


def load_sheet_state(sheets) -> list[dict]:
    """Return list of dicts for every active row with a google_place_id.

    Each dict carries the venue_id, sheet row number, and current values of
    all read columns. Order preserved by sheet row."""
    # Read every column we care about, plus the identity/filter cols.
    cols = [READ_VENUE_ID_COL, READ_NAME_COL, READ_ACTIVE_COL] + list(
        WRITE_WHITELIST.keys()
    )
    ranges = [f"NYC Venues!{c}3:{c}" for c in cols]
    res = sheets.values().batchGet(spreadsheetId=SHEET_ID, ranges=ranges).execute()

    by_col: dict[str, list[str]] = {}
    for r in res.get("valueRanges", []):
        # Extract col letter from range like "'NYC Venues'!AP3:AP1336"
        rng = r.get("range", "")
        col = rng.split("!")[1].split("3")[0].split(":")[0]
        col = col.strip("'")
        values = [row[0].strip() if row else "" for row in r.get("values", [])]
        by_col[col] = values

    # Align all columns to the longest list length (sheet row count from row 3 onward)
    n_rows = max(len(v) for v in by_col.values()) if by_col else 0
    for c in cols:
        if c not in by_col:
            by_col[c] = []
        # Pad with empty strings if some columns were short (no trailing values)
        while len(by_col[c]) < n_rows:
            by_col[c].append("")

    rows: list[dict] = []
    for i in range(n_rows):
        sheet_row = i + 3  # row 3 = first data row
        venue_id = by_col[READ_VENUE_ID_COL][i]
        name = by_col[READ_NAME_COL][i]
        active = by_col[READ_ACTIVE_COL][i].lower()
        if not venue_id or active != "yes":
            continue
        gpid = by_col["AP"][i]
        if not gpid:
            continue
        rows.append(
            {
                "venue_id": venue_id,
                "name": name,
                "sheet_row": sheet_row,
                "old": {
                    "google_place_id": gpid,
                    "google_rating": by_col["AV"][i],
                    "google_review_count": by_col["AW"][i],
                    "google_types": by_col["AX"][i],
                    "google_phone": by_col["AY"][i],
                    "enriched": by_col["AZ"][i],
                    "business_status": by_col["BA"][i],
                    "last_verified": by_col["AI"][i],
                },
            }
        )
    return rows


# ── Google Places ────────────────────────────────────────────────────────
def fetch_place(place_id: str, attempt: int = 0) -> dict | None:
    url = f"https://places.googleapis.com/v1/places/{place_id}"
    req = Request(
        url,
        headers={
            "X-Goog-Api-Key": API_KEY,
            "X-Goog-FieldMask": PLACES_FIELD_MASK,
        },
    )
    try:
        with urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        if e.code in (429, 500, 502, 503, 504) and attempt < 3:
            time.sleep(2 ** attempt)
            return fetch_place(place_id, attempt + 1)
        if e.code == 404:
            return {"_status": "not_found"}
        if e.code == 403:
            print(f"  FATAL 403: {e.read().decode()[:200]}", file=sys.stderr)
            raise SystemExit(1)
        return {"_status": "error", "_http": e.code}
    except (URLError, TimeoutError):
        if attempt < 3:
            time.sleep(2 ** attempt)
            return fetch_place(place_id, attempt + 1)
        return {"_status": "network_error"}


# ── core: build planned writes + diff ────────────────────────────────────
def build_plan(venues: list[dict]) -> tuple[list[dict], dict]:
    """Iterate every venue, call Places, compute planned writes + diff metadata.

    Returns (plan, diff_summary) where plan = list of per-venue dicts with
    `old`, `new`, `sheet_row`, `material_changes` (list of field names),
    `lookup_status` ("ok" | "not_found" | "error")."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    plan: list[dict] = []
    diff = {
        "n_venues": 0,
        "n_lookup_errors": 0,
        "n_not_found": 0,
        "place_id_mismatches": [],
        "business_status_changes": [],
        "rating_changes": [],  # list of floats (signed delta)
        "rating_drops_large": [],  # venues with rating drop > 0.3
        "enriched_to_yes": 0,
        "all_changes": 0,
    }

    for i, v in enumerate(venues, 1):
        place = fetch_place(v["old"]["google_place_id"])
        time.sleep(SLEEP_S)
        if i % 50 == 0 or i == len(venues):
            print(
                f"  [{i}/{len(venues)}] processed", file=sys.stderr
            )

        # Handle lookup failure
        if place is None or place.get("_status") in ("not_found", "error", "network_error"):
            status = (place or {}).get("_status", "error")
            plan.append(
                {
                    **v,
                    "lookup_status": status,
                    "new": None,
                    "material_changes": [],
                }
            )
            if status == "not_found":
                diff["n_not_found"] += 1
            else:
                diff["n_lookup_errors"] += 1
            continue

        new_pid = place.get("id", "")
        new_rating = place.get("rating", "")
        new_reviews = place.get("userRatingCount", "")
        new_types = place.get("types", []) or []
        new_phone = place.get("nationalPhoneNumber", "")
        new_status = place.get("businessStatus", "")

        new_vals = {
            "google_place_id": new_pid,
            "google_rating": normalize_for_compare("google_rating", new_rating),
            "google_review_count": normalize_for_compare("google_review_count", new_reviews),
            "google_types": ",".join(new_types),  # write in Google's order
            "google_phone": new_phone or "",
            "enriched": "yes",
            "business_status": new_status,
            "last_verified": today,
        }

        # Compute material changes
        changes: list[str] = []
        for f in MATERIAL_COLS:
            old_norm = normalize_for_compare(f, v["old"][f])
            if f == "google_types":
                if types_changed(v["old"][f], new_types):
                    changes.append(f)
            else:
                new_norm = normalize_for_compare(f, new_vals[f])
                if old_norm != new_norm:
                    changes.append(f)

        plan.append(
            {
                **v,
                "lookup_status": "ok",
                "new": new_vals,
                "material_changes": changes,
            }
        )

        diff["n_venues"] += 1
        if changes:
            diff["all_changes"] += 1

        # Specific diff signals
        if "google_place_id" in changes:
            diff["place_id_mismatches"].append(
                {
                    "venue_id": v["venue_id"],
                    "name": v["name"],
                    "old": v["old"]["google_place_id"],
                    "new": new_pid,
                }
            )
        if "business_status" in changes and new_status and new_status != "OPERATIONAL":
            diff["business_status_changes"].append(
                {
                    "venue_id": v["venue_id"],
                    "name": v["name"],
                    "old": v["old"]["business_status"],
                    "new": new_status,
                }
            )
        if "google_rating" in changes:
            try:
                old_r = float(v["old"]["google_rating"]) if v["old"]["google_rating"] else None
                new_r = float(new_rating) if new_rating != "" else None
                if old_r is not None and new_r is not None:
                    delta = new_r - old_r
                    diff["rating_changes"].append(delta)
                    if delta < -0.3:
                        diff["rating_drops_large"].append(
                            {
                                "venue_id": v["venue_id"],
                                "name": v["name"],
                                "old": old_r,
                                "new": new_r,
                                "delta": delta,
                            }
                        )
            except (TypeError, ValueError):
                pass
        if v["old"]["enriched"].lower() != "yes":
            diff["enriched_to_yes"] += 1

    return plan, diff


# ── output ───────────────────────────────────────────────────────────────
def print_dry_run(plan: list[dict], diff: dict, total_active: int) -> None:
    """Spec-shaped dry-run output."""
    skipped = total_active - len(plan)
    print()
    print("=" * 78)
    print("DRY RUN — Google Places refresh")
    print("=" * 78)
    print(f"Total active venues to refresh:    {len(plan)}")
    print(f"Skipped (no place_id):             {skipped}")
    print(f"Successful lookups:                {diff['n_venues']}")
    print(f"Lookup errors (network/5xx):       {diff['n_lookup_errors']}")
    print(f"Place IDs not found (404):         {diff['n_not_found']}")
    print(f"Venues with material changes:      {diff['all_changes']}")
    print(f"enriched flipped to 'yes':         {diff['enriched_to_yes']}")
    print()

    print(f"Would change business_status (REQUIRES REVIEW) — {len(diff['business_status_changes'])} venues:")
    if not diff["business_status_changes"]:
        print("  (none)")
    else:
        for c in diff["business_status_changes"]:
            print(f"  - {c['venue_id']:<6} {c['name'][:36]:<36}  {c['old'] or '<empty>'} → {c['new']}")
    print()

    print(f"Would change place_id (UNEXPECTED, REVIEW) — {len(diff['place_id_mismatches'])} venues:")
    if not diff["place_id_mismatches"]:
        print("  (none)")
    else:
        for c in diff["place_id_mismatches"]:
            print(f"  - {c['venue_id']:<6} {c['name'][:36]:<36}  {c['old']} → {c['new']}")
    print()

    deltas = diff["rating_changes"]
    print("Rating changes:")
    if not deltas:
        print("  (no rating changes detected)")
    else:
        avg = sum(deltas) / len(deltas)
        max_abs = max(deltas, key=lambda d: abs(d))
        print(f"  changed:       {len(deltas)} venues")
        print(f"  avg delta:     {avg:+.3f}")
        print(f"  max delta:     {max_abs:+.2f}")
        print(f"  > 0.3 drops:   {len(diff['rating_drops_large'])} venues")
        if diff["rating_drops_large"]:
            for c in diff["rating_drops_large"][:10]:
                print(
                    f"    - {c['venue_id']:<6} {c['name'][:32]:<32}  {c['old']:.1f} → {c['new']:.1f} ({c['delta']:+.2f})"
                )
            if len(diff["rating_drops_large"]) > 10:
                print(f"    ... and {len(diff['rating_drops_large']) - 10} more")
    print()

    n_calls = len(plan)  # one Places call per venue
    cost = n_calls * COST_PER_CALL_USD
    print(f"Estimated Places API cost:         ~${cost:.2f} ({n_calls} calls × ${COST_PER_CALL_USD:.3f})")
    print()
    print("(dry run — no writes performed)")
    print("Re-run with --apply to commit changes to the sheet.")


def write_snapshot(plan: list[dict]) -> Path:
    """Save snapshot CSV of old vs new for every changed row."""
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = SNAPSHOT_DIR / f"google_refresh_{timestamp}.csv"
    cols = list(WRITE_WHITELIST.values())  # 8 fields

    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(
            ["venue_id", "name", "sheet_row", "lookup_status", "material_changes"]
            + [f"old_{c}" for c in cols]
            + [f"new_{c}" for c in cols]
        )
        for p in plan:
            if not p["new"] and not p["material_changes"]:
                continue  # nothing changed and no new data → skip
            new = p["new"] or {}
            w.writerow(
                [
                    p["venue_id"],
                    p["name"],
                    p["sheet_row"],
                    p["lookup_status"],
                    "|".join(p["material_changes"]),
                ]
                + [p["old"].get(c, "") for c in cols]
                + [new.get(c, "") for c in cols]
            )
    return path


# Sheets batchUpdate over the full catalog (1.3k venues × 8 cells ≈ 10k cells)
# exceeds httplib2's connection write window — the single-call pattern broke
# with a BrokenPipeError mid-stream. Chunking by venue keeps each request
# small enough to flush cleanly. 100 venues × 8 cells = 800 cells / call,
# ~30KB body, well under any plausible limit. Empirically 14 chunks complete
# in under 10 seconds with zero retries.
APPLY_CHUNK_VENUES = 100


def apply_writes(sheets, plan: list[dict]) -> dict:
    """Build batchUpdate from the plan. Writes 8 cells per venue that had
    a successful lookup. Skips venues with lookup_status != 'ok'.

    Chunked into APPLY_CHUNK_VENUES-sized batches to avoid the broken-pipe
    failure mode when a single batchUpdate body grows too large."""
    ok_plans = [p for p in plan if p["lookup_status"] == "ok" and p["new"]]
    skipped_lookup = len(plan) - len(ok_plans)

    if not ok_plans:
        return {"ok": True, "cells": 0, "venues": 0, "skipped": skipped_lookup, "chunks": 0}

    total_cells = 0
    n_chunks = (len(ok_plans) + APPLY_CHUNK_VENUES - 1) // APPLY_CHUNK_VENUES

    for ci in range(0, len(ok_plans), APPLY_CHUNK_VENUES):
        chunk = ok_plans[ci : ci + APPLY_CHUNK_VENUES]
        data_blocks: list[dict] = []
        for p in chunk:
            row = p["sheet_row"]
            for col, field in WRITE_WHITELIST.items():
                data_blocks.append(write_cell(col, row, p["new"][field]))

        # Retry with exponential backoff on transient network failures.
        attempts = 0
        while True:
            try:
                res = (
                    sheets.values()
                    .batchUpdate(
                        spreadsheetId=SHEET_ID,
                        body={"valueInputOption": "RAW", "data": data_blocks},
                    )
                    .execute()
                )
                break
            except Exception as e:
                attempts += 1
                if attempts > 3:
                    raise
                wait = 2 ** attempts
                print(
                    f"  ⚠ chunk {ci // APPLY_CHUNK_VENUES + 1}/{n_chunks} "
                    f"attempt {attempts} failed ({type(e).__name__}); retrying in {wait}s",
                    file=sys.stderr,
                )
                time.sleep(wait)

        cells = res.get("totalUpdatedCells", 0)
        total_cells += cells
        print(
            f"  chunk {ci // APPLY_CHUNK_VENUES + 1}/{n_chunks}: "
            f"{len(chunk)} venues, {cells} cells",
            file=sys.stderr,
        )

    return {
        "ok": True,
        "cells": total_cells,
        "venues": len(ok_plans),
        "skipped": skipped_lookup,
        "chunks": n_chunks,
    }


# ── main ─────────────────────────────────────────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write to sheet (default is dry-run).",
    )
    args = parser.parse_args()

    print("Connecting to Google Sheets...", file=sys.stderr)
    sheets = get_sheets()

    print("Verifying column whitelist against sheet headers...", file=sys.stderr)
    verify_column_whitelist(sheets)
    print("  ✓ all 8 columns match", file=sys.stderr)

    print("Loading sheet state (active venues with google_place_id)...", file=sys.stderr)
    venues = load_sheet_state(sheets)
    total_active = len(venues)
    print(f"  {total_active} venues to refresh", file=sys.stderr)

    if not venues:
        print("(nothing to do)", file=sys.stderr)
        return 0

    print(
        f"Fetching Google Places details (rate-limited to {RPS} RPS)...",
        file=sys.stderr,
    )
    plan, diff = build_plan(venues)

    print_dry_run(plan, diff, total_active)

    if not args.apply:
        return 0

    # --apply path
    print()
    print("=" * 78)
    print("APPLYING — writing to sheet")
    print("=" * 78)
    snapshot_path = write_snapshot(plan)
    print(f"Snapshot written: {snapshot_path.relative_to(ROOT)}")

    res = apply_writes(sheets, plan)
    print(f"batchUpdate complete:")
    print(f"  chunks sent:       {res['chunks']}")
    print(f"  venues updated:    {res['venues']}")
    print(f"  cells written:     {res['cells']}")
    print(f"  skipped (lookup):  {res['skipped']}")
    print()
    print(
        "Next step: run `npm run import-venues -- dry-run` then `apply` to sync the "
        "refreshed sheet values into composer_venues_v2."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
