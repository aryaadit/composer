// Canonical TypeScript module for venue import.
//
// Composition:
//   sheet.ts       → reads Google Sheet rows + identity + tab names
//   transform.ts   → row → VenueRecord with strict validation
//   diff.ts        → semantic diff against current DB rows
//   assertions.ts  → Layer 2 sanity checks
//   apply.ts       → atomic upsert via composer_apply_venue_import RPC
//   columns.ts     → single source of truth for column inventory + types
//   config.ts      → tunable thresholds + tab name
//
// Phases shipped:
//   1. dry-run: read-only diff
//   2. apply:   atomic upsert with sanity assertions and large-change guard
//   3. orphan deactivation in the same transaction as upsert
//   4. audit trail to composer_import_runs (success / failed / aborted)
//
// The legacy paths (scripts/import_venues_v2.py and the
// /api/admin/sync-venues route) remain operational and untouched.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { ALL_NEIGHBORHOODS } from "@/config/generated/neighborhoods";

import {
  callApplyRpc,
  LargeChangeError,
  runApply as runApplyLowLevel,
} from "./apply";
import { runAssertions } from "./assertions";
import {
  recordImportRun,
  type RecordImportRunInput,
} from "./audit";
import { ALL_WRITABLE_COLUMNS } from "./columns";
import { VENUE_SHEET_TAB } from "./config";
import { computeDiff } from "./diff";
import {
  fetchSheetMetadata,
  fetchTabNames,
  readSheetRows,
} from "./sheet";
import { transformRows } from "./transform";
import type {
  ApplyResult,
  AssertionReport,
  ImportDiff,
  SheetMetadata,
  VenueCellValue,
  VenueRecord,
} from "./types";

/**
 * Thrown by the high-level `runApply()` when sanity assertions block and
 * the caller did not pass `skipAssertions: true`. The admin route catches
 * this to render the assertion-blocked response. The CLI doesn't go
 * through `runApply()` so it never sees this — it inspects
 * `prep.assertions.blocked` directly.
 *
 * `runId` is attached after the `aborted/assertions` audit row is
 * recorded, so callers can surface it back to the operator.
 */
export class AssertionsBlockedError extends Error {
  /** Audit run id; populated by runApply after recording. */
  runId: string | null = null;

  constructor(public readonly assertions: AssertionReport) {
    const failed = assertions.results
      .filter((a) => !a.passed && a.severity === "block")
      .map((a) => `${a.name}: ${a.detail}`)
      .join("\n  ");
    super(
      `Apply blocked by failed sanity assertion(s):\n  ${failed}\n\nUse --skip-assertions to override (not recommended).`
    );
    this.name = "AssertionsBlockedError";
  }
}

/**
 * Thrown when an override apply (`skipAssertions: true`) runs against a
 * sheet that produced 0 rows. Without this guard the override path
 * would happily record `status: 'success'` with all-zero counts, lying
 * to the operator that a sync happened when nothing was actually read.
 *
 * Practically this fires when the operator overrides an assertion
 * failure that prevented sheet reads — `Tab exists` failed and the data
 * range therefore returned no rows, or `Headers present` failed so the
 * transform produced no records. The check is "0 rows read, override
 * was used" rather than "specific assertion X failed" so it stays
 * robust to any future read-blocking assertion.
 */
export class OverrideEmptyReadError extends Error {
  /** Audit run id; populated by runApply after recording. */
  runId: string | null = null;

  constructor(failedAssertionNames: string[]) {
    const tail =
      failedAssertionNames.length > 0
        ? ` Failed assertion(s): ${failedAssertionNames.join(", ")}.`
        : "";
    super(
      `Override applied, but the sheet read produced no data — likely a missing tab, missing headers, or unreachable sheet. The database was not modified.${tail}`
    );
    this.name = "OverrideEmptyReadError";
  }
}

export interface DryRunResult {
  sheet: SheetMetadata;
  db: {
    active: number;
    inactive: number;
    total: number;
  };
  diff: ImportDiff;
}

export interface ApplyRunResult extends DryRunResult {
  assertions: AssertionReport;
  applyResult: ApplyResult;
  /** Audit run id; null when the audit write failed. */
  runId: string | null;
}

