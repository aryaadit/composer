"use client";

// Lucky-itinerary crown — the inverted burgundy band that wraps the
// page header, composition header, and dice banner for itineraries
// from the dice roll. Full viewport-width background field, content
// constrained to the standard column.
//
// Below this component the page returns to the standard white layout:
// straight horizontal seam at the bottom of the crown, then the
// ItineraryView renders byte-identical to a non-lucky itinerary.
//
// Scope safety: the only callers are the three itinerary surfaces
// (fresh, saved, share), each gating with isLuckyItinerary(inputs).
// The crown is unreachable from home, questionnaire, and standard
// itineraries — see CLAUDE.md "Lucky as a layer, not a fork".

import Link from "next/link";
import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { CompositionHeader } from "@/components/itinerary/CompositionHeader";
import { LuckyBanner } from "@/components/itinerary/LuckyBanner";
import type { ItineraryResponse } from "@/types";

interface LuckyCrownProps {
  header: ItineraryResponse["header"];
  inputs: ItineraryResponse["inputs"] | undefined;
  partySize?: number;
  /** Optional Back link target. When omitted (e.g., the public share
   *  surface), no right-slot is rendered. */
  backHref?: string;
  /** Visible label for the Back link. Plain text or ReactNode. */
  backLabel?: ReactNode;
}

export function LuckyCrown({
  header,
  inputs,
  partySize,
  backHref,
  backLabel,
}: LuckyCrownProps) {
  return (
    <div data-testid="lucky-crown" className="w-full bg-crown-field pb-6">
      <Header
        variant="crown"
        rightSlot={
          backHref ? (
            // Cream Back link with the crown-ring focus token — the
            // standard burgundy/40 ring is invisible on this field.
            <Link
              href={backHref}
              className="rounded-sm font-sans text-sm text-crown-text transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crown-ring focus-visible:ring-offset-2 focus-visible:ring-offset-crown-field"
            >
              {backLabel}
            </Link>
          ) : undefined
        }
      />
      <CompositionHeader
        header={header}
        inputs={inputs}
        partySize={partySize}
        variant="crown"
      />
      {/* Banner sits beneath the meta rows, inside the crown column,
          with a small top margin so it doesn't crowd the atmosphere
          line above. */}
      <div className="mx-auto mt-6 w-full max-w-lg px-6">
        <LuckyBanner variant="crown" />
      </div>
    </div>
  );
}
