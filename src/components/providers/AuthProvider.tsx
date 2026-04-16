"use client";

// AuthProvider — the single source of truth for `user`, `profile`, and
// `session` everywhere in the client tree. Subscribes to Supabase auth
// events, fetches the Composer profile row when the session lands, and
// exposes a `refreshProfile` hook for the profile page to call after
// inline edits.
//
// Under email/password auth the profile row is materialized by the
// onboarding flow (which runs against an already-live session), so this
// provider's only job is to keep React state in sync — no metadata
// upsert, no fallback seeding.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import {
  getProfile,
  signOut as libSignOut,
  onAuthStateChange,
} from "@/lib/auth";
import type { ComposerUser } from "@/types";

interface AuthContextValue {
  user: User | null;
  profile: ComposerUser | null;
  session: Session | null;
  isLoading: boolean;
  // Derived from profile.is_admin. Exposed as a top-level boolean so
  // callers don't have to null-check the profile themselves. Defaults
  // to false until the profile row loads.
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ComposerUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applySession = useCallback(async (s: Session | null) => {
    setSession(s);
    setUser(s?.user ?? null);

    if (!s?.user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    // Profile may not yet exist (user just signed up, hasn't completed
    // onboarding). That's fine — routing pushes them to /onboarding
    // where the upsert happens. Null here is not an error state.
    const existing = await getProfile(s.user.id);
    setProfile(existing);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Initial session read on mount — Supabase hydrates from the cookie
    // before our listener fires, so we need an explicit getSession() to
    // populate state on first paint.
    getBrowserSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (cancelled) return;
        void applySession(data.session);
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });

    // Subscribe to future auth events (SIGNED_IN, SIGNED_OUT, refresh).
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
    setProfile(null);
    setUser(null);
    setSession(null);
  }, []);

  const isAdmin = profile?.is_admin ?? false;

  const value = useMemo(
    () => ({
      user,
      profile,
      session,
      isLoading,
      isAdmin,
      refreshProfile,
      signOut,
    }),
    [user, profile, session, isLoading, isAdmin, refreshProfile, signOut]
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
