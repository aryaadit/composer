"use client";

// Renders the sanity assertion report from the admin sync route.
// Always renders every assertion row — passing rows render compactly
// (icon + name only), failing rows expand inline with what-it-means /
// what-to-do guidance from syncCopy.ts. Hiding passing rows in a
// blocked state implies they didn't run, which is wrong.
//
// The header shows the failure count when blocked so the operator gets
// section-level "something is wrong" signal at a glance, not just the
// row-level ✗.
//
// Loading variant: same row count, same names (the assertion names are
// known up front so we can render them without waiting on the response),
// spinner in place of ✓/✗, skeleton bar where the detail string will go.
// Skeleton structure communicates loading without needing an explanatory
// text line above the section.

import type { AssertionResult } from "@/lib/venues/types";
import { SkeletonBar } from "./SkeletonBar";
import { assertionExplanations } from "./syncCopy";

// Stable list of assertion names used by the loading variant. Mirrors
// the order in src/lib/venues/assertions.ts so the loading and ready
// states render identically when results arrive.
const ASSERTION_NAMES_FOR_LOADING = [
  "Tab exists",
  "Headers present",
  "Row count band",
  "Lat/lng coverage",
  "Canonical neighborhoods",
  "Sheet staleness",
] as const;

export type AssertionsTableProps =
  | { phase: "loading" }
  | { phase: "ready"; results: AssertionResult[] };

export function AssertionsTable(props: AssertionsTableProps) {
  if (props.phase === "loading") {
    return (
      <div aria-busy>
        <h4 className="font-sans text-[10px] tracking-widest uppercase text-muted mb-2 flex items-center gap-2">
          <span>Sanity Assertions</span>
          <Spinner />
        </h4>
        <ul className="space-y-2">
          {ASSERTION_NAMES_FOR_LOADING.map((name) => (
            <li key={name} className="font-sans text-xs flex items-start gap-2">
              <PendingDot />
              <span className="text-warm-gray min-w-[10rem]">{name}</span>
              <SkeletonBar width="w-48" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const { results } = props;
  if (results.length === 0) return null;

  const total = results.length;
  const blockedFailures = results.filter(
    (a) => !a.passed && a.severity === "block"
  ).length;
  const allPassed = blockedFailures === 0;

  return (
    <div>
      <h4 className="font-sans text-[10px] tracking-widest uppercase text-muted mb-2">
        Sanity Assertions{" "}
        {allPassed ? (
          <span className="text-emerald-600">(all passed)</span>
        ) : (
          <span className="text-burgundy">
            ({blockedFailures} of {total} blocked)
          </span>
        )}
      </h4>
      <ul className="space-y-2">
        {results.map((a) => (
          <AssertionRow key={a.name} assertion={a} />
        ))}
      </ul>
    </div>
  );
}

function AssertionRow({ assertion }: { assertion: AssertionResult }) {
  const explanation = assertionExplanations[assertion.name];
  const isBlocking = !assertion.passed && assertion.severity === "block";

  // Compact rendering for passing assertions — icon + name only, muted
  // line height. The point is "all six checks ran"; the detail isn't
  // load-bearing when the answer is ✓.
  if (assertion.passed) {
    return (
      <li className="font-sans text-xs flex items-start gap-2">
        <StatusIcon passed blocking={false} />
        <span className="text-warm-gray">{assertion.name}</span>
      </li>
    );
  }

  return (
    <li className="font-sans text-xs">
      <div className="flex items-start gap-2">
        <StatusIcon passed={false} blocking={isBlocking} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-charcoal">{assertion.name}</span>
            {isBlocking && (
              <span className="font-mono text-[10px] uppercase tracking-wide text-burgundy">
                blocked
              </span>
            )}
          </div>
          <div className="text-warm-gray mt-0.5">{assertion.detail}</div>
          {explanation && (
            <div className="mt-2 pl-3 border-l-2 border-burgundy/30 space-y-1.5">
              <div>
                <span className="text-charcoal font-medium">What this means: </span>
                <span className="text-warm-gray">{explanation.whatItMeans}</span>
              </div>
              <div>
                <span className="text-charcoal font-medium">What to do: </span>
                <span className="text-warm-gray">{explanation.whatToDo}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

// ─── Icons ─────────────────────────────────────────────────────────────

function StatusIcon({ passed, blocking }: { passed: boolean; blocking: boolean }) {
  if (passed) {
    return (
      <span
        aria-label="passed"
        className="flex-shrink-0 mt-0.5 text-emerald-600"
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m5 12 5 5L20 6" />
        </svg>
      </span>
    );
  }
  return (
    <span
      aria-label={blocking ? "blocked" : "failed"}
      className="flex-shrink-0 mt-0.5 text-burgundy"
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </span>
  );
}

/** Pulsing dot rendered in place of ✓/✗ while the assertion is pending. */
function PendingDot() {
  return (
    <span
      aria-hidden
      className="flex-shrink-0 mt-1.5 inline-block w-2 h-2 rounded-full bg-border animate-pulse"
    />
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-3 w-3 text-muted"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeOpacity="0.2"
      />
      <path
        d="M21 12a9 9 0 0 1-9 9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
