"use client";

// Lucky-itinerary banner. Lives inside the crown band for the current
// (Option B) treatment — chip-on-field styling, cream text, light
// chip border. Keeps the same copy + die as the original layer; only
// the surface treatment is restyled.
//
// The default variant (burgundy tint + burgundy/30 border + burgundy
// text) is retained for any future caller that wants the banner on
// a white surface, but the shipped consumer (LuckyCrown) always uses
// `variant="crown"`.

import { motion } from "motion/react";

interface LuckyBannerProps {
  /** Visual variant. "crown" is the chip-on-field treatment inside
   *  LuckyCrown's burgundy band; "default" is the original
   *  burgundy-tint-on-cream treatment, retained for future callers. */
  variant?: "default" | "crown";
}

export function LuckyBanner({ variant = "default" }: LuckyBannerProps) {
  const isCrown = variant === "crown";
  return (
    <motion.div
      role="status"
      data-testid="lucky-banner"
      className={
        isCrown
          ? "w-full max-w-lg mx-auto flex items-center gap-3 rounded-xl border border-crown-chip-border bg-crown-chip px-5 py-3"
          : "w-full max-w-lg mx-auto mb-4 flex items-center gap-3 rounded-xl border border-burgundy/30 bg-burgundy-tint px-5 py-3"
      }
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <BannerDie variant={variant} />
      <p
        className={`font-sans text-sm ${
          isCrown ? "text-crown-text" : "text-burgundy"
        }`}
      >
        The dice did this.
      </p>
    </motion.div>
  );
}

function BannerDie({ variant }: { variant: "default" | "crown" }) {
  const colorClass =
    variant === "crown" ? "text-crown-text" : "text-burgundy";
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${colorClass}`}
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
