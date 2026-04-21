// POST /api/admin/fetch-place-data
//
// Fetches Google Places details and stores as JSONB. Two modes:
//   - Single venue: POST { venueId: "v148" }
//   - All missing:  POST {}
//
// Requires admin auth. Uses service-role client for DB writes.

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getServerSupabase } from "@/lib/supabase/server";
import { fetchPlaceDetails } from "@/lib/google-places";

async function requireAdmin(): Promise<true | Response> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

interface RequestBody {
  venueId?: string;
  refreshAll?: boolean;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth !== true) return auth;

  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const supabase = getServiceSupabase();

    let query = supabase
      .from("composer_venues")
      .select("id, venue_id, name, google_place_id")
      .not("google_place_id", "is", null);

    if (body.venueId) {
      query = query.eq("venue_id", body.venueId);
    } else if (!body.refreshAll) {
      query = query.is("google_place_data", null);
    }

    const { data: venues, error } = await query;
    if (error) {
      console.error("[fetch-place-data] query error:", error.message);
      return NextResponse.json(
        { error: "Failed to query venues" },
        { status: 500 }
      );
    }

    let updated = 0;
    const errors: string[] = [];

    for (const venue of venues) {
      const placeData = await fetchPlaceDetails(venue.google_place_id);
      if (placeData) {
        const { error: updateError } = await supabase
          .from("composer_venues")
          .update({
            google_place_data: placeData,
            google_data_updated_at: new Date().toISOString(),
          })
          .eq("id", venue.id);

        if (updateError) {
          errors.push(`${venue.name}: ${updateError.message}`);
        } else {
          updated++;
        }
      } else {
        errors.push(`${venue.name}: API returned no data`);
      }

      await sleep(170);
    }

    return NextResponse.json({ updated, errors, total: venues.length });
  } catch (err) {
    console.error("[fetch-place-data] unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to fetch place data" },
      { status: 500 }
    );
  }
}
