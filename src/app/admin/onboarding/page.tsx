"use client";

// Admin backdoor — lets an admin replay the onboarding flow against
// their own session to tweak their profile via the same UI real users
// see. Session-gated (bounces to `/` otherwise) and email-gated (same
// allowlist as AdminSection on the profile page). On completion, the
// normal upsert path overwrites the existing composer_users row — no
// sign-out, no duplicate user risk, no special handling in
// OnboardingFlow itself since it already pre-fills from `profile`.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

// Keep in sync with AdminSection's ADMIN_EMAILS.
// TODO: replace Reid's placeholder email with his actual one.
const ADMIN_EMAILS: readonly string[] = [
  "aryaadit@hotmail.com",
  "reid@TODO-REPLACE.invalid",
];

export default function AdminOnboardingPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/");
      return;
    }
    if (!ADMIN_EMAILS.includes(user.email ?? "")) {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || !ADMIN_EMAILS.includes(user.email ?? "")) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div className="w-6 h-6 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return <OnboardingFlow />;
}
