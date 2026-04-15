"use client";

// Browser-side Supabase client. Uses @supabase/ssr so the auth session
// lives in cookies (readable by both the client and the Next.js server),
// not in localStorage.
//
// Singleton — the same client is returned on every call so React re-
// renders don't churn subscriptions or duplicate auth listeners.

import { createBrowserClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let _client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  _client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // @supabase/ssr needs an explicit cookie adapter on the client because
    // the browser exposes document.cookie rather than a CookieStore. This
    // keeps the auth session in a first-party cookie that the server
    // route handlers can read via the server client below.
    cookies: {
      get(name: string) {
        if (typeof document === "undefined") return undefined;
        const match = document.cookie
          .split("; ")
          .find((row) => row.startsWith(`${name}=`));
        return match?.split("=").slice(1).join("=");
      },
      set(name: string, value: string, options: CookieOptions) {
        if (typeof document === "undefined") return;
        let cookie = `${name}=${value}`;
        if (options.path) cookie += `; path=${options.path}`;
        if (options.maxAge) cookie += `; max-age=${options.maxAge}`;
        if (options.domain) cookie += `; domain=${options.domain}`;
        if (options.sameSite) cookie += `; samesite=${options.sameSite}`;
        if (options.secure) cookie += "; secure";
        document.cookie = cookie;
      },
      remove(name: string, options: CookieOptions) {
        if (typeof document === "undefined") return;
        document.cookie = `${name}=; max-age=0${options.path ? `; path=${options.path}` : ""}`;
      },
    },
  });
  return _client;
}
