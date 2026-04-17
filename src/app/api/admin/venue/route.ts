// GET /api/admin/venue?name=<search>
// Returns up to 5 matching venues with all fields. Venue data is public
// (anon SELECT policy) so no auth check — the admin section UI gates
// visibility client-side via is_admin.

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.trim();

  if (!name) {
    return NextResponse.json({ query: "", count: 0, venues: [] });
  }

  const { data, error } = await getSupabase()
    .from("composer_venues")
    .select("*")
    .ilike("name", `%${name}%`)
    .limit(5);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    query: name,
    count: data?.length ?? 0,
    venues: data ?? [],
  });
}
