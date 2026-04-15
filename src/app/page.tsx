"use client";

// Root gate. Four states, picked from AuthProvider:
//
//   - loading              → spinner (prevents flash-of-auth-screen
//                            before the cookie session hydrates)
//   - no session           → <AuthScreen /> (sign in or sign up)
//   - session, no profile  → redirect to /onboarding (profile row
//                            doesn't exist yet; user needs to finish
//                            onboarding before landing on Home)
//   - session + profile    → <HomeScreen />

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { HomeScreen } from "@/components/home/HomeScreen";
import { useAuth } from "@/components/providers/AuthProvider";

export default function Home() {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();

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

  if (!session) {
    return <AuthScreen />;
  }

  if (!profile) {
    // Effect above is redirecting to /onboarding; render a neutral
    // loader for the single frame before the nav kicks in.
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div className="w-6 h-6 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return <HomeScreen userName={profile.name} />;
}
