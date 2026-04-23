#!/usr/bin/env python3
"""
Backfill Google Places photos for composer_venues_v2.

For each venue with google_place_id and empty image_keys:
  1. Fetch place details (photos field only) from Google Places API
  2. Download first 4 photos
  3. Upload to Supabase Storage at {google_place_id}/{index}.jpg
  4. Update image_keys array in DB

Usage:
  python3 scripts/backfill_venue_photos_v2.py --dry-run   # test 5 venues, 1 upload
  python3 scripts/backfill_venue_photos_v2.py              # full backfill
"""

from __future__ import annotations
import argparse
import csv
import os
import sys
import time
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# ═══════════════════════════════════════════════════════════════════════
# Config
# ═══════════════════════════════════════════════════════════════════════

MAX_PHOTOS = 4
RATE_LIMIT_S = 0.2
CSV_OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "debug", "venue-photos-backfill-v2.csv")

# ═══════════════════════════════════════════════════════════════════════
# Env + clients
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


# ═══════════════════════════════════════════════════════════════════════
# Google Places API
# ═══════════════════════════════════════════════════════════════════════

def fetch_place_photos(place_id: str, api_key: str) -> list[dict]:
    """Fetch photo references from Google Places. Returns list of photo objects."""
    url = f"https://places.googleapis.com/v1/places/{place_id}"
    headers = {
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "photos",
    }
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            return data.get("photos", [])
    except HTTPError as e:
        if e.code == 429:
            raise
        if e.code == 403:
            print(f"  FATAL 403: {e.read().decode()[:200]}")
            sys.exit(1)
        return []
    except (URLError, TimeoutError):
        return []


