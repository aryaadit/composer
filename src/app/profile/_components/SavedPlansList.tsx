"use client";

// Saved itineraries section on the profile page. Uses the shared
// SavedPlanRow component and useSavedPlans hook. Phase 5 split into
// Upcoming + Past sections — same partitioning logic as HomeScreen.

import { useMemo } from "react";
import { useSavedPlans } from "@/hooks/useSavedPlans";
import { SavedPlanRow } from "@/components/shared/SavedPlanRow";
import { SavedPlanRowExpanded } from "@/components/shared/SavedPlanRowExpanded";
import { splitPlansByDate } from "@/lib/dateUtils";

interface Props {
  userId: string;
}

export function SavedPlansList({ userId }: Props) {
  const { plans, loading, deletePlan, renamePlan } = useSavedPlans({
    userId,
  });

  const { upcoming, past } = useMemo(() => splitPlansByDate(plans), [plans]);
  const hasAnyPlans = plans.length > 0;

  if (loading) {
    return (
      <section className="mb-10">
        <h2 className="font-sans text-xs tracking-widest uppercase text-muted mb-5">
          Saved itineraries
        </h2>
        <p className="font-sans text-sm text-muted py-8">Loading...</p>
      </section>
    );
  }

  if (!hasAnyPlans) {
    return (
      <section className="mb-10">
        <h2 className="font-sans text-xs tracking-widest uppercase text-muted mb-5">
          Saved itineraries
        </h2>
        <div className="py-8 border-t border-border">
          <p className="font-sans text-sm text-muted">
            No saved nights yet. Generate one and tap Save.
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="mb-10">
      {upcoming.length > 0 && (
        <section className="mb-8">
          <h2 className="font-sans text-xs tracking-widest uppercase text-muted mb-5">
            Upcoming
          </h2>
          {/* Phase 6: hero treatment for the soonest upcoming. */}
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
                  showSubtitle
                  onDelete={deletePlan}
                  onRenamed={renamePlan}
                />
              ))}
            </div>
          )}
        </section>
      )}
      {past.length > 0 && (
        <section className="mb-8">
          <h2 className="font-sans text-xs tracking-widest uppercase text-muted mb-5">
            Past
          </h2>
          <div className="divide-y divide-border border-t border-border">
            {past.map((plan) => (
              <SavedPlanRow
                key={plan.id}
                plan={plan}
                showSubtitle
                onDelete={deletePlan}
                onRenamed={renamePlan}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
