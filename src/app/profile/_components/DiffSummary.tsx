"use client";

// Counts grid + per-bucket samples for the admin sync UI.
// Used in both preview and result panels so the operator sees the same
// representation before and after applying.
//
// Loading variant: same row labels, skeleton bars in place of count
// values. The label column matters (it teaches the operator what
// dimensions exist); the values are what the request resolves.

import { useState } from "react";
import type {
  FieldChange,
  ImportDiff,
  ModifiedVenue,
  SkippedRow,
  VenueRecord,
} from "@/lib/venues/types";
import { SkeletonBar } from "./SkeletonBar";
import { deactivationExplanation } from "./syncCopy";

export type DiffSummaryProps =
  | { phase: "loading" }
  | { phase: "ready"; diff: ImportDiff };

export function DiffSummary(props: DiffSummaryProps) {
  if (props.phase === "loading") {
    return (
      <div className="space-y-5" aria-busy>
        <div>
          <h4 className="font-sans text-[10px] tracking-widest uppercase text-muted mb-2">
            Changes
          </h4>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-sans text-xs">
            <CountRowSkeleton label="Add" />
            <CountRowSkeleton label="Modify" />
            <CountRowSkeleton label="Deactivate" hint={deactivationExplanation} />
            <CountRowSkeleton label="Unchanged" muted />
            <CountRowSkeleton label="Skipped" muted />
          </dl>
        </div>
      </div>
    );
  }

  const { diff } = props;
  const totalChanges =
    diff.add.length + diff.modify.length + diff.deactivate.length;

  return (
    <div className="space-y-5">
      <div>
        <h4 className="font-sans text-[10px] tracking-widest uppercase text-muted mb-2">
          Changes
        </h4>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-sans text-xs">
          <CountRow label="Add" value={diff.add.length} />
          <CountRow label="Modify" value={diff.modify.length} />
          <CountRow
            label="Deactivate"
            value={diff.deactivate.length}
            hint={deactivationExplanation}
          />
          <CountRow label="Unchanged" value={diff.unchanged} muted />
          <CountRow
            label="Skipped"
            value={diff.skipped.length}
            muted={diff.skipped.length === 0}
          />
        </dl>
        {totalChanges === 0 && (
          <p className="font-sans text-xs text-warm-gray mt-3">
            Sheet and database are already in sync. Nothing to apply.
          </p>
        )}
      </div>

      {diff.modify.length > 0 && (
        <SampleSection
          title={`Sample modifications (showing first ${Math.min(5, diff.modify.length)} of ${diff.modify.length})`}
        >
          {diff.modify.slice(0, 5).map((m) => (
            <ModifiedRow key={m.venue_id} mod={m} />
          ))}
        </SampleSection>
      )}

      {diff.deactivate.length > 0 && (
        <SampleSection
          title={`Sample deactivations (showing first ${Math.min(5, diff.deactivate.length)} of ${diff.deactivate.length})`}
        >
          {diff.deactivate.slice(0, 5).map((d) => (
            <li key={d.venue_id} className="font-mono text-xs text-warm-gray">
              <span className="text-charcoal">{d.venue_id}</span>
              {" — "}
              <span>&ldquo;{d.name}&rdquo;</span>
              <span className="text-muted"> (no longer in sheet)</span>
            </li>
          ))}
        </SampleSection>
      )}

      {diff.add.length > 0 && (
        <SampleSection
          title={`New venues (showing first ${Math.min(5, diff.add.length)} of ${diff.add.length})`}
        >
          {diff.add.slice(0, 5).map((v) => (
            <NewVenueRow key={v.venue_id as string} venue={v} />
          ))}
        </SampleSection>
      )}

      {diff.skipped.length > 0 && (
        <SkippedRowsBlock skipped={diff.skipped} />
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function CountRow({
  label,
  value,
  hint,
  muted,
}: {
  label: string;
  value: number;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <>
      <dt className={`text-${muted ? "muted" : "warm-gray"}`}>
        {label}
        {hint && <InfoTooltip text={hint} />}
      </dt>
      <dd className={`text-right font-mono ${muted ? "text-muted" : "text-charcoal"}`}>
        {value.toLocaleString()}
      </dd>
    </>
  );
}

function CountRowSkeleton({
  label,
  hint,
  muted,
}: {
  label: string;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <>
      <dt className={`text-${muted ? "muted" : "warm-gray"}`}>
        {label}
        {hint && <InfoTooltip text={hint} />}
      </dt>
      <dd className="text-right">
        <SkeletonBar width="w-12" />
      </dd>
    </>
  );
}

function SampleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="font-sans text-[10px] tracking-widest uppercase text-muted mb-2">
        {title}
      </h4>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function ModifiedRow({ mod }: { mod: ModifiedVenue }) {
  const top = mod.changedFields.slice(0, 2);
  const overflow = mod.changedFields.length - top.length;
  return (
    <li className="font-mono text-xs text-warm-gray">
      <span className="text-charcoal">{mod.venue_id}</span>
      <span className="text-muted"> — </span>
      {top.map((c, i) => (
        <span key={c.field}>
          {i > 0 && <span className="text-muted">; </span>}
          {formatChange(c)}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-muted">
          {" "}
          (+{overflow} more field{overflow === 1 ? "" : "s"})
        </span>
      )}
    </li>
  );
}

function formatChange(c: FieldChange): React.ReactNode {
  const valueStr = (v: unknown): string => {
    if (v == null) return "null";
    if (Array.isArray(v)) return `[${v.map((x) => valueStr(x)).join(", ")}]`;
    if (typeof v === "string") return `"${v}"`;
    return String(v);
  };
  if (c.added || c.removed) {
    const parts: string[] = [];
    if (c.added && c.added.length > 0) parts.push(`+${valueStr(c.added)}`);
    if (c.removed && c.removed.length > 0) parts.push(`-${valueStr(c.removed)}`);
    return (
      <>
        <span className="text-charcoal">{c.field}</span> {parts.join(" ")}
      </>
    );
  }
  return (
    <>
      <span className="text-charcoal">{c.field}</span> {valueStr(c.before)} →{" "}
      {valueStr(c.after)}
    </>
  );
}

function NewVenueRow({ venue }: { venue: VenueRecord }) {
  const vid = venue.venue_id as string;
  const name = (venue.name as string) ?? "(unnamed)";
  const hood = (venue.neighborhood as string) ?? "(no neighborhood)";
  return (
    <li className="font-mono text-xs text-warm-gray">
      <span className="text-charcoal">{vid}</span> — &ldquo;
      <span className="text-charcoal">{name}</span>
      &rdquo; <span className="text-muted">({hood})</span>
    </li>
  );
}

function SkippedRowsBlock({ skipped }: { skipped: SkippedRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? skipped : skipped.slice(0, 5);
  return (
    <div>
      <h4 className="font-sans text-[10px] tracking-widest uppercase text-burgundy mb-2">
        Skipped sheet rows ({skipped.length})
      </h4>
      <ul className="space-y-1">
        {visible.map((s) => (
          <li
            key={`${s.row}-${s.venue_id ?? ""}`}
            className="font-mono text-xs text-warm-gray"
          >
            <span className="text-charcoal">row {s.row}</span>
            {s.venue_id && <span> {s.venue_id}</span>}
            {s.name && <span> &ldquo;{s.name}&rdquo;</span>}
            <span className="text-muted">: {s.reason}</span>
          </li>
        ))}
      </ul>
      {!expanded && skipped.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 font-sans text-xs text-muted hover:text-charcoal transition-colors"
        >
          Show all {skipped.length}
        </button>
      )}
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span
      role="img"
      aria-label="info"
      title={text}
      className="ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-muted text-[9px] text-muted cursor-help align-text-bottom"
    >
      i
    </span>
  );
}
