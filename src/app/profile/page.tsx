"use client";

// Profile page. Auth-gated — bounces to `/` if no session.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { SavedVenuesProvider } from "@/components/providers/SavedVenuesProvider";
import { Header } from "@/components/Header";
import { ProfileHeader } from "./_components/ProfileHeader";
import { AccountDetails } from "./_components/AccountDetails";
import { AddEmailSection } from "./_components/AddEmailSection";
import { SavedPlansList } from "./_components/SavedPlansList";
import { AdminSection } from "./_components/AdminSection";
import { YourPlacesGrid } from "@/components/profile/YourPlacesGrid";
import { getSavedVenueIds } from "@/lib/auth";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { Venue } from "@/types";

export default function ProfilePage() {
  const { user, profile, isLoading, refreshProfile, signOut } = useAuth();
  const router = useRouter();
  const [savedVenues, setSavedVenues] = useState<Venue[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/");
  }, [isLoading, user, router]);

  // Fetch saved venue IDs + full venue records.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const ids = await getSavedVenueIds(user.id);
      if (cancelled) return;
      setSavedIds(ids);
      if (ids.length === 0) return;
      // Reverse for newest-first (array_append puts newest at end).
      const reversed = [...ids].reverse();
      const { data } = await getBrowserSupabase()
        .from("composer_venues_v2")
        .select("*")
        .in("id", reversed);
      if (cancelled || !data) return;
      // Sort by the reversed IDs order.
      const idOrder = new Map(reversed.map((id, i) => [id, i]));
      const sorted = (data as Venue[]).sort(
        (a, b) => (idOrder.get(a.id) ?? 99) - (idOrder.get(b.id) ?? 99)
      );
      setSavedVenues(sorted);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (isLoading || !user || !profile) {
    return <main className="min-h-screen bg-cream" />;
  }

  return (
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

        <SavedVenuesProvider initialIds={savedIds}>
          <section className="mt-8">
            <h2 className="font-serif text-xl text-charcoal mb-1">
              Your places
            </h2>
            {savedVenues.length > 0 && (
              <p className="font-sans text-sm text-muted mt-1 mb-3">
                {savedVenues.length} {savedVenues.length === 1 ? "venue" : "venues"} you&apos;ve saved across your nights out.
              </p>
            )}
            <YourPlacesGrid venues={savedVenues} />
          </section>
        </SavedVenuesProvider>

        <AdminSection />
      </div>
    </div>
  );
}
