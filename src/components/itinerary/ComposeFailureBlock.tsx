"use client";

// Inline failure surface rendered at the point of action when /api/
// swap-stop or /api/add-stop returns a 422 ComposeFailure. The full-
// page generate-failure surface lives in /app/itinerary/page.tsx; this
// component is its compact, in-context counterpart.
//
// Design-system primary state block: burgundy border + tinted fill +
// serif headline. Loud enough that the user can't miss it, calm enough
// that it doesn't read like a system error. Copy is routed exclusively
// through the compose-failure registry — never inline strings.

import type { ComposeFailure } from "@/lib/itinerary/compose-failure";

interface ComposeFailureBlockProps {
  failure: ComposeFailure;
  /** Optional extra class on the outer block — used to align the inline
   *  surface with whatever container it lands in (stop card, add-stop
   *  CTA row, etc.). */
  className?: string;
}

export function ComposeFailureBlock({
  failure,
  className = "",
}: ComposeFailureBlockProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        "rounded-xl border border-burgundy/40 bg-burgundy/5 px-4 py-3 " +
        className
      }
    >
      <p className="font-serif text-lg leading-snug text-burgundy">
        {failure.title}
      </p>
      <p className="font-sans text-sm leading-snug text-charcoal/80 mt-1">
        {failure.suggestion}
      </p>
    </div>
  );
}
