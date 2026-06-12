"use client";

// Full-screen overlay shown while the surprise-me ("Lucky") path is
// rolling inputs and waiting on /api/generate. The overlay owns:
//   1. The dice-tumble animation (pure CSS/SVG — see globals.css
//      .lucky-die / @keyframes lucky-tumble).
//   2. The retry loop — up to LUCKY.maxAttempts on 422, rerolling
//      fresh inputs each time. Silent reroll between attempts.
//   3. The minimum display floor (LUCKY.minOverlayMs) so sub-second
//      responses still read as a roll.
//   4. The terminal failure surface — the standard ComposeFailureBlock
//      with a Dismiss button. Closes the overlay; no navigation, no
//      animation strand.
//
// Architectural rule (non-negotiable per the spec): Lucky bypasses
// the questionnaire. It does NOT call markComposeEntry, does NOT set
// the compose-abandoned flag, does NOT emit compose_started. It emits
// compose_submitted with `mode: "lucky"` and `attempt: n` on rerolls.
// All server events flow unchanged.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ComposeFailureBlock } from "@/components/itinerary/ComposeFailureBlock";
import type { ComposeFailure } from "@/lib/itinerary/compose-failure";
import { runLuckyRolls } from "@/lib/lucky-runner";
import { LUCKY } from "@/config/lucky";
import { STORAGE_KEYS } from "@/config/storage";

interface LuckyOverlayProps {
  /** Signed-in user id for the recent-exclusions fetch. null → empty
   *  exclusion list (logged-out lucky still works; the server uses
   *  whatever inputs it's given). */
  userId: string | null;
  /** Called when the user dismisses the terminal failure state. The
   *  parent should unmount the overlay. */
  onDismiss: () => void;
  /** Reduced-motion preference, threaded from the parent so SSR can
   *  decide too. Defaults to false (tumble); when true the die holds
   *  still and pulses gently instead. */
  reduceMotion?: boolean;
}

type Phase =
  | { kind: "rolling"; attempt: number }
  | { kind: "navigating" }
  | { kind: "failed"; failure: ComposeFailure };

export function LuckyOverlay({
  userId,
  onDismiss,
  reduceMotion = false,
}: LuckyOverlayProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "rolling", attempt: 1 });
  // Once-per-mount guard — StrictMode dev double-invokes effects;
  // without this we'd kick off two parallel roll loops.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const startedAt =
      typeof performance !== "undefined" ? performance.now() : 0;
    let cancelled = false;

    (async () => {
      const result = await runLuckyRolls({
        now: new Date(),
        userId,
        onAttempt: (attempt) => {
          if (!cancelled) setPhase({ kind: "rolling", attempt });
        },
      });
      // Minimum display floor — keep the dice visible even when the
      // server is fast, otherwise the overlay flashes and feels broken.
      const elapsed =
        typeof performance !== "undefined"
          ? performance.now() - startedAt
          : LUCKY.minOverlayMs;
      const remaining = Math.max(0, LUCKY.minOverlayMs - elapsed);
      if (remaining > 0) {
        await new Promise((r) => setTimeout(r, remaining));
      }
      if (cancelled) return;
      if (result.ok) {
        setPhase({ kind: "navigating" });
        // Mirror the questionnaire's success path: store inputs + result
        // in the same sessionStorage keys, navigate to /itinerary. The
        // page has no idea this came from lucky — the spec rule.
        sessionStorage.setItem(
          STORAGE_KEYS.session.questionnaireInputs,
          JSON.stringify(result.lastBody),
        );
        sessionStorage.setItem(
          STORAGE_KEYS.session.currentItinerary,
          JSON.stringify(result.data),
        );
        router.push("/itinerary");
      } else {
        setPhase({ kind: "failed", failure: result.failure });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, router]);

  // A11y: exactly ONE live region is active per phase, and its
  // accessible name matches the visible content.
  //   rolling → role=status on the visible "Rolling for tonight" copy.
  //   failed  → ComposeFailureBlock owns role=status on its own block.
  // The outer container is a plain <div> so we don't nest two
  // live regions inside one another (which AT handle inconsistently)
  // and so the announced text always matches what's on screen.
  return (
    <div className="fixed inset-0 z-50 bg-cream flex flex-col items-center justify-center px-6">
      {phase.kind === "failed" ? (
        <div className="w-full max-w-md">
          <ComposeFailureBlock failure={phase.failure} />
          <div className="mt-6 flex justify-center">
            <Button variant="secondary" onClick={onDismiss}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <>
          <DieIcon
            size={120}
            // Static / pulsing branch for reduced-motion users — no
            // tumble. Belt-and-suspenders: the CSS @media query also
            // freezes the tumble keyframes, so even a forgetful caller
            // still gets the right behavior.
            animated={!reduceMotion}
          />
          <p
            role="status"
            aria-live="polite"
            className="mt-8 font-serif text-xl text-charcoal"
          >
            Rolling for tonight
          </p>
        </>
      )}
    </div>
  );
}

