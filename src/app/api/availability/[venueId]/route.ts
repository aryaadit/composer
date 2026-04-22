// GET /api/availability/{venueId}?date=YYYY-MM-DD&partySize=2
//
// Returns available reservation slots for a venue. Requires an
// authenticated Supabase session to prevent drive-by scraping.

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getVenueAvailability } from "@/lib/availability";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;

  // Auth check
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Validate venueId
  if (!UUID_RE.test(venueId)) {
    return NextResponse.json({ error: "Invalid venue ID" }, { status: 400 });
  }

  // Parse query params
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const partySizeStr = searchParams.get("partySize");

  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json(
      { error: "date is required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  // Don't allow past dates
  const today = new Date().toISOString().split("T")[0];
  if (date < today) {
    return NextResponse.json(
      { error: "Date cannot be in the past" },
      { status: 400 }
    );
  }

  const partySize = parseInt(partySizeStr ?? "2", 10);
  if (isNaN(partySize) || partySize < 1 || partySize > 20) {
    return NextResponse.json(
      { error: "partySize must be 1-20" },
      { status: 400 }
    );
  }

  try {
    const result = await getVenueAvailability(venueId, date, partySize);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[availability] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch availability" },
      { status: 500 }
    );
  }
}
