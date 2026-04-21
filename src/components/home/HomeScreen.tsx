"use client";

// HomeScreen — the signed-in landing view. Uses the shared
// useSavedPlans hook and SavedPlanRow component for the saved
// plans list, keeping behavior identical to the profile page.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/Header";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSavedPlans } from "@/hooks/useSavedPlans";
import { SavedPlanRow } from "@/components/shared/SavedPlanRow";

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

  const totalStops = savedPlans.reduce(
    (sum, p) => sum + (p.stops?.length ?? 0),
    0
  );

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      <div className="px-6 pt-6 max-w-lg w-full mx-auto">
        <Header />
      </div>
      <div className="px-6 pt-4 pb-8 max-w-lg w-full mx-auto flex items-start justify-between">
        <div>
          <p className="font-sans text-sm tracking-widest uppercase text-muted mb-2">
            {greeting ? `${greeting}, ${userName}` : "\u00A0"}
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
            <p className="font-sans text-sm">Loading...</p>
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
            {savedPlans.map((plan) => (
              <SavedPlanRow
                key={plan.id}
                plan={plan}
                onDelete={deletePlan}
                onRenamed={renamePlan}
              />
            ))}
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="px-6 py-6 border-t border-border mt-10 max-w-lg w-full mx-auto">
        <div className="flex justify-around text-center items-center">
          <div>
            <div className="font-sans text-lg font-medium text-charcoal">
              {savedPlans.length}
            </div>
            <div className="font-sans text-xs text-muted mt-1">
              Plans saved
            </div>
          </div>
          <div>
            <div className="font-sans text-lg font-medium text-charcoal">
              {totalStops}
            </div>
            <div className="font-sans text-xs text-muted mt-1">
              Stops planned
            </div>
          </div>
          <div>
            <Button
              variant="secondary"
              href="/compose"
              className="text-xs px-4 py-2"
            >
              New
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
