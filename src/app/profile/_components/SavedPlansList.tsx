"use client";

// Saved itineraries section on the profile page. Uses the shared
// SavedPlanRow component and useSavedPlans hook.

import { useSavedPlans } from "@/hooks/useSavedPlans";
import { SavedPlanRow } from "@/components/shared/SavedPlanRow";

interface Props {
  userId: string;
}

export function SavedPlansList({ userId }: Props) {
  const { plans, loading, deletePlan, renamePlan } = useSavedPlans({
    userId,
  });

  return (
    <section className="mb-10">
      <h2 className="font-sans text-xs tracking-widest uppercase text-muted mb-5">
        Saved itineraries
      </h2>

      {loading ? (
        <p className="font-sans text-sm text-muted py-8">Loading...</p>
      ) : plans.length === 0 ? (
        <div className="py-8 border-t border-border">
          <p className="font-sans text-sm text-muted">
            No saved nights yet. Generate one and tap Save.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border border-t border-border">
          {plans.map((plan) => (
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
  );
}
