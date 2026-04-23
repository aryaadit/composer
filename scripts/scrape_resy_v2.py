#!/usr/bin/env python3
"""
Scrape Resy venue IDs for the v2 catalog.

For each venue in the Google Sheet, queries Resy's venuesearch API
using venue name + lat/long, records high-confidence matches, and
optionally writes them back to the sheet.

Usage:
  python3 scripts/scrape_resy_v2.py --dry-run
  python3 scripts/scrape_resy_v2.py
"""

from __future__ import annotations
import argparse
import csv
import math
import os
import sys
import time
import json
from typing import Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# ═══════════════════════════════════════════════════════════════════════
# Config
# ═══════════════════════════════════════════════════════════════════════

SHEET_ID = "139gp-s2sBbEZbi4-6mrsMlhKykpoGWvuQdboMaAt20o"
RESY_API_KEY = "VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5"
RESY_URL = "https://api.resy.com/3/venuesearch/search"

GEO_THRESHOLD_M = 150
NAME_SIM_THRESHOLD = 85
RATE_LIMIT_S = 0.4  # 400ms between calls

CSV_OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "debug", "resy-scrape-v2-results.csv")

# ═══════════════════════════════════════════════════════════════════════
# Google Sheets
# ═══════════════════════════════════════════════════════════════════════

def load_env():
    env_file = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    os.environ.setdefault(key.strip(), val.strip())


def get_sheets_service():
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build

    SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
    client_email = os.environ.get("GOOGLE_SHEETS_CLIENT_EMAIL")
    private_key = os.environ.get("GOOGLE_SHEETS_PRIVATE_KEY", "").replace("\\n", "\n")

    if not client_email or not private_key:
        print("ERROR: Google Sheets credentials not found in env.")
        sys.exit(1)

    creds = Credentials.from_service_account_info(
        {
            "client_email": client_email,
            "private_key": private_key,
            "type": "service_account",
            "token_uri": "https://oauth2.googleapis.com/token",
        },
        scopes=SCOPES,
    )
    return build("sheets", "v4", credentials=creds)


def read_sheet(service) -> tuple[list[str], list[list[str]]]:
    header_res = service.spreadsheets().values().get(
        spreadsheetId=SHEET_ID, range="NYC Venues!A2:CD2"
    ).execute()
    headers = [h.strip().lower() for h in (header_res.get("values", [[]])[0])]

    data_res = service.spreadsheets().values().get(
        spreadsheetId=SHEET_ID, range="NYC Venues!A3:CD"
    ).execute()
    rows = data_res.get("values", [])
    return headers, rows


# ═══════════════════════════════════════════════════════════════════════
# Geo + name matching
# ═══════════════════════════════════════════════════════════════════════

