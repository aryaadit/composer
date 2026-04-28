#!/usr/bin/env python3
"""
Backfill price_tier from Google Places priceLevel field.

For each active venue with null price_tier and a google_place_id:
  1. Fetch place details (priceLevel field only) from Google Places API
  2. Map Google enum to our 1-4 tier scale
  3. Update price_tier in DB

Usage:
  python3 scripts/backfill_price_tier.py --dry-run   # test 5 venues, no writes
  python3 scripts/backfill_price_tier.py              # full backfill
"""

from __future__ import annotations
import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
CSV_OUT = ROOT / "docs" / "debug" / "price-tier-backfill.csv"
RATE_LIMIT_S = 0.2

# Google Places priceLevel enum → our 1-4 tier scale
# https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places#PriceLevel
PRICE_LEVEL_MAP = {
    "PRICE_LEVEL_FREE": None,
    "PRICE_LEVEL_INEXPENSIVE": 1,
    "PRICE_LEVEL_MODERATE": 2,
    "PRICE_LEVEL_EXPENSIVE": 3,
    "PRICE_LEVEL_VERY_EXPENSIVE": 4,
    "PRICE_LEVEL_UNSPECIFIED": None,
}


def load_env():
    env_file = ROOT / ".env.local"
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    os.environ.setdefault(key.strip(), val.strip().strip('"'))


def get_supabase():
    try:
        from supabase import create_client
        return create_client(
            os.environ["NEXT_PUBLIC_SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    except ImportError:
        print("ERROR: supabase-py not installed. Run: pip3 install supabase")
        sys.exit(1)


def fetch_price_level(place_id: str, api_key: str) -> str | None:
    """Fetch priceLevel from Google Places (New). Returns enum string or None."""
    url = f"https://places.googleapis.com/v1/places/{place_id}"
    headers = {
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "priceLevel",
    }
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            return data.get("priceLevel")
    except HTTPError as e:
        if e.code == 429:
            raise
        if e.code == 403:
            print(f"  FATAL 403: {e.read().decode()[:200]}")
            sys.exit(1)
        return None
    except (URLError, TimeoutError):
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Test 5 venues, no writes")
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("GOOGLE_PLACES_API_KEY")
    if not api_key:
        print("ERROR: GOOGLE_PLACES_API_KEY not set in .env.local")
        sys.exit(1)

    supabase = get_supabase()

    # Fetch venues with null price_tier, paginated
    all_venues = []
    page_size = 1000
    offset = 0
    while True:
        res = supabase.table("composer_venues_v2") \
            .select("id, venue_id, name, google_place_id") \
            .eq("active", True) \
            .is_("price_tier", "null") \
            .not_.is_("google_place_id", "null") \
            .range(offset, offset + page_size - 1) \
            .execute()
        all_venues.extend(res.data)
        if len(res.data) < page_size:
            break
        offset += page_size

    venues = all_venues
    print(f"Found {len(venues)} active venues with null price_tier and google_place_id")

    if args.dry_run:
        venues = venues[:5]
        print(f"DRY RUN: Processing {len(venues)} venues")

    CSV_OUT.parent.mkdir(parents=True, exist_ok=True)
    rows_written = []
    updated_count = 0
    no_data_count = 0
    error_count = 0

    for i, v in enumerate(venues):
        try:
            level_str = fetch_price_level(v["google_place_id"], api_key)
            tier = PRICE_LEVEL_MAP.get(level_str) if level_str else None

            rows_written.append({
                "venue_id": v["venue_id"],
                "name": v["name"],
                "google_place_id": v["google_place_id"],
                "google_price_level": level_str or "",
                "mapped_tier": tier if tier is not None else "",
            })

            if tier is not None:
                if not args.dry_run:
                    supabase.table("composer_venues_v2") \
                        .update({"price_tier": tier}) \
                        .eq("id", v["id"]) \
                        .execute()
                updated_count += 1
                status = "DRY" if args.dry_run else "UPDATED"
                print(f"  [{i+1}/{len(venues)}] {status:8s} {v['name'][:40]:40s} → tier {tier} (from {level_str})")
            else:
                no_data_count += 1
                print(f"  [{i+1}/{len(venues)}] NO DATA  {v['name'][:40]:40s} (priceLevel: {level_str})")

            time.sleep(RATE_LIMIT_S)

        except Exception as e:
            error_count += 1
            print(f"  [{i+1}/{len(venues)}] ERROR    {v['name'][:40]:40s} — {e}")

    if rows_written:
        with open(CSV_OUT, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows_written[0].keys()))
            writer.writeheader()
            writer.writerows(rows_written)

    print()
    print(f"Done. Updated {updated_count}, no data {no_data_count}, errors {error_count}")
    print(f"CSV: {CSV_OUT}")
    if args.dry_run:
        print("DRY RUN — no writes made.")


if __name__ == "__main__":
    main()
