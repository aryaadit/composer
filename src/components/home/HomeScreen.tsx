"use client";

// HomeScreen — the signed-in landing view. Uses the shared
// useSavedPlans hook and SavedPlanRow component for the saved
// plans list, keeping behavior identical to the profile page.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSavedPlans } from "@/hooks/useSavedPlans";
import { SavedPlanRow } from "@/components/shared/SavedPlanRow";
import { SavedPlanRowExpanded } from "@/components/shared/SavedPlanRowExpanded";
import { LuckyDieButton } from "@/components/home/LuckyDieButton";
import { Button } from "@/components/ui/Button";
import { TonightsPickHero } from "@/components/home/TonightsPickHero";
import { useTonightsPick } from "@/hooks/useTonightsPick";
import { splitPlansByDate, todayLocalISO } from "@/lib/dateUtils";

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
  return "Good night";
}

function useGreeting(): string | null {
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    void Promise.resolve().then(() => setGreeting(getGreeting()));
  }, []);
  return greeting;
}

export function HomeScreen({ userName }: HomeScreenProps) {
  const { user } = useAuth();
  const greeting = useGreeting();
  const { plans: savedPlans, loading, deletePlan, renamePlan } = useSavedPlans({
    userId: user?.id ?? null,
    limit: 10,
  });

  // Phase 5: split by itinerary day, not save date. The hook still
  // orders by created_at DESC (exclusions.ts depends on that), so the
  // 10-row limit hits on save-recency — the split then partitions
  // whichever subset Home is showing into Upcoming + Past sections.
  const { upcoming, past } = useMemo(
    () => splitPlansByDate(savedPlans),
    [savedPlans],
  );
  const hasAnyPlans = savedPlans.length > 0;
  // When the user already has a saved plan for tonight, that plan
  // takes the upcoming hero slot (upcoming[0]) and the daily pick
  // steps aside — we don't want two heroes competing for the same
  // intent. Match by ISO day to avoid timezone drift.
  const hasTonightPlan = upcoming.some((p) => p.day === todayLocalISO());
  const tonightsPick = useTonightsPick(user?.id ?? null);
  // Narrow to the "ready" variant once so the render gate doesn't
  // repeat the discriminant check. `pickData` is the typed handle
  // we read inputs/itinerary/pick_date off of below.
  const pickData =
    tonightsPick.data?.status === "ready" ? tonightsPick.data : null;
  // One-hero-per-page rule. Computed once here so the pick gate and
  // the upcoming-section branch stay perfectly in sync — if showPick
  // is true, the pick hero renders AND the upcoming section drops
  // its SavedPlanRowExpanded hero in favor of compact SavedPlanRow.
  const showPick = pickData !== null && !hasTonightPlan;

  return (
    <div className="min-h-dvh flex flex-col bg-cream">
      {/* Header rightSlot: die + profile. Home redesign 2026-06-12
          moves the lucky affordance off the body (under New plan) and
          into the header next to the profile glyph — icon-only,
          burgundy, same tap-target hit area as the surrounding glyphs. */}
      <Header
        rightSlot={
          <div className="flex items-center gap-3">
            <LuckyDieButton userId={user?.id ?? null} />
            <Link
              href="/profile"
              aria-label="Profile"
              className="inline-flex h-8 w-8 items-center justify-center text-muted hover:text-charcoal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/50 focus-visible:rounded-full"
            >
              <UserIcon />
            </Link>
          </div>
        }
      />
      <div className="px-6 pt-4 pb-8 max-w-lg w-full mx-auto">
        <p className="font-sans text-sm tracking-widest uppercase text-muted mb-2">
          {greeting ? `${greeting}, ${userName}` : "\u00A0"}
        </p>
        <h1 className="font-serif text-3xl font-normal text-charcoal leading-tight">
          Compose your night.
        </h1>
      </div>

      {/* Main CTA. The "Random tonight?" row under it was deleted
          2026-06-12 — die moved into the header rightSlot above.
          Audit item 30: routed through Button primitive at pixel
          parity. size="lg" supplies the exact py-5 px-5 text-sm
          tracking-wide recipe; w-full + the block layout sit on the
          consumer side. */}
      <div className="px-6 mb-10 max-w-lg w-full mx-auto">
        <Button variant="primary" size="lg" href="/compose" className="w-full">
          New plan →
        </Button>
      </div>

      {/* Tonight's Pick — between the action row and Upcoming.
       * Renders only when (a) the seeded daily roll succeeded
       * (status: "ready") AND (b) the user has no saved plan for
       * tonight (otherwise the upcoming hero is already showing
       * their own intent). Failures + the loading shimmer render
       * nothing — spec: "no error state for unrequested content". */}
      {showPick && pickData && (
        <TonightsPickHero
          inputs={pickData.inputs}
          itinerary={pickData.itinerary}
          pickDate={pickData.pick_date}
        />
      )}

      {/* Saved plans — split into Upcoming + Past (Phase 5) */}
      <div className="px-6 flex-1 max-w-lg w-full mx-auto">
        {loading ? (
          <>
            <h2 className="font-sans text-xs tracking-widest uppercase text-muted mb-4">
              Your plans
            </h2>
            <div
              role="status"
              aria-live="polite"
              className="py-10 text-muted border-t border-border"
            >
              <p className="font-sans text-sm">Loading...</p>
            </div>
          </>
        ) : !hasAnyPlans ? (
          <>
            <h2 className="font-sans text-xs tracking-widest uppercase text-muted mb-4">
              Your plans
            </h2>
            <div className="py-10 text-muted border-t border-border">
              <p className="font-sans text-sm">No saved plans yet.</p>
              <p className="font-sans text-xs mt-1">
                Compose your first night and save it.
              </p>
            </div>
          </>
        ) : (
          <>
            {upcoming.length > 0 && (
              <section className="mb-8">
                <h2 className="font-sans text-xs tracking-widest uppercase text-muted mb-4">
                  Upcoming
                </h2>
                {showPick ? (
                  // One-hero-per-page: the pick is already the page's
                  // hero, so the Upcoming section degrades to compact
                  // SavedPlanRow for ALL entries (no second hero).
                  <div className="divide-y divide-border border-t border-border">
                    {upcoming.map((plan) => (
                      <SavedPlanRow
                        key={plan.id}
                        plan={plan}
                        onDelete={deletePlan}
                        onRenamed={renamePlan}
                      />
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Phase 6: hero treatment for the soonest upcoming
                        when nothing else is competing for the slot. */}
                    <SavedPlanRowExpanded
                      key={upcoming[0].id}
                      plan={upcoming[0]}
                      onDelete={deletePlan}
                      onRenamed={renamePlan}
                    />
                    {upcoming.length > 1 && (
                      <div className="divide-y divide-border border-t border-border">
                        {upcoming.slice(1).map((plan) => (
                          <SavedPlanRow
                            key={plan.id}
                            plan={plan}
                            onDelete={deletePlan}
                            onRenamed={renamePlan}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>
            )}
            {past.length > 0 && (
              <section className="mb-8">
                <h2 className="font-sans text-xs tracking-widest uppercase text-muted mb-4">
                  Past
                </h2>
                <div className="divide-y divide-border border-t border-border">
                  {past.map((plan) => (
                    <SavedPlanRow
                      key={plan.id}
                      plan={plan}
                      onDelete={deletePlan}
                      onRenamed={renamePlan}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
