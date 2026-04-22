"use client";

// Root gate. Three states:
//   - loading       → spinner
//   - no session    → OnboardingFlow (splash → profile → phone auth)
//   - session + profile → HomeScreen
//
// The onboarding flow handles auth at the end (phone OTP), so
// unauthenticated users go through splash → profile → auth in one
// continuous flow. Returning users who already have a session + profile
// land directly on HomeScreen.

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { HomeScreen } from "@/components/home/HomeScreen";
import { useAuth } from "@/components/providers/AuthProvider";

export default function Home() {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();

  // Session exists but no profile → onboarding page handles the
  // remaining profile setup. This covers edge cases like a user
  // who verified their phone but the profile upsert failed.
  useEffect(() => {
    if (isLoading) return;
    if (session && !profile) {
      router.replace("/onboarding");
    }
  }, [isLoading, session, profile, router]);

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div className="w-6 h-6 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (session && profile) {
    return <HomeScreen userName={profile.name} />;
  }

  if (session && !profile) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div className="w-6 h-6 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return <OnboardingFlow />;
}
