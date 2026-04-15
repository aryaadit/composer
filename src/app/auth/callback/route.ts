// Magic-link callback handler.
//
// Supabase's production magic-link flow sends the user to
// `{emailRedirectTo}?code=<one-time-code>` after they click the email
// link. We swap that one-time code for a full session here, server-side,
// so the session cookie lands on the response and the user arrives at
// `/` already authenticated. Landing the code on a client-only route
// leaves the ?code param hanging and no session gets set.
//
// This route does nothing if `code` is missing (e.g. user hits the URL
// directly) — it just redirects home, where the existing routing gate
// will push them back to onboarding.

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // Surface the error in the URL so the client can show it instead
      // of silently dropping the user on onboarding with no context.
      const err = encodeURIComponent(error.message);
      return NextResponse.redirect(`${origin}/?auth_error=${err}`);
    }
  }

  return NextResponse.redirect(`${origin}/`);
}
