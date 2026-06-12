"use client";

// Tonight's Pick — daily seeded itinerary, rendered on home as a
// COMPACT TEASER (home-redesign 2026-06-12). Tinted burgundy fill,
// eyebrow + serif title + ONE-line subtitle + chevron. No map, no
// stop rows — the upcoming hero on the same page owns the map, and
// duplicating the stops there made the pick read as a visual twin
// of the user's saved plan.
//
// Renders every day for authed users regardless of whether they
// already have a today-plan. Tap → sessionStorage handoff to
// /itinerary, unchanged from the pre-redesign card (handoff + the
// daily_pick_opened event don't move).

import { useRouter } from "next/navigation";
import { STORAGE_KEYS } from "@/config/storage";
import { EVENTS, track } from "@/lib/analytics";
import type { ItineraryResponse, GenerateRequestBody } from "@/types";

interface TonightsPickCardProps {
  inputs: GenerateRequestBody;
  itinerary: ItineraryResponse;
  pickDate: string;
}

export function TonightsPickCard({
  inputs,
  itinerary,
  pickDate,
}: TonightsPickCardProps) {
  const router = useRouter();

  const handleOpen = () => {
    track(EVENTS.DAILY_PICK_OPENED, {
      itinerary_id: null,
      pick_date: pickDate,
    });
    // Standard handoff — same sessionStorage keys, same /itinerary
    // page. Lucky uses the identical pattern. No new render path.
    sessionStorage.setItem(
      STORAGE_KEYS.session.questionnaireInputs,
      JSON.stringify(inputs),
    );
    sessionStorage.setItem(
      STORAGE_KEYS.session.currentItinerary,
      JSON.stringify(itinerary),
    );
    router.push("/itinerary");
  };

  const title = itinerary.header?.title ?? "A plan for tonight";
  const subtitle = itinerary.header?.subtitle ?? null;

  return (
    <section
      data-testid="tonights-pick-card"
      className="w-full max-w-lg mx-auto mb-8 px-6"
    >
      <button
        type="button"
        onClick={handleOpen}
        className="group flex w-full items-center gap-3 rounded-xl border border-burgundy/30 bg-burgundy-tint px-5 py-4 text-left transition-colors hover:border-burgundy/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/50"
      >
        <div className="min-w-0 flex-1">
          {/* ── Eyebrow ───────────────────────────────────── */}
          <div
            data-testid="tonights-pick-eyebrow"
            className="mb-1 flex items-center gap-2 font-sans text-[11px] tracking-widest uppercase text-burgundy"
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-burgundy"
              aria-hidden
            />
            <span>Tonight&apos;s pick &middot; from us</span>
          </div>

          {/* ── Title ─────────────────────────────────────── */}
          <h2 className="truncate font-serif text-xl text-charcoal leading-snug">
            {title}
          </h2>

          {/* ── One-line subtitle (existing copy, truncated) ─ */}
          {subtitle && (
            <p className="mt-1 truncate font-sans text-sm text-warm-gray">
              {subtitle}
            </p>
          )}
        </div>

        {/* ── Right-aligned chevron ────────────────────────── */}
        <ChevronRightIcon />
      </button>
    </section>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-burgundy transition-transform group-hover:translate-x-0.5"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
