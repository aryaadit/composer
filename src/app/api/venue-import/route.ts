// POST /api/venue-import — create a provisional venue from Google Places.
// Idempotent: if google_place_id already exists, returns the existing row.
// Fires a founder-review webhook (best-effort) on new rows.

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getServerSupabase } from "@/lib/supabase/server";
import { inferVibe } from "@/lib/vibe-inference";

interface ImportBody {
  google_place_id: string;
}

export async function POST(request: Request) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not signed in" });
    }

    const body = (await request.json()) as ImportBody;
    if (!body.google_place_id) {
      return NextResponse.json({ ok: false, error: "Missing google_place_id" });
    }

    // Check if already imported.
    const { data: existing } = await getSupabase()
      .from("composer_venues_v2")
      .select("*")
      .eq("google_place_id", body.google_place_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, venue: existing });
    }

    // Fetch Place Details from Google.
    const placesKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!placesKey) {
      return NextResponse.json({ ok: false, error: "Google Places unavailable" });
    }

    const detailUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
    detailUrl.searchParams.set("place_id", body.google_place_id);
    detailUrl.searchParams.set("key", placesKey);
    detailUrl.searchParams.set("fields", "name,formatted_address,geometry,types,price_level,website");

    const detailRes = await fetch(detailUrl.toString());
    if (!detailRes.ok) {
      return NextResponse.json({ ok: false, error: "Google Places lookup failed" });
    }

    const detail = await detailRes.json();
    const place = detail.result;
    if (!place?.name || !place?.geometry?.location) {
      return NextResponse.json({ ok: false, error: "Incomplete place data" });
    }

    // Infer vibe from Google types.
    const vibeResult = await inferVibe({
      name: place.name,
      googlePlacesTypes: place.types ?? [],
      priceLevel: place.price_level ?? null,
      address: place.formatted_address ?? "",
    });

    // Insert provisional row.
    const row = {
      name: place.name,
      address: place.formatted_address ?? null,
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng,
      google_place_id: body.google_place_id,
      google_types: place.types ?? [],
      provenance: "google_places",
      pending_curation: true,
      provisional_added_at: new Date().toISOString(),
      provisional_added_by: user.id,
      inferred_vibe: vibeResult.vibe,
      active: true,
      neighborhood: "unknown",
      vibe_tags: vibeResult.vibe ? [vibeResult.vibe] : [],
      occasion_tags: [],
      stop_roles: ["main"],
      quality_score: 5,
      curation_boost: 0,
      time_blocks: ["morning", "afternoon", "evening", "late_night"],
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("composer_venues_v2")
      .insert(row)
      .select()
      .single();

    if (insertErr) {
      console.error("[venue-import] insert failed:", insertErr.message);
      return NextResponse.json({ ok: false, error: "Import failed" });
    }

    // Founder-review notification (best-effort).
    const webhookUrl = process.env.FOUNDER_REVIEW_WEBHOOK_URL;
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `New provisional venue: ${place.name} (${place.formatted_address})\nInferred vibe: ${vibeResult.vibe ?? "unknown"} (${vibeResult.confidence})\nAdded by: ${user.id}`,
        }),
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      venue: inserted,
      vibeConfidence: vibeResult.confidence,
    });
  } catch (err) {
    console.error("[venue-import] error:", err);
    return NextResponse.json({ ok: false, error: "Import failed" });
  }
}
