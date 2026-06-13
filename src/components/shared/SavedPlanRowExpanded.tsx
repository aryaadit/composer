"use client";

// Hero row for the soonest upcoming saved itinerary. The three-zone
// layout (countdown header, static Mapbox map, venue timeline) lives in
// `ItineraryHeroCard`; this component is the thin wrapper that:
//   - maps the SavedItinerary row to hero props (countdown, title,
//     meta line, walks fallback)
//   - owns the outer Link to the saved-itinerary page
//   - keeps the rename + delete affordances + their absolute-positioned
//     pencil/trash buttons + the inline-rename input that replaces the
//     hero's default <h2>{title}</h2> via the `titleSlot` escape hatch.
//
// Phase 9 originated the three-zone treatment. 2026-06-13 split the
// presentation out so Tonight's Pick can reuse the same hero shape.

import { useRef, useState } from "react";
import Link from "next/link";
import type { SavedItinerary } from "@/types";
import { formatShortDateLabel, todayLocalISO, tomorrowLocalISO } from "@/lib/dateUtils";
import {
  formatStartTimeLabel,
  startTimeFromLegacyBlock,
} from "@/lib/itinerary/time-blocks";
import { neighborhoodLabel } from "@/config/neighborhoods";
import { rebuildWalks } from "@/lib/itinerary/saved-hydration";
import {
  ItineraryHeroCard,
  type EyebrowUrgency,
} from "@/components/shared/ItineraryHeroCard";

export type CountdownUrgency = EyebrowUrgency;

export interface CountdownLabel {
  text: string;
  urgency: CountdownUrgency;
}

/**
 * Countdown copy + urgency level for the hero card.
 *
 *   - today    → "TONIGHT AT 7 PM"  / urgency "today"
 *   - tomorrow → "TOMORROW AT 7 PM" / urgency "tomorrow"
 *   - else     → null (no countdown rendered)
 *
 * `today` and `tomorrow` are injected for testability; the production
 * call site supplies `todayLocalISO()` and `tomorrowLocalISO()`.
 */
export function getCountdownLabel(
  dayISO: string | null | undefined,
  startTime: string,
  today: string = todayLocalISO(),
  tomorrow: string = tomorrowLocalISO(),
): CountdownLabel | null {
  if (!dayISO) return null;
  const timeLabel = formatStartTimeLabel(startTime);
  if (dayISO === today) {
    return { text: `TONIGHT AT ${timeLabel}`, urgency: "today" };
  }
  if (dayISO === tomorrow) {
    return { text: `TOMORROW AT ${timeLabel}`, urgency: "tomorrow" };
  }
  return null;
}

interface SavedPlanRowExpandedProps {
  plan: SavedItinerary;
  onDelete: (id: string) => void;
  onRenamed: (id: string, customName: string | null) => void;
}

export function SavedPlanRowExpanded({
  plan,
  onDelete,
  onRenamed,
}: SavedPlanRowExpandedProps) {
  const displayName = plan.custom_name || plan.title || "Saved plan";
  const stops = plan.stops ?? [];
  // Phase 10: prefer persisted walks (carry route_geometry from
  // composer_walking_routes); fall back to straight-line stubs from
  // venue coords for legacy rows saved before the 20260610 migration.
  const walks =
    plan.walks && plan.walks.length > 0 ? plan.walks : rebuildWalks(stops);

  // Header text content (Phase 5 secondary line format).
  const dayLabel = formatShortDateLabel(plan.day);
  const resolvedStartTime =
    plan.start_time ?? startTimeFromLegacyBlock(plan.time_block);
  const startLabel = formatStartTimeLabel(resolvedStartTime);
  const firstNeighborhood = (plan.neighborhoods ?? [])[0];
  const neighborhoodSegment = firstNeighborhood
    ? neighborhoodLabel(firstNeighborhood)
    : "";
  const secondaryLine = [dayLabel, startLabel, neighborhoodSegment]
    .filter((s) => s.length > 0)
    .join(" · ");

  const countdown = getCountdownLabel(plan.day, resolvedStartTime);

  // ── Inline rename ───────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setDraft(displayName);
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const cancelEditing = () => {
    setEditing(false);
    setDraft(displayName);
  };

  const saveRename = async () => {
    const trimmed = draft.trim();
    const newName = trimmed || null;
    if (newName === displayName) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/itineraries/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customName: newName }),
      });
      if (res.ok) onRenamed(plan.id, newName);
    } catch {
      // keep current name on failure
    }
    setSaving(false);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void saveRename();
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  };

  // ── Confirm delete ──────────────────────────────────────────
  const [confirming, setConfirming] = useState(false);

  // The rename input replaces the default <h2>{title}</h2> via the
  // hero's titleSlot escape hatch when editing. The meta line is
  // suppressed (empty string) so the input has visual breathing room
  // matching the pre-extraction layout.
  const titleSlot = editing ? (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => void saveRename()}
      onClick={(e) => e.preventDefault()}
      disabled={saving}
      aria-label="Rename plan"
      className="w-full font-serif text-2xl text-charcoal leading-tight bg-transparent border-b border-burgundy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/40 disabled:opacity-50"
    />
  ) : undefined;

  return (
    <div
      data-testid="saved-plan-row-expanded"
      className="relative w-full mb-6 rounded-xl border border-burgundy/15 bg-cream overflow-hidden"
    >
      <Link href={`/itinerary/saved/${plan.id}`} className="block">
        <ItineraryHeroCard
          eyebrow={countdown}
          title={displayName}
          metaLine={editing ? "" : secondaryLine}
          stops={stops}
          walks={walks}
          titleSlot={titleSlot}
        />
      </Link>

      {/* Affordances — top-right, outside the Link */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            startEditing();
          }}
          aria-label="Rename"
          className="w-11 h-11 rounded-full bg-cream/90 hover:bg-cream text-burgundy/70 hover:text-burgundy flex items-center justify-center shadow-sm border border-burgundy/10 transition-colors"
        >
          <PencilIcon />
        </button>
        {confirming ? (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-cream/95 shadow-sm border border-burgundy/10 font-sans text-xs">
            <span className="text-muted">Remove?</span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setConfirming(false);
                onDelete(plan.id);
              }}
              className="font-medium text-burgundy hover:text-burgundy-light transition-colors"
            >
              Yes
            </button>
            <span aria-hidden className="text-muted">·</span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setConfirming(false);
              }}
              className="text-muted hover:text-charcoal transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConfirming(true);
            }}
            aria-label="Remove saved plan"
            className="w-11 h-11 rounded-full bg-cream/90 hover:bg-cream text-burgundy/70 hover:text-burgundy flex items-center justify-center shadow-sm border border-burgundy/10 transition-colors"
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
