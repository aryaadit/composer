# Codebase Audit — Venue Import Overhaul + Session Work

**Date:** 2026-05-01
**Scope:** 27 files audited
- `src/lib/venues/*.ts` (10 files)
- `src/app/profile/_components/*` (10 files)
- `src/app/api/admin/sync-venues/route.ts`
- `scripts/import-venues.ts`
- `supabase/migrations/{20260501,20260502,20260503,20260504000001}_*.sql` (4 files)
- `src/app/globals.css`
- `src/components/Header.tsx`
- `docs/archive/import-overhaul-followups.md`

**Method:** Read-only review against the 9 stated principles. No source code modified.

---

## Executive summary

The overhaul is in good shape architecturally. Single-source-of-truth holds for the load-bearing constants (column inventory, route response shapes, threshold knobs) and the audit recording is correctly centralized. The UI's discriminated-union loading pattern landed cleanly across 4 of 5 panels.

The drift that did surface clusters around **two recurring themes**:

1. **Trivial helpers got duplicated rather than shared.** Three copies of `shortId()`, two copies of an inline `Spinner` SVG, three service-role Supabase clients. None of them are wrong individually; collectively they're the kind of background dust that ages into "which one is canonical?" questions.
2. **The assertion name strings escaped centralization.** They appear as inline string literals in `assertions.ts` (definitions), `AssertionsTable.tsx` (loading-mode list), and `syncCopy.ts` (explanation lookup keys). All three need to stay in sync, with no compile-time link between them. The handoff explicitly flagged this surface as a drift risk.

**Counts: 2 High, 7 Medium, 8 Low.**

**Top three recommendations (synthesized):**

1. Extract a `src/lib/venues/assertion-names.ts` (or add a `name` field on a per-assertion config object) so the six names live in exactly one place. Closes the highest-severity drift surface.
2. Pull trivial helpers (`shortId`, `Spinner`) into shared modules. The duplications are tiny but each is a future-drift surface; one PR fixes them all.
3. Split `AdminSection.tsx` (623 lines) into the sync state machine + a separate `HealthCheckSection.tsx`. The two concerns share zero state; the single file makes the sync flow harder to read than it needs to be.

The session's smaller fixes (loading skeletons, scrollbar gutter, header drift) are clean — no findings against them specifically beyond the spinner-duplication note that's adjacent to them.

---

## Findings by principle

### 1. Single source of truth

**Finding 1.1 [HIGH] — Assertion names defined in three places**

- **Files/lines:**
  - `src/lib/venues/assertions.ts` — names embedded as string literals across 6 assertion functions (`"Tab exists"` lines 40, 48; `"Headers present"` lines 60, 67; `"Row count band"` lines 83, 96; `"Lat/lng coverage"` lines 106, 121; `"Canonical neighborhoods"` lines 134, 160; `"Sheet staleness"` lines 170, 179, 193).
  - `src/app/profile/_components/AssertionsTable.tsx:25-32` — `ASSERTION_NAMES_FOR_LOADING` const array repeats all six names.
  - `src/app/profile/_components/syncCopy.ts:67-126` — `assertionExplanations` object uses the same names as keys.
