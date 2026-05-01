// Canonical TypeScript module for venue import.
//
// Phase 1: dry-run only (read-only diff). The apply path lands in Phase 2,
// deactivation in Phase 3, audit log in Phase 4.
//
// Composition:
//   sheet.ts       → reads Google Sheet rows + identity
//   transform.ts   → row → VenueRecord with strict validation
//   diff.ts        → semantic diff against current DB rows
//   columns.ts     → single source of truth for column inventory + types
//
// The legacy paths (scripts/import_venues_v2.py and the
// /api/admin/sync-venues route) remain operational and untouched. They
// will be removed once Phase 2 and Phase 3 ship.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  ALL_WRITABLE_COLUMNS,
} from "./columns";
import { fetchSheetMetadata, readSheetRows } from "./sheet";
import { transformRows } from "./transform";
import { computeDiff } from "./diff";
import type {
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

// ─── Supabase service-role client ──────────────────────────────────────
// Importer always uses service-role: it operates outside any user session,
// reads/writes the venues table directly, and runs in CLI / cron contexts.
// Mirrors getServiceSupabase() in src/lib/supabase.ts but reads env vars
// inline — this module needs to work from a CLI without next.js bootstrap.

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
 * therefore not selected — we only pull what diff.ts will actually read.
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

// ─── Public entry point ────────────────────────────────────────────────

/**
 * Read the sheet, validate rows, fetch current DB state, and compute the
 * semantic diff. Pure read-only — no DB writes anywhere in this path.
 */
export async function runDryRun(): Promise<DryRunResult> {
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
    sheet: sheetMeta,
    db: {
      active: dbActive,
      inactive: dbInactive,
      total: dbVenues.length,
    },
    diff,
  };
}
