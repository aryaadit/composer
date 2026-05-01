#!/usr/bin/env python3
"""
Restore composer_venues_v2.image_keys from a CSV snapshot.

Reads docs/debug/image_keys_snapshot_<timestamp>.csv and updates each
matching row by google_place_id. Rows in the CSV that don't match any
row in the new DB (because the venue was removed in the new sheet) are
skipped and logged.
"""

from __future__ import annotations
import argparse
import csv
import json
import os
import sys


def load_env():
    env_file = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, _, val = line.partition("=")
                    os.environ.setdefault(key.strip(), val.strip().strip('"'))


def get_supabase():
    from supabase import create_client
    return create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot_path", help="Path to image_keys_snapshot CSV")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()

    if not os.path.exists(args.snapshot_path):
        print(f"ERROR: snapshot file not found: {args.snapshot_path}")
        sys.exit(1)

    load_env()
    supabase = get_supabase()

    rows = []
    with open(args.snapshot_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({
                "google_place_id": row["google_place_id"],
                "image_keys": json.loads(row["image_keys"]),
            })
    print(f"Loaded {len(rows)} snapshot rows")

    updated = 0
    not_found = 0
    errors = 0

    for i, snap in enumerate(rows):
        try:
            if args.dry_run:
                res = supabase.table("composer_venues_v2") \
                    .select("id") \
                    .eq("google_place_id", snap["google_place_id"]) \
                    .execute()
                if res.data:
                    updated += 1
                    if i % 100 == 0:
                        print(f"  [{i+1}/{len(rows)}] DRY: would update {snap['google_place_id'][:30]}...")
                else:
                    not_found += 1
            else:
                res = supabase.table("composer_venues_v2") \
                    .update({"image_keys": snap["image_keys"]}) \
                    .eq("google_place_id", snap["google_place_id"]) \
                    .execute()
                if res.data and len(res.data) > 0:
                    updated += 1
                    if i % 100 == 0:
                        print(f"  [{i+1}/{len(rows)}] UPDATED {snap['google_place_id'][:30]}...")
                else:
                    not_found += 1
        except Exception as e:
            errors += 1
            print(f"  ERROR for {snap['google_place_id']}: {e}")

    print()
    print(f"Done. Updated {updated}, not found {not_found}, errors {errors}")
    print(f"Total in snapshot: {len(rows)}")
    if args.dry_run:
        print("DRY RUN — no writes made.")
    if not_found > 0:
        print(f"\nNote: {not_found} venues from snapshot are not in the new DB.")
        print("These are venues that existed in the old sheet but not the new one (e.g., the 82 London restaurants).")


if __name__ == "__main__":
    main()
