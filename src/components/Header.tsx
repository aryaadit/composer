// Shared page header. Composer lockup on the left (always linked to
// home), arbitrary right slot for back links, profile icons, etc.
//
// Self-contains its padding + max-width wrapper so callers don't need
// to repeat them. Pages that need a wider body (privacy) still get the
// standard-width header — that's intentional, magazine-style.
//
// `variant="crown"` is the lucky-itinerary inverted treatment: the
// lockup flips to cream via brightness/invert filters, and the focus
// ring switches to the crown-ring token so keyboard focus reads on
// the dark burgundy field. See CLAUDE.md "Lucky as a layer, not a
// fork" — the crown variant is unreachable from home / questionnaire
// / standard itineraries; the only callers are the itinerary surfaces
// when isLuckyItinerary(inputs) is true.

import Link from "next/link";
import type { ReactNode } from "react";

interface HeaderProps {
  /** Right-aligned slot. Typically a Back link, profile icon, or step-back button. */
  rightSlot?: ReactNode;
  /** Visual variant — "default" for the standard white surface,
   *  "crown" for the burgundy-field treatment on lucky itineraries.
   *  The variant only restyles the lockup + focus ring; the layout
   *  + max-width + padding stay identical so the column doesn't
   *  shift between standard and crown renders. */
  variant?: "default" | "crown";
}

export function Header({ rightSlot, variant = "default" }: HeaderProps) {
  const isCrown = variant === "crown";
  return (
    <div className="px-6 pt-6 max-w-lg w-full mx-auto">
      <header className="flex items-center justify-between py-4">
        <Link
          href="/"
          aria-label="Composer — home"
          className={
            isCrown
              ? "inline-block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crown-ring focus-visible:ring-offset-2 focus-visible:ring-offset-crown-field"
              : "inline-block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/50 focus-visible:ring-offset-2"
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/composer-lockup.svg"
            alt="Composer"
            className={
              isCrown
                ? "h-8 w-auto brightness-0 invert"
                : "h-8 w-auto"
            }
          />
        </Link>

        {rightSlot && <div className="flex items-center">{rightSlot}</div>}
      </header>
    </div>
  );
}
