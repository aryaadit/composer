"use client";

// Admin backdoor — lets an admin replay the onboarding flow against
// their own session to tweak their profile via the same UI real users
// see. Gated on the DB-driven `is_admin` flag (see CLAUDE.md for the
// grant SQL); no hardcoded email list. On completion, the normal
// upsert path overwrites the existing composer_users row — no sign
// out, no duplicate user risk, no special handling in OnboardingFlow
// itself since it already pre-fills from `profile`.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export default function AdminOnboardingPage() {
  const router = useRouter();
  const { user, isAdmin, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user || !isAdmin) {
      router.replace("/");
    }
  }, [isLoading, user, isAdmin, router]);

  if (isLoading || !user || !isAdmin) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div className="w-6 h-6 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return <OnboardingFlow />;
}
