// Generic auth-code exchange endpoint.
//
// Under email/password auth this is rarely hit — the password reset
// flow redirects straight to `/auth/reset` (which handles its own code
// exchange), and there's no magic-link flow anymore. Kept in place as
// a safety net for any PKCE redirect that might still carry a `?code`
// here (e.g. if Supabase project settings change, or if we add email
// confirmation later). No profile upsert, no special handling — just
// exchange the code (if present) and redirect home.

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const err = encodeURIComponent(error.message);
      return NextResponse.redirect(`${origin}/?auth_error=${err}`);
    }
  }

  return NextResponse.redirect(`${origin}/`);
}
