"use client";

// Admin venue lookup — search by name, see all fields, force-resync a
// single venue from the source sheet. The single-venue resync routes
// through `POST /api/admin/sync-venues { action: 'sync_single' }` which
// uses the canonical importer module (no assertions, no threshold
// guards — those exist for full-sheet operations). Single-venue runs
// still record to the audit trail with `trigger_source = 'route:sync_single'`.

import { useState } from "react";
import type { Venue } from "@/types";
import type { AdminSyncResponse } from "@/lib/venues/types";
import { getVenueHeroImageUrl } from "@/lib/venues/images";

interface LookupResult {
  query: string;
  count: number;
  venues: Venue[];
}

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "data"; result: LookupResult }
  | { status: "error"; message: string };

export function VenueLookup() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<LookupState>({ status: "idle" });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setState({ status: "loading" });
    try {
      const res = await fetch(
        `/api/admin/venue?name=${encodeURIComponent(q)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Lookup failed");
      const result = (await res.json()) as LookupResult;
      setState({ status: "data", result });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Request failed",
      });
    }
  };

  return (
    <div className="mt-5 w-full">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSearch();
          }}
          placeholder="Search venues by name…"
          className="flex-1 px-3 py-1.5 font-mono text-xs bg-transparent border border-border rounded-md focus:border-charcoal focus:outline-none text-charcoal placeholder:text-muted"
        />
        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={state.status === "loading" || !query.trim()}
          className="font-sans text-xs text-muted hover:text-charcoal transition-colors disabled:cursor-wait"
        >
          {state.status === "loading" ? "…" : "Lookup →"}
        </button>
      </div>

      {state.status === "data" && (
        <div className="mt-3 space-y-4">
          {state.result.count === 0 && (
            <p className="font-mono text-xs text-muted">
              No venues matching &quot;{state.result.query}&quot;
            </p>
          )}
          {state.result.venues.map((v) => (
            <VenueCard
              key={v.id}
              venue={v}
              expanded={expandedId === v.id}
              onToggle={() =>
                setExpandedId(expandedId === v.id ? null : v.id)
              }
            />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <p className="mt-3 font-mono text-xs text-muted">
          {state.message}
        </p>
      )}
    </div>
  );
}

function VenueCard({
  venue,
  expanded,
  onToggle,
}: {
  venue: Venue;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [syncState, setSyncState] = useState<SyncState>({ status: "idle" });

  const handleSync = async () => {
    setSyncState({ status: "syncing" });
    try {
      const res = await fetch("/api/admin/sync-venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync_single",
          venue_id: venue.venue_id,
        }),
      });
      const json = (await res.json()) as AdminSyncResponse;

      if (json.ok && json.kind === "sync_single_success") {
        setSyncState({
          status: "success",
          action: json.action,
          runId: json.run_id,
        });
      } else if (!json.ok && json.kind === "sync_single_not_found") {
        setSyncState({
          status: "not_found",
          message: json.error ?? "venue not in sheet",
        });
      } else if (!json.ok && json.kind === "sync_single_failed") {
        setSyncState({ status: "error", message: json.error });
      } else if (!json.ok && json.kind === "auth_failed") {
        setSyncState({
          status: "error",
          message:
            json.reason === "not_admin"
              ? "not authorized"
              : "session expired — sign in again",
        });
      } else {
        setSyncState({
          status: "error",
          message: "error" in json ? (json.error as string) : "sync failed",
        });
      }
    } catch (err) {
      setSyncState({
        status: "error",
        message: err instanceof Error ? err.message : "request failed",
      });
    }
  };
  const heroUrl = getVenueHeroImageUrl(venue.image_keys ?? []);

  const SKIP_KEYS = new Set([
    "id", "venue_id", "name", "google_place_id", "latitude", "longitude",
    "created_at", "updated_at", "image_keys",
  ]);

  const fields: [string, string][] = [];
  for (const [key, val] of Object.entries(venue)) {
    if (SKIP_KEYS.has(key)) continue;
    if (val == null) continue;
    if (typeof val === "string" && val.trim() === "") continue;
    if (Array.isArray(val) && val.length === 0) continue;

    const label = key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    let display: string;
    if (typeof val === "boolean") {
      display = val ? "yes" : "no";
    } else if (Array.isArray(val)) {
      display = val.join(", ");
    } else if (typeof val === "number") {
      display = String(val);
    } else {
      display = String(val);
    }

    fields.push([label, display]);
  }

  return (
    <div className="border border-border rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {heroUrl && (
            <img
              src={heroUrl}
              alt={venue.name}
              className="w-10 h-10 rounded object-cover flex-shrink-0"
            />
          )}
          <div className="font-sans text-sm font-medium text-charcoal">
            {venue.name}
          </div>
        </div>
        <SyncButton state={syncState} onClick={() => void handleSync()} />
      </div>
      <SyncStatusLine state={syncState} />
      <div className="font-mono text-xs text-muted space-y-0.5">
        {fields.map(([label, value]) => (
          <div key={label}>
            <span className="text-warm-gray">{label}:</span>{" "}
            <span className="text-charcoal">{value}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="mt-2 font-mono text-xs text-muted hover:text-charcoal transition-colors"
      >
        {expanded ? "Hide JSON ▲" : "Raw JSON ▼"}
      </button>
      {expanded && (
        <pre className="mt-2 font-mono text-xs text-muted whitespace-pre-wrap max-w-full overflow-x-auto border-t border-border pt-2">
          {JSON.stringify(venue, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── Single-venue sync state + UI ──────────────────────────────────────

type SyncState =
  | { status: "idle" }
  | { status: "syncing" }
  | { status: "success"; action: "inserted" | "updated"; runId: string | null }
  | { status: "not_found"; message: string }
  | { status: "error"; message: string };

function SyncButton({
  state,
  onClick,
}: {
  state: SyncState;
  onClick: () => void;
}) {
  const label =
    state.status === "syncing"
      ? "syncing…"
      : state.status === "success"
      ? `${state.action} ✓`
      : state.status === "not_found"
      ? "not in sheet ✗"
      : state.status === "error"
      ? "failed ✗"
      : "sync from sheet →";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state.status === "syncing"}
      className="font-mono text-xs text-muted hover:text-charcoal transition-colors disabled:cursor-wait"
    >
      {label}
    </button>
  );
}

function SyncStatusLine({ state }: { state: SyncState }) {
  if (state.status === "idle" || state.status === "syncing") return null;

  if (state.status === "success") {
    return (
      <p className="font-mono text-xs text-emerald-600 mt-1">
        {state.action === "inserted"
          ? "Inserted into DB."
          : "Overwrote DB row from sheet."}{" "}
        {state.runId && (
          <span className="text-muted">
            Run {shortId(state.runId)} (CLI:{" "}
            <code>npm run import-venues -- show {shortId(state.runId)}</code>)
          </span>
        )}
      </p>
    );
  }
  if (state.status === "not_found") {
    return (
      <p className="font-mono text-xs text-burgundy mt-1">
        {state.message} — add it to the source sheet first, then resync.
      </p>
    );
  }
  return (
    <p className="font-mono text-xs text-burgundy mt-1">{state.message}</p>
  );
}

function shortId(uuid: string): string {
  const cleaned = uuid.replace(/-/g, "").toLowerCase();
  if (cleaned.length < 8) return uuid;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(-4)}`;
}
