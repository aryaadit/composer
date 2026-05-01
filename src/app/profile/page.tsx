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
import { Header } from "@/components/Header";
import { ProfileHeader } from "./_components/ProfileHeader";
import { AccountDetails } from "./_components/AccountDetails";
import { AddEmailSection } from "./_components/AddEmailSection";
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

  // Redirect is in-flight or auth is still hydrating — show blank cream
  // page (not a spinner) so unauthenticated users don't see a loading
  // state before the redirect lands.
  if (isLoading || !user || !profile) {
    return <main className="min-h-screen bg-cream" />;
  }

  return (
    // flex flex-col mirrors HomeScreen's wrapper. Without it the Header
    // renders inside a block formatting context here vs a flex item in
    // HomeScreen, producing a small but visible vertical offset of the
    // logo when navigating between the two pages. Profile has no
    // flex-1 children that need the column behavior; this is purely
    // for symmetric formatting context.
    <div className="min-h-screen flex flex-col bg-cream">
      <Header
        rightSlot={
          <Link
            href="/"
            className="font-sans text-sm text-muted hover:text-charcoal transition-colors"
          >
            &larr; Back
          </Link>
        }
      />
      <div className="max-w-lg w-full mx-auto px-6 pb-10 mt-6">
        <ProfileHeader
          name={profile.name}
          email={user.email ?? null}
          phone={user.phone ?? null}
          onSignOut={signOut}
        />
        <AccountDetails
          profile={profile}
          userId={user.id}
          refreshProfile={refreshProfile}
        />
        <AddEmailSection currentEmail={user.email ?? null} />
        <SavedPlansList userId={user.id} />
        <AdminSection />
      </div>
    </div>
  );
}
