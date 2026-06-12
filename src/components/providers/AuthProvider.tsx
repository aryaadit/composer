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
//
// Analytics integration:
//   - posthog.identify on first session resolve. Per founder spec we
//     do NOT push email / phone / name to the PostHog person — only
//     signup_at and signup_source (best-effort), via $set_once.
//   - user_signed_in / user_signed_up are emitted at the action sites
//     in `@/lib/auth` (verifyPhoneOtp, signInOrSignUp), NOT here. The
//     SIGNED_IN listener over-fires on supabase-js 2.102.1 — every tab
//     refocus / token refresh re-emits SIGNED_IN — so wiring funnel
//     events to it inflated the auth funnel. Action-site emission
//     fires exactly once per actual user action.
//   - user_signed_out fires from the explicit signOut() callback BEFORE
//     posthog.reset() so the event is still associated with the user.

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
import posthog from "posthog-js";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { track, EVENTS } from "@/lib/analytics";
import { checkAndEmitIfStale } from "@/lib/analytics/compose-abandoned";
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

function deriveSignupSource(): string {
  if (typeof window === "undefined") return "direct";
  try {
    const ref = new URL(window.location.href).searchParams.get("ref");
    if (ref) return `ref_${ref}`;
    const referrer = document.referrer;
    if (!referrer) return "direct";
    const url = new URL(referrer);
    if (url.origin !== window.location.origin) return "external";
    if (url.pathname.startsWith("/itinerary/share")) return "share_link";
    if (url.pathname === "/" || url.pathname === "") return "home";
    return "internal";
  } catch {
    return "direct";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ComposerUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Tracks the user id we've already identified in PostHog this
  // lifecycle. Prevents repeated identify() calls on every applySession
  // (e.g., USER_UPDATED, TOKEN_REFRESHED) from re-running the
  // setPersonProperties payload.
  const identifiedUserRef = useRef<string | null>(null);

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

    // Identify once per lifecycle. Third arg is $set_once — only
    // written the first time we identify this distinct_id, so we
    // don't overwrite signup_source on returning sessions.
    if (identifiedUserRef.current !== s.user.id) {
      identifiedUserRef.current = s.user.id;
      posthog.identify(s.user.id, undefined, {
        signup_at: s.user.created_at,
        signup_source: deriveSignupSource(),
      });
    }
  }, []);

  // App-boot stale-flag check. If a previous compose flow was abandoned
  // (flag set on compose_started, never cleared), fire compose_abandoned
  // once per page load. Runs at the AuthProvider mount so it catches
  // every entry into the app — including direct loads of /itinerary,
  // /profile, etc. — not just /compose mounts.
  useEffect(() => {
    checkAndEmitIfStale(track);
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

    // Subscribe to future auth events. Listener now only re-syncs React
    // state (session / user / profile) and refreshes the PostHog
    // identify. Lifecycle funnel events live at the action sites in
    // `@/lib/auth` — see this file's top-comment.
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
    // Fire BEFORE reset() so the event is still associated with the
    // outgoing user (reset clears the distinct_id).
    track(EVENTS.USER_SIGNED_OUT, {});
    await libSignOut();
    posthog.reset();
    identifiedUserRef.current = null;
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