/**
 * Result of preparing for apply — everything computed by the dry-run
 * pass plus the assertion report and the records that *would* be
 * written. Callers (CLI, route) can inspect, prompt for confirmation,
 * and only then call `applyPrepared()` to actually mutate the DB.
 */
export interface ApplyPreparation extends DryRunResult {
  assertions: AssertionReport;
  recordsToWrite: VenueRecord[];
}

const CANONICAL_NEIGHBORHOODS: ReadonlySet<string> = new Set(ALL_NEIGHBORHOODS);

// ─── Supabase service-role client ──────────────────────────────────────
// Importer always uses service-role: it operates outside any user session,
// reads/writes the venues table directly, and runs in CLI / cron contexts.

let _service: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (_service) return _service;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is required. Set it in .env.local."
    );
  }
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required. Set it in .env.local."
    );
  }
  _service = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _service;
}

// ─── DB fetch ──────────────────────────────────────────────────────────

/**
 * Pull every venue from composer_venues_v2 (active and inactive). Pages
 * defensively in 1,000-row chunks because Supabase enforces a per-request
 * row cap (default 1,000) at the PostgREST layer.
 *
 * Selects venue_id + every writable column. PROTECTED columns (id,
 * created_at, updated_at, image_keys) are excluded from comparison and
 * therefore not selected.
 */