// ─── DieIcon — six-sided die in pure SVG ──────────────────────────
//
// All six faces are rendered and positioned via 3D CSS transforms so
// the tumble keyframes show real geometry (no flat trick). Faces are
// kept simple: rounded-square outline + cream pips. Colors read from
// the design-system tokens via CSS vars so a future token migration
// (the cream value migrated #FAF8F5 → #FFFFFF on 2026-06-12) is one
// edit in globals.css, not one per component.

function DieIcon({ size, animated }: { size: number; animated: boolean }) {
  const half = size / 2;

  // Each face is a Face component positioned along one of six axes.
  // The transform values use half=N/2 so the cube edges meet cleanly.
  const faces = [
    { transform: `rotateY(0deg)   translateZ(${half}px)`, value: 1 },
    { transform: `rotateY(180deg) translateZ(${half}px)`, value: 6 },
    { transform: `rotateY(90deg)  translateZ(${half}px)`, value: 3 },
    { transform: `rotateY(-90deg) translateZ(${half}px)`, value: 4 },
    { transform: `rotateX(90deg)  translateZ(${half}px)`, value: 5 },
    { transform: `rotateX(-90deg) translateZ(${half}px)`, value: 2 },
  ];

  return (
    <div
      className="lucky-die-scene"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <div
        className={animated ? "lucky-die" : "lucky-die-pulse"}
        style={{ width: size, height: size, position: "relative" }}
      >
        {faces.map((f, i) => (
          <div
            key={i}
            className="lucky-die-face"
            style={{ transform: f.transform }}
          >
            <DieFace size={size} value={f.value} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DieFace({ size, value }: { size: number; value: number }) {
  const r = size * 0.07; // pip radius
  // Pip positions per value, in unit-square coords (0..1). 0.5 is
  // center; 0.25 / 0.75 are the four-corner offsets.
  const grid: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [
      [0.27, 0.27],
      [0.73, 0.73],
    ],
    3: [
      [0.27, 0.27],
      [0.5, 0.5],
      [0.73, 0.73],
    ],
    4: [
      [0.27, 0.27],
      [0.73, 0.27],
      [0.27, 0.73],
      [0.73, 0.73],
    ],
    5: [
      [0.27, 0.27],
      [0.73, 0.27],
      [0.5, 0.5],
      [0.27, 0.73],
      [0.73, 0.73],
    ],
    6: [
      [0.27, 0.25],
      [0.73, 0.25],
      [0.27, 0.5],
      [0.73, 0.5],
      [0.27, 0.75],
      [0.73, 0.75],
    ],
  };
  const pips = grid[value] ?? [];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "block" }}
    >
      <rect
        x={size * 0.04}
        y={size * 0.04}
        width={size * 0.92}
        height={size * 0.92}
        rx={size * 0.14}
        ry={size * 0.14}
        fill="var(--color-burgundy)"
      />
      {pips.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={size * cx}
          cy={size * cy}
          r={r}
          fill="var(--color-cream)"
        />
      ))}
    </svg>
  );
}

