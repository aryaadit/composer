"use client";

// Authenticated onboarding route. Landing here without a session
// bounces to `/` where AuthScreen takes over. Landing with a session
// but an already-complete profile also bounces to `/` — the root gate
// will render HomeScreen. This page is only the right destination for
// users who have a session but haven't finished the profile.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, profile, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (profile) {
      // User already has a profile — nothing to onboard. Root gate
      // will route them to HomeScreen.
      router.replace("/");
    }
  }, [isLoading, user, profile, router]);

  if (isLoading || !user || profile) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div className="w-6 h-6 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return <OnboardingFlow />;
}
