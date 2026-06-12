"use client";

// "Random tonight" — icon-only die button. Lives in the home Header
// next to the profile glyph (home redesign 2026-06-12). The previous
// labeled row under the New plan CTA was deleted; vertical slot freed.
// Behavior is unchanged from that row: tap opens the LuckyOverlay,
// the overlay handles the seeded roll + navigation + analytics. No
// compose_started, no abandon flag.

import { useEffect, useState } from "react";
import { LuckyOverlay } from "./LuckyOverlay";
import { LUCKY } from "@/config/lucky";
import { nextEligibleStartTime } from "@/lib/lucky";

interface LuckyDieButtonProps {
  /** Signed-in user id, or null when logged-out. Passed through to the
   *  overlay for the recent-exclusions fetch. The button itself works
   *  the same in both states. */
  userId: string | null;
  /** Optional className for layout — the parent decides spacing
   *  relative to neighboring header glyphs. */
  className?: string;
}

function usePrefersReducedMotion(): boolean {
  // Lazy initializer so the first render reflects the user's actual
  // preference. Keeps setState out of the initial useEffect (React
  // Compiler flags cascading renders for the effect-init pattern).
  const [reduce, setReduce] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduce(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return reduce;
}

/** Track whether the same-day cutoff still allows at least one pill.
 *  Polled every minute so a user sitting on the home screen past the
 *  cutoff sees the button dim in place rather than tapping into a
 *  no-op. After-cutoff state is presented as a dimmed icon with
 *  aria-disabled, per spec. */
function useTodayHasEligibleSlot(): boolean {
  const [eligible, setEligible] = useState(() =>
    typeof window === "undefined"
      ? true
      : nextEligibleStartTime(new Date()) !== null,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(
      () => setEligible(nextEligibleStartTime(new Date()) !== null),
      60_000,
    );
    return () => window.clearInterval(id);
  }, []);
  return eligible;
}

export function LuckyDieButton({ userId, className = "" }: LuckyDieButtonProps) {
  const [overlayOpen, setOverlayOpen] = useState(false);
  // Debounce: each attempt is real spend (Gemini + Mapbox). Block
  // double-taps / rage-rolls for LUCKY.debounceMs even after the
  // overlay closes on a failure dismiss.
  const [debouncedUntil, setDebouncedUntil] = useState(0);
  const reduceMotion = usePrefersReducedMotion();
  const eligible = useTodayHasEligibleSlot();
  const disabled = !eligible || overlayOpen;

  const handleClick = () => {
    if (disabled) return;
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now < debouncedUntil) return;
    setDebouncedUntil(now + LUCKY.debounceMs);
    setOverlayOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        aria-label="Random tonight"
        title={eligible ? "Random tonight" : "Too late tonight"}
        className={
          "inline-flex h-8 w-8 items-center justify-center text-burgundy " +
          "transition-colors hover:text-burgundy-light " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/50 focus-visible:rounded-full " +
          "disabled:cursor-not-allowed disabled:opacity-40 " +
          className
        }
      >
        <DieGlyph size={20} />
      </button>
      {overlayOpen && (
        <LuckyOverlay
          userId={userId}
          reduceMotion={reduceMotion}
          onDismiss={() => setOverlayOpen(false)}
        />
      )}
    </>
  );
}

/** Inline 2D die glyph for the button. Same visual language as the
 *  overlay's 3D die but static + small. */
function DieGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
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
