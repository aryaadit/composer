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

import { useCallback, useEffect, useMemo, useRef } from "react";
import { motion } from "motion/react";
import { pillClass } from "@/lib/styles";
import {
  NEIGHBORHOOD_GROUPS,
  BOROUGH_LABELS,
  BOROUGH_ORDER,
  type Borough,
} from "@/config/neighborhoods";
import { BAKE_VERSION } from "@/config/generated/neighborhoods";
import { isGroupVisible } from "@/config/group-visibility";
import { EVENTS, track } from "@/lib/analytics";

interface NeighborhoodPickerProps {
  /** Group IDs to pre-select. */
  selected: string[];
  /** Called every time the selection set changes. */
  onChange: (selected: string[]) => void;
  /** Max simultaneous selections. Ignored when `singleSelect` is true. */
  maxSelections?: number;
  /**
   * Radio behavior: clicking a pill replaces the current selection
   * instead of toggling it into a set. Clicking the currently-selected
   * pill clears the selection. `onChange` always fires with an array of
   * length 0 or 1 in this mode. The questionnaire uses this; the picker
   * still supports multi-select for any future caller.
   */
  singleSelect?: boolean;
  /** Render borough section headers. Default `true`. */
  groupByBorough?: boolean;
  /** Stagger pill entrance animation. Default `true`. */
  animated?: boolean;
}

// Uses shared pillClass from @/lib/styles with disabled second arg

export function NeighborhoodPicker({
  selected,
  onChange,
  maxSelections,
  singleSelect = false,
  groupByBorough = true,
  animated = true,
}: NeighborhoodPickerProps) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  // `atMax` only applies to multi-select mode. In single-select, no pill
  // is ever disabled — clicking a different pill replaces the selection.
  const atMax =
    !singleSelect &&
    maxSelections != null &&
    selectedSet.size >= maxSelections;

  const toggle = useCallback(
    (value: string) => {
      if (singleSelect) {
        // Radio: clicking the active pill clears; any other click replaces.
        onChange(selectedSet.has(value) ? [] : [value]);
        return;
      }
      const next = new Set(selectedSet);
      if (next.has(value)) {
        next.delete(value);
      } else if (!atMax) {
        next.add(value);
      }
      onChange(Array.from(next));
    },
    [selectedSet, atMax, onChange, singleSelect]
  );

  // Native-composability gate (src/config/group-visibility.ts) replaced
  // the venueCount < 25 rule on 2026-06-11. A group renders iff the
  // median of its three per-tier native itinerary counts clears the
  // bar (currently 25); a tiny venueCount can still pass if it
  // composes densely, and a fat venueCount can fail if the tiers are
  // lopsided.
  const filtered = NEIGHBORHOOD_GROUPS.filter(isGroupVisible);
  // Fallback to unfiltered if the gate hides everything (defensive — a
  // bake misconfiguration shouldn't blank the picker).
  const groups = filtered.length > 0 ? filtered : NEIGHBORHOOD_GROUPS;

  // Fire neighborhood_options_shown once per mount so we can attribute
  // picker behavior (selection rate, abandons after view) to a specific
  // visibility bake. BAKE_VERSION is a content hash of the generated
  // taxonomy — see scripts/generate-configs.py — and changes whenever
  // groups, slugs, counts, or per-tier composability shift. The
  // emittedRef guards against React StrictMode dev double-mount.
  const emittedRef = useRef(false);
  useEffect(() => {
    if (emittedRef.current) return;
    emittedRef.current = true;
    const visibleIds = groups.map((g) => g.id);
    const hiddenCount = NEIGHBORHOOD_GROUPS.length - visibleIds.length;
    track(EVENTS.NEIGHBORHOOD_OPTIONS_SHOWN, {
      visible_group_ids: visibleIds,
      hidden_count: hiddenCount,
      bake_version: BAKE_VERSION,
    });
    // groups identity is stable per mount (constants + filter on
    // constants); deps intentionally empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
