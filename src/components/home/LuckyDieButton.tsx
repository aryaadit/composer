"use client";

// Secondary "Random tonight?" action — small die icon under the New
// plan CTA on the authed Home. Tapping it opens the LuckyOverlay
// which rolls inputs through /api/generate and navigates on success.
//
// Design intent: NOT a second filled button (would compete with New
// plan). A small icon + word treatment — burgundy die on cream, no
// background fill, hover/active darken only. First-run users need a
// word because the behavior isn't learned yet; icon-only is reserved
// for a later iteration once "die = random" is established.

import { useEffect, useState } from "react";
import { LuckyOverlay } from "./LuckyOverlay";
import { LUCKY } from "@/config/lucky";
import { nextEligibleStartTime } from "@/lib/lucky";

interface LuckyDieButtonProps {
  /** Signed-in user id, or null when logged-out. Passed through to the
   *  overlay for the recent-exclusions fetch. The button itself works
   *  the same in both states. */
  userId: string | null;
  /** Optional className for layout — the parent decides whether to
   *  center it, justify-end it, etc. */
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
 *  cutoff sees the button disable in place rather than tapping into
 *  a no-op. */
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
        aria-label="Random tonight? Roll a plan for tonight."
        className={
          "inline-flex items-center gap-2 font-sans text-sm text-burgundy " +
          "hover:text-burgundy-light transition-colors disabled:opacity-40 " +
          "disabled:cursor-not-allowed " +
          className
        }
      >
        <DieGlyph size={20} />
        <span>{eligible ? "Random tonight?" : "Too late tonight"}</span>
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
