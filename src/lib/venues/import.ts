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
// Phase 3 will add orphan deactivation; Phase 4 the audit trail.
//
// The legacy paths (scripts/import_venues_v2.py and the
// /api/admin/sync-venues route) remain operational and untouched.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { ALL_NEIGHBORHOODS } from "@/config/generated/neighborhoods";

import { runApply as runApplyLowLevel } from "./apply";
import { runAssertions } from "./assertions";
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

async function loadAndDiff(): Promise<LoadResult> {
  const tabNames = await fetchTabNames();

  // Fail loud BEFORE attempting to read rows. A missing tab would
  // otherwise surface as an opaque "Unable to parse range" from the
  // Sheets API. Both dry-run and apply paths benefit — the operator
  // sees the actionable diagnostic either way.
  if (!tabNames.includes(VENUE_SHEET_TAB)) {
    const present = tabNames.length > 0
      ? tabNames.map((t) => `'${t}'`).join(", ")
      : "(none)";
    throw new Error(
      `'${VENUE_SHEET_TAB}' tab not found in spreadsheet. Tabs present: ${present}. Did you rename the tab? Update VENUE_SHEET_TAB in src/lib/venues/config.ts to match.`
    );
  }

  const { headers, rows } = await readSheetRows();
  const { records, skipped } = transformRows(headers, rows);

  const dbVenues = await fetchAllDbVenues();
  const dbActive = dbVenues.filter((v) => v.active === true).length;
  const dbInactive = dbVenues.length - dbActive;

  const sheetMeta = await fetchSheetMetadata(
    rows.length,
    sampleNeighborhoods(records)
  );

  const diff = computeDiff(records, dbVenues, skipped);

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
  const r = await loadAndDiff();

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
 * Execute the apply step against an already-prepared payload. Throws
 * `LargeChangeError` (from apply.ts) if the diff exceeds the threshold
 * and `confirmLargeChange` is not set. Does NOT re-check assertions —
 * the caller is expected to have inspected `prep.assertions` already.
 */
export async function applyPrepared(
  prep: ApplyPreparation,
  options: { confirmLargeChange?: boolean } = {}
): Promise<ApplyResult> {
  const supabase = getServiceClient();
  return runApplyLowLevel(
    supabase,
    prep.diff,
    prep.recordsToWrite,
    prep.db.active,
    { confirmLargeChange: options.confirmLargeChange }
  );
}

/**
 * End-to-end apply: dry-run → sanity assertions → atomic upsert.
 *
 * If any block-severity assertion fails, throws unless the caller passes
 * `skipAssertions: true`. If the diff exceeds the change threshold, the
 * underlying apply throws `LargeChangeError` unless `confirmLargeChange:
 * true` is passed.
 *
 * Convenience wrapper for non-CLI callers (route, cron). The CLI uses
 * `prepareApply()` + `applyPrepared()` so it can interleave the
 * confirmation prompt.
 */
export async function runApply(options: {
  confirmLargeChange?: boolean;
  skipAssertions?: boolean;
} = {}): Promise<ApplyRunResult> {
  const prep = await prepareApply();

  if (prep.assertions.blocked && !options.skipAssertions) {
    const failed = prep.assertions.results
      .filter((a) => !a.passed && a.severity === "block")
      .map((a) => `${a.name}: ${a.detail}`)
      .join("\n  ");
    throw new Error(
      `Apply blocked by failed sanity assertion(s):\n  ${failed}\n\nUse --skip-assertions to override (not recommended).`
    );
  }

  const applyResult = await applyPrepared(prep, {
    confirmLargeChange: options.confirmLargeChange,
  });

  return {
    sheet: prep.sheet,
    db: prep.db,
    diff: prep.diff,
    assertions: prep.assertions,
    applyResult,
  };
}
