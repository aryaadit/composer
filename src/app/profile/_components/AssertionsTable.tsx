"use client";

// Renders the sanity assertion report from the admin sync route.
// Failed assertions expand inline with what-it-means / what-to-do
// guidance from syncCopy.ts. Reusable across preview and result panels.

import type { AssertionResult } from "@/lib/venues/types";
import { assertionExplanations } from "./syncCopy";

interface AssertionsTableProps {
  results: AssertionResult[];
}

export function AssertionsTable({ results }: AssertionsTableProps) {
  if (results.length === 0) return null;

  return (
    <ul className="space-y-2">
      {results.map((a) => (
        <AssertionRow key={a.name} assertion={a} />
      ))}
    </ul>
  );
}

function AssertionRow({ assertion }: { assertion: AssertionResult }) {
  const explanation = assertionExplanations[assertion.name];
  const isBlocking = !assertion.passed && assertion.severity === "block";

  return (
    <li className="font-sans text-xs">
      <div className="flex items-start gap-2">
        <StatusIcon passed={assertion.passed} blocking={isBlocking} />
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
          {!assertion.passed && explanation && (
            <div className="mt-2 pl-3 border-l-2 border-border space-y-1.5">
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
