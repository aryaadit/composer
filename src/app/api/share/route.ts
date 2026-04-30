// POST /api/share — snapshot an itinerary into a shareable public link.
// Returns { id, url } where url is the public view page. The itinerary
// is stored as-is (JSONB) so the shared view renders exactly what the
// sharer saw, even if venue data changes later.

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import type { ItineraryResponse } from "@/types";

export async function POST(request: Request) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const itinerary = (await request.json()) as ItineraryResponse;
    if (!itinerary?.stops?.length) {
      return NextResponse.json({ error: "No itinerary" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("composer_shared_itineraries")
      .insert({
        itinerary,
        time_block: itinerary.inputs?.timeBlock ?? "evening",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[share] insert failed:", error.message);
      return NextResponse.json({ error: "Failed to share" }, { status: 500 });
    }

    // Always use the production domain for share links — preview deploy
    // URLs are behind Vercel auth and won't work for recipients.
    const PROD_ORIGIN = "https://composer.onpalate.com";
    const rawOrigin = request.headers.get("origin") ?? "";
    const isPreview =
      !rawOrigin ||
      (rawOrigin.includes("aryaadits-projects") && rawOrigin.includes("vercel.app")) ||
      rawOrigin.includes("composer-git-") ||
      rawOrigin.includes("localhost");
    const origin = isPreview ? PROD_ORIGIN : rawOrigin;
    return NextResponse.json({
      id: data.id,
      url: `${origin}/itinerary/share/${data.id}`,
    });
  } catch (err) {
    console.error("[share] error:", err);
    return NextResponse.json({ error: "Failed to share" }, { status: 500 });
  }
}
