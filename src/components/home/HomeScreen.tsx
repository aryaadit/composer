"use client";

import { useSyncExternalStore, useCallback, useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { getSavedItineraries, deleteSavedItinerary } from "@/lib/sharing";
import { createCachedStore } from "@/lib/createCachedStore";
import { SavedItinerary } from "@/types";

const COACHMARK_FLAG = "composer_seen_coachmark";

interface HomeScreenProps {
  userName: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const EMPTY_SAVED: SavedItinerary[] = [];

const savedPlansStore = createCachedStore<SavedItinerary[]>(
  () => getSavedItineraries(),
  (plans) => plans.map((p) => p.id).join("|"),
  EMPTY_SAVED
);

export function HomeScreen({ userName }: HomeScreenProps) {
  const savedPlans = useSyncExternalStore(
    savedPlansStore.subscribe,
    savedPlansStore.getSnapshot,
    savedPlansStore.getServerSnapshot
  );

  const handleDelete = useCallback((id: string) => {
    deleteSavedItinerary(id);
    savedPlansStore.notify();
  }, []);

  // First-run coachmark — fires only when the user has no saved plans and
  // hasn't dismissed it before. Stored in localStorage so it stays dismissed.
  const [showCoachmark, setShowCoachmark] = useState(false);
  useEffect(() => {
    if (savedPlans.length === 0 && !localStorage.getItem(COACHMARK_FLAG)) {
      setShowCoachmark(true);
    }
    // Run once on mount; intentionally not reactive to savedPlans changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissCoachmark = useCallback(() => {
    setShowCoachmark(false);
    localStorage.setItem(COACHMARK_FLAG, "1");
  }, []);

  const totalStops = savedPlans.reduce(
    (sum, p) => sum + (p.itinerary?.stops?.length ?? 0),
    0
  );

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      {/* Header */}
      <div className="px-6 pt-14 pb-6 max-w-lg w-full mx-auto">
        <p className="font-sans text-sm text-warm-gray mb-1">
          {getGreeting()}, {userName}
        </p>
        <h1 className="font-serif text-4xl text-charcoal">Compose your night.</h1>
      </div>

      {/* Main CTA — lifted above the dim overlay when coachmark is active */}
      <div
        className={`px-6 mb-8 max-w-lg w-full mx-auto ${
          showCoachmark ? "relative z-50" : ""
        }`}
      >
        <Link
          href="/compose"
          onClick={dismissCoachmark}
          className="block w-full p-6 rounded-2xl bg-burgundy text-cream relative overflow-hidden hover:bg-burgundy-light transition-colors"
        >
          <div className="relative z-10">
            <div className="font-serif text-2xl mb-2">New Date Plan</div>
            <p className="font-sans text-sm text-cream/80">
              Tell us the vibe, the neighborhood, the time. We&apos;ll do the rest.
            </p>
          </div>
          <div
            className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full bg-cream/10"
            aria-hidden
          />
        </Link>
      </div>

      {/* Saved plans */}
      <div className="px-6 flex-1 max-w-lg w-full mx-auto">
        <h2 className="font-serif text-xl text-charcoal mb-4">Your plans</h2>
        {savedPlans.length === 0 ? (
          <div className="text-center py-12 text-warm-gray border border-dashed border-border rounded-2xl">
            <p className="font-sans text-sm">No saved plans yet.</p>
            <p className="font-sans text-xs mt-1 text-warm-gray/70">
              Compose your first night and save it.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {savedPlans.map((plan) => {
              const stops = plan.itinerary?.stops ?? [];
              const firstStop = stops[0];
              const title = plan.itinerary?.header?.title ?? "Saved night";
              const date = new Date(plan.savedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
              return (
                <div
                  key={plan.id}
                  className="p-4 rounded-xl border border-border bg-white flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-serif text-base text-charcoal truncate">
                      {title}
                    </div>
                    <div className="font-sans text-xs text-warm-gray mt-1">
                      {firstStop?.venue?.name ?? "—"} · {stops.length} stops · saved {date}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(plan.id)}
                    className="font-sans text-xs text-warm-gray hover:text-burgundy transition-colors"
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
      <div className="px-6 py-6 border-t border-border mt-8 max-w-lg w-full mx-auto">
        <div className="flex justify-around text-center">
          <div>
            <div className="font-serif text-2xl text-burgundy">{savedPlans.length}</div>
            <div className="font-sans text-xs text-warm-gray">Plans saved</div>
          </div>
          <div>
            <div className="font-serif text-2xl text-burgundy">{totalStops}</div>
            <div className="font-sans text-xs text-warm-gray">Stops planned</div>
          </div>
          <div>
            <Button variant="secondary" href="/compose" className="text-xs px-4 py-2">
              New
            </Button>
          </div>
        </div>
      </div>

      {/* First-run coachmark */}
      <AnimatePresence>
        {showCoachmark && (
          <>
            <motion.button
              type="button"
              className="fixed inset-0 z-40 bg-charcoal/60 cursor-pointer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={dismissCoachmark}
              aria-label="Dismiss tip"
            />
            <motion.div
              className="fixed left-1/2 top-[58%] -translate-x-1/2 z-50 w-[88%] max-w-xs bg-cream rounded-2xl shadow-2xl p-5 text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <div className="font-serif text-lg text-charcoal mb-2">
                Tap to start
              </div>
              <p className="font-sans text-sm text-warm-gray mb-4">
                Six quick steps and you&apos;ve got a plan.
              </p>
              <button
                type="button"
                onClick={dismissCoachmark}
                className="font-sans text-xs font-medium text-burgundy"
              >
                Got it
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
