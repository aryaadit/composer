"use client";

// Renders the full preview state: source identity, sanity assertions,
// diff. The action button at the bottom transitions to apply (or to the
// override flow when assertions blocked).

import type { AdminPreviewResponse } from "@/lib/venues/types";
import { AssertionsTable } from "./AssertionsTable";
import { DiffSummary } from "./DiffSummary";
import { SourceBlock, TargetBlock } from "./SyncPreflightPanel";
import { buttonLabels } from "./syncCopy";

interface SyncPreviewPanelProps {
  data: AdminPreviewResponse;
  isApplying: boolean;
  onApply: () => void;
  onOverride: () => void;
}

export function SyncPreviewPanel({
  data,
  isApplying,
  onApply,
  onOverride,
}: SyncPreviewPanelProps) {
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
        <AssertionsTable results={data.assertions.results} />
      </div>

      {/* Hide the Changes section entirely when assertions blocked. The
          diff in that state is empty for the wrong reason — sheet
          couldn't be read — so showing zero counts implies "in sync"
          when reality is "we don't know". Item 7 from the UI fixes pass. */}
      {!blocked && (
        <div className="pt-1 border-t border-border">
          <DiffSummary diff={data.diff} />
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
