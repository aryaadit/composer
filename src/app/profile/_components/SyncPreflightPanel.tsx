"use client";

// Renders the source-sheet identity + DB counts after the operator clicks
// "Check source". Includes a link to open the sheet in a new tab so the
// operator can visually confirm they're pointing at the right thing.

import type { SheetMetadata } from "@/lib/venues/types";

interface SyncPreflightPanelProps {
  metadata: SheetMetadata;
  dbActive: number;
  dbInactive: number;
}

export function SyncPreflightPanel({
  metadata,
  dbActive,
  dbInactive,
}: SyncPreflightPanelProps) {
  return (
    <div className="border border-border rounded-md p-4 space-y-4">
      <SourceBlock metadata={metadata} />
      <TargetBlock active={dbActive} inactive={dbInactive} />
    </div>
  );
}

export function SourceBlock({ metadata }: { metadata: SheetMetadata }) {
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${metadata.spreadsheetId}/edit`;
  const truncatedId =
    metadata.spreadsheetId.length > 16
      ? `${metadata.spreadsheetId.slice(0, 8)}…${metadata.spreadsheetId.slice(-6)}`
      : metadata.spreadsheetId;

  return (
    <div>
      <h4 className="font-sans text-[10px] tracking-widest uppercase text-muted mb-2">
        Source
      </h4>
      <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 font-sans text-xs">
        <dt className="text-warm-gray">Sheet</dt>
        <dd className="text-charcoal font-mono">
          &ldquo;{metadata.title}&rdquo;
        </dd>
        <dt className="text-warm-gray">ID</dt>
        <dd className="text-charcoal font-mono">
          {truncatedId}{" "}
          <a
            href={sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-burgundy hover:text-burgundy-light underline-offset-2 hover:underline"
          >
            open in new tab ↗
          </a>
        </dd>
        {metadata.rowCount > 0 && (
          <>
            <dt className="text-warm-gray">Rows in tab</dt>
            <dd className="text-charcoal font-mono">
              {metadata.rowCount.toLocaleString()}
            </dd>
          </>
        )}
        <dt className="text-warm-gray">Modified</dt>
        <dd className="text-charcoal">{formatModified(metadata)}</dd>
      </dl>
    </div>
  );
}

export function TargetBlock({
  active,
  inactive,
}: {
  active: number;
  inactive: number;
}) {
  return (
    <div>
      <h4 className="font-sans text-[10px] tracking-widest uppercase text-muted mb-2">
        Target
      </h4>
      <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 font-sans text-xs">
        <dt className="text-warm-gray">Database</dt>
        <dd className="text-charcoal font-mono">composer_venues_v2</dd>
        <dt className="text-warm-gray">Active</dt>
        <dd className="text-charcoal font-mono">
          {active.toLocaleString()} venues
        </dd>
        <dt className="text-warm-gray">Inactive</dt>
        <dd className="text-charcoal font-mono">
          {inactive.toLocaleString()} venues
        </dd>
      </dl>
    </div>
  );
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
