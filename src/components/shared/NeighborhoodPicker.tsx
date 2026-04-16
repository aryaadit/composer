"use client";

// NeighborhoodPicker — shared pill-selection UI for neighborhood groups.
//
// Two consumers:
//   1. Questionnaire NeighborhoodStep — borough-grouped, capped at 3,
//      animated, with CitySwitcher and Continue CTA managed by the
//      wrapper.
//   2. Onboarding step 3 — flat list, uncapped, no animation, with
//      Skip / Let's go CTA managed by the wrapper.
//
// The picker owns selection state but reports changes upward via
// `onChange` so the wrapper can gate its CTA on selection count and
// read the final value on submit.

import { useCallback, useMemo } from "react";
import { motion } from "motion/react";
import {
  NEIGHBORHOOD_GROUPS,
  BOROUGH_LABELS,
  BOROUGH_ORDER,
  type Borough,
} from "@/config/neighborhoods";

interface NeighborhoodPickerProps {
  /** Group IDs to pre-select. */
  selected: string[];
  /** Called every time the selection set changes. */
  onChange: (selected: string[]) => void;
  /** Max simultaneous selections. Omit for unlimited. */
  maxSelections?: number;
  /** Render borough section headers. Default `true`. */
  groupByBorough?: boolean;
  /** Stagger pill entrance animation. Default `true`. */
  animated?: boolean;
}

const pillClass = (selected: boolean, atMax: boolean) =>
  `rounded-full px-4 py-2 text-sm font-sans font-medium transition-all border ${
    selected
      ? "bg-burgundy text-cream border-burgundy"
      : atMax
      ? "bg-cream border-border text-muted cursor-not-allowed"
      : "bg-cream border-border text-charcoal hover:border-charcoal/40"
  }`;

export function NeighborhoodPicker({
  selected,
  onChange,
  maxSelections,
  groupByBorough = true,
  animated = true,
}: NeighborhoodPickerProps) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const atMax =
    maxSelections != null && selectedSet.size >= maxSelections;

  const toggle = useCallback(
    (value: string) => {
      const next = new Set(selectedSet);
      if (next.has(value)) {
        next.delete(value);
      } else if (!atMax) {
        next.add(value);
      }
      onChange(Array.from(next));
    },
    [selectedSet, atMax, onChange]
  );

  const groups = NEIGHBORHOOD_GROUPS;

  // ── Flat list ────────────────────────────────────────────────────────
  if (!groupByBorough) {
    return (
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => {
          const isSelected = selectedSet.has(g.id);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => toggle(g.id)}
              disabled={!isSelected && atMax}
              className={pillClass(isSelected, !isSelected && atMax)}
            >
              {g.label}
            </button>
          );
        })}
      </div>
    );
  }

  // ── Borough-grouped ──────────────────────────────────────────────────
  type Group = (typeof groups)[number];
  const buckets = new Map<Borough, Group[]>();
  for (const g of groups) {
    if (!buckets.has(g.borough)) buckets.set(g.borough, []);
    buckets.get(g.borough)!.push(g);
  }
  const sections = BOROUGH_ORDER.filter((b) => buckets.has(b)).map((b) => ({
    borough: b,
    label: BOROUGH_LABELS[b],
    items: buckets.get(b)!,
  }));

  let delayIndex = 0;

  return (
    <div className="flex flex-col gap-5">
      {sections.map((section) => (
        <div key={section.borough}>
          <h3 className="text-center font-sans text-xs font-medium tracking-widest uppercase text-muted mb-3">
            {section.label}
          </h3>
          <div className="flex flex-wrap justify-center gap-2">
            {section.items.map((g) => {
              const isSelected = selectedSet.has(g.id);
              const isAtMax = !isSelected && atMax;
              const i = animated ? delayIndex++ : 0;
              const Wrapper = animated ? motion.button : "button";
              const animProps = animated
                ? {
                    initial: { opacity: 0, scale: 0.9 },
                    animate: { opacity: 1, scale: 1 },
                    transition: { duration: 0.2, delay: i * 0.03 },
                    whileTap: isAtMax ? undefined : { scale: 0.95 },
                  }
                : {};
              return (
                <Wrapper
                  key={g.id}
                  type="button"
                  onClick={() => toggle(g.id)}
                  disabled={isAtMax}
                  className={pillClass(isSelected, isAtMax)}
                  {...animProps}
                >
                  {g.label}
                </Wrapper>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