def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000
    to_rad = math.radians
    dlat = to_rad(lat2 - lat1)
    dlon = to_rad(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def name_similarity(a: str, b: str) -> int:
    """Token set ratio — handles word reordering and partial matches."""
    try:
        from rapidfuzz import fuzz
        return fuzz.token_set_ratio(a, b)
    except ImportError:
        # Fallback: simple case-insensitive containment + length ratio
        a_low, b_low = a.lower().strip(), b.lower().strip()
        if a_low == b_low:
            return 100
        if a_low in b_low or b_low in a_low:
            return 90
        # Word overlap
        a_words = set(a_low.split())
        b_words = set(b_low.split())
        if not a_words or not b_words:
            return 0
        overlap = len(a_words & b_words)
        total = max(len(a_words), len(b_words))
        return int(overlap / total * 100)


# ═══════════════════════════════════════════════════════════════════════
# Resy API
# ═══════════════════════════════════════════════════════════════════════

def search_resy(name: str, lat: float, lng: float, retries: int = 3) -> Optional[list[dict]]:
    body = json.dumps({
        "availability": False,
        "page": 1,
        "per_page": 5,
        "types": ["venue"],
        "order_by": "distance",
        "geo": {"latitude": lat, "longitude": lng, "radius": 500},
        "query": name,
    }).encode("utf-8")

    headers = {
        "Authorization": f'ResyAPI api_key="{RESY_API_KEY}"',
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
        "Origin": "https://resy.com",
        "Referer": "https://resy.com/",
        "X-Origin": "https://resy.com",
    }

    for attempt in range(retries):
        try:
            req = Request(RESY_URL, data=body, headers=headers, method="POST")
            with urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
                return data.get("search", {}).get("hits", [])
        except HTTPError as e:
            if e.code == 429:
                wait = 30 * (attempt + 1)
                print(f"    Rate limited (429). Waiting {wait}s...")
                time.sleep(wait)
                continue
            if e.code == 403:
                print(f"    BLOCKED (403). Response: {e.read().decode()}")
                sys.exit(1)
            if e.code >= 500:
                time.sleep(2 ** attempt)
                continue
            print(f"    HTTP {e.code}: {e.read().decode()[:200]}")
            return None
        except (URLError, TimeoutError):
            time.sleep(2 ** attempt)
            continue

    return None


# ═══════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env()

    print("Connecting to Google Sheets...")
    service = get_sheets_service()
    headers, rows = read_sheet(service)
    print(f"  {len(rows)} venues loaded, {len(headers)} columns")

    # Find column indices
    col_idx = {h: i for i, h in enumerate(headers)}
    name_i = col_idx["name"]
    lat_i = col_idx["latitude"]
    lng_i = col_idx["longitude"]
    vid_i = col_idx["venue_id"]
    resy_id_i = col_idx.get("resy_venue_id")
    resy_slug_i = col_idx.get("resy_slug")
    platform_i = col_idx.get("reservation_platform")

    results = []
    matched_writes = []  # (sheet_row_0indexed, resy_id, resy_slug)

    stats = {
        "total": 0, "already_has": 0, "matched": 0,
        "rejected_geo": 0, "rejected_similarity": 0, "rejected_locality": 0,
        "no_hits": 0, "error": 0, "skipped_no_geo": 0,
    }

    for i, row in enumerate(rows):
        def get(idx):
            return row[idx].strip() if idx is not None and idx < len(row) and row[idx] else ""

        venue_id = get(vid_i)
        venue_name = get(name_i)
        lat_s = get(lat_i)
        lng_s = get(lng_i)

        if not venue_name:
            continue

        stats["total"] += 1

        # Skip if already has resy_venue_id
        existing_resy_id = get(resy_id_i) if resy_id_i is not None else ""
        if existing_resy_id:
            results.append({
                "sheet_row": i + 3, "venue_id": venue_id, "name": venue_name,
                "hit_name": "", "hit_id": existing_resy_id, "hit_slug": get(resy_slug_i) if resy_slug_i else "",
                "distance_m": "", "name_similarity": "", "status": "already_has_resy_id",
            })
            stats["already_has"] += 1
            continue

        # Skip if no lat/lng
        try:
            lat = float(lat_s)
            lng = float(lng_s)
        except (ValueError, TypeError):
            stats["skipped_no_geo"] += 1
            results.append({
                "sheet_row": i + 3, "venue_id": venue_id, "name": venue_name,
                "hit_name": "", "hit_id": "", "hit_slug": "",
                "distance_m": "", "name_similarity": "", "status": "error",
            })
            continue

        # Search Resy
        hits = search_resy(venue_name, lat, lng)

        if hits is None:
            stats["error"] += 1
            results.append({
                "sheet_row": i + 3, "venue_id": venue_id, "name": venue_name,
                "hit_name": "", "hit_id": "", "hit_slug": "",
                "distance_m": "", "name_similarity": "", "status": "error",
            })
            time.sleep(RATE_LIMIT_S)
            continue

        if len(hits) == 0:
            stats["no_hits"] += 1
            results.append({
                "sheet_row": i + 3, "venue_id": venue_id, "name": venue_name,
                "hit_name": "", "hit_id": "", "hit_slug": "",
                "distance_m": "", "name_similarity": "", "status": "no_hits",
            })
            time.sleep(RATE_LIMIT_S)
            continue

        # Evaluate hits
        best = None
        best_sim = 0
        best_dist = 999999
        rejection_reason = "no_hits"

        for hit in hits:
            hit_lat = hit.get("_geoloc", {}).get("lat", 0)
            hit_lng = hit.get("_geoloc", {}).get("lng", 0)
            hit_name = hit.get("name", "")
            hit_id = hit.get("id", {}).get("resy", 0)
            hit_slug = hit.get("url_slug", "")
            hit_locality = hit.get("locality", "")

            dist = haversine_m(lat, lng, hit_lat, hit_lng) if hit_lat and hit_lng else 999999
            sim = name_similarity(venue_name, hit_name)

            # Locality check
            if hit_locality and hit_locality != "New York":
                rejection_reason = "rejected_locality"
                continue

            # Geo check
            if dist > GEO_THRESHOLD_M:
                rejection_reason = "rejected_geo"
                continue

            # Name similarity check
            if sim < NAME_SIM_THRESHOLD:
                rejection_reason = "rejected_similarity"
                continue

            # All checks pass — candidate
            if sim > best_sim or (sim == best_sim and dist < best_dist):
                best = {
                    "hit_name": hit_name, "hit_id": hit_id, "hit_slug": hit_slug,
                    "distance_m": round(dist), "name_similarity": sim,
                }
                best_sim = sim
                best_dist = dist

        if best:
            stats["matched"] += 1
            results.append({
                "sheet_row": i + 3, "venue_id": venue_id, "name": venue_name,
                "status": "matched", **best,
            })
            matched_writes.append((i + 3, best["hit_id"], best["hit_slug"]))
        else:
            stats[rejection_reason] += 1
            results.append({
                "sheet_row": i + 3, "venue_id": venue_id, "name": venue_name,
                "hit_name": "", "hit_id": "", "hit_slug": "",
                "distance_m": "", "name_similarity": "", "status": rejection_reason,
            })

        time.sleep(RATE_LIMIT_S)

        # Progress every 25
        if (stats["total"]) % 25 == 0:
            print(f"  [{stats['total']}/{len(rows)}] matched={stats['matched']} no_hits={stats['no_hits']} errors={stats['error']}")

    # Write CSV
    os.makedirs(os.path.dirname(CSV_OUT), exist_ok=True)
    with open(CSV_OUT, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "sheet_row", "venue_id", "name", "hit_name", "hit_id", "hit_slug",
            "distance_m", "name_similarity", "status",
        ])
        writer.writeheader()
        writer.writerows(results)
    print(f"\nCSV written to {CSV_OUT}")

    # Summary
    print(f"\n{'='*50}")
    print(f"Total venues scanned:          {stats['total']}")
    print(f"Already had resy_venue_id:     {stats['already_has']}")
    print(f"Matched (new):                 {stats['matched']}")
    print(f"Rejected by geo (>150m):       {stats['rejected_geo']}")
    print(f"Rejected by similarity (<85):  {stats['rejected_similarity']}")
    print(f"Rejected by locality:          {stats['rejected_locality']}")
    print(f"No hits:                       {stats['no_hits']}")
    print(f"Errors:                        {stats['error']}")
    print(f"Skipped (no lat/lng):          {stats['skipped_no_geo']}")

    if args.dry_run:
        print(f"\n[DRY RUN] Would write {len(matched_writes)} rows to sheet.")
        return

    if not matched_writes:
        print("\nNo new matches to write.")
        return

    # Confirm before write
    print(f"\nReady to write {len(matched_writes)} rows to sheet.")
    confirm = input("Proceed? (y/n): ").strip().lower()
    if confirm != "y":
        print("Aborted. Sheet not modified.")
        return

    # Batch write to sheet
    print("Writing to sheet...")

    # Build batch data — each matched row needs 3 cells: BB, BC, BD
    # BB = reservation_platform, BC = resy_venue_id, BD = resy_slug
    # These are at column indices platform_i, resy_id_i, resy_slug_i
    # But simpler: just use the known column letters BB, BC, BD
    data = []
    for sheet_row, resy_id, resy_slug in matched_writes:
        data.append({
            "range": f"NYC Venues!BB{sheet_row}:BD{sheet_row}",
            "values": [["resy", str(resy_id), resy_slug]],
        })

    # Batch update in chunks of 100
    for chunk_start in range(0, len(data), 100):
        chunk = data[chunk_start:chunk_start + 100]
        service.spreadsheets().values().batchUpdate(
            spreadsheetId=SHEET_ID,
            body={
                "valueInputOption": "RAW",
                "data": chunk,
            },
        ).execute()
        print(f"  Wrote batch {chunk_start // 100 + 1} ({len(chunk)} rows)")

    print(f"\nDone. {len(matched_writes)} rows written to sheet.")


if __name__ == "__main__":
    main()