def download_photo(photo_name: str, api_key: str, retries: int = 3) -> bytes | None:
    """Download photo binary from Google Places."""
    url = f"https://places.googleapis.com/v1/{photo_name}/media?maxHeightPx=800&maxWidthPx=1200&key={api_key}"
    for attempt in range(retries):
        try:
            with urlopen(url, timeout=15) as resp:
                return resp.read()
        except HTTPError as e:
            if e.code == 429:
                time.sleep(30 * (attempt + 1))
                continue
            if e.code == 403:
                print(f"  FATAL 403 on photo: {e.read().decode()[:200]}")
                sys.exit(1)
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

    api_key = os.environ.get("GOOGLE_PLACES_API_KEY")
    if not api_key:
        print("ERROR: GOOGLE_PLACES_API_KEY not set")
        sys.exit(1)

    sb = get_supabase()

    # Load venues
    print("Loading venues...")
    # Supabase default limit is 1000 — fetch in pages
    all_venues = []
    page = 0
    page_size = 1000
    while True:
        result = sb.table("composer_venues_v2") \
            .select("id, venue_id, name, google_place_id, image_keys") \
            .eq("active", True) \
            .range(page * page_size, (page + 1) * page_size - 1) \
            .execute()
        batch = result.data or []
        all_venues.extend(batch)
        if len(batch) < page_size:
            break
        page += 1
    result_data = all_venues
    result = type("R", (), {"data": result_data})()
    venues = result.data or []
    print(f"  Total active: {len(venues)}")

    # Filter to venues needing photos
    needs_photos = [v for v in venues if v.get("google_place_id") and not v.get("image_keys")]
    has_photos = [v for v in venues if v.get("image_keys") and len(v["image_keys"]) > 0]
    no_gpid = [v for v in venues if not v.get("google_place_id")]

    print(f"  Already have photos: {len(has_photos)}")
    print(f"  No google_place_id: {len(no_gpid)}")
    print(f"  Need photos: {len(needs_photos)}")

    if args.dry_run:
        needs_photos = needs_photos[:5]
        print(f"\n[DRY RUN] Processing {len(needs_photos)} venues")

    results = []
    stats = {"success": 0, "no_photos": 0, "api_error": 0, "upload_error": 0, "skipped_has": len(has_photos), "skipped_no_gpid": len(no_gpid)}
    total_uploaded = 0

    for i, venue in enumerate(needs_photos):
        gpid = venue["google_place_id"]
        name = venue["name"]

        # Fetch photo references
        try:
            photos = fetch_place_photos(gpid, api_key)
        except HTTPError:
            time.sleep(30)
            try:
                photos = fetch_place_photos(gpid, api_key)
            except Exception:
                photos = []

        if not photos:
            results.append({
                "venue_id": venue["venue_id"], "name": name, "google_place_id": gpid,
                "photos_found": 0, "photos_uploaded": 0, "status": "no_photos_returned", "error": "",
            })
            stats["no_photos"] += 1
            time.sleep(RATE_LIMIT_S)
            continue

        # Download + upload first N photos
        to_download = photos[:MAX_PHOTOS]
        if args.dry_run and i > 0:
            # Only download for the first venue in dry-run
            results.append({
                "venue_id": venue["venue_id"], "name": name, "google_place_id": gpid,
                "photos_found": len(photos), "photos_uploaded": 0,
                "status": "dry_run_skip_download", "error": "",
            })
            time.sleep(RATE_LIMIT_S)
            continue

        uploaded_keys = []
        for j, photo in enumerate(to_download):
            photo_name = photo.get("name", "")
            if not photo_name:
                continue

            img_data = download_photo(photo_name, api_key)
            if not img_data:
                continue

            storage_path = f"{gpid}/{j}.jpg"
            if args.dry_run:
                storage_path = f"dryrun/test-{gpid}/{j}.jpg"

            try:
                sb.storage.from_("venue-photos").upload(
                    path=storage_path,
                    file=img_data,
                    file_options={"content-type": "image/jpeg", "upsert": "true"},
                )
                uploaded_keys.append(storage_path if not args.dry_run else f"{gpid}/{j}.jpg")
                total_uploaded += 1
            except Exception as e:
                print(f"  Upload error for {name} photo {j}: {e}")

            time.sleep(0.05)  # Small delay between photo downloads

        if uploaded_keys and not args.dry_run:
            # Update DB
            try:
                sb.table("composer_venues_v2") \
                    .update({"image_keys": uploaded_keys}) \
                    .eq("id", venue["id"]) \
                    .execute()
            except Exception as e:
                results.append({
                    "venue_id": venue["venue_id"], "name": name, "google_place_id": gpid,
                    "photos_found": len(photos), "photos_uploaded": len(uploaded_keys),
                    "status": "upload_error", "error": str(e),
                })
                stats["upload_error"] += 1
                time.sleep(RATE_LIMIT_S)
                continue

        results.append({
            "venue_id": venue["venue_id"], "name": name, "google_place_id": gpid,
            "photos_found": len(photos), "photos_uploaded": len(uploaded_keys),
            "status": "success" if uploaded_keys else "no_photos_returned", "error": "",
        })
        if uploaded_keys:
            stats["success"] += 1
        else:
            stats["no_photos"] += 1

        time.sleep(RATE_LIMIT_S)

        # Progress every 25
        if (i + 1) % 25 == 0:
            print(f"  [{i+1}/{len(needs_photos)}] success={stats['success']} photos={total_uploaded} errors={stats['api_error']}")

    # Write CSV
    os.makedirs(os.path.dirname(CSV_OUT), exist_ok=True)
    with open(CSV_OUT, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "venue_id", "name", "google_place_id", "photos_found",
            "photos_uploaded", "status", "error",
        ])
        writer.writeheader()
        writer.writerows(results)

    # Summary
    print(f"\n{'='*50}")
    print(f"Total venues processed:   {len(needs_photos)}")
    print(f"Success (photos uploaded): {stats['success']}")
    print(f"No photos returned:        {stats['no_photos']}")
    print(f"API errors:                {stats['api_error']}")
    print(f"Upload errors:             {stats['upload_error']}")
    print(f"Skipped (already have):    {stats['skipped_has']}")
    print(f"Skipped (no google_place_id): {stats['skipped_no_gpid']}")
    print(f"Total photos uploaded:     {total_uploaded}")
    print(f"\nCSV: {CSV_OUT}")

    if args.dry_run:
        print(f"\n[DRY RUN] Would process {len([v for v in venues if v.get('google_place_id') and not v.get('image_keys')])} venues in real run")
        # Clean up dry-run uploads
        try:
            files = sb.storage.from_("venue-photos").list("dryrun", {"limit": 100})
            if files:
                for folder in files:
                    sub = sb.storage.from_("venue-photos").list(f"dryrun/{folder['name']}", {"limit": 10})
                    if sub:
                        paths = [f"dryrun/{folder['name']}/{f['name']}" for f in sub]
                        sb.storage.from_("venue-photos").remove(paths)
                print("Cleaned up dry-run uploads")
        except Exception:
            pass


if __name__ == "__main__":
    main()
