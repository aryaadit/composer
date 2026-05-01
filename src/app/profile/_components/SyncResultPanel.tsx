"use client";

// Renders the apply outcome — success, assertion-blocked, threshold-
// blocked, or failed. The assertion-blocked path links back to the
// override dialog (caller controls the open state). The threshold path
// re-applies with confirm_large_change set.

import type {
  AdminApplyAssertionBlockedResponse,
  AdminApplyFailedResponse,
  AdminApplySuccessResponse,
  AdminApplyThresholdBlockedResponse,
  LargeChangeReason,
} from "@/lib/venues/types";
import { AssertionsTable } from "./AssertionsTable";
import { DiffSummary } from "./DiffSummary";
import {
  buttonLabels,
  errorHints,
  stateExplanations,
} from "./syncCopy";

// ─── Success ───────────────────────────────────────────────────────────

export function SyncSuccessPanel({
  data,
}: {
  data: AdminApplySuccessResponse;
}) {
  const { apply_result: r, diff, run_id } = data;
  const seconds = (r.durationMs / 1000).toFixed(1);
  return (
    <div className="border border-border rounded-md p-4 space-y-4">
      <div>
        <h3 className="font-sans text-sm font-medium text-emerald-700 mb-1">
          ✓ Sync complete
        </h3>
        <p className="font-mono text-xs text-warm-gray">
          Inserted {r.inserted.toLocaleString()}, updated{" "}
          {r.updated.toLocaleString()}, deactivated{" "}
          {r.deactivated.toLocaleString()} in {seconds}s
        </p>
        <RunIdLine runId={run_id} />
      </div>
      <p className="font-sans text-xs text-warm-gray leading-relaxed">
        {stateExplanations.applySuccess}
      </p>
      <div className="pt-2 border-t border-border">
        <DiffSummary diff={diff} />
      </div>
    </div>
  );
}

// ─── Assertion blocked ─────────────────────────────────────────────────

interface AssertionBlockedProps {
  data: AdminApplyAssertionBlockedResponse;
  onOverride: () => void;
  isApplying: boolean;
}

export function SyncAssertionBlockedPanel({
  data,
  onOverride,
  isApplying,
}: AssertionBlockedProps) {
  return (
    <div className="border border-burgundy/30 bg-burgundy-tint rounded-md p-4 space-y-4">
      <div>
        <h3 className="font-sans text-sm font-medium text-burgundy mb-1">
          ✗ Sync blocked: sanity check failed
        </h3>
        <RunIdLine runId={data.run_id} />
      </div>
      <p className="font-sans text-xs text-warm-gray leading-relaxed">
        {stateExplanations.applyAssertionBlocked}
      </p>
      <div className="pt-1 border-t border-border">
        <AssertionsTable results={data.assertions.results} />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOverride}
          disabled={isApplying}
          className="font-sans text-sm font-medium text-cream bg-burgundy hover:bg-burgundy-light disabled:bg-muted disabled:cursor-not-allowed transition-colors px-4 py-1.5 rounded-md"
        >
          {buttonLabels.overrideAssertions}
        </button>
      </div>
    </div>
  );
}

// ─── Threshold blocked ─────────────────────────────────────────────────

interface ThresholdBlockedProps {
  data: AdminApplyThresholdBlockedResponse;
  onConfirm: () => void;
  isApplying: boolean;
}

export function SyncThresholdBlockedPanel({
  data,
  onConfirm,
  isApplying,
}: ThresholdBlockedProps) {
  return (
    <div className="border border-burgundy/30 bg-burgundy-tint rounded-md p-4 space-y-4">
      <div>
        <h3 className="font-sans text-sm font-medium text-burgundy mb-1">
          ⏸ Sync paused: large change detected
        </h3>
        <RunIdLine runId={data.run_id} />
      </div>
      <p className="font-sans text-xs text-warm-gray leading-relaxed">
        {stateExplanations.applyThresholdBlocked}
      </p>
      <div>
        <h4 className="font-sans text-[10px] tracking-widest uppercase text-muted mb-2">
          Reasons
        </h4>
        <ul className="space-y-1 font-mono text-xs text-warm-gray">
          {data.reasons.map((r) => (
            <li key={r.kind}>• {formatReason(r)}</li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={onConfirm}
        disabled={isApplying}
        className="font-sans text-sm font-medium text-cream bg-burgundy hover:bg-burgundy-light disabled:bg-muted disabled:cursor-not-allowed transition-colors px-4 py-1.5 rounded-md"
      >
        {isApplying ? "Applying…" : buttonLabels.confirmLargeChange}
      </button>
    </div>
  );
}

function formatReason(r: LargeChangeReason): string {
  if (r.kind === "deactivations") {
    return `Deactivations: ${r.count.toLocaleString()} (max ${r.threshold.toLocaleString()} = guard for ${r.dbActiveCount.toLocaleString()} active rows)`;
  }
  return `Total changes: ${r.count.toLocaleString()} (max ${r.threshold.toLocaleString()} = guard for ${r.dbActiveCount.toLocaleString()} active rows)`;
}

// ─── Failed ────────────────────────────────────────────────────────────

export function SyncFailedPanel({
  data,
}: {
  data: AdminApplyFailedResponse;
}) {
  const hint = errorHints(data.error);
  return (
    <div className="border border-burgundy/30 bg-burgundy-tint rounded-md p-4 space-y-3">
      <div>
        <h3 className="font-sans text-sm font-medium text-burgundy mb-1">
          ✗ Sync failed
        </h3>
        <RunIdLine runId={data.run_id ?? null} />
      </div>
      <p className="font-sans text-xs text-warm-gray leading-relaxed">
        {stateExplanations.applyFailed}
      </p>
      <div>
        <div className="font-sans text-[10px] tracking-widest uppercase text-muted mb-1">
          Error
        </div>
        <pre className="font-mono text-xs text-charcoal whitespace-pre-wrap bg-cream p-2 border border-border rounded">
          {data.error}
        </pre>
      </div>
      {hint && (
        <p className="font-sans text-xs text-warm-gray">
          <span className="text-charcoal font-medium">Hint: </span>
          {hint}
        </p>
      )}
    </div>
  );
}

// ─── Shared ────────────────────────────────────────────────────────────

function RunIdLine({ runId }: { runId: string | null }) {
  if (!runId) {
    return (
      <p className="font-mono text-[11px] text-muted mt-1">
        Run ID: <span className="text-burgundy">(audit write failed)</span>
      </p>
    );
  }
  const short = shortId(runId);
  return (
    <p className="font-mono text-[11px] text-muted mt-1">
      Run ID: <span className="text-charcoal">{short}</span>{" "}
      <span className="text-muted">({runId})</span>
      <span className="block text-muted">
        CLI: <code>npm run import-venues -- show {short}</code>
      </span>
    </p>
  );
}

function shortId(uuid: string): string {
  const cleaned = uuid.replace(/-/g, "").toLowerCase();
  if (cleaned.length < 8) return uuid;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(-4)}`;
}
