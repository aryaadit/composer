// GET /api/admin/venue?name=<search>
// Returns up to 5 matching venues. Requires admin auth.

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
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

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth !== true) return auth;

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
    console.error("[admin/venue] query error:", error.message);
    return NextResponse.json(
      { error: "Failed to search venues" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    query: name,
    count: data?.length ?? 0,
    venues: data ?? [],
  });
}
