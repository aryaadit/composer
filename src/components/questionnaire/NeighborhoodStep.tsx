"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { CitySwitcher, CitySwitcherButton } from "./CitySwitcher";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  NEIGHBORHOOD_GROUPS,
  BOROUGH_LABELS,
  BOROUGH_ORDER,
  type Borough,
} from "@/config/neighborhoods";

interface Option {
  value: string;
  label: string;
}

interface NeighborhoodStepProps {
  options: Option[];
  initialSelected?: string[];
  onContinue: (selected: string[]) => void;
}

const MAX_HOODS = 3;

export function NeighborhoodStep({
  options,
  initialSelected = [],
  onContinue,
}: NeighborhoodStepProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [cityDrawerOpen, setCityDrawerOpen] = useState(false);

  // Pre-fill from the signed-in user's profile.favorite_hoods — but only
  // on the first session-level visit to this step (initialSelected empty)
  // and only once per mount. After the first toggle, prefilledRef keeps
  // the profile default from stomping on manual changes, including the
  // legitimate "deselect all" case. Uses a Promise.resolve microtask to
  // keep the setState off the synchronous effect path (react-hooks/
  // set-state-in-effect rule).
  const { profile } = useAuth();
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    if (initialSelected.length > 0) {
      prefilledRef.current = true;
      return;
    }
    if (!profile?.favorite_hoods?.length) return;
    const validIds = new Set(options.map((o) => o.value));
    const prefill = profile.favorite_hoods
      .filter((id) => validIds.has(id))
      .slice(0, MAX_HOODS);
    if (prefill.length === 0) return;
    prefilledRef.current = true;
    void Promise.resolve().then(() => setSelected(new Set(prefill)));
  }, [profile, initialSelected, options]);

  // Group the incoming options by borough using the canonical group config.
  // Keeps the `options` prop flat for back-compat, while letting this step
  // render section headers without inventing its own taxonomy.
  const sections = useMemo(() => {
    const boroughOf = new Map<string, Borough>(
      NEIGHBORHOOD_GROUPS.map((g) => [g.id, g.borough])
    );
    const buckets = new Map<Borough, Option[]>();
    for (const opt of options) {
      const b = boroughOf.get(opt.value) ?? "manhattan";
      if (!buckets.has(b)) buckets.set(b, []);
      buckets.get(b)!.push(opt);
    }
    return BOROUGH_ORDER.filter((b) => buckets.has(b)).map((b) => ({
      borough: b,
      label: BOROUGH_LABELS[b],
      options: buckets.get(b)!,
    }));
  }, [options]);

  const handleToggle = useCallback((value: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else if (next.size < MAX_HOODS) {
        next.add(value);
      }
      return next;
    });
  }, []);

  const handleContinue = useCallback(() => {
    if (selected.size === 0) return;
    onContinue(Array.from(selected));
  }, [selected, onContinue]);

  let delayIndex = 0;

  return (
    <div>
      <p className="text-center font-sans text-xs text-muted mb-4">
        Pick up to {MAX_HOODS}
      </p>

      <div className="flex flex-col gap-5">
        {sections.map((section) => (
          <div key={section.borough}>
            <h3 className="text-center font-sans text-xs font-medium tracking-widest uppercase text-muted mb-3">
              {section.label}
            </h3>
            <div className="flex flex-wrap justify-center gap-2">
              {section.options.map((option) => {
                const isSelected = selected.has(option.value);
                const isAtMax = !isSelected && selected.size >= MAX_HOODS;
                const i = delayIndex++;
                return (
                  <motion.button
                    key={option.value}
                    onClick={() => handleToggle(option.value)}
                    disabled={isAtMax}
                    className={`rounded-full px-4 py-2 text-sm font-sans font-medium transition-all border ${
                      isSelected
                        ? "bg-burgundy text-cream border-burgundy"
                        : isAtMax
                        ? "bg-cream border-border text-muted cursor-not-allowed"
                        : "bg-cream border-border text-charcoal hover:border-charcoal/40"
                    }`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2, delay: i * 0.03 }}
                    whileTap={isAtMax ? undefined : { scale: 0.95 }}
                  >
                    {option.label}
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <CitySwitcherButton onClick={() => setCityDrawerOpen(true)} />

      <div className="mt-8">
        <Button
          variant="primary"
          onClick={handleContinue}
          disabled={selected.size === 0}
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
