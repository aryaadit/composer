"use client";

// Search for a venue to anchor the itinerary around. Catalog results
// appear first; Google Places fallback shows inline when catalog is empty.

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

interface SearchResult {
  id: string;
  name: string;
  neighborhood: string;
  category: string | null;
  source: "catalog" | "google_places";
  google_place_id?: string;
}

interface Props {
  onSelect: (result: SearchResult) => void;
}

export function AnchorSearch({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/venue-search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { results: SearchResult[] };
      setResults(data.results);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for a restaurant, bar, or spot"
        className="w-full px-4 py-3 bg-white border border-border rounded-xl font-sans text-sm focus:border-charcoal focus:outline-none transition-colors text-charcoal"
        autoFocus
      />

      {loading && (
        <p className="font-sans text-xs text-muted mt-3">Searching...</p>
      )}

      <div className="mt-3 space-y-1">
        {results.map((r) => (
          <motion.button
            key={r.id}
            type="button"
            onClick={() => onSelect(r)}
            className="w-full text-left px-4 py-3 rounded-xl border border-border hover:border-burgundy/30 transition-colors"
            whileTap={{ scale: 0.99 }}
          >
            <p className="font-sans text-sm font-medium text-charcoal">
              {r.name}
            </p>
            <p className="font-sans text-xs text-muted mt-0.5">
              {r.source === "google_places" ? (
                <span className="text-burgundy">+ add to Composer</span>
              ) : (
                r.neighborhood
              )}
            </p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
