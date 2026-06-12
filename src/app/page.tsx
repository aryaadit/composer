"use client";

// Root gate. Five states:
//
//   - loading              → spinner
//   - no session           → SplashScreen (Get Started / Log In)
//   - no session + auth    → AuthScreen (phone OTP or email)
//   - session, no profile  → redirect to /onboarding
//   - session + profile    → HomeScreen
//
// This component is also the drain point for the deferred user_signed_up
// / user_signed_in funnel emission. Auth action sites (verifyPhoneOtp,
// signInOrSignUp) stash {method, source} in sessionStorage on
// verification success because phone OTP can't locally tell signup
// from signin. The same routing branch that decides /onboarding vs /
// (profile existence) decides which funnel event to emit, then clears
// the token. Cookie-hydrated reloads find no token and don't fire.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { HomeScreen } from "@/components/home/HomeScreen";
import { useAuth } from "@/components/providers/AuthProvider";
import { EVENTS, track } from "@/lib/analytics";
import { STORAGE_KEYS } from "@/config/storage";
import type { AuthPendingEmit } from "@/lib/auth";

function drainAuthPendingEmit(): AuthPendingEmit | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(
      STORAGE_KEYS.session.authPendingEmit,
    );
    if (!raw) return null;
    window.sessionStorage.removeItem(STORAGE_KEYS.session.authPendingEmit);
    const parsed = JSON.parse(raw) as Partial<AuthPendingEmit>;
    if (parsed.method !== "phone" && parsed.method !== "password") return null;
    return {
      method: parsed.method,
      signup_source:
        typeof parsed.signup_source === "string"
          ? parsed.signup_source
          : "direct",
    };
  } catch {
    return null;
  }
}

export default function Home() {
  const router = useRouter();
  const {
    session,
    profile,
    isLoading,
    profileFetchErrored,
    refreshProfile,
  } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  // Once per lifecycle. Same shape as the itinerary_viewed / failure-
  // viewed guards: prevents StrictMode dev double-fires and re-renders
  // from re-emitting.
  const authEmitFiredRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (!session) return;
    // Profile fetch failed — don't emit (can't tell signup vs signin
    // honestly) and don't route to /onboarding (would overwrite a
    // returning user's row). The retry surface below lets the user
    // re-trigger refreshProfile. The pending-emit token stays in
    // sessionStorage so a successful retry still gets credit.
    if (profileFetchErrored) return;
    if (!authEmitFiredRef.current) {
      const pending = drainAuthPendingEmit();
      if (pending) {
        authEmitFiredRef.current = true;
        // Profile existence is the source of truth — same as the route
        // decision below. New users haven't completed onboarding so
        // profile is null; returning users always have a row (the
        // upsert happens at onboarding completion).
        if (profile) {
          track(EVENTS.USER_SIGNED_IN, { method: pending.method });
        } else {
          track(EVENTS.USER_SIGNED_UP, {
            method: pending.method,
            signup_source: pending.signup_source,
          });
        }
      }
    }
    if (!profile) {
      router.replace("/onboarding");
    }
  }, [isLoading, session, profile, router, profileFetchErrored]);

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div
          role="status"
          aria-label="Loading"
          className="w-6 h-6 border-2 border-burgundy border-t-transparent rounded-full animate-spin"
        />
      </main>
    );
  }

  // Authed but the profile fetch hit a transient error after retries.
  // Show an honest retry surface — without this branch the user is
  // either stuck on a spinner (looks frozen) or worse, routed to
  // /onboarding and onboarded over their existing row.
  if (session && profileFetchErrored) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center min-h-screen bg-cream px-6 text-center">
        <h1 className="font-serif text-2xl text-charcoal mb-3">
          Something went wrong
        </h1>
        <p className="font-sans text-base text-warm-gray mb-6 max-w-sm">
          We couldn&apos;t load your profile. Give it a moment, then try again.
        </p>
        <Button onClick={() => refreshProfile()}>Try again</Button>
      </main>
    );
  }

  if (session && profile) {
    return <HomeScreen userName={profile.name} />;
  }

  if (session && !profile) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div
          role="status"
          aria-label="Loading"
          className="w-6 h-6 border-2 border-burgundy border-t-transparent rounded-full animate-spin"
        />
      </main>
    );
  }

  // Unauthenticated — show splash or auth
  if (showAuth) {
    return <AuthScreen />;
  }

  return <SplashScreen onGetStarted={() => setShowAuth(true)} onLogIn={() => setShowAuth(true)} />;
}

function SplashScreen({
  onGetStarted,
  onLogIn,
}: {
  onGetStarted: () => void;
  onLogIn: () => void;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-cream px-6">
      <div className="w-full max-w-lg text-center">
        <h1 className="font-serif text-6xl md:text-7xl text-charcoal mb-8">
          Composer
        </h1>
        <div className="flex items-center justify-center gap-3 font-serif text-3xl md:text-4xl text-charcoal leading-tight mb-8">
          <span>For</span>
          <span
            className="inline-block h-[1.6em] w-[5.5em] text-left"
            style={{ clipPath: "inset(0 -100vw 0 0)" }}
          >
            <motion.span
              className="block text-burgundy"
              animate={{
                y: [
                  "0%", "-7.143%", "-14.286%", "-21.429%",
                  "-28.571%", "-35.714%", "-42.857%", "-50%",
                  "-57.143%", "-64.286%", "-71.429%", "-78.571%",
                  "-85.714%", "-92.857%",
                ],
              }}
              transition={{
                duration: 26,
                repeat: Infinity,
                repeatType: "loop",
                ease: "easeInOut",
                times: [
                  0, 0.077, 0.154, 0.231, 0.308, 0.385, 0.462,
                  0.538, 0.615, 0.692, 0.769, 0.846, 0.923, 1,
                ],
              }}
            >
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">meeting someone new</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">solo Sundays</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">group chats</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">a night out</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">the girlies</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">the parents</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">family fun</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">NYC weekends</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">random Tuesdays</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">your anniversary</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">the boys</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">a rainy day</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">the birthday</span>
              <span className="block h-[1.6em] flex items-center whitespace-nowrap">meeting someone new</span>
            </motion.span>
          </span>
        </div>
        <p className="font-sans text-base text-warm-gray max-w-xs mx-auto mb-12">
          A time and a place. Plans in NYC made by people who live here.
        </p>

        <div className="space-y-3">
          <Button variant="primary" onClick={onGetStarted} className="w-full">
            Get Started
          </Button>
          <button
            type="button"
            onClick={onLogIn}
            className="w-full py-3 font-sans text-sm text-muted hover:text-charcoal transition-colors text-center"
          >
            Already have an account? Log in
          </button>
        </div>
      </div>
    </main>
  );
}
