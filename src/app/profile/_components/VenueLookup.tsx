"use client";

// Admin venue lookup — search by name, see all fields. Used to
// verify that the import pipeline is producing correct data without
// needing to open the Supabase dashboard.

import { useState } from "react";
import type { Venue } from "@/types";
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
