"use client";

// Questionnaire neighborhood step. The pill-selection grid lives in
// the shared `NeighborhoodPicker`; this component handles profile
// prefill, the Continue CTA, and the CitySwitcher drawer.
//
// Single-select (radio): the algorithm only meaningfully uses one
// neighborhood anyway, and a multi-select UI was misleading users.
// The `neighborhoods` field stays an array (length 1) all the way
// through the API + saved-itinerary shape so this change stays
// reversible without a schema migration.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { NeighborhoodPicker } from "@/components/shared/NeighborhoodPicker";
import { CitySwitcher, CitySwitcherButton } from "./CitySwitcher";
import { useAuth } from "@/components/providers/AuthProvider";

interface NeighborhoodStepProps {
  initialSelected?: string[];
  onContinue: (selected: string[]) => void;
}

export function NeighborhoodStep({
  initialSelected = [],
  onContinue,
}: NeighborhoodStepProps) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [cityDrawerOpen, setCityDrawerOpen] = useState(false);

  // Pre-fill from the signed-in user's profile.favorite_hoods — but
  // only on the first session-level visit to this step (initialSelected
  // empty) and only once per mount. After the first change,
  // prefilledRef keeps the profile default from stomping on manual
  // changes, including the legitimate "deselect" case.
  //
  // Single-select takes the first favorite only. Existing accounts may
  // have multiple favorites from the pre-2026 multi-select era; we just
  // pick the top of the list.
  const { profile } = useAuth();
  const prefilledRef = useRef(false);
  const [didPrefill, setDidPrefill] = useState(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    if (initialSelected.length > 0) {
      prefilledRef.current = true;
      return;
    }
    if (!profile?.favorite_hoods?.length) return;
    const prefill = profile.favorite_hoods.slice(0, 1);
    if (prefill.length === 0) return;
    prefilledRef.current = true;
    void Promise.resolve().then(() => {
      setSelected(prefill);
      setDidPrefill(true);
    });
  }, [profile, initialSelected]);

  return (
    <div>
      {didPrefill && (
        <p
          aria-live="polite"
          className="text-center font-sans text-[11px] text-muted mb-4"
        >
          Pre-filled from your favorites
        </p>
      )}

      <NeighborhoodPicker
        selected={selected}
        onChange={setSelected}
        singleSelect
        groupByBorough
        animated
      />

      <CitySwitcherButton onClick={() => setCityDrawerOpen(true)} />

      <div className="mt-8">
        <Button
          variant="primary"
          onClick={() => onContinue(selected)}
          disabled={selected.length !== 1}
          className="w-full"
        >
          Continue
        </Button>
      </div>

      <CitySwitcher
        open={cityDrawerOpen}
        onClose={() => setCityDrawerOpen(false)}
      />
    </div>
  );
}
