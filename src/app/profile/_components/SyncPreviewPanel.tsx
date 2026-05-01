"use client";

// Renders the full preview state: source identity, sanity assertions,
// diff. The action button at the bottom transitions to apply (or to the
// override flow when assertions blocked).
//
// Loading variant: same panel structure. Source/Target are populated
// from the preflight data (already known by the time the operator
// clicks Run preview), so they render real values immediately. Sanity
// Assertions and Changes show skeletons. The button shows "Loading…"
// in the disabled state. No header line above the panel — the skeleton
// structure communicates the state without redundant text.

import type {
  AdminPreflightResponse,
  AdminPreviewResponse,
} from "@/lib/venues/types";
import { AssertionsTable } from "./AssertionsTable";
import { DiffSummary } from "./DiffSummary";
import { SourceBlock, TargetBlock } from "./SyncPreflightPanel";
import { buttonLabels } from "./syncCopy";

export type SyncPreviewPanelProps =
  | {
      phase: "loading";
      preflight: AdminPreflightResponse;
    }
  | {
      phase: "ready";
      data: AdminPreviewResponse;
      isApplying: boolean;
      onApply: () => void;
      onOverride: () => void;
    };

export function SyncPreviewPanel(props: SyncPreviewPanelProps) {
  if (props.phase === "loading") {
    return <PreviewLoading preflight={props.preflight} />;
  }
  return <PreviewReady {...props} />;
}

// ─── Loading variant ───────────────────────────────────────────────────

function PreviewLoading({ preflight }: { preflight: AdminPreflightResponse }) {
  return (
    <div
      aria-busy
      className="border border-border rounded-md p-4 space-y-5"
    >
      {/* Source/Target are known from preflight — render real values, not
          skeletons. Re-skeletoning here would be a layout shift back to
          unknown state, which is misleading. */}
      <div className="grid gap-6 sm:grid-cols-2 sm:gap-8">
        <div className="min-w-0">
          <SourceBlock metadata={preflight.metadata} />
        </div>
        <div className="min-w-0">
          <TargetBlock
            active={preflight.db_active_count}
            inactive={preflight.db_inactive_count}
          />
        </div>
      </div>

      <div>
        <AssertionsTable phase="loading" />
      </div>

      <div className="pt-1 border-t border-border">
        <DiffSummary phase="loading" />
      </div>

      <div className="flex items-center gap-3 pt-1 flex-wrap">
        <button
          type="button"
          disabled
          className="font-sans text-sm font-medium text-cream bg-muted cursor-not-allowed transition-colors px-4 py-1.5 rounded-md whitespace-nowrap"
        >
          Loading…
        </button>
        <span className="font-sans text-xs text-muted">
          Computing diff and running assertions.
        </span>
      </div>
    </div>
  );
}

// ─── Ready variant ─────────────────────────────────────────────────────

interface PreviewReadyProps {
  phase: "ready";
  data: AdminPreviewResponse;
  isApplying: boolean;
  onApply: () => void;
  onOverride: () => void;
}

function PreviewReady({
  data,
  isApplying,
  onApply,
  onOverride,
}: PreviewReadyProps) {
  const totalChanges =
    data.diff.add.length + data.diff.modify.length + data.diff.deactivate.length;
  const blocked = data.assertions.blocked;

  return (
    <div className="border border-border rounded-md p-4 space-y-5">
      <div className="grid gap-6 sm:grid-cols-2 sm:gap-8">
        <div className="min-w-0">
          <SourceBlock metadata={data.metadata} />
        </div>
        <div className="min-w-0">
          <TargetBlock
            active={data.db_active_count}
            inactive={data.db_inactive_count}
          />
        </div>
      </div>

      <div>
        <AssertionsTable phase="ready" results={data.assertions.results} />
      </div>

      {/* Hide the Changes section entirely when assertions blocked. The
          diff in that state is empty for the wrong reason — sheet
          couldn't be read — so showing zero counts implies "in sync"
          when reality is "we don't know". Item 7 from the UI fixes pass. */}
      {!blocked && (
        <div className="pt-1 border-t border-border">
          <DiffSummary phase="ready" diff={data.diff} />
        </div>
      )}

      <div className="flex items-center gap-3 pt-1 flex-wrap">
        {blocked ? (
          <button
            type="button"
            onClick={onOverride}
            disabled={isApplying}
            className="font-sans text-sm font-medium text-cream bg-burgundy hover:bg-burgundy-light disabled:bg-muted disabled:cursor-not-allowed transition-colors px-4 py-1.5 rounded-md whitespace-nowrap"
          >
            {buttonLabels.overrideAssertions}
          </button>
        ) : (
          <button
            type="button"
            onClick={onApply}
            disabled={isApplying || totalChanges === 0}
            className="font-sans text-sm font-medium text-cream bg-burgundy hover:bg-burgundy-light disabled:bg-muted disabled:cursor-not-allowed transition-colors px-4 py-1.5 rounded-md whitespace-nowrap"
          >
            {isApplying
              ? "Applying…"
              : totalChanges === 0
              ? buttonLabels.applyNoChanges
              : buttonLabels.applyChanges(totalChanges)}
          </button>
        )}
        <span className="font-sans text-xs text-muted">
          {blocked
            ? "Assertions blocked — review failures above before overriding."
            : totalChanges === 0
            ? "Nothing to apply right now."
            : "Atomic transaction — either everything lands or nothing does."}
        </span>
      </div>
    </div>
  );
}
