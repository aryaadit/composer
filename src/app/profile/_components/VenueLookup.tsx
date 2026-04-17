"use client";

// Admin venue lookup — search by name, see all fields. Used to
// verify that the import pipeline is producing correct data without
// needing to open the Supabase dashboard.

import { useState } from "react";
import type { Venue } from "@/types";

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
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "done" | "error">("idle");

  const handleSync = async () => {
    setSyncState("syncing");
    try {
      const res = await fetch("/api/admin/sync-venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue_id: venue.venue_id }),
      });
      if (!res.ok) throw new Error("sync failed");
      setSyncState("done");
      setTimeout(() => setSyncState("idle"), 3000);
    } catch {
      setSyncState("error");
      setTimeout(() => setSyncState("idle"), 3000);
    }
  };
  const fields: [string, string][] = [
    ["Neighborhood", venue.neighborhood],
    ["Category", venue.category],
    ["Price Tier", String(venue.price_tier)],
    ["Vibe Tags", venue.vibe_tags?.join(", ") || "—"],
    ["Occasion Tags", venue.occasion_tags?.join(", ") || "—"],
    ["Stop Roles", venue.stop_roles?.join(", ") || "—"],
    ["Duration", venue.duration_hours ? `${venue.duration_hours}h` : "—"],
    ["Hours", venue.hours || "—"],
    ["Outdoor", venue.outdoor_seating || "—"],
    ["Active", venue.active ? "yes" : "no"],
    ["Quality", String(venue.quality_score)],
    ["Boost", String(venue.curation_boost)],
    ["Awards", venue.awards || "—"],
    ["Signature", venue.signature_order || "—"],
    ["Last Verified", venue.last_verified || "—"],
  ];

  return (
    <div className="border border-border rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-sans text-sm font-medium text-charcoal">
          {venue.name}
        </div>
        <button
          type="button"
          onClick={() => void handleSync()}
          disabled={syncState === "syncing"}
          className="font-mono text-xs text-muted hover:text-charcoal transition-colors disabled:cursor-wait"
        >
          {syncState === "syncing"
            ? "syncing…"
            : syncState === "done"
            ? "synced ✓"
            : syncState === "error"
            ? "failed ✗"
            : "sync →"}
        </button>
      </div>
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
