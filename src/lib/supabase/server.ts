// Server-side Supabase client for Route Handlers.
//
// Uses @supabase/ssr bound to Next.js's request-scoped cookies() so that
// `auth.uid()` resolves for RLS policies against composer_users and
// composer_saved_itineraries. The API routes use this to read the signed-
// in user's profile without trusting client-sent identity.
//
// Do not import this from browser code — the cookies() import is server-
// only and will throw if called in a client component.

import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function getServerSupabase(): Promise<SupabaseClient> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        // In Route Handlers, writing auth cookies is how the session
        // refresh persists. The try/catch guards against read-only
        // contexts (Server Components) calling this by mistake.
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // no-op: Server Components cannot mutate cookies; the client
          // will see the refreshed session via middleware instead.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options, maxAge: 0 });
        } catch {
          // same as set — read-only context, silently ignore.
        }
      },
    },
  });
}
