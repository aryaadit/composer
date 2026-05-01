// POST /api/admin/sync-venues
//
// Reads venue data directly from the Google Sheet and upserts into
// composer_venues_v2. Two modes:
//   - Full sync:   POST {} → upserts all venues
//   - Single sync: POST { venue_id: "c0001" } → upserts one venue
//
// Column mapping is built dynamically from the sheet's header row
// so reordering columns in the sheet doesn't break the sync.

import { NextResponse } from "next/server";
import { getSheetData, getSheetHeaders } from "@/lib/google-sheets";
import { getServiceSupabase } from "@/lib/supabase";
import { getServerSupabase } from "@/lib/supabase/server";

async function requireAdmin(): Promise<true | Response> {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data } = await supabase
    .from("composer_users")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!data?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return true;
}

function splitCsv(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .replace(/\|/g, ",")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseBool(s: string | undefined): boolean | null {
  const v = s?.toLowerCase().trim();
  if (v === "yes" || v === "true") return true;
  if (v === "no" || v === "false") return false;
  return null;
}

function parseNum(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseDate(s: string | undefined): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // Google Sheets serial date number
  const serial = parseFloat(trimmed);
  if (!isNaN(serial) && serial > 30000) {
    const d = new Date(Date.UTC(1899, 11, 30));
    d.setUTCDate(d.getUTCDate() + serial);
    return d.toISOString().split("T")[0];
  }
  return null;
}

function rowToVenue(
  row: string[],
  col: Record<string, number>
): Record<string, unknown> | null {
  const get = (key: string) => {
    const i = col[key];
    return i != null && i < row.length ? row[i]?.trim() || null : null;
  };

  const venue_id = get("venue_id");
  const name = get("name");
  if (!venue_id || !name) return null;

  const lat = parseNum(get("latitude") ?? undefined);
  const lng = parseNum(get("longitude") ?? undefined);
  if (lat == null || lng == null) return null;

  return {
    // Core identity
    venue_id,
    name,
    neighborhood: get("neighborhood") ?? null,
    category: get("category") ?? null,
    price_tier: parseNum(get("price_tier") ?? undefined),

    // Matching & scoring
    vibe_tags: splitCsv(get("vibe_tags") ?? undefined),
    occasion_tags: splitCsv(get("occasion_tags") ?? undefined),
    stop_roles: splitCsv(get("stop_roles") ?? undefined),
    time_blocks: splitCsv(get("time_blocks") ?? undefined),
    mon_blocks: splitCsv(get("mon_blocks") ?? undefined),
    tue_blocks: splitCsv(get("tue_blocks") ?? undefined),
    wed_blocks: splitCsv(get("wed_blocks") ?? undefined),
    thu_blocks: splitCsv(get("thu_blocks") ?? undefined),
    fri_blocks: splitCsv(get("fri_blocks") ?? undefined),
    sat_blocks: splitCsv(get("sat_blocks") ?? undefined),
    sun_blocks: splitCsv(get("sun_blocks") ?? undefined),

    // Logistics
    duration_hours: parseNum(get("duration_hours") ?? undefined),
    outdoor_seating: get("outdoor_seating")?.toLowerCase() ?? null,
    reservation_difficulty: parseNum(get("reservation_difficulty") ?? undefined),
    reservation_lead_days: parseNum(get("reservation_lead_days") ?? undefined),
    reservation_url: get("reservation_url"),
    maps_url: get("maps_url"),

    // Curation
    curation_note: get("curation_note"),
    awards: get("awards"),
    quality_score: parseNum(get("quality_score") ?? undefined) ?? 7,
    curation_boost: parseNum(get("curation_boost") ?? undefined) ?? 0,
    curated_by: get("curated_by")?.toLowerCase() ?? null,

    // Geo
    address: get("address"),
    latitude: lat,
    longitude: lng,

    // Status
    active: parseBool(get("active") ?? undefined) ?? true,
    notes: get("notes"),
    verified: parseBool(get("verified") ?? undefined),
    hours: get("hours"),
    last_verified: parseDate(get("last_verified") ?? undefined),
    last_updated: parseDate(get("last_updated") ?? undefined),

    // Attributes
    happy_hour: get("happy_hour"),
    dog_friendly: parseBool(get("dog_friendly") ?? undefined),
    kid_friendly: parseBool(get("kid_friendly") ?? undefined),
    wheelchair_accessible: parseBool(get("wheelchair_accessible") ?? undefined),
    signature_order: get("signature_order"),
    google_place_id: get("google_place_id"),

    // Corner source
    corner_id: get("corner_id"),
    corner_photo_url: get("corner_photo_url"),
    guide_count: parseNum(get("guide_count") ?? undefined),
    source_guides: splitCsv(get("source_guides") ?? undefined),
    all_neighborhoods: splitCsv(get("all_neighborhoods") ?? undefined),

    // Google Places
    google_rating: parseNum(get("google_rating") ?? undefined),
    google_review_count: parseNum(get("google_review_count") ?? undefined),
    google_types: splitCsv(get("google_types") ?? undefined),
    google_phone: get("google_phone"),
    enriched: parseBool(get("enriched") ?? undefined) ?? false,
    business_status: get("business_status"),

    // Reservation
    reservation_platform: get("reservation_platform"),
    resy_venue_id: parseNum(get("resy_venue_id") ?? undefined),
    resy_slug: get("resy_slug"),
  };
}

interface SyncRequestBody {
  venue_id?: string;
}

const EXPECTED_SHEET_ID = "1EdJqvFKaGAAo5oKMXBXeXfZdzfdT9IsmLiQYA9whXVg";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth !== true) return auth;

  if (process.env.GOOGLE_SHEET_ID !== EXPECTED_SHEET_ID) {
    return NextResponse.json(
      {
        error:
          "GOOGLE_SHEET_ID in .env.local does not match the expected v2 sheet. Update your .env.local before running sync to avoid corrupting v2 data with stale v1 sheet data.",
        expected: EXPECTED_SHEET_ID,
        got: process.env.GOOGLE_SHEET_ID,
      },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as SyncRequestBody;
    const singleVenueId = body.venue_id;

    // Build column index map from sheet headers
    const headers = await getSheetHeaders();
    const col: Record<string, number> = {};
    headers.forEach((h, i) => {
      const key = h.trim().toLowerCase();
      if (key) col[key] = i;
    });

    if (!("venue_id" in col) || !("name" in col)) {
      return NextResponse.json(
        {
          error: "Sheet headers missing venue_id or name column",
          headers,
        },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();

    if (singleVenueId) {
      // Single venue sync
      const rows = await getSheetData();
      const vidIdx = col["venue_id"];
      const row = rows.find((r) => r[vidIdx]?.trim() === singleVenueId);
      if (!row) {
        return NextResponse.json(
          { error: `Venue ${singleVenueId} not found in sheet` },
          { status: 404 }
        );
      }

      const venue = rowToVenue(row, col);
      if (!venue) {
        return NextResponse.json(
          { error: "Row is missing required fields" },
          { status: 400 }
        );
      }

      const { error } = await supabase
        .from("composer_venues_v2")
        .upsert(venue, { onConflict: "venue_id" });

      if (error) {
        console.error("[sync-venues] upsert error:", error.message);
        return NextResponse.json({ error: "Failed to upsert venue" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        synced: 1,
        venue: venue.name as string,
      });
    } else {
      // Full sync
      const rows = await getSheetData();
      const venues = rows
        .map((r) => rowToVenue(r, col))
        .filter((v): v is Record<string, unknown> => v !== null);

      if (venues.length === 0) {
        return NextResponse.json(
          { error: "No valid venues found in sheet" },
          { status: 400 }
        );
      }

      // Supabase upsert has a row limit per call — batch in chunks of 100
      let synced = 0;
      for (let i = 0; i < venues.length; i += 100) {
        const batch = venues.slice(i, i + 100);
        const { error } = await supabase
          .from("composer_venues_v2")
          .upsert(batch, { onConflict: "venue_id" });
        if (error) {
          console.error("[sync-venues] batch upsert error:", error.message);
          return NextResponse.json(
            { error: "Failed to upsert batch", synced },
            { status: 500 }
          );
        }
        synced += batch.length;
      }

      return NextResponse.json({ success: true, synced });
    }
  } catch (err) {
    console.error("[sync-venues]", err);
    console.error("[sync-venues] unexpected error:", err);
    return NextResponse.json(
      { error: "Sync failed" },
      { status: 500 }
    );
  }
}
