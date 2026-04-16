// Generic auth-code exchange endpoint. A safety net for any PKCE
// redirect carrying a `?code` — e.g. if Supabase project settings
// change, or if email confirmation is enabled later. The password
// reset flow redirects to `/auth/reset` (which handles its own code
// exchange), so this endpoint is rarely hit in practice. Exchanges
// the code if present and redirects home.

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
