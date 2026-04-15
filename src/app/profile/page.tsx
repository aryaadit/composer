"use client";

// Profile page. Auth-gated — if there's no session we bounce to `/`
// where the root gate will route the user through onboarding. The
// redirect lives in a useEffect because we need to wait for
// AuthProvider to finish hydrating before we know whether the session
// is actually missing vs still loading.

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { ProfileHeader } from "./_components/ProfileHeader";
import { AccountDetails } from "./_components/AccountDetails";
import { SavedPlansList } from "./_components/SavedPlansList";
import { AdminSection } from "./_components/AdminSection";

export default function ProfilePage() {
  const { user, profile, isLoading, refreshProfile, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || !profile) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div className="w-6 h-6 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-lg w-full mx-auto px-6 py-10">
        {/* Small back link — cheap mobile affordance without a full nav bar */}
        <Link
          href="/"
          className="inline-block font-sans text-xs tracking-wide uppercase text-muted hover:text-charcoal transition-colors mb-8"
        >
          &larr; Home
        </Link>

        <ProfileHeader
          name={profile.name}
          email={user.email ?? ""}
          onSignOut={signOut}
        />
        <AccountDetails
          profile={profile}
          userId={user.id}
          refreshProfile={refreshProfile}
        />
        <SavedPlansList userId={user.id} />
        <AdminSection email={user.email ?? ""} />
      </div>
    </div>
  );
}
