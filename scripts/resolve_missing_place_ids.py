#!/usr/bin/env python3
"""
Resolve Google Place IDs for active venues that have neither image_keys
nor google_place_id. Output CSV for operator spot-check before any DB write.

Filter:  active=true AND google_place_id IS NULL AND image_keys empty

For each venue, calls Google Places Text Search with query = "{name} {address}"
and a 500m location bias around the venue's lat/lng. Top match is recorded
along with confidence signals (name similarity, distance, business status).

Usage:
  python3 scripts/resolve_missing_place_ids.py

Output: docs/debug/place_id_resolution_<timestamp>.csv
Does NOT write to Supabase or the sheet.
"""
from __future__ import annotations
import csv
import json
import math
import os
import re
import sys
import time
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "docs" / "debug"

# Search window around the venue's recorded lat/lng. NYC blocks ≈ 80m,
# so 500m covers neighborhood-level ambiguity without bleeding into the
# wrong neighborhood.
LOCATION_BIAS_RADIUS_M = 500.0
RATE_LIMIT_S = 0.25  # 4 RPS — well under Places API limits


def load_env() -> None:
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


load_env()

API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY") or ""
if not API_KEY:
    print("ERROR: GOOGLE_PLACES_API_KEY not set in .env.local", file=sys.stderr)
    sys.exit(1)


