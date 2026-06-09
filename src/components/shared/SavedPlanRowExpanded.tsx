"use client";

// Three-zone hero card for the soonest upcoming saved itinerary.
//
//   Zone 1 — Text header on the card's cream background. Countdown
//            line, large serif title, day · time · neighborhood.
//            No overlaid-on-image text.
//   Zone 2 — Static Mapbox map with numbered burgundy pins. Strictly
//            functional preview — no interactive layer. Hidden when
//            Mapbox returns null OR the request errors (token scope
//            issue, missing coords).
//   Zone 3 — Venue timeline. Numbered marker · name · role on the
//            right · category line. Walk-minutes separator between
//            stops, rebuilt from venue coords via rebuildWalks.
//
// Phase 9 rebuild — dropped the hero venue image entirely. Card sits
// on the cream surface with a subtle burgundy-tinted border to
// differentiate from the standard SavedPlanRow.

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
import { rebuildWalks } from "@/lib/itinerary/saved-hydration";
import { ROLE_LABELS } from "@/config/roles";
import { formatCategory } from "@/lib/format/category";
import { getVenueHeroImageUrl } from "@/lib/venues/images";

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
  const walks = rebuildWalks(stops);

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

  // Mapbox static URL. Phase 9 defaults to 600×180@2x padding 60 so
  // pins read clearly. Null when token is missing or no stop has
  // finite coords. `mapErrored` switches to "hide map zone" if the
  // image GET fails at runtime (e.g. token's Static Images scope
  // isn't granted in the Mapbox dashboard — see mapbox.ts comment).
  const mapUrl = buildItineraryStaticMapUrl(
    stops.map((s) => ({
      latitude: s.venue.latitude,
      longitude: s.venue.longitude,
    })),
  );
  const [mapErrored, setMapErrored] = useState(false);

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
      className="relative w-full mb-6 rounded-xl border border-burgundy/15 bg-cream overflow-hidden"
    >
      <Link href={`/itinerary/saved/${plan.id}`} className="block">
        {/* ─── Zone 1 — Text header ────────────────────────── */}
        <div className="px-5 pt-5 pb-4">
          {countdown && (
            <div
              data-testid="countdown"
              className={`flex items-center gap-2 font-sans text-[11px] tracking-widest uppercase mb-2 ${
                countdown.urgency === "today"
                  ? "text-burgundy"
                  : "text-burgundy/60"
              }`}
            >
              <span
                data-testid="countdown-dot"
                className={
                  countdown.urgency === "today"
                    ? "inline-block w-1.5 h-1.5 rounded-full bg-burgundy"
                    : "inline-block w-1.5 h-1.5 rounded-full bg-burgundy/60"
                }
                aria-hidden
              />
              <span>{countdown.text}</span>
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
              className="w-full font-serif text-2xl text-charcoal leading-tight bg-transparent border-b border-burgundy focus:outline-none disabled:opacity-50"
            />
          ) : (
            <h2 className="font-serif text-2xl text-charcoal leading-tight pr-20">
              {displayName}
            </h2>
          )}

          {secondaryLine && !editing && (
            <p className="font-sans text-sm text-muted mt-1">
              {secondaryLine}
            </p>
          )}
        </div>

        {/* ─── Zone 2 — Functional static map ──────────────── */}
        {mapUrl && !mapErrored && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mapUrl}
            alt="Itinerary route map"
            className="w-full h-[180px] object-cover"
            loading="lazy"
            onError={() => setMapErrored(true)}
          />
        )}

        {/* ─── Zone 3 — Venue timeline ─────────────────────── */}
        {stops.length > 0 && (
          <div className="px-5 py-4">
            {stops.map((stop, i) => {
              const thumb = getVenueHeroImageUrl(stop.venue.image_keys ?? []);
              return (
                <div key={`${stop.venue.id}-${i}`}>
                  <div className="flex items-center gap-3">
                    {/* Venue thumbnail (or first-letter fallback). The
                        row order matches the map's pin numbers, so an
                        explicit number on the timeline is redundant. */}
                    <div
                      data-testid="venue-thumbnail"
                      className="shrink-0 w-12 h-12 rounded-md overflow-hidden bg-burgundy/10 flex items-center justify-center"
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt={stop.venue.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span
                          data-testid="thumbnail-fallback"
                          className="font-serif text-lg text-burgundy"
                        >
                          {stop.venue.name.charAt(0)}
                        </span>
                      )}
                    </div>
                    {/* Name + category (left), role (right) */}
                    <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-serif text-base text-charcoal truncate">
                          {stop.venue.name}
                        </div>
                        {stop.venue.category && (
                          <div className="font-sans text-xs text-muted mt-0.5">
                            {formatCategory(stop.venue.category)}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 font-sans text-[10px] tracking-widest uppercase text-muted whitespace-nowrap pt-1">
                        {ROLE_LABELS[stop.role] ?? stop.role}
                      </div>
                    </div>
                  </div>

                  {/* Walk separator — between stops only, not after the last */}
                  {i < stops.length - 1 && walks[i] && (
                    <div
                      data-testid="walk-separator"
                      className="flex items-center gap-3 my-3 ml-6"
                    >
                      <span className="flex-1 border-t border-border" aria-hidden />
                      <span className="font-sans text-[11px] text-muted whitespace-nowrap">
                        {walks[i].walk_minutes} min walk
                      </span>
                      <span className="flex-1 border-t border-border" aria-hidden />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
          className="w-8 h-8 rounded-full bg-cream/90 hover:bg-cream text-burgundy/70 hover:text-burgundy flex items-center justify-center shadow-sm border border-burgundy/10 transition-colors"
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
            className="w-8 h-8 rounded-full bg-cream/90 hover:bg-cream text-burgundy/70 hover:text-burgundy flex items-center justify-center shadow-sm border border-burgundy/10 transition-colors"
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