- **Issue:** Three files key off the same six strings with no compile-time binding. If `assertions.ts` renames `"Tab exists"` to `"Tab present"`, the loading panel still shows the old name and the explanation lookup silently returns `undefined` (caller has a fallback so it's not a crash, just a silent UX regression). Comment in `AssertionsTable.tsx:23` acknowledges the duplication ("Mirrors the order in src/lib/venues/assertions.ts") without binding it.
- **Severity:** High — silent drift surface explicitly called out in the handoff.
- **Proposed fix:** Define a single source — either `src/lib/venues/assertion-names.ts` exporting a typed const array, or restructure assertions to a config-driven shape where each assertion is an object `{name, severity, run: (records, ...) => Result}` registered in one list. UI then iterates the list for ordering and imports `name` for keys. Closes all three duplications.
- **Effort:** Single-file change in `assertions.ts` plus minimal updates to the two consumers. Maybe 60–90 minutes.

**Finding 1.2 [HIGH] — `shortId()` defined in three files**

- **Files/lines:**
  - `src/lib/venues/audit.ts:323-327` — `export function shortId(uuid)` (the canonical one)
  - `src/app/profile/_components/SyncResultPanel.tsx:278-282` — local copy
  - `src/app/profile/_components/VenueLookup.tsx:314-318` — local copy
- **Issue:** Identical implementations of the same UUID-to-short-form helper. If we ever change the short-id format (e.g., 6+6 instead of 4+4) the audit table and the two UI panels could disagree silently.
- **Severity:** High — silent drift between operator-facing UI and audit truth.
- **Proposed fix:** Delete the two UI copies; import `shortId` from `@/lib/venues/audit`. The function is pure and free of server-only deps, so it's safe to import into client components.
- **Effort:** Single-file deletions in two UI panels + import statements. ~10 minutes.

**Finding 1.3 [MEDIUM] — Service-role Supabase client created in 3 places**

- **Files/lines:**
  - `src/lib/supabase.ts:20-29` — `getServiceSupabase()` (the original, used elsewhere in the app)
  - `src/lib/venues/import.ts:139-156` — local `getServiceClient()`
  - `src/lib/venues/audit.ts:32-44` — local `getServiceClient()`
- **Issue:** Three implementations of the same singleton-pattern service-role client. The two `venues/*` copies have an in-comment justification ("sharing through a third module would just be ceremony") but the project ALSO has `getServiceSupabase` in `src/lib/supabase.ts` that does the same thing. The "third module" already exists.
- **Severity:** Medium — different env-var error messages between the three, slight type-shape divergence possible.
- **Proposed fix:** Use the existing `src/lib/supabase.ts:getServiceSupabase()` from both venue modules. Delete the two local copies.
- **Effort:** Two-file change, ~15 minutes. Verify the singleton lifetime is acceptable (it is — same module-scope cache pattern).

**Finding 1.4 [MEDIUM] — `Spinner` SVG component duplicated**

- **Files/lines:**
  - `src/app/profile/_components/SyncResultPanel.tsx:67-91`
  - `src/app/profile/_components/AssertionsTable.tsx:195-217`
- **Issue:** Same SVG, slightly different size classes (`h-3.5 w-3.5` vs `h-3 w-3`). The duplication is tiny but each instance is its own potential drift point — if one gets a stroke color tweak the other won't follow.
- **Severity:** Medium.
- **Proposed fix:** Move alongside `SkeletonBar.tsx` as a sibling primitive, or co-locate in a tiny `src/app/profile/_components/SyncPrimitives.tsx`. Both panels import. Default size as a prop.
- **Effort:** Single new file + 2 import statements + 2 deletions. ~15 minutes.

**Finding 1.5 [MEDIUM] — `VenueLookup.tsx` status copy not in `syncCopy.ts`**

- **Files/lines:** `src/app/profile/_components/VenueLookup.tsx:259-281` (status copy strings: "Added new row from sheet.", "Updated DB row — fields changed.", "No changes — sheet matches DB.", plus button labels "syncing…", "not in sheet ✗", "failed ✗", "sync from sheet →") and the empty-state hint at lines 84-87.
- **Issue:** The whole point of `syncCopy.ts` is centralized operator-facing copy. VenueLookup is operator-facing and bypasses it.
- **Severity:** Medium — moves one degree of friction off the principle.
- **Proposed fix:** Add a `singleVenueCopy` block (or extend `buttonLabels` and add a `singleVenueStatuses` map) to `syncCopy.ts`. Import from VenueLookup.
- **Effort:** Single-file addition to `syncCopy.ts` + ~6 string replacements in VenueLookup. ~15 minutes.

**Finding 1.6 [LOW] — `TIMESTAMP_AS_DATE_COLUMNS` lives in `diff.ts`, not `columns.ts`**

- **Files/lines:** `src/lib/venues/diff.ts:23` — `const TIMESTAMP_AS_DATE_COLUMNS: ReadonlySet<string> = new Set(["last_updated"]);`
- **Issue:** This is column-inventory metadata (which DB column is conceptually a date even though the schema says timestamptz) but it lives in `diff.ts` rather than `columns.ts` where every other column-categorization set lives. If a new column joins the "stored as timestamp, treat as date" club, the precedent says to update `columns.ts`; the actual code path is `diff.ts`.
- **Severity:** Low — single member, narrow blast radius.
- **Proposed fix:** Move the constant to `columns.ts`, export it, import from `diff.ts`. Or fold into `pgType()` semantics if there's a cleaner unification.
- **Effort:** Two-file change, ~5 minutes.

### 2. Avoid premature/missed abstraction

**Finding 2.1 [MEDIUM] — Missed primitive: `Spinner`**

Covered as 1.4 above. Same finding under both principles — the duplication is both "two sources of truth" and "missed abstraction."

**Finding 2.2 [LOW] — Missed primitive: short-id helper**

Covered as 1.2. Same dual-classification.

**Finding 2.3 [LOW] — `PendingDot` in AssertionsTable.tsx is single-use**

- **File/lines:** `src/app/profile/_components/AssertionsTable.tsx:185-192`
- **Issue:** Used in exactly one place (the loading-row of AssertionsTable). Does NOT need extracting. Calling out to confirm I considered it.
- **Severity:** None — it's correctly inline.
- **Proposed fix:** N/A.

### 3. No bloated files

**Finding 3.1 [MEDIUM] — `import.ts` at 750 lines is doing too many jobs**

- **File:** `src/lib/venues/import.ts`
- **Issue:** 750 lines covering: error class definitions (`AssertionsBlockedError`, `OverrideEmptyReadError`), service-client singleton, DB row fetch, `loadAndDiff`, `prepareApply`, `applyPrepared`, `runApply`, `runPreflight`, `runApplySingleVenue`, `safeRecord`, `recordAssertionsAbort`. That's three concerns in one file — error types, infra glue, orchestrators.
- **Severity:** Medium — file is navigable but readers chase what they need. Splitting helps without forcing it.
- **Proposed fix:** Suggested splits:
  - `src/lib/venues/errors.ts` — `AssertionsBlockedError`, `OverrideEmptyReadError`. Co-locate `LargeChangeError` here too (currently in `apply.ts`).
  - Keep orchestrators in `import.ts`.
  - Don't split DB-fetch helpers — they're tight glue and small.
  Net result: import.ts ~600 lines, errors.ts ~70 lines. Cleaner module surface.
- **Effort:** Single-file split + import-statement updates across ~5 files. ~30 minutes.

**Finding 3.2 [MEDIUM] — `AdminSection.tsx` at 623 lines mixes sync state machine with health check**

- **File:** `src/app/profile/_components/AdminSection.tsx`
- **Issue:** The component holds:
  - The complete sync state machine (~400 lines: types, transitions, `SyncSection`, `SyncBody`, `CurrentStateExplanation`, `PrimaryButton`, `ErrorBlock`)
  - Health-check rendering (~80 lines: `HealthState`, `runHealthCheck`, `HealthStatusBanner`, `CheckIcon`, `CrossIcon`)
  - Top-level orchestration that ties them together (~60 lines)
  Health check has zero state interaction with sync. They're both "internal admin stuff" but otherwise unrelated.
- **Severity:** Medium — single file works, but the sync flow is harder to follow when it shares a file with the unrelated health probe.
- **Proposed fix:** Extract `HealthCheckSection.tsx` (the health-check rendering, banner, icons). `AdminSection` becomes the thin orchestrator that renders both child sections. ~150-line move.
- **Effort:** Single new file + edits to `AdminSection.tsx`. ~30 minutes. Visual output identical.

**Finding 3.3 [LOW] — `scripts/import-venues.ts` at 695 lines is dense but coherent**

- **File:** `scripts/import-venues.ts`
- **Issue:** Long file but it's all CLI plumbing — argv parsing, formatters, prompt helpers, subcommand handlers. No mixed concerns. Borderline by line count.
- **Severity:** Low — works fine; could split if it grows further.
- **Proposed fix:** None now. If it grows past ~900 lines, split formatters into `import-venues-format.ts`.
- **Effort:** N/A.

### 4. Consistent patterns

**Finding 4.1 [LOW] — `SyncResultPanel.tsx` doesn't use the `phase` discriminated union**

- **Files:** `src/app/profile/_components/SyncResultPanel.tsx` exports 5 named panels (`SyncSuccessPanel`, `SyncApplyingPanel`, `SyncAssertionBlockedPanel`, `SyncThresholdBlockedPanel`, `SyncFailedPanel`) where 4 sibling panels (preflight, preview, assertions, diff) use `{phase: 'loading'} | {phase: 'ready', data}`.
- **Issue:** The pattern divergence is real but justified — success/blocked/failed are visually quite different and a single panel with phase variants would be a giant switch internally. The handoff acknowledged this trade-off ("Pick whichever style is cleaner given the existing component shapes").
- **Severity:** Low — flagging only because the audit asked. Not a violation; deliberate divergence with an in-context justification.
- **Proposed fix:** None. Document in a comment near the exports if you want it explicit.
- **Effort:** N/A.

**Finding 4.2 [LOW] — `requireAdmin()` in route.ts hand-rolls auth result type**

- **Files/lines:** `src/app/api/admin/sync-venues/route.ts:48-69` defines `interface AuthOk { ok: true; userId: string; }` and `type AuthResult = AuthOk | AdminAuthFailedResponse;` inline. Other discriminated unions in this codebase live in `types.ts`.
- **Issue:** Minor — the auth result type is route-internal, not part of the public response shape, so co-locating it isn't wrong. Could move to `types.ts` for consistency.
- **Severity:** Low.
- **Proposed fix:** Leave as-is, or move `AuthResult` to `types.ts`. Operator's choice.
- **Effort:** Trivial if you decide to move it.

### 5. Discriminated unions over boolean flags

All five panels that needed loading variants use `{phase: 'loading'} | {phase: 'ready', ...}` (or split components for SyncResultPanel — see 4.1). VenueLookup's inline sync state uses `{status: 'idle'} | {status: 'syncing'} | {status: 'success', ...} | {status: 'not_found', ...} | {status: 'error', ...}` — proper discriminated union.

`AdminState` in `AdminSection.tsx:42-65` is a 13-variant discriminated union, properly typed.

**No violations found.**

### 6. Layer separation

- UI panels in `src/app/profile/_components/*` import from `@/lib/venues/types` (type-only) plus `@/lib/venues/audit` for `shortId` and `getRun`/`listRuns` (used by CLI, not by UI components). UI doesn't reach into `apply.ts`/`diff.ts`/`assertions.ts` internals.
- Route imports `runApply`/`runApplySingleVenue`/`runPreflight`/`prepareApply` from `import.ts` (orchestrators) plus `LargeChangeError` from `apply.ts`. No direct imports from internals.
- CLI imports orchestrators + `OverrideEmptyReadError` + `recordAssertionsAbort`. Same level of access as the route.

**No violations found.** Layer hygiene is clean.

### 7. Tunable knobs centralized

**Finding 7.1 [MEDIUM] — `SHORT_ID_LOOKUP_WINDOW = 500` lives in `audit.ts`, not `config.ts`**

- **File/lines:** `src/lib/venues/audit.ts:239` — `const SHORT_ID_LOOKUP_WINDOW = 500;`
- **Issue:** This is a tunable knob — how many recent runs the short-id resolver scans. It belongs in `config.ts` where `SANITY_THRESHOLDS` and `CHANGE_THRESHOLDS` live, with a doc comment explaining the trade-off (resolution depth vs query size).
- **Severity:** Medium — single-spot magic number, but exactly the kind of thing config.ts exists to gather.
- **Proposed fix:** Add `LOOKUP_LIMITS = { shortIdWindow: 500 }` (or extend the existing thresholds object) to `config.ts`. Import from `audit.ts`.
- **Effort:** Two-file change, ~5 minutes.

**Finding 7.2 [LOW] — `PAGE = 1000` in `import.ts:fetchAllDbVenues` is a Supabase max, not really a knob**

- **File/lines:** `src/lib/venues/import.ts:170` — `const PAGE = 1000;`
- **Issue:** Magic number, but it reflects Supabase's enforced PostgREST max-rows default. Tuning down doesn't help; tuning up doesn't work. Calling out for completeness.
- **Severity:** Low — not actually tunable in any meaningful sense.
- **Proposed fix:** Add a one-line comment naming it as the PostgREST max; that documents the constant without false-promising tuning.
- **Effort:** One line.

### 8. Brand voice in operator-facing copy

`syncCopy.ts` reads cleanly per the "clinical-but-clear in admin failure states" rule:

- `stateExplanations.applyAssertionBlocked` — explains the why ("these checks exist because they catch the kind of mistake that bulk-imports normally amplify")
- `assertionExplanations.*.whatToDo` entries are specific and actionable
- `errorHints` returns null when no pattern matches — good restraint
- Override warning copy is appropriately grave without melodrama

VenueLookup's inline status copy (Finding 1.5) is consistent in tone — when it migrates into syncCopy.ts it'll fit the existing voice without modification.

**No voice violations found.** The copy that exists is well-calibrated; the issue with VenueLookup is centralization (Finding 1.5), not voice.

### 9. No dead code, no stale comments

**Finding 9.1 [LOW] — "item N from UI fixes pass" references will age confusingly**

- **Files/lines:**
  - `src/app/profile/_components/AdminSection.tsx:56` — "item 4 from UI fixes"
  - `src/app/profile/_components/SyncPreviewPanel.tsx:131` — "Item 7 from the UI fixes pass"
  - `src/app/profile/_components/SyncResultPanel.tsx:6-7` — "item 4 from the UI fixes pass"
- **Issue:** "The UI fixes pass" was a session-specific reference. Future-readers (including future-Adit) won't know what document or PR it refers to. Comments still describe the WHY accurately, but the cross-reference is dead.
- **Severity:** Low — comments are still informative, just the parenthetical is unanchored.
- **Proposed fix:** Either delete the parentheticals (the why-comments stand on their own) or replace with a stable reference (e.g., a commit hash or "see docs/codebase-audit-2026-05-01.md" if this audit gets committed).
- **Effort:** ~3 minute sweep.

**Finding 9.2 [LOW] — `audit.ts` has a double blank line between `hydrate()` and `shortId()`**

- **File/lines:** `src/lib/venues/audit.ts:316-317`
- **Issue:** Pure cosmetic — extra blank line between two function definitions.
- **Severity:** Low.
- **Proposed fix:** Remove one blank.
- **Effort:** Trivial.

**Finding 9.3 [LOW] — `recordImportRun.triggeredBy` is optional in audit.ts but required at every caller**

- **File/lines:** `src/lib/venues/audit.ts:91` — `triggeredBy?: string;` with default `"cli"` at line 120 (`triggered_by: input.triggeredBy ?? "cli"`).
- **Issue:** Every call site (in `import.ts:safeRecord`, `recordAssertionsAbort`, `applyPrepared`, `runApply`, `runApplySingleVenue`) passes `triggeredBy` explicitly. The optionality + default in the writer permits omission, which would mask a missing pass-through. Making it required at the writer-level matches the pattern enforced upstream.
- **Severity:** Low — behaviorally fine today; a defensive tightening.
- **Proposed fix:** Remove the optional + default. Make `triggeredBy: string` required in `RecordImportRunInput`.
- **Effort:** Single-file change. Type system enforces the rest. ~5 minutes.

---

## Findings by severity

### High (2)
- 1.1 Assertion names defined in 3 places (`assertions.ts`, `AssertionsTable.tsx`, `syncCopy.ts`)
- 1.2 `shortId()` defined in 3 files (`audit.ts`, `SyncResultPanel.tsx`, `VenueLookup.tsx`)

### Medium (7)
- 1.3 Service-role Supabase client in 3 places (`supabase.ts`, `import.ts`, `audit.ts`)
- 1.4 / 2.1 `Spinner` duplicated in `SyncResultPanel.tsx` + `AssertionsTable.tsx`
- 1.5 VenueLookup status copy not consumed from `syncCopy.ts`
- 3.1 `import.ts` 750 lines mixes errors / glue / orchestrators
- 3.2 `AdminSection.tsx` 623 lines mixes sync state machine + health check
- 7.1 `SHORT_ID_LOOKUP_WINDOW` in `audit.ts` instead of `config.ts`

### Low (8)
- 1.6 `TIMESTAMP_AS_DATE_COLUMNS` in `diff.ts` instead of `columns.ts`
- 2.3 `PendingDot` is single-use (no fix needed; flagged for completeness)
- 3.3 `import-venues.ts` 695 lines (works; flag if it grows)
- 4.1 `SyncResultPanel.tsx` uses split exports rather than phase union (deliberate; flagging for completeness)
- 4.2 `AuthResult` type lives inline in route.ts
- 7.2 `PAGE = 1000` in `import.ts` could use a comment
- 9.1 "item N from UI fixes" stale references in 3 files
- 9.2 Double blank line in `audit.ts`
- 9.3 `recordImportRun.triggeredBy` optional in audit.ts

(Note: 1.4 and 2.1 are the same finding under two principles; counted once in totals. Grand total: 17 distinct findings, 2 High / 7 Medium / 8 Low.)

---

## Specific spots checked

### 1. `syncCopy.ts` shape and length
**Verified mostly clean.** 175 lines, single concern, organized into named exports. Other components do consume from it (AdminSection, AssertionsTable, DiffSummary, SyncPreviewPanel, SyncResultPanel, ThresholdOverrideDialog all import). One real exception: VenueLookup defines its status copy inline (Finding 1.5).

### 2. Discriminated union usage across panels
**Verified clean for 4 of 5.** SyncPreflightPanel, SyncPreviewPanel, AssertionsTable, DiffSummary use the `phase` union. SyncResultPanel uses split components — flagged as Finding 4.1, deliberate divergence.

### 3. Hardcoded assertion names in `AssertionsTable.tsx` loading variant
**Found drift surface.** Comment at line 23 acknowledges the duplication ("Mirrors the order in src/lib/venues/assertions.ts") but doesn't bind via a shared constant. Compounded by `syncCopy.ts:67-126` using the same names as object keys for explanations. Three copies, no compile-time link. **Finding 1.1, High.**

### 4. `config.ts` as canonical knobs file
**Mostly clean, two minor escapes.** `SANITY_THRESHOLDS`, `CHANGE_THRESHOLDS`, sheet tab/range constants all there. Findings 7.1 (`SHORT_ID_LOOKUP_WINDOW`) and 1.6 (`TIMESTAMP_AS_DATE_COLUMNS`) are knobs/metadata that escaped to other modules. No magic threshold numbers in `apply.ts`/`diff.ts`/`assertions.ts`/`import.ts` beyond those.

### 5. Column constants
**Verified clean.** `transform.ts`, `diff.ts`, `apply.ts`, `import.ts` all import from `columns.ts`. No local copies of `PROTECTED_COLUMNS`, `COALESCE_COLUMNS`, etc. Only `TIMESTAMP_AS_DATE_COLUMNS` (1.6) is in the wrong file.

### 6. Audit recording centralization
**Verified clean.** All paths go through `safeRecord` (in `import.ts`) → `recordImportRun` (in `audit.ts`) → INSERT. No direct table writes anywhere else. `triggeredBy` flows through every orchestrator: route passes user UUID, CLI passes `"cli"`. Minor type-shape note (Finding 9.3) about `triggeredBy` being optional at the writer.

### 7. Error type consistency
**Verified mostly clean.** All three errors (`LargeChangeError`, `AssertionsBlockedError`, `OverrideEmptyReadError`) extend `Error` and carry a `runId: string | null` field. Locations split: `LargeChangeError` in `apply.ts`, the other two in `import.ts`. Consolidation suggested (folded into Finding 3.1's proposed `errors.ts`).

### 8. Skeleton component reuse
**Verified clean for SkeletonBar.** Three panels import the shared primitive (SyncPreflightPanel, AssertionsTable, DiffSummary). SyncPreviewPanel uses skeletons transitively via AssertionsTable + DiffSummary. SyncResultPanel doesn't use skeletons (uses a Spinner instead — appropriate for in-flight RPC, not waiting-for-data). The drift here is the `Spinner` (Finding 1.4) not the skeleton primitive.

### 9. Route response shape
**Verified clean.** All response variants typed in `src/lib/venues/types.ts` as `AdminSyncResponse` discriminated union. Both route.ts and the UI consumers (AdminSection, VenueLookup) import from there. No string-literal "kinds" rolled inline.

### 10. Migration files vs schema
**Verified clean.** Phase 2 file (20260501) creates the original 5-param function; Phase 3 file (20260502) drops + recreates as 6-param. Sequence is correct from a fresh apply. Phase 4 (20260503) creates `composer_import_runs` table. The verify migration (20260504000001) is intentionally retained per spec ("durable evidence").

---

## Recommendations

Synthesized in priority order:

1. **Close the assertion-name drift surface (Finding 1.1).** Highest-leverage single change. Either extract a shared constant or restructure assertions to a config-driven shape. Until this lands, every assertion-related copy change has 3 files to touch in lockstep.

2. **Sweep duplicated trivial helpers (Findings 1.2, 1.3, 1.4).** A single PR that:
   - Imports `shortId` from `audit.ts` in the two UI panels (delete locals)
   - Extracts `Spinner` alongside `SkeletonBar` (or into a `SyncPrimitives.tsx`)
   - Replaces the two `getServiceClient()` locals with `getServiceSupabase` from `src/lib/supabase.ts`
   This is ~30 minutes and removes 4 silent-drift surfaces at once.

3. **Split `AdminSection.tsx` (Finding 3.2).** Pulling the health check out makes the sync state machine the only thing in the file, which makes future state-machine edits easier to review. Visual output unchanged. ~30 minutes.

4. **Optional: split `import.ts` into `errors.ts` + orchestrators (Finding 3.1).** Lower priority than the above. Worth doing alongside any future error-class addition (e.g., a Phase 6 deactivation-undo error).

5. **Defer until painful: copy migration to `syncCopy.ts` for VenueLookup (Finding 1.5), plus the cosmetic findings (9.1–9.3, 1.6, 7.1).** None are actively bug-prone. Bundle into the same sweep as #2 if you want a clean pass.

The session's smaller fixes (loading skeletons, scrollbar gutter, header drift) are not flagged as findings beyond the spinner-duplication that intersects them. Those changes look good.

---

## Out of scope but noticed

These came up while reading; flagged here so they're not lost. Not findings against the audit's principles.

- **`InfoTooltip` accessibility (DiffSummary.tsx:233-244)** — uses `role="img"` + `title` attribute. Works for desktop hover, fails for keyboard-only and touch. Not in scope (pre-dates the overhaul) but worth noting.
- **`<img>` in VenueLookup.tsx with eslint-disable** — pre-existing pattern across the app (StopCard, VenueDetailModal also use raw `<img>`). Lint flags them all. A future "use Next.js Image component everywhere" sweep would fix as a group.
- **Migration tracking duplicate-version blocker is closed** — the 5 originally-duplicated files were renamed in the followups #1 work. The followups doc is appropriately archived in `docs/archive/`. No drift between doc and reality.
- **`composer_apply_venue_import` is `SECURITY DEFINER` with text-parameter dynamic SQL.** Threat model holds because callers build the params from typed constants. The migration files (20260501 and 20260502) document this; the orchestrator (`apply.ts:buildSqlFragments`) doesn't reference the migration's security note. If a future engineer extends `apply.ts` to accept user-supplied SQL fragments, the security model breaks silently. Worth a comment in `apply.ts:buildSqlFragments` pointing to the migration's threat-model note. Borderline finding — left out of the formal list because the call site is currently airtight.
- **Test migration `20260504000001_verify_migration_tracking_repair.sql`** is preserved on disk per spec. Mildly unusual to leave a `SELECT 1 WHERE FALSE` migration in production history; it's noted in the file's own comment why. Future ops engineers seeing it should not try to "clean it up."
- **No automated tests** for the venue import module. The build is verified by hand-walking the CLI and admin UI. Not a finding for this audit (testing strategy isn't part of the 9 principles), but worth noting that `apply.ts:buildSqlFragments` and `diff.ts:computeDiff` are exactly the shapes that benefit most from unit tests — pure functions over typed inputs.
