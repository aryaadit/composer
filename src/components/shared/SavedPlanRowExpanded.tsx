"use client";

// Hero card for the soonest upcoming saved itinerary. Renders with
// significant vertical presence — venue hero image at the top with a
// dark gradient overlay carrying the title + secondary line, a stop
// preview row, and a static Mapbox map with numbered pins below.
//
// Routing: HomeScreen + profile/SavedPlansList render this for
// upcoming[0] only; the rest of upcoming and all of past use the
// standard SavedPlanRow.

import { useRef, useState } from "react";
import Link from "next/link";
import type { SavedItinerary } from "@/types";
import { formatShortDateLabel, todayLocalISO, tomorrowLocalISO } from "@/lib/dateUtils";
import {
  formatStartTimeLabel,
  startTimeFromLegacyBlock,
} from "@/lib/itinerary/time-blocks";
import { neighborhoodLabel } from "@/config/neighborhoods";
import { buildItineraryStaticMapUrl } from "@/lib/mapbox";
import { getVenueHeroImageUrl } from "@/lib/venues/images";
import { ROLE_LABELS } from "@/config/roles";

export type CountdownUrgency = "today" | "tomorrow";

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
  const firstStop = stops[0];
  const heroImageUrl = firstStop
    ? getVenueHeroImageUrl(firstStop.venue.image_keys ?? [])
    : null;

  // Phase 5 secondary line (kept consistent with the standard row).
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

  const mapUrl = buildItineraryStaticMapUrl(
    stops.map((s) => ({
      latitude: s.venue.latitude,
      longitude: s.venue.longitude,
    })),
  );

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

  return (
    <div
      data-testid="saved-plan-row-expanded"
      className="relative w-full mb-6 rounded-xl border border-burgundy/15 overflow-hidden bg-cream"
    >
      <Link href={`/itinerary/saved/${plan.id}`} className="block">
        {/* Hero zone — relative parent for image + gradient + text overlay */}
        <div className="relative h-[200px] w-full">
          {heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroImageUrl}
              alt={firstStop?.venue.name ?? "Itinerary hero"}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div
              data-testid="hero-fallback"
              className="absolute inset-0 w-full h-full bg-burgundy"
            />
          )}
          {/* Dark gradient overlay — darker at the bottom for text legibility */}
          <div
            className="absolute inset-0 bg-gradient-to-t from-charcoal/85 via-charcoal/35 to-transparent"
            aria-hidden
          />

          {/* Bottom-aligned text overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-5">
            {countdown && (
              <div
                data-testid="countdown"
                className="flex items-center gap-2 font-sans text-xs tracking-widest uppercase text-cream mb-2"
              >
                <span
                  data-testid="countdown-dot"
                  className={
                    countdown.urgency === "today"
                      ? "inline-block w-2 h-2 rounded-full bg-burgundy"
                      : "inline-block w-2 h-2 rounded-full bg-burgundy-light"
                  }
                  aria-hidden
                />
                <span
                  className={
                    countdown.urgency === "today"
                      ? "text-cream"
                      : "text-cream/80"
                  }
                >
                  {countdown.text}
                </span>
              </div>
            )}

            {editing ? (
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => void saveRename()}
                onClick={(e) => e.preventDefault()}
                disabled={saving}
                className="w-full font-serif text-2xl text-cream leading-tight bg-transparent border-b border-cream/60 focus:outline-none disabled:opacity-50"
              />
            ) : (
              <h2 className="font-serif text-2xl text-cream leading-tight">
                {displayName}
              </h2>
            )}

            {secondaryLine && !editing && (
              <p className="font-sans text-sm text-cream/80 mt-1">
                {secondaryLine}
              </p>
            )}
          </div>
        </div>

        {/* Stop preview row — wraps on narrow viewports */}
        {stops.length > 0 && (
          <div className="px-5 py-4 flex flex-wrap items-center gap-4 border-b border-border">
            {stops.map((stop, i) => {
              const thumb = getVenueHeroImageUrl(stop.venue.image_keys ?? []);
              return (
                <div
                  key={`${stop.venue.id}-${i}`}
                  className="flex items-center gap-2 min-w-0"
                >
                  <div className="w-10 h-10 rounded-md overflow-hidden bg-burgundy/10 shrink-0 flex items-center justify-center">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt={stop.venue.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="font-serif text-sm text-burgundy">
                        {stop.venue.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-serif text-sm text-charcoal truncate">
                      {stop.venue.name}
                    </div>
                    <div className="font-sans text-[10px] tracking-widest uppercase text-muted">
                      {ROLE_LABELS[stop.role] ?? stop.role}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Static Mapbox map — pins for every stop, no interaction */}
        {mapUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mapUrl}
            alt="Itinerary route map"
            className="w-full h-[160px] object-cover"
            loading="lazy"
          />
        )}
      </Link>

      {/* Affordances — absolutely positioned over the hero, outside the Link */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            startEditing();
          }}
          aria-label="Rename"
          className="w-8 h-8 rounded-full bg-cream/90 hover:bg-cream text-charcoal flex items-center justify-center shadow-sm transition-colors"
        >
          <PencilIcon />
        </button>
        {confirming ? (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-cream/95 shadow-sm font-sans text-xs">
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
            className="w-8 h-8 rounded-full bg-cream/90 hover:bg-cream text-charcoal hover:text-burgundy flex items-center justify-center shadow-sm transition-colors"
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
