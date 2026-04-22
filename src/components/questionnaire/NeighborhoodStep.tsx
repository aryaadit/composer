"use client";

// Questionnaire neighborhood step. The pill-selection grid lives in
// the shared `NeighborhoodPicker`; this component adds the "Pick up
// to 3" helper, the profile-prefill logic, the Continue CTA, and the
// CitySwitcher drawer.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { NeighborhoodPicker } from "@/components/shared/NeighborhoodPicker";
import { CitySwitcher, CitySwitcherButton } from "./CitySwitcher";
import { useAuth } from "@/components/providers/AuthProvider";

interface NeighborhoodStepProps {
  initialSelected?: string[];
  onContinue: (selected: string[]) => void;
}

const MAX_HOODS = 3;

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
  // changes, including the legitimate "deselect all" case.
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
    const prefill = profile.favorite_hoods.slice(0, MAX_HOODS);
    if (prefill.length === 0) return;
    prefilledRef.current = true;
    void Promise.resolve().then(() => {
      setSelected(prefill);
      setDidPrefill(true);
    });
  }, [profile, initialSelected]);

  return (
    <div>
      <p
        aria-live="polite"
        className={`text-center font-sans text-xs mb-4 tabular-nums ${
          selected.length >= MAX_HOODS ? "text-burgundy" : "text-muted"
        }`}
      >
        {selected.length}/{MAX_HOODS} selected
        {didPrefill && (
          <span className="block text-muted text-[11px] mt-0.5">
            Pre-filled from your favorites
          </span>
        )}
      </p>

      <NeighborhoodPicker
        selected={selected}
        onChange={setSelected}
        maxSelections={MAX_HOODS}
        groupByBorough
        animated
      />

      <CitySwitcherButton onClick={() => setCityDrawerOpen(true)} />

      <div className="mt-8">
        <Button
          variant="primary"
          onClick={() => onContinue(selected)}
          disabled={selected.length === 0}
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