def get_supabase():
    try:
        from supabase import create_client
        return create_client(
            os.environ["NEXT_PUBLIC_SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    except ImportError:
        print("ERROR: supabase-py not installed. Run: pip3 install supabase", file=sys.stderr)
        sys.exit(1)


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance between two lat/lng points in meters."""
    R = 6371000
    to_rad = math.radians
    dlat = to_rad(lat2 - lat1)
    dlon = to_rad(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def name_similarity(a: str, b: str) -> int:
    """0-100 score. Case-insensitive, ignores common business-name noise."""
    def clean(s: str) -> str:
        s = s.lower()
        # Strip punctuation that varies between sources
        s = re.sub(r"[^a-z0-9 ]", " ", s)
        # Collapse whitespace
        s = re.sub(r"\s+", " ", s).strip()
        return s

    return int(round(SequenceMatcher(None, clean(a), clean(b)).ratio() * 100))


def classify_confidence(
    name_sim: int, distance_m: float, business_status: str
) -> str:
    """Cheap heuristic — operator still spot-checks."""
    notes = []
    if business_status not in ("OPERATIONAL", ""):
        notes.append(f"status={business_status}")
    if distance_m > 200:
        notes.append(f"{int(distance_m)}m away")
    if name_sim < 70:
        notes.append(f"name-sim {name_sim}")
    if not notes:
        return "high"
    if name_sim < 50 or distance_m > 400 or business_status == "CLOSED_PERMANENTLY":
        return "low: " + ", ".join(notes)
    return "medium: " + ", ".join(notes)


def search_text(query: str, lat: float, lng: float) -> list[dict]:
    """Call Places Text Search. Returns list of place candidates (top 5)."""
    body = {
        "textQuery": query,
        "locationBias": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": LOCATION_BIAS_RADIUS_M,
            }
        },
        "maxResultCount": 5,
    }
    field_mask = ",".join(
        [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.location",
            "places.rating",
            "places.userRatingCount",
            "places.businessStatus",
            "places.types",
        ]
    )
    req = Request(
        "https://places.googleapis.com/v1/places:searchText",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": API_KEY,
            "X-Goog-FieldMask": field_mask,
        },
        method="POST",
    )
    try:
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            return data.get("places", []) or []
    except HTTPError as e:
        if e.code == 403:
            print(f"  FATAL 403: {e.read().decode()[:200]}", file=sys.stderr)
            sys.exit(1)
        if e.code == 429:
            time.sleep(15)
            return []
        return []
    except (URLError, TimeoutError):
        return []


def main() -> int:
    sb = get_supabase()
    print("Querying Supabase for active venues with no place_id + no image...", file=sys.stderr)

    result = (
        sb.table("composer_venues_v2")
        .select("id, venue_id, name, neighborhood, address, latitude, longitude")
        .eq("active", True)
        .is_("google_place_id", None)
        .execute()
    )
    rows = result.data or []
    # Filter for empty image_keys client-side (Postgres array IS NULL semantics
    # vary; the actual schema has NOT NULL DEFAULT '{}' so the predicate is
    # "empty array" rather than NULL).
    targets = [r for r in rows if not r.get("image_keys")]
    # Re-fetch to be safe — the select above didn't include image_keys.
    # Just refetch with image_keys.
    result = (
        sb.table("composer_venues_v2")
        .select("id, venue_id, name, neighborhood, address, latitude, longitude, image_keys")
        .eq("active", True)
        .is_("google_place_id", None)
        .execute()
    )
    rows = result.data or []
    targets = [
        r for r in rows
        if not r.get("image_keys") or len(r.get("image_keys") or []) == 0
    ]
    print(f"  {len(targets)} venues to resolve", file=sys.stderr)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    out_path = OUT_DIR / f"place_id_resolution_{timestamp}.csv"

    fieldnames = [
        "venue_id",
        "name",
        "neighborhood",
        "original_address",
        "resolved_place_id",
        "place_name_returned",
        "place_address_returned",
        "google_rating",
        "google_review_count",
        "business_status",
        "name_similarity",
        "distance_m",
        "candidate_count",
        "confidence",
        "other_candidates",
    ]

    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for i, venue in enumerate(targets, 1):
            name = venue["name"] or ""
            address = venue.get("address") or ""
            neighborhood = venue.get("neighborhood") or ""
            lat = venue.get("latitude")
            lng = venue.get("longitude")

            # Query: name + address (most disambiguating combo)
            query_parts = [name]
            if address:
                query_parts.append(address)
            query = " ".join(query_parts)

            print(f"[{i}/{len(targets)}] {name[:40]:<40} ", file=sys.stderr, end="")

            if lat is None or lng is None:
                writer.writerow(
                    {
                        "venue_id": venue["venue_id"],
                        "name": name,
                        "neighborhood": neighborhood,
                        "original_address": address,
                        "resolved_place_id": "",
                        "place_name_returned": "",
                        "place_address_returned": "",
                        "google_rating": "",
                        "google_review_count": "",
                        "business_status": "",
                        "name_similarity": "",
                        "distance_m": "",
                        "candidate_count": 0,
                        "confidence": "skip: no coordinates",
                        "other_candidates": "",
                    }
                )
                print("(no coords)", file=sys.stderr)
                continue

            candidates = search_text(query, lat, lng)
            time.sleep(RATE_LIMIT_S)

            if not candidates:
                writer.writerow(
                    {
                        "venue_id": venue["venue_id"],
                        "name": name,
                        "neighborhood": neighborhood,
                        "original_address": address,
                        "resolved_place_id": "",
                        "place_name_returned": "",
                        "place_address_returned": "",
                        "google_rating": "",
                        "google_review_count": "",
                        "business_status": "",
                        "name_similarity": 0,
                        "distance_m": "",
                        "candidate_count": 0,
                        "confidence": "no results",
                        "other_candidates": "",
                    }
                )
                print("no results", file=sys.stderr)
                continue

            top = candidates[0]
            place_id = top.get("id") or ""
            place_name = (top.get("displayName") or {}).get("text") or ""
            place_addr = top.get("formattedAddress") or ""
            loc = top.get("location") or {}
            place_lat = loc.get("latitude")
            place_lng = loc.get("longitude")
            rating = top.get("rating", "")
            review_count = top.get("userRatingCount", "")
            biz_status = top.get("businessStatus") or ""

            name_sim = name_similarity(name, place_name)
            distance_m = (
                haversine_m(lat, lng, place_lat, place_lng)
                if place_lat is not None and place_lng is not None
                else 0
            )
            confidence = classify_confidence(name_sim, distance_m, biz_status)

            # Capture other candidates' names for ambiguity awareness
            others = []
            for c in candidates[1:]:
                cn = (c.get("displayName") or {}).get("text") or "?"
                others.append(cn)
            other_str = " | ".join(others[:3])

            writer.writerow(
                {
                    "venue_id": venue["venue_id"],
                    "name": name,
                    "neighborhood": neighborhood,
                    "original_address": address,
                    "resolved_place_id": place_id,
                    "place_name_returned": place_name,
                    "place_address_returned": place_addr,
                    "google_rating": rating,
                    "google_review_count": review_count,
                    "business_status": biz_status,
                    "name_similarity": name_sim,
                    "distance_m": int(distance_m),
                    "candidate_count": len(candidates),
                    "confidence": confidence,
                    "other_candidates": other_str,
                }
            )
            print(
                f"{confidence[:7]:<8} sim={name_sim} dist={int(distance_m)}m  → {place_name[:30]}",
                file=sys.stderr,
            )

    print(f"\nCSV: {out_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
