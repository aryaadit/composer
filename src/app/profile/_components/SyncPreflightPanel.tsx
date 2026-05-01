"use client";

// Renders the source-sheet identity + DB counts after the operator clicks
// "Check source". Includes a link to open the sheet in a new tab so the
// operator can visually confirm they're pointing at the right thing.
//
// Two phases share this layout:
//   - `loading`: rendered immediately on click; placeholder skeletons
//                where data will go. Same structure, same row labels —
//                only the values are skeletons. No layout shift on
//                response.
//   - `ready`:   the populated panel.
//
// `SourceBlock` and `TargetBlock` accept nullable values; null = render
// skeleton in that field's slot. This keeps the loading vs ready code
// path inside a single layout — no parallel skeleton component to
// maintain.

import type { SheetMetadata } from "@/lib/venues/types";
import { SkeletonBar } from "./SkeletonBar";

export type SyncPreflightPanelProps =
  | { phase: "loading" }
  | {
      phase: "ready";
      metadata: SheetMetadata;
      dbActive: number;
      dbInactive: number;
    };

export function SyncPreflightPanel(props: SyncPreflightPanelProps) {
  const isLoading = props.phase === "loading";
  return (
    <div
      aria-busy={isLoading}
      className="border border-border rounded-md p-4 grid gap-6 sm:grid-cols-2 sm:gap-8"
    >
      <div className="min-w-0">
        <SourceBlock metadata={isLoading ? null : props.metadata} />
      </div>
      <div className="min-w-0">
        <TargetBlock
          active={isLoading ? null : props.dbActive}
          inactive={isLoading ? null : props.dbInactive}
        />
      </div>
    </div>
  );
}

// ─── Source ────────────────────────────────────────────────────────────

export function SourceBlock({ metadata }: { metadata: SheetMetadata | null }) {
  return (
    <div className="min-w-0">
      <h4 className="font-sans text-[10px] tracking-widest uppercase text-muted mb-2">
        Source
      </h4>
      <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-1 font-sans text-xs">
        <dt className="text-warm-gray">Sheet</dt>
        <dd className="text-charcoal font-mono break-words min-w-0">
          {metadata ? (
            <>&ldquo;{metadata.title}&rdquo;</>
          ) : (
            <SkeletonBar width="w-48" />
          )}
        </dd>
        <dt className="text-warm-gray">ID</dt>
        <dd className="text-charcoal font-mono min-w-0 break-all">
          {metadata ? (
            <>
              {truncateId(metadata.spreadsheetId)}{" "}
              <span className="text-muted">·</span>{" "}
              <a
                href={`https://docs.google.com/spreadsheets/d/${metadata.spreadsheetId}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-burgundy hover:text-burgundy-light underline-offset-2 hover:underline whitespace-nowrap"
              >
                open ↗
              </a>
            </>
          ) : (
            <SkeletonBar width="w-40" />
          )}
        </dd>
        {metadata && metadata.rowCount > 0 && (
          <>
            <dt className="text-warm-gray">Rows in tab</dt>
            <dd className="text-charcoal font-mono">
              {metadata.rowCount.toLocaleString()}
            </dd>
          </>
        )}
        <dt className="text-warm-gray">Modified</dt>
        <dd className="text-charcoal min-w-0 break-words">
          {metadata ? formatModified(metadata) : <SkeletonBar width="w-56" />}
        </dd>
      </dl>
    </div>
  );
}

// ─── Target ────────────────────────────────────────────────────────────

export function TargetBlock({
  active,
  inactive,
}: {
  active: number | null;
  inactive: number | null;
}) {
  return (
    <div className="min-w-0">
      <h4 className="font-sans text-[10px] tracking-widest uppercase text-muted mb-2">
        Target
      </h4>
      <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-1 font-sans text-xs">
        <dt className="text-warm-gray">Database</dt>
        {/* Database name is a constant we know up front — no skeleton needed. */}
        <dd className="text-charcoal font-mono break-all min-w-0">
          composer_venues_v2
        </dd>
        <dt className="text-warm-gray">Active</dt>
        <dd className="text-charcoal font-mono">
          {active != null ? (
            <>{active.toLocaleString()} venues</>
          ) : (
            <SkeletonBar width="w-20" />
          )}
        </dd>
        <dt className="text-warm-gray">Inactive</dt>
        <dd className="text-charcoal font-mono">
          {inactive != null ? (
            <>{inactive.toLocaleString()} venues</>
          ) : (
            <SkeletonBar width="w-16" />
          )}
        </dd>
      </dl>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

function truncateId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

function formatModified(metadata: SheetMetadata): string {
  if (!metadata.modifiedTime) {
    return "(unavailable — Drive API not enabled)";
  }
  const d = new Date(metadata.modifiedTime);
  if (!Number.isFinite(d.getTime())) return metadata.modifiedTime;
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate()
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  const age = relativeAge(metadata.modifiedTime);
  const by = metadata.modifiedBy;
  const tail = [age && `(${age})`, by && `by ${by}`].filter(Boolean).join(" ");
  return tail ? `${stamp} ${tail}` : stamp;
}

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
}
