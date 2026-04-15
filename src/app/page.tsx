"use client";

// Root gate. Four mutually exclusive states, picked from AuthProvider:
//
//   - loading              → nothing (prevents a flash of onboarding
//                            before the cookie session hydrates)
//   - no session           → OnboardingFlow (first-time visitor; will
//                            collect a profile and send a magic link)
//   - session, no profile  → OnboardingFlow (user clicked the link in
//                            a fresh tab but the metadata-upsert hasn't
//                            landed yet, or landed and failed — either
//                            way, have them re-enter the profile)
//   - session + profile    → HomeScreen

import { Hero } from "@/components/landing/Hero";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { HomeScreen } from "@/components/home/HomeScreen";
import { useAuth } from "@/components/providers/AuthProvider";

export default function Home() {
  const { session, profile, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div className="w-6 h-6 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (!session) {
    return <OnboardingFlow />;
  }

  if (!profile) {
    // Session is real but the profile row hasn't materialized. Most
    // common cause: the metadata upsert failed (network, RLS change,
    // etc). Dropping back to onboarding lets the user retry; Skip on
    // the last step will re-run upsertProfile via sendMagicLinkWithProfile.
    return <OnboardingFlow />;
  }

  // Returning user. Landing/Hero is no longer a separate view — home
  // is the single entry point once you're signed in. Hero is reserved
  // for the marketing page, if/when we split marketing from app.
  if (profile.name) {
    return <HomeScreen userName={profile.name} />;
  }

  return (
    <main className="flex flex-1 flex-col min-h-screen">
      <Hero />
    </main>
  );
}
