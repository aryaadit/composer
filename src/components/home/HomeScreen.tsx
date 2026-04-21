"use client";

// HomeScreen — the signed-in landing view. Saved plans list is fetched
// from `composer_saved_itineraries` on mount and whenever the user
// returns to the page (auth state changes, route pops). No client-side
// caching store — React Query isn't in the dep list, and the fetch is
// fast enough that a plain useEffect is honest.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/Header";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { useAuth } from "@/components/providers/AuthProvider";
import type { SavedItinerary } from "@/types";
import type { PostgrestError } from "@supabase/supabase-js";

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

interface HomeScreenProps {
  userName: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "Good morning";
  if (hour >= 11 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Good night"; // 10pm – 5am
}

// Compute the greeting on the client only. SSR runs in the server's
// timezone (UTC on Vercel), which mismatches the user's local clock at
// the AM/PM boundaries — left to its own devices, hydration would
// flash the server's wrong greeting before the client corrects.
// Returning null on first render keeps the paint clean until the
// effect fills in the right one.
function useGreeting(): string | null {
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    // Microtask hop keeps the setState off the synchronous effect body
    // (react-hooks/set-state-in-effect rule).
    void Promise.resolve().then(() => setGreeting(getGreeting()));
  }, []);
  return greeting;
}

export function HomeScreen({ userName }: HomeScreenProps) {
  const { user } = useAuth();
  const greeting = useGreeting();
  // `loadedFor` tracks which user id the `plans` array belongs to. When
  // that doesn't match the current `user.id`, UI shows the loading
  // state. Packing both into one state keeps the effect's only setState
  // call inside the async `.then` callback — satisfies the
  // react-hooks/set-state-in-effect rule by treating the Supabase
  // query as a subscription with a single update path.
  const [{ plans: savedPlans, loadedFor }, setState] = useState<{
    plans: SavedItinerary[];
    loadedFor: string | null;
  }>({ plans: [], loadedFor: null });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const userId = user.id;
    getBrowserSupabase()
      .from("composer_saved_itineraries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(
        ({ data, error }: { data: SavedItinerary[] | null; error: PostgrestError | null }) => {
          if (cancelled) return;
          if (error) {
            console.error("[home] load saved plans failed:", error.message);
            setState({ plans: [], loadedFor: userId });
          } else {
            setState({ plans: data ?? [], loadedFor: userId });
          }
        }
      );
    return () => {
      cancelled = true;
    };
  }, [user]);

  const loading = user != null && loadedFor !== user.id;

  const handleDelete = useCallback(
    async (id: string) => {
      const { error } = await getBrowserSupabase()
        .from("composer_saved_itineraries")
        .delete()
        .eq("id", id);
      if (error) {
        console.error("[home] delete failed:", error.message);
        return;
      }
      setState((prev) => ({
        ...prev,
        plans: prev.plans.filter((p) => p.id !== id),
      }));
    },
    []
  );

  const totalStops = savedPlans.reduce((sum, p) => sum + (p.stops?.length ?? 0), 0);

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      {/* Header — Composer lockup. Profile icon stays in the greeting
          row below so it sits in the existing layout column. */}
      <div className="px-6 pt-6 max-w-lg w-full mx-auto">
        <Header />
      </div>
      <div className="px-6 pt-4 pb-8 max-w-lg w-full mx-auto flex items-start justify-between">
        <div>
          <p className="font-sans text-sm tracking-widest uppercase text-muted mb-2">
            {greeting ? `${greeting}, ${userName}` : `\u00A0`}
          </p>
          <h1 className="font-serif text-3xl font-normal text-charcoal leading-tight">
            Compose your night.
          </h1>
        </div>
        <Link
          href="/profile"
          aria-label="Profile"
          className="text-muted hover:text-charcoal transition-colors mt-1"
        >
          <UserIcon />
        </Link>
      </div>

      {/* Main CTA */}
      <div className="px-6 mb-10 max-w-lg w-full mx-auto">
        <Link
          href="/compose"
          className="group block w-full py-5 px-5 rounded-full bg-burgundy text-cream hover:bg-burgundy-light transition-colors text-center"
        >
          <span className="font-sans text-sm font-medium tracking-wide">
            New date plan →
          </span>
        </Link>
      </div>

      {/* Saved plans */}
      <div className="px-6 flex-1 max-w-lg w-full mx-auto">
        <h2 className="font-sans text-xs tracking-widest uppercase text-muted mb-4">
          Your plans
        </h2>
        {loading ? (
          <div className="py-10 text-muted border-t border-border">
            <p className="font-sans text-sm">Loading…</p>
          </div>
        ) : savedPlans.length === 0 ? (
          <div className="py-10 text-muted border-t border-border">
            <p className="font-sans text-sm">No saved plans yet.</p>
            <p className="font-sans text-xs mt-1">
              Compose your first night and save it.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {savedPlans.map((plan) => {
              const stops = plan.stops ?? [];
              const firstStop = stops[0];
              const title = plan.custom_name || plan.title || "Saved night";
              const date = new Date(plan.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
              return (
                <div key={plan.id} className="py-4 flex items-center gap-4">
                  <Link
                    href={`/itinerary/saved/${plan.id}`}
                    className="flex-1 min-w-0 group"
                  >
                    <div className="font-serif text-base text-charcoal truncate leading-snug group-hover:text-burgundy transition-colors">
                      {title}
                    </div>
                    <div className="font-sans text-xs text-muted mt-1">
                      {firstStop?.venue?.name ?? "—"} · {stops.length} stops · saved {date}
                    </div>
                  </Link>
                  <button
                    onClick={() => void handleDelete(plan.id)}
                    className="font-sans text-xs text-muted hover:text-burgundy transition-colors"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="px-6 py-6 border-t border-border mt-10 max-w-lg w-full mx-auto">
        <div className="flex justify-around text-center items-center">
          <div>
            <div className="font-sans text-lg font-medium text-charcoal">{savedPlans.length}</div>
            <div className="font-sans text-xs text-muted mt-1">Plans saved</div>
          </div>
          <div>
            <div className="font-sans text-lg font-medium text-charcoal">{totalStops}</div>
            <div className="font-sans text-xs text-muted mt-1">Stops planned</div>
          </div>
          <div>
            <Button variant="secondary" href="/compose" className="text-xs px-4 py-2">
              New
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
