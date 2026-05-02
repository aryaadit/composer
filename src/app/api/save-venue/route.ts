// POST /api/save-venue — toggle a venue in the user's saved_venue_ids.
// Idempotent: saving already-saved or unsaving absent is a no-op.

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getSupabase } from "@/lib/supabase";

interface SaveVenueBody {
  venueId: string;
  action: "save" | "unsave";
}

export async function POST(request: Request) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not signed in" });
    }

    const body = (await request.json()) as SaveVenueBody;
    if (!body.venueId || !["save", "unsave"].includes(body.action)) {
      return NextResponse.json({ ok: false, error: "Invalid request" });
    }

    // Validate venue exists in the catalog.
    const { data: venue } = await getSupabase()
      .from("composer_venues_v2")
      .select("id")
      .eq("id", body.venueId)
      .maybeSingle();
    if (!venue) {
      return NextResponse.json({ ok: false, error: "Venue not found" });
    }

    // Read current saved IDs, mutate, write back.
    const { data: profile } = await supabase
      .from("composer_users")
      .select("saved_venue_ids")
      .eq("id", user.id)
      .single();

    const current: string[] = (profile?.saved_venue_ids as string[]) ?? [];

    let next: string[];
    if (body.action === "save") {
      next = current.includes(body.venueId)
        ? current
        : [...current, body.venueId];
    } else {
      next = current.filter((id) => id !== body.venueId);
    }

    if (next !== current) {
      await supabase
        .from("composer_users")
        .update({
          saved_venue_ids: next,
          saved_venues_updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[save-venue] error:", err);
    return NextResponse.json({ ok: false, error: "Failed to save" });
  }
}
