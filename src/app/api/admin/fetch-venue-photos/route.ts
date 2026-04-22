// POST /api/admin/fetch-venue-photos
//
// Downloads venue photos from Google Places and uploads to Supabase Storage.
// Two modes:
//   - Single venue: POST { venueId: "v148" }
//   - All missing:  POST {}
//
// Requires admin auth.

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getServerSupabase } from "@/lib/supabase/server";
import { fetchPlacePhoto } from "@/lib/google-places";

const MAX_PHOTOS = 4;

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
      .select("id, venue_id, name, google_place_data")
      .not("google_place_data", "is", null);

    if (body.venueId) {
      query = query.eq("venue_id", body.venueId);
    } else {
      query = query.or("google_place_photos.is.null,google_place_photos.eq.{}");
    }

    const { data: venues, error } = await query;
    if (error) {
      console.error("[fetch-venue-photos] query error:", error.message);
      return NextResponse.json(
        { error: "Failed to query venues" },
        { status: 500 }
      );
    }

    let updated = 0;
    const errors: string[] = [];

    for (const venue of venues) {
      const placeData = venue.google_place_data as {
        photos?: { name: string }[];
      };
      if (!placeData.photos?.length) continue;

      const count = Math.min(placeData.photos.length, MAX_PHOTOS);
      const paths: string[] = [];

      for (let j = 0; j < count; j++) {
        const buffer = await fetchPlacePhoto(placeData.photos[j].name);
        if (buffer) {
          const storagePath = `${venue.venue_id}/${j + 1}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from("venue-photos")
            .upload(storagePath, buffer, {
              contentType: "image/jpeg",
              upsert: true,
            });
          if (!uploadError) paths.push(storagePath);
        }
        await sleep(150);
      }

      if (paths.length > 0) {
        const { error: updateError } = await supabase
          .from("composer_venues")
          .update({ google_place_photos: paths })
          .eq("id", venue.id);

        if (updateError) {
          errors.push(`${venue.name}: ${updateError.message}`);
        } else {
          updated++;
        }
      }
    }

    return NextResponse.json({ updated, errors, total: venues.length });
  } catch (err) {
    console.error("[fetch-venue-photos] unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to fetch photos" },
      { status: 500 }
    );
  }
}
