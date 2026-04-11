"use client";

import { useSyncExternalStore, useCallback } from "react";
import Hero from "@/components/landing/Hero";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import HomeScreen from "@/components/home/HomeScreen";
import { getUserPrefs } from "@/lib/userPrefs";
import { getSavedItineraries } from "@/lib/sharing";
import type { UserPrefs } from "@/types";

type View = "loading" | "onboarding" | "landing" | "home";

interface Snapshot {
  view: View;
  prefs: UserPrefs | null;
}

const LOADING_SNAPSHOT: Snapshot = { view: "loading", prefs: null };

let cachedSnapshot: Snapshot = LOADING_SNAPSHOT;
let cachedKey = "";
const listeners = new Set<() => void>();

function computeSnapshot(): Snapshot {
  if (typeof window === "undefined") return LOADING_SNAPSHOT;
  const stored = getUserPrefs();
  if (!stored) return { view: "onboarding", prefs: null };
  const saved = getSavedItineraries();
  return {
    view: saved.length > 0 ? "home" : "landing",
    prefs: stored,
  };
}

function getSnapshot(): Snapshot {
  if (typeof window === "undefined") return LOADING_SNAPSHOT;
  const fresh = computeSnapshot();
  const key = `${fresh.view}|${fresh.prefs?.name ?? ""}`;
  if (key !== cachedKey) {
    cachedSnapshot = fresh;
    cachedKey = key;
  }
  return cachedSnapshot;
}

function getServerSnapshot(): Snapshot {
  return LOADING_SNAPSHOT;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notify(): void {
  cachedKey = ""; // invalidate
  listeners.forEach((cb) => cb());
}

export default function Home() {
  const { view, prefs } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const handleOnboardingComplete = useCallback(() => {
    notify();
  }, []);

  if (view === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div className="w-6 h-6 border-2 border-burgundy border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (view === "onboarding") {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  if (view === "home" && prefs) {
    return <HomeScreen userName={prefs.name} />;
  }

  return (
    <main className="flex flex-1 flex-col min-h-screen">
      <Hero />
    </main>
  );
}
