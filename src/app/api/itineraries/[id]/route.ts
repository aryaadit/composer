// PATCH /api/itineraries/[id] — rename a saved itinerary.
// Sets or clears the custom_name field. RLS ensures the user can
// only update their own rows.

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

interface PatchBody {
  customName?: string | null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const customName =
    typeof body.customName === "string" && body.customName.trim()
      ? body.customName.trim()
      : null;

  const { error } = await supabase
    .from("composer_saved_itineraries")
    .update({ custom_name: customName })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[itineraries/patch] update error:", error.message);
    return NextResponse.json(
      { error: "Failed to rename" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, custom_name: customName });
}