async function fetchAllDbVenues(): Promise<Record<string, VenueCellValue>[]> {
  const supabase = getServiceClient();
  const cols = ["venue_id", ...ALL_WRITABLE_COLUMNS].filter(
    (c, i, arr) => arr.indexOf(c) === i
  );
  const select = cols.join(",");

  const PAGE = 1000;
  const out: Record<string, VenueCellValue>[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("composer_venues_v2")
      .select(select)
      .range(offset, offset + PAGE - 1)
      .order("venue_id", { ascending: true });
    if (error) {
      throw new Error(`composer_venues_v2 read failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    out.push(...(data as unknown as Record<string, VenueCellValue>[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

// ─── Sample neighborhoods ──────────────────────────────────────────────

function sampleNeighborhoods(records: VenueRecord[], n = 5): string[] {
  const seen = new Set<string>();
  for (const r of records) {
    const v = r.neighborhood;
    if (typeof v === "string" && v.length > 0) seen.add(v);
  }
  return Array.from(seen).sort().slice(0, n);
}

// ─── Shared load+diff path ─────────────────────────────────────────────
// Both runDryRun and runApply walk the same path up to and including the
// diff. Keeping it in one helper means the apply path can never disagree
// with what the dry-run reported.

interface LoadResult {
  sheetMeta: SheetMetadata;
  tabNames: string[];
  headers: string[];
  records: VenueRecord[];
  dbVenues: Record<string, VenueCellValue>[];
  dbActive: number;
  dbInactive: number;
  diff: ImportDiff;
}

/**
 * `loadAndDiff` options.
 *
 * `allowMissingTab` controls how a missing VENUE_SHEET_TAB is reported:
 *   - `false` (default, used by dry-run): throw immediately with a
 *     diagnostic listing the tabs present. Dry-run is read-only and a
 *     misnamed tab would otherwise produce confusing "all DB rows are
 *     orphans" output.
 *   - `true` (used by the apply preparation): return a partial result
 *     with empty rows/records/diff so the assertion-block code path can
 *     surface the failure through `runAssertions` and produce an audit
 *     row in `composer_import_runs` for post-mortem.
 */
interface LoadAndDiffOptions {
  allowMissingTab?: boolean;
}

async function loadAndDiff(opts: LoadAndDiffOptions = {}): Promise<LoadResult> {
  const tabNames = await fetchTabNames();
  const tabExists = tabNames.includes(VENUE_SHEET_TAB);

  if (!tabExists && !opts.allowMissingTab) {
    const present = tabNames.length > 0
      ? tabNames.map((t) => `'${t}'`).join(", ")
      : "(none)";
    throw new Error(
      `'${VENUE_SHEET_TAB}' tab not found in spreadsheet. Tabs present: ${present}. Did you rename the tab? Update VENUE_SHEET_TAB in src/lib/venues/config.ts to match.`
    );
  }

  // When the tab is missing under allowMissingTab, skip the sheet read
  // AND the diff entirely — we don't know what *should* be in the sheet,
  // so treating "no rows read" as "deactivate everything" would be
  // catastrophic. Return empty buckets and let assertions surface the
  // tab-missing failure.
  let headers: string[] = [];
  let rows: string[][] = [];
  let records: VenueRecord[] = [];
  let skipped: ReturnType<typeof transformRows>["skipped"] = [];
  let diff: ImportDiff = { add: [], modify: [], deactivate: [], unchanged: 0, skipped: [] };

  if (tabExists) {
    ({ headers, rows } = await readSheetRows());
    ({ records, skipped } = transformRows(headers, rows));
  }

  const dbVenues = await fetchAllDbVenues();
  const dbActive = dbVenues.filter((v) => v.active === true).length;
  const dbInactive = dbVenues.length - dbActive;

  const sheetMeta = await fetchSheetMetadata(
    rows.length,
    sampleNeighborhoods(records)
  );

  if (tabExists) {
    diff = computeDiff(records, dbVenues, skipped);
  }

  return {
    sheetMeta,
    tabNames,
    headers,
    records,
    dbVenues,
    dbActive,
    dbInactive,
    diff,
  };
}

// ─── Public entry points ───────────────────────────────────────────────

/**
 * Read the sheet, validate rows, fetch current DB state, and compute the
 * semantic diff. Pure read-only — no DB writes anywhere in this path.
 */
export async function runDryRun(): Promise<DryRunResult> {
  const r = await loadAndDiff();
  return {
    sheet: r.sheetMeta,
    db: { active: r.dbActive, inactive: r.dbInactive, total: r.dbVenues.length },
    diff: r.diff,
  };
}

/**
 * Read-only preparation for apply: load + diff + assertions + filter to
 * the records that would be written. Does NOT call the Postgres function.
 * Use this when you need to inspect the assertion report and prompt for
 * confirmation before mutating — the CLI does this so it can render a
 * single receipt (assertions + diff + prompt) before any DB write.
 */
export async function prepareApply(): Promise<ApplyPreparation> {
  // Tolerate a missing tab so the failure flows through the assertion
  // report (and gets recorded in the audit table) instead of throwing
  // before assertions can run.
  const r = await loadAndDiff({ allowMissingTab: true });

  const assertions = runAssertions(
    r.records,
    r.sheetMeta,
    r.tabNames,
    r.headers,
    r.dbActive,
    CANONICAL_NEIGHBORHOODS
  );

  // Filter sheet records to only those the apply will actually write.
  // The diff carries field-level deltas; the payload needs the full
  // post-state per row.
  const writeIds = new Set<string>([
    ...r.diff.add.map((v) => v.venue_id as string),
    ...r.diff.modify.map((m) => m.venue_id),
  ]);
  const recordsToWrite = r.records.filter((rec) =>
    writeIds.has(rec.venue_id as string)
  );

  return {
    sheet: r.sheetMeta,
    db: { active: r.dbActive, inactive: r.dbInactive, total: r.dbVenues.length },
    diff: r.diff,
    assertions,
    recordsToWrite,
  };
}

/**
 * Wrap a recordImportRun call so audit failures never block or mask the
 * apply path. The apply already happened (or already failed) by the time
 * we get here — losing an audit row is bad but recoverable; throwing
 * would confuse the operator about whether the apply landed.
 *
 * Returns the new run id, or `null` if the audit write failed.
 */
async function safeRecord(input: RecordImportRunInput): Promise<string | null> {
  try {
    const { runId } = await recordImportRun(input);
    return runId;
  } catch (err) {
    console.warn(
      `[import] audit record failed (apply outcome was '${input.status}'): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
}

/**
 * Record the assertions-blocked exit. Called by the CLI before exiting
 * when `prep.assertions.blocked === true` and the operator hasn't used
 * `--skip-assertions`. Also called by the high-level `runApply()` for
 * non-CLI callers (route, cron). Returns the new run id (or null on
 * audit-write failure).
 */
export async function recordAssertionsAbort(
  prep: ApplyPreparation,
  triggerSource: string,
  startedAt: Date,
  triggeredBy: string
): Promise<string | null> {
  return safeRecord({
    status: "aborted",
    abortReason: "assertions",
    metadata: prep.sheet,
    diff: prep.diff,
    assertions: prep.assertions,
    triggerSource,
    triggeredBy,
    startedAt,
    finishedAt: new Date(),
  });
}

/**
 * Execute the apply step against an already-prepared payload. Records the
 * outcome to `composer_import_runs`:
 *   - `success`              — RPC returned counts
 *   - `aborted` / threshold  — LargeChangeError thrown by the low-level apply
 *   - `failed`               — any other error from the RPC
 *
 * Throws `LargeChangeError` (from apply.ts) when the diff exceeds the
 * configured threshold and `confirmLargeChange` is not set. Other failures
 * propagate as-is. Does NOT re-check assertions — the caller is expected
 * to have inspected `prep.assertions` already.
 *
 * The thrown errors carry `runId` (populated after audit recording) so
 * the route can correlate the failure to its audit entry.
 */
export async function applyPrepared(
  prep: ApplyPreparation,
  options: {
    confirmLargeChange?: boolean;
    /** Free-form trigger label, e.g. "cli:apply --yes" or "route:apply". */
    triggerSource: string;
    /** "cli" for CLI invocations; user UUID for route invocations. */
    triggeredBy: string;
    /** Wall-clock start. Defaults to "now" if omitted. */
    startedAt?: Date;
  }
): Promise<{ applyResult: ApplyResult; runId: string | null }> {
  const startedAt = options.startedAt ?? new Date();
  const supabase = getServiceClient();

  // Override-empty-read guard. If we got here with `prep.assertions.blocked`
  // it means the caller already bypassed the assertion gate (CLI typed
  // OVERRIDE; route sent override_assertions: 'OVERRIDE'). In that case
  // a failure that prevented the sheet read (Tab exists, Headers present)
  // produces a diff of zeros — applying it would record a misleading
  // 'success' with all-zero counts. Fail loud instead. Catches the same
  // bug from both CLI and route, since both go through this function.
  if (prep.assertions.blocked) {
    const sheetRowsRead =
      prep.diff.unchanged +
      prep.diff.add.length +
      prep.diff.modify.length +
      prep.diff.skipped.length;
    if (sheetRowsRead === 0) {
      const failed = prep.assertions.results
        .filter((a) => !a.passed && a.severity === "block")
        .map((a) => a.name);
      const err = new OverrideEmptyReadError(failed);
      err.runId = await safeRecord({
        status: "failed",
        errorMessage: err.message,
        metadata: prep.sheet,
        diff: prep.diff,
        assertions: prep.assertions,
        triggerSource: options.triggerSource,
        triggeredBy: options.triggeredBy,
        startedAt,
        finishedAt: new Date(),
      });
      throw err;
    }
  }

  let applyResult: ApplyResult;
  try {
    applyResult = await runApplyLowLevel(
      supabase,
      prep.diff,
      prep.recordsToWrite,
      prep.db.active,
      { confirmLargeChange: options.confirmLargeChange }
    );
  } catch (err) {
    if (err instanceof LargeChangeError) {
      err.runId = await safeRecord({
        status: "aborted",
        abortReason: "threshold",
        errorMessage: err.message,
        metadata: prep.sheet,
        diff: prep.diff,
        assertions: prep.assertions,
        triggerSource: options.triggerSource,
        triggeredBy: options.triggeredBy,
        startedAt,
        finishedAt: new Date(),
      });
    } else {
      const runId = await safeRecord({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        metadata: prep.sheet,
        diff: prep.diff,
        assertions: prep.assertions,
        triggerSource: options.triggerSource,
        triggeredBy: options.triggeredBy,
        startedAt,
        finishedAt: new Date(),
      });
      // Attach for callers that want to surface the run id alongside
      // the error. `Error` doesn't have a runId field by default, so
      // we add it as an optional property.
      (err as Error & { runId?: string | null }).runId = runId;
    }
    throw err;
  }

  const runId = await safeRecord({
    status: "success",
    metadata: prep.sheet,
    diff: prep.diff,
    applyResult,
    assertions: prep.assertions,
    triggerSource: options.triggerSource,
    triggeredBy: options.triggeredBy,
    startedAt,
    finishedAt: new Date(),
  });

  return { applyResult, runId };
}

/**
 * End-to-end apply: dry-run → sanity assertions → atomic upsert. Records
 * to `composer_import_runs` at every exit (assertions block, threshold
 * abort, RPC failure, success).
 *
 * If any block-severity assertion fails, throws `AssertionsBlockedError`
 * unless the caller passes `skipAssertions: true`. If the diff exceeds
 * the change threshold, the underlying apply throws `LargeChangeError`
 * unless `confirmLargeChange: true` is passed.
 *
 * Convenience wrapper for non-CLI callers (route, cron). The CLI uses
 * `prepareApply()` + `applyPrepared()` so it can interleave the
 * confirmation prompt around the audit calls.
 */
export async function runApply(options: {
  confirmLargeChange?: boolean;
  skipAssertions?: boolean;
  /** Free-form trigger label, e.g. "route:apply". Required so audit rows are searchable. */
  triggerSource: string;
  /** "cli" or the operator's user UUID — required so audit rows are attributable. */
  triggeredBy: string;
}): Promise<ApplyRunResult> {
  const startedAt = new Date();
  const prep = await prepareApply();

  if (prep.assertions.blocked && !options.skipAssertions) {
    const runId = await recordAssertionsAbort(
      prep,
      options.triggerSource,
      startedAt,
      options.triggeredBy
    );
    const err = new AssertionsBlockedError(prep.assertions);
    err.runId = runId;
    throw err;
  }

  const { applyResult, runId } = await applyPrepared(prep, {
    confirmLargeChange: options.confirmLargeChange,
    triggerSource: options.triggerSource,
    triggeredBy: options.triggeredBy,
    startedAt,
  });

  return {
    sheet: prep.sheet,
    db: prep.db,
    diff: prep.diff,
    assertions: prep.assertions,
    applyResult,
    runId,
  };
}

// ─── Preflight (Phase 5a) ──────────────────────────────────────────────

export interface PreflightResult {
  sheet: SheetMetadata;
  db: { active: number; inactive: number; total: number };
}

/**
 * Lightweight identity check for the admin UI's first panel. Fetches
 * sheet metadata (title, modified time) and DB row counts but does NOT
 * read sheet rows or compute a diff — that's preview's job.
 *
 * Costs: 1 Sheets API call (spreadsheets.get for title), 1 Drive API
 * call (best-effort), 2 cheap COUNT queries against composer_venues_v2.
 */
export async function runPreflight(): Promise<PreflightResult> {
  // rowCount=0 / sampleNeighborhoods=[] — we haven't read rows yet, and
  // the preflight UI panel doesn't surface either field. Preview is
  // where row-level info appears.
  const sheetMeta = await fetchSheetMetadata(0, []);

  const supabase = getServiceClient();
  const [activeRes, inactiveRes] = await Promise.all([
    supabase
      .from("composer_venues_v2")
      .select("*", { count: "exact", head: true })
      .eq("active", true),
    supabase
      .from("composer_venues_v2")
      .select("*", { count: "exact", head: true })
      .eq("active", false),
  ]);

  if (activeRes.error) {
    throw new Error(`composer_venues_v2 active count failed: ${activeRes.error.message}`);
  }
  if (inactiveRes.error) {
    throw new Error(`composer_venues_v2 inactive count failed: ${inactiveRes.error.message}`);
  }

  const active = activeRes.count ?? 0;
  const inactive = inactiveRes.count ?? 0;
  return { sheet: sheetMeta, db: { active, inactive, total: active + inactive } };
}

// ─── Single-venue path (Phase 5a) ──────────────────────────────────────

export interface SingleVenueResult {
  found: boolean;
  /** "inserted" or "updated" — set only when `found: true`. */
  action?: "inserted" | "updated";
  /**
   * True if the upsert produced a real field-level change. False on a
   * forced no-op rewrite (existing DB row already matched the sheet).
   * Always true when `action === 'inserted'`. Set only when `found: true`.
   */
  changed?: boolean;
  /** Run id from the audit table. Set on found rows; null if audit failed. */
  runId?: string | null;
  /** Validation/skip reason or apply error. Set on `found: false` or RPC failure. */
  error?: string;
}

/**
 * Sync a single venue from the sheet into the database. Skips sanity
 * assertions and threshold guards by design — the operator targets one
 * row by ID, so the safety machinery built for full-sheet operations
 * doesn't apply.
 *
 * Records to `composer_import_runs` so single-venue runs show up in
 * history alongside full applies (distinguishable by `trigger_source`).
 */
export async function runApplySingleVenue(
  venueId: string,
  options: {
    triggeredBy: string;
    triggerSource: string;
  }
): Promise<SingleVenueResult> {
  const startedAt = new Date();

  const tabNames = await fetchTabNames();
  if (!tabNames.includes(VENUE_SHEET_TAB)) {
    return {
      found: false,
      error: `'${VENUE_SHEET_TAB}' tab not found in spreadsheet (tabs present: ${tabNames.map((t) => `'${t}'`).join(", ") || "(none)"})`,
    };
  }

  const { headers, rows } = await readSheetRows();
  const { records, skipped } = transformRows(headers, rows);

  const sheetRecord = records.find((r) => r.venue_id === venueId);
  if (!sheetRecord) {
    const skip = skipped.find((s) => s.venue_id === venueId);
    if (skip) {
      return {
        found: false,
        error: `row failed validation: ${skip.reason}`,
      };
    }
    return { found: false };
  }

  const supabase = getServiceClient();

  // Capture the before-image so the audit row's diff_payload carries
  // enough data for a future undo. Cheap single-row read.
  const cols = ["venue_id", ...ALL_WRITABLE_COLUMNS].filter(
    (c, i, a) => a.indexOf(c) === i
  );
  const { data: dbBefore, error: readErr } = await supabase
    .from("composer_venues_v2")
    .select(cols.join(","))
    .eq("venue_id", venueId)
    .maybeSingle();
  if (readErr) {
    return { found: false, error: `db read failed: ${readErr.message}` };
  }

  // Build a one-venue diff so audit counts and diff_payload reflect the
  // actual semantic change (or no-change). We always RPC regardless —
  // single-venue is "force this row's sheet data into the DB".
  const dbAsRow = dbBefore as Record<string, VenueCellValue> | null;
  const diff = computeDiff([sheetRecord], dbAsRow ? [dbAsRow] : []);
  const action: "inserted" | "updated" = dbAsRow ? "updated" : "inserted";
  // `changed` is the operator-facing signal: did this resync actually
  // alter the row, or was it a forced no-op rewrite? Inserts are always
  // a change; updates are only a change if the diff has a modify entry.
  const changed = action === "inserted" || diff.modify.length > 0;

  const sheetMeta = await fetchSheetMetadata(rows.length, []);
  const emptyAssertions: AssertionReport = { results: [], blocked: false };

  let applyResult: ApplyResult;
  try {
    applyResult = await callApplyRpc(supabase, [sheetRecord], []);
  } catch (err) {
    const runId = await safeRecord({
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
      metadata: sheetMeta,
      diff,
      assertions: emptyAssertions,
      triggerSource: options.triggerSource,
      triggeredBy: options.triggeredBy,
      startedAt,
      finishedAt: new Date(),
    });
    return {
      found: true,
      error: err instanceof Error ? err.message : String(err),
      runId,
    };
  }

  const runId = await safeRecord({
    status: "success",
    metadata: sheetMeta,
    diff,
    applyResult,
    assertions: emptyAssertions,
    triggerSource: options.triggerSource,
    triggeredBy: options.triggeredBy,
    startedAt,
    finishedAt: new Date(),
  });

  return { found: true, action, changed, runId };
}
