// Magic-link callback handler.
//
// Supabase's production magic-link flow sends the user to
// `{emailRedirectTo}?code=<one-time-code>` after they click the email
// link. We swap that one-time code for a full session here, server-side,
// so the session cookie lands on the response and the user arrives at
// `/` already authenticated. Landing the code on a client-only route
// leaves the ?code param hanging and no session gets set.
//
// We also upsert the `composer_users` profile row here — in the same
// request that exchanges the code — so a first-time sign-in has a
// profile row committed before the browser ever reaches `/`. Client-
// side AuthProvider keeps a fallback upsert as resilience, but the
// source-of-truth is this route.

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/`);
  }

  const supabase = await getServerSupabase();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    const err = encodeURIComponent(exchangeError.message);
    return NextResponse.redirect(`${origin}/?auth_error=${err}`);
  }

  // Fresh session is now on the client — pull the user and materialize
  // the Composer profile from the metadata we stashed at signInWithOtp
  // time. Any error here is logged but doesn't block the redirect;
  // AuthProvider's client fallback will retry on mount.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.error("[auth/callback] getUser failed:", userError.message);
  } else if (userData.user) {
    await upsertProfileFromMetadata(supabase, userData.user);
  }

  return NextResponse.redirect(`${origin}/`);
}

/**
 * Read the onboarding payload off `user.user_metadata` (the JS SDK's
 * view of `auth.users.raw_user_meta_data`) and upsert it into
 * `composer_users`. Idempotent via `onConflict: "id"` — safe to run on
 * every magic-link click, including repeat clicks where a row already
 * exists.
 */
async function upsertProfileFromMetadata(
  supabase: SupabaseClient,
  user: User
): Promise<void> {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = typeof meta.name === "string" ? meta.name : null;

  // No name = user came in from somewhere other than our onboarding
  // (e.g. dashboard-created user). Nothing to materialize; the client
  // will route them back through onboarding.
  if (!name) return;

  const row = {
    id: user.id,
    name,
    context: typeof meta.context === "string" ? meta.context : null,
    drinks: typeof meta.drinks === "string" ? meta.drinks : null,
    dietary: Array.isArray(meta.dietary) ? (meta.dietary as string[]) : [],
    favorite_hoods: Array.isArray(meta.favorite_hoods)
      ? (meta.favorite_hoods as string[])
      : [],
  };

  const { error } = await supabase
    .from("composer_users")
    .upsert(row, { onConflict: "id" });

  if (error) {
    console.error("[auth/callback] profile upsert failed:", error.message);
  }
}
