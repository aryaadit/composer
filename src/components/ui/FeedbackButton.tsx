"use client";

const FEEDBACK_URL = "https://forms.gle/ccbUjsfpFYeN36sY8";

export function FeedbackButton() {
  return (
    <a
      href={FEEDBACK_URL}
      target="_blank"
      rel="noopener noreferrer"
      // Audit item 14: tokenized (charcoal token, no zinc palette).
      // Offset bumped from `bottom-6` to `bottom-24` so the floating
      // button never overlaps the sticky LooksGoodCTA on the itinerary
      // surface. Safe-area override keeps it clear on notch devices.
      // z-30 sits under modal backdrops (z-40) so the bubble never
      // intercepts taps on an open modal CTA. Label is always shown —
      // hover-only text was invisible on touch.
      className="fixed right-6 z-30 flex items-center gap-2 rounded-full bg-charcoal px-4 py-2.5 font-sans text-sm text-cream shadow-lg transition-all hover:bg-charcoal/90 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/50"
      aria-label="Send feedback"
      style={{
        bottom:
          "max(6rem, env(safe-area-inset-bottom, 0px) + 6rem)",
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      Feedback
    </a>
  );
}
