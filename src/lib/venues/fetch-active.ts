// Paginated read of all active rows from composer_venues_v2.
//
// Replaces the bare `.select("*").eq("active", true)` calls in the
// generation request path (/api/generate, /api/swap-stop, /api/add-stop)
// and the /api/health scoring smoke test, which silently truncated at
// PostgREST's 1000-row cap. With the catalog at ~1320 active rows that
// was a 24% drop on every request, against a non-deterministic subset
// (no .order). See
// docs/archive/runtime-fetch-truncation-diagnostic-2026-06-09.md.
//
// Mirrors the proven paging pattern in src/lib/venues/import.ts:188:
// range loop, PAGE=1000, explicit .order("id") so page boundaries are
// deterministic, terminate on partial page. We deliberately do not
// consolidate the two loops in this change — that's a parked follow-up;
// import.ts:188 selects a different column set (writable cols only)
// and inverts the active filter (returns all rows for diffing), so a
// shared helper would need careful refactoring of both call sites.
//
// After paging we cross-check fetched count against a head:true exact
// count on the same filter. On mismatch we console.error both numbers
// and proceed with the fetched rows — a row or two can drift if an
// import lands mid-fetch, and surfacing a hard error in the request
// path is worse than a logged discrepancy.

import { getSupabase } from "@/lib/supabase";
import type { Venue } from "@/types";

const PAGE_SIZE = 1000;

export async function fetchActiveVenues(): Promise<Venue[]> {
  const supabase = getSupabase();
  const out: Venue[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("composer_venues_v2")
      .select("*")
      .eq("active", true)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`composer_venues_v2 read failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    out.push(...(data as Venue[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // Cross-check against the exact count. Log-and-proceed on mismatch
  // (not throw): the alternative is to take a 500 in the request path
  // for a transient one-row drift.
  const { count, error: countError } = await supabase
    .from("composer_venues_v2")
    .select("*", { count: "exact", head: true })
    .eq("active", true);
  if (countError) {
    console.error(
      `[fetchActiveVenues] count check failed: ${countError.message}; proceeding with ${out.length} fetched rows`,
    );
  } else if (count !== null && count !== out.length) {
    console.error(
      `[fetchActiveVenues] count mismatch: fetched=${out.length} count=${count}; proceeding with fetched rows`,
    );
  }

  return out;
}
