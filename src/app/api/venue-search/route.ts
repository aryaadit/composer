// GET /api/venue-search?q=<query> — catalog-first venue search with
// Google Places fallback. Saved venues bubble to the top.

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getServerSupabase } from "@/lib/supabase/server";

interface SearchResult {
  id: string;
  name: string;
  neighborhood: string;
  category: string | null;
  source: "catalog" | "google_places";
  google_place_id?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // Get user's saved IDs for ranking.
  let savedIds: string[] = [];
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("composer_users")
        .select("saved_venue_ids")
        .eq("id", user.id)
        .maybeSingle();
      savedIds = (data?.saved_venue_ids as string[]) ?? [];
    }
  } catch {
    // Continue without saved IDs.
  }

  // Catalog search — case-insensitive substring on name.
  const { data: catalogRows } = await getSupabase()
    .from("composer_venues_v2")
    .select("id, name, neighborhood, category")
    .eq("active", true)
    .ilike("name", `%${q}%`)
    .limit(10);

  const savedSet = new Set(savedIds);
  const catalog: SearchResult[] = (catalogRows ?? [])
    .map((r) => ({
      id: r.id as string,
      name: r.name as string,
      neighborhood: r.neighborhood as string,
      category: r.category as string | null,
      source: "catalog" as const,
    }))
    .sort((a, b) => {
      const aS = savedSet.has(a.id) ? 0 : 1;
      const bS = savedSet.has(b.id) ? 0 : 1;
      return aS - bS;
    });

  if (catalog.length > 0) {
    return NextResponse.json({ results: catalog });
  }

  // Google Places fallback — only when catalog returns zero.
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) {
    return NextResponse.json({ results: [], fallbackUnavailable: true });
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", q);
    url.searchParams.set("key", placesKey);
    url.searchParams.set("types", "establishment");
    url.searchParams.set("location", "40.7580,-73.9855");
    url.searchParams.set("radius", "15000");
    url.searchParams.set("strictbounds", "true");

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error();
    const data = await res.json();

    const places: SearchResult[] = (data.predictions ?? [])
      .slice(0, 5)
      .map((p: { place_id: string; description: string }) => ({
        id: p.place_id,
        name: p.description.split(",")[0],
        neighborhood: "",
        category: null,
        source: "google_places" as const,
        google_place_id: p.place_id,
      }));

    return NextResponse.json({ results: places });
  } catch {
    return NextResponse.json({ results: [], fallbackUnavailable: true });
  }
}
