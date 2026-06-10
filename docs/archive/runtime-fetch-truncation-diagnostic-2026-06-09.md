# Runtime fetch truncation diagnostic — 2026-06-09

Read-only diagnostic. Follows [bed-stuy-pipeline-diagnostic-2026-06-09.md](bed-stuy-pipeline-diagnostic-2026-06-09.md), which traced yesterday's bad audit numbers to a missing `.range()` in the throwaway script. Spec for this audit: confirm that production runtime fetches against `composer_venues_v2` don't have the same bug.

**Answer: they do.** Three generation-path fetches and one health-check fetch are bare `select` calls that hit PostgREST's default 1000-row cap. The catalog has 1320 active venues. **Every itinerary generation composes from a 24%-truncated pool.**

Per the spec halt rule ("If any runtime fetch is broken, STOP and report instead — the fix plan comes before any re-audit"), the coverage audit re-run is held until this is fixed.

---

## Part 1 — Runtime fetch shape audit

Every read of `composer_venues_v2` reachable from a runtime path. Found via `grep -rn "composer_venues_v2" src/`.

### Generation request path — three identical bugs

| file:line | code | order clause | effective max rows |
| --- | --- | --- | --- |
| [src/app/api/generate/route.ts:194](../../src/app/api/generate/route.ts#L194) | `getSupabase().from("composer_venues_v2").select("*").eq("active", true)` | none | **1000** (PostgREST default) |
| [src/app/api/swap-stop/route.ts:104](../../src/app/api/swap-stop/route.ts#L104) | identical | none | **1000** |
| [src/app/api/add-stop/route.ts:67](../../src/app/api/add-stop/route.ts#L67) | identical | none | **1000** |

All three return a bare PostgREST result. Supabase JS / PostgREST enforces a per-request row cap at the data-API layer (default 1000). With no `.range()`, `.limit()` or `.order()`, the rows that come back are whatever the scan emits first. Per Supabase docs this is **not deterministic** when no `order` is specified — the dropped 320 rows can drift across vacuum / index changes / replica swap. Identical user requests can see different candidate pools without any code change.

### Health endpoint — count check fine, scoring smoke test affected

| file:line | code | effective max rows |
| --- | --- | --- |
| [src/app/api/health/route.ts:95](../../src/app/api/health/route.ts#L95) | `select("*", { count: "exact", head: true }).eq("active", true)` | 0 rows, returns count only — **OK** |
| [src/app/api/health/route.ts:111](../../src/app/api/health/route.ts#L111) | `select("*").eq("active", true)` | **1000** — same bug |

The `checkScoring` smoke test runs the same hard-filter pass production uses, but on the truncated pool, so its diagnostic numbers don't faithfully canary production. The count check at line 95 uses `head: true` and is fine.

### Other runtime reads — fine

| file:line | shape | effective max rows |
| --- | --- | --- |
| [src/app/api/admin/venue/route.ts:37](../../src/app/api/admin/venue/route.ts#L37) | `select("*").ilike("name", …).limit(5)` | 5 — explicit `.limit()` |
| [src/lib/availability/index.ts:41](../../src/lib/availability/index.ts#L41) | `select(…).eq("id", venueId).maybeSingle()` | 1 — single row by PK |

### Importer / admin tooling — fine

| file:line | shape | notes |
| --- | --- | --- |
| [src/lib/venues/import.ts:188](../../src/lib/venues/import.ts#L188) | `.range(offset, offset+PAGE-1).order("venue_id")` | Paginated loop; comment explicitly cites the 1000-row cap. Correct. |
| [src/lib/venues/import.ts:605-609](../../src/lib/venues/import.ts#L605-L609) | `head: true` count queries | Fine. |
| [src/lib/venues/import.ts:693](../../src/lib/venues/import.ts#L693) | calls into the paginated `fetchAllDbVenues` | Fine. |

### String-only references (not fetches; ignored)

- [src/types/index.ts:128-129](../../src/types/index.ts#L128-L129)
- [src/app/profile/_components/SyncPreflightPanel.tsx:122](../../src/app/profile/_components/SyncPreflightPanel.tsx#L122)
- [src/app/profile/_components/SyncResultPanel.tsx:51](../../src/app/profile/_components/SyncResultPanel.tsx#L51)
- [src/app/profile/_components/syncCopy.ts:167](../../src/app/profile/_components/syncCopy.ts#L167)
- [src/lib/venues/apply.ts:98 / 163](../../src/lib/venues/apply.ts#L98)
- [src/lib/venues/columns.ts:1 / 8 / 123](../../src/lib/venues/columns.ts#L1)

Comments or SQL fragment strings, no fetch.

---

## Part 2 — Cap arithmetic, confirmed

Throwaway script (deleted after) ran three queries against the live DB on 2026-06-09:

| query | result |
| --- | --- |
| `select("*", { count: "exact", head: true }).eq("active", true)` | count = **1320** |
| bare `select("*").eq("active", true)` (= production code) | data.length = **1000** |
| paginated `.range()` loop summed | **1320** |

**Truncation gap: 320 active venues dropped on every generation request (24.2% of the catalog).**

The catalog is well above the cap (1320 > 1000), so the bug fires on 100% of requests, not occasionally. Which 320 rows are dropped is **not stable across scans** (no `.order` clause), so the dropped subset can change between deploys, between Vercel cold-start regions, after vacuum, etc. Two identical user requests with the same seed can compose against different pools.

---

## Part 3 — NOT RUN

Per spec: "If any runtime fetch is broken, STOP and report instead — the fix plan comes before any re-audit." Three runtime fetches are broken; no re-audit.

[neighborhood-coverage-audit-2026-06-09.md](neighborhood-coverage-audit-2026-06-09.md) remains the most recent coverage doc; its correction banner already flags the matrix as unreliable. Re-running the audit before the production truncation is fixed in code would produce a third snapshot of a non-deterministic scan — still not what production sees.

---

## Implications for product behavior right now

- **24% of the catalog is invisible to every itinerary generation.** Which 24% drifts with vacuum / replica state.
- **The "thin pool widening" branch fires more often than it should.** [src/app/api/generate/route.ts](../../src/app/api/generate/route.ts)'s `minBudgetWideningThreshold = 30` check sees a 24%-smaller post-budget pool, so casual / splurge requests in mid-coverage neighborhoods widen up a tier when they shouldn't.
- **The "exclude-list graceful trim" comparison against `ALGORITHM.pools.minPoolSize = 4`** is also slightly distorted — same direction, smaller magnitude.
- **The `/api/health` scoring smoke test** sees the truncated pool, so its numbers are not a faithful production canary.
- **Newest venues are likely over-represented in the dropped set** if Postgres scans return rows in insert order or near it — recent additions could be disappearing first. Worth assuming until proven otherwise via an `.order("created_at")` test.

---

## Suggested fix shape (not implementing)

Single paginated helper consumed by all three generation routes and the health smoke test:

```ts
// Suggested: src/lib/venues/fetch-active.ts
//
// - .range() loop with PAGE=1000
// - explicit .order("id") so the page boundary is deterministic
// - count: exact head:true on the same filter, assert fetched == count
//   before returning (catches future drift)
// - returns Venue[]; same shape callers consume today
```

Then [src/app/api/generate/route.ts:194](../../src/app/api/generate/route.ts#L194), [src/app/api/swap-stop/route.ts:104](../../src/app/api/swap-stop/route.ts#L104), [src/app/api/add-stop/route.ts:67](../../src/app/api/add-stop/route.ts#L67), and [src/app/api/health/route.ts:111](../../src/app/api/health/route.ts#L111) flip from bare select to that helper.

After the fix ships, the coverage audit re-run becomes meaningful: the data picture is faithful, and the picker's baked `venueCount` (which `scripts/generate-configs.py` already computes correctly via paginated reads) will then match what `/api/generate` actually composes against.

---

## What's NOT in this report

- The actual fix implementation. The spec required halting at the report.
- Per-route impact on swap rates or composition quality — needs prod analytics joined to deploy timeline.
- Recommendations on whether to backfill the wrongly-widened past compositions or just move forward.
