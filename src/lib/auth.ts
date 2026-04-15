"use client";

// Thin wrappers around the Supabase auth surface Composer uses.
//
// These helpers exist so the rest of the app talks to "auth", not to
// Supabase directly — if the auth provider ever changes (unlikely) the
// blast radius stays in one file. Everything here is browser-side; the
// server reads auth via `@/lib/supabase/server`.

import { getBrowserSupabase } from "@/lib/supabase/browser";
import type {
  Session,
  User,
  AuthChangeEvent,
  Subscription,
} from "@supabase/supabase-js";
import type { ComposerUser, UserPrefs } from "@/types";

export async function getSession(): Promise<Session | null> {
  const { data } = await getBrowserSupabase().auth.getSession();
  return data.session;
}

export async function getAuthUser(): Promise<User | null> {
  const { data } = await getBrowserSupabase().auth.getUser();
  return data.user;
}

/** Read the joined Composer profile row for the current session. */
export async function getProfile(userId: string): Promise<ComposerUser | null> {
  const { data, error } = await getBrowserSupabase()
    .from("composer_users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[auth] getProfile failed:", error.message);
    return null;
  }
  return (data as ComposerUser | null) ?? null;
}

/**
 * Insert or update the current user's profile.
 *
 * Called both from the onboarding completion path (right after the
 * session lands) and from anywhere that edits preferences later.
 */
export async function upsertProfile(
  userId: string,
  prefs: UserPrefs
): Promise<ComposerUser | null> {
  const row = {
    id: userId,
    name: prefs.name,
    context: prefs.context ?? null,
    drinks: prefs.drinks ?? null,
    dietary: prefs.dietary ?? [],
    favorite_hoods: prefs.favoriteHoods ?? [],
  };
  const { data, error } = await getBrowserSupabase()
    .from("composer_users")
    .upsert(row)
    .select()
    .single();
  if (error) {
    console.error("[auth] upsertProfile failed:", error.message);
    return null;
  }
  return data as ComposerUser;
}

export async function signOut(): Promise<void> {
  await getBrowserSupabase().auth.signOut();
}

/**
 * Send a magic-link email carrying the full onboarding profile inside
 * `options.data`. Supabase stores that blob on `auth.users.raw_user_meta_data`
 * so when the user clicks the link and the session lands (possibly in a
 * fresh tab, days later), the metadata survives. `AuthProvider` then reads
 * it back and upserts the Composer profile row.
 *
 * This is the single sign-in entry point — called only after the user
 * finishes step 3 of onboarding with a complete profile in hand. No
 * second email is sent after the session lands.
 */
export async function sendMagicLinkWithProfile(
  email: string,
  prefs: UserPrefs
): Promise<{ ok: boolean; error?: string }> {
  // Point the magic link at the server-side callback route, not `/` —
  // Supabase sends the user to `{redirect}?code=…`, and `/auth/callback`
  // is the server handler that swaps that code for a session cookie
  // before redirecting home. Landing directly on `/` in production
  // leaves the ?code param hanging without a session.
  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : undefined;

  const { error } = await getBrowserSupabase().auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: redirectTo,
      data: {
        name: prefs.name,
        context: prefs.context ?? null,
        drinks: prefs.drinks ?? null,
        dietary: prefs.dietary ?? [],
        favorite_hoods: prefs.favoriteHoods ?? [],
      },
    },
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

export function onAuthStateChange(cb: AuthListener): Subscription {
  const { data } = getBrowserSupabase().auth.onAuthStateChange((event, session) => {
    cb(event, session);
  });
  return data.subscription;
}
