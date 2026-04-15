"use client";

// AuthProvider — the single source of truth for `user`, `profile`, and
// `session` everywhere in the client tree.
//
// Two responsibilities:
//   1. Keep React state in sync with Supabase's auth subscription so
//      components re-render when the session changes (sign-in, sign-out,
//      token refresh).
//   2. When a brand-new session lands, read the onboarding profile off
//      `user.user_metadata` (where `sendMagicLinkWithProfile` stashed it)
//      and write it to the `composer_users` row. This is the "magic link
//      click → account created" hop.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import {
  getProfile,
  upsertProfile,
  signOut as libSignOut,
  onAuthStateChange,
} from "@/lib/auth";
import type { ComposerUser, UserPrefs, DrinksPref } from "@/types";

interface AuthContextValue {
  user: User | null;
  profile: ComposerUser | null;
  session: Session | null;
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Read the onboarding profile stashed on auth.users.raw_user_meta_data
// by sendMagicLinkWithProfile(). Returns null if anything is missing.
function profileFromMetadata(user: User): UserPrefs | null {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = typeof meta.name === "string" ? meta.name : null;
  if (!name) return null;
  return {
    name,
    context: typeof meta.context === "string" ? meta.context : undefined,
    drinks:
      meta.drinks === "yes" || meta.drinks === "sometimes" || meta.drinks === "no"
        ? (meta.drinks as DrinksPref)
        : undefined,
    dietary: Array.isArray(meta.dietary)
      ? (meta.dietary as string[])
      : [],
    favoriteHoods: Array.isArray(meta.favorite_hoods)
      ? (meta.favorite_hoods as string[])
      : [],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ComposerUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Guard against doing the metadata → profile upsert twice for the same
  // session id (e.g. if the listener fires TOKEN_REFRESHED after
  // SIGNED_IN). The ref survives StrictMode double-mount.
  const seededFor = useRef<string | null>(null);

  const applySession = useCallback(async (s: Session | null) => {
    setSession(s);
    setUser(s?.user ?? null);

    if (!s?.user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    // Try to read an existing profile row. If present → we're good.
    let existing = await getProfile(s.user.id);

    // No row yet? This is a fresh sign-in from a magic link carrying
    // onboarding metadata. Materialize the profile from user_metadata.
    if (!existing && seededFor.current !== s.user.id) {
      seededFor.current = s.user.id;
      const prefs = profileFromMetadata(s.user);
      if (prefs) {
        existing = await upsertProfile(s.user.id, prefs);
      }
    }

    setProfile(existing);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // 1. Initial session read on mount — Supabase hydrates from the
    //    cookie before our listener fires, so we need an explicit
    //    getSession() to populate state on first paint.
    getBrowserSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (cancelled) return;
        void applySession(data.session);
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });

    // 2. Subscribe to future auth events (SIGNED_IN, SIGNED_OUT, refresh).
    const sub = onAuthStateChange((_event, s) => {
      void applySession(s);
    });

    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, [applySession]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const fresh = await getProfile(user.id);
    setProfile(fresh);
  }, [user]);

  const signOut = useCallback(async () => {
    await libSignOut();
    seededFor.current = null;
    setProfile(null);
    setUser(null);
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ user, profile, session, isLoading, refreshProfile, signOut }),
    [user, profile, session, isLoading, refreshProfile, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }
  return ctx;
}
