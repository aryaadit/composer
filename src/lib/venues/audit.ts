// Audit-trail writer + reader for the venue importer (Phase 4).
//
// `recordImportRun` is invoked by the apply orchestrator at every exit
// point — success, failure, threshold abort, assertions abort. Callers
// are expected to wrap it in their own try/catch: writing the audit must
// never block the apply path or mask the original error. See `safeRecord`
// in import.ts for the standard wrapper.
//
// `listRuns` and `getRun` power the CLI `history` and `show` subcommands.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  ApplyResult,
  AssertionReport,
  DiffPayload,
  DiffPayloadModification,
  ImportDiff,
  ImportRun,
  ImportRunAbortReason,
  ImportRunStatus,
  ImportRunSummary,
  SheetMetadata,
  VenueCellValue,
} from "./types";

// ─── Supabase service-role client ──────────────────────────────────────
// Mirrors the pattern in import.ts. Both modules need a service-role
// client for unattended CLI invocations; sharing through a third module
// would just be ceremony.

let _service: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (_service) return _service;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
  _service = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _service;
}

// ─── Diff payload assembly ─────────────────────────────────────────────

/**
 * Build the compact diff payload stored in `composer_import_runs.diff_payload`.
 * For modifications we keep only the changed-field before/after pair —
 * full rows would balloon the payload to many megabytes when most venues
 * change at once (e.g., wipe-and-replace).
 */
function buildDiffPayload(diff: ImportDiff): DiffPayload {
  const modify: DiffPayloadModification[] = diff.modify.map((m) => {
    const before: Record<string, VenueCellValue> = {};
    const after: Record<string, VenueCellValue> = {};
    for (const change of m.changedFields) {
      before[change.field] = change.before;
      after[change.field] = change.after;
    }
    return { venue_id: m.venue_id, before, after };
  });
  return {
    add: diff.add.map((v) => v.venue_id as string),
    modify,
    deactivate: diff.deactivate.map((d) => d.venue_id),
  };
}

// ─── Writer ────────────────────────────────────────────────────────────

/**
 * Input shape for `recordImportRun()`. Captures everything the audit
 * table needs across all four exit points (success / failed / aborted-
 * assertions / aborted-threshold). The function fills in derived fields
 * (counts, payload, duration) so callers don't repeat themselves.
 */
export interface RecordImportRunInput {
  status: ImportRunStatus;
  abortReason?: ImportRunAbortReason;
  errorMessage?: string;
  metadata: SheetMetadata;
  diff: ImportDiff;
  /** Present only when status === 'success'. */
  applyResult?: ApplyResult;
  assertions: AssertionReport;
  /** Free-form trigger label, e.g. "cli:apply --yes" or "route:admin". */
  triggerSource: string;
  /** Identity of the actor. "cli" today; user UUID once the route lands. */
  triggeredBy?: string;
  startedAt: Date;
  finishedAt: Date;
}

export interface RecordImportRunResult {
  runId: string;
}

export async function recordImportRun(
  input: RecordImportRunInput
): Promise<RecordImportRunResult> {
  const supabase = getServiceClient();

  const durationMs = input.finishedAt.getTime() - input.startedAt.getTime();

  const row = {
    started_at: input.startedAt.toISOString(),
    finished_at: input.finishedAt.toISOString(),
    duration_ms: durationMs,

    status: input.status,
    abort_reason: input.abortReason ?? null,
    error_message: input.errorMessage ?? null,

    sheet_id: input.metadata.spreadsheetId,
    sheet_title: input.metadata.title ?? null,
    sheet_modified_time: input.metadata.modifiedTime ?? null,

    triggered_by: input.triggeredBy ?? "cli",
    trigger_source: input.triggerSource,

    added_count: input.diff.add.length,
    modified_count: input.diff.modify.length,
    deactivated_count: input.diff.deactivate.length,
    unchanged_count: input.diff.unchanged,
    skipped_count: input.diff.skipped.length,

    diff_payload: buildDiffPayload(input.diff),
    assertions: input.assertions.results,
  };

  const { data, error } = await supabase
    .from("composer_import_runs")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    throw new Error(`composer_import_runs insert failed: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error("composer_import_runs insert returned no id");
  }
  return { runId: data.id as string };
}

// ─── Readers ───────────────────────────────────────────────────────────

export interface ListRunsOptions {
  /** Default 10. Capped server-side by the CLI to keep output bounded. */
  limit?: number;
  status?: ImportRunStatus;
  /** Inclusive lower bound on `started_at`. */
  since?: Date;
}

interface RunSummaryRow {
  id: string;
  started_at: string;
  status: ImportRunStatus;
  abort_reason: ImportRunAbortReason | null;
  error_message: string | null;
  added_count: number;
  modified_count: number;
  deactivated_count: number;
  duration_ms: number | null;
  sheet_title: string | null;
}

export async function listRuns(
  opts: ListRunsOptions = {}
): Promise<ImportRunSummary[]> {
  const supabase = getServiceClient();
  const limit = opts.limit ?? 10;

  let query = supabase
    .from("composer_import_runs")
    .select(
      "id, started_at, status, abort_reason, error_message, added_count, modified_count, deactivated_count, duration_ms, sheet_title"
    )
    .order("started_at", { ascending: false })
    .limit(limit);

  if (opts.status) query = query.eq("status", opts.status);
  if (opts.since) query = query.gte("started_at", opts.since.toISOString());

  const { data, error } = await query;
  if (error) {
    throw new Error(`composer_import_runs read failed: ${error.message}`);
  }
  return (data ?? []).map((r: RunSummaryRow) => ({
    id: r.id,
    startedAt: new Date(r.started_at),
    status: r.status,
    abortReason: r.abort_reason,
    errorMessage: r.error_message,
    added: r.added_count,
    modified: r.modified_count,
    deactivated: r.deactivated_count,
    durationMs: r.duration_ms,
    sheetTitle: r.sheet_title,
  }));
}

interface RunFullRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: ImportRunStatus;
  abort_reason: ImportRunAbortReason | null;
  error_message: string | null;
  sheet_id: string;
  sheet_title: string | null;
  sheet_modified_time: string | null;
  triggered_by: string;
  trigger_source: string | null;
  added_count: number;
  modified_count: number;
  deactivated_count: number;
  unchanged_count: number;
  skipped_count: number;
  diff_payload: DiffPayload | null;
  assertions: ImportRun["assertions"];
}

/**
 * Resolve a run by full UUID or short id. Short id = first 4 chars + "-"
 * + last 4 chars of the UUID's hex (with hyphens stripped), as rendered
 * by the `history` CLI output. Returns `null` when no match.
 *
 * For short-id lookup we fetch the most recent N rows and filter
 * client-side: PostgreSQL's `~~*` (ILIKE) operator does not exist for
 * the `uuid` type, and casting through PostgREST is awkward. The N=500
 * window covers months of operator-driven imports — old short ids that
 * fall off the window can still be resolved by passing the full UUID.
 */
const SHORT_ID_LOOKUP_WINDOW = 500;

export async function getRun(idOrShort: string): Promise<ImportRun | null> {
  const supabase = getServiceClient();

  const trimmed = idOrShort.trim();
  const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);

  if (isFullUuid) {
    const { data, error } = await supabase
      .from("composer_import_runs")
      .select("*")
      .eq("id", trimmed)
      .maybeSingle();
    if (error) {
      throw new Error(`composer_import_runs lookup failed: ${error.message}`);
    }
    return data ? hydrate(data as RunFullRow) : null;
  }

  const cleaned = trimmed.replace(/-/g, "").toLowerCase();
  if (cleaned.length !== 8 || !/^[0-9a-f]{8}$/.test(cleaned)) {
    throw new Error(
      `Invalid id "${idOrShort}". Expected full UUID or short id (4 hex chars + '-' + 4 hex chars).`
    );
  }
  const prefix = cleaned.slice(0, 4);
  const suffix = cleaned.slice(4);

  const { data, error } = await supabase
    .from("composer_import_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(SHORT_ID_LOOKUP_WINDOW);
  if (error) {
    throw new Error(`composer_import_runs lookup failed: ${error.message}`);
  }
  const rows = (data ?? []) as RunFullRow[];
  const matches = rows.filter((r) => {
    const c = r.id.replace(/-/g, "").toLowerCase();
    return c.startsWith(prefix) && c.endsWith(suffix);
  });
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(
      `Short id "${idOrShort}" matches ${matches.length} runs. Use the full UUID.`
    );
  }
  return hydrate(matches[0]);
}

function hydrate(r: RunFullRow): ImportRun {
  return {
    id: r.id,
    startedAt: new Date(r.started_at),
    finishedAt: r.finished_at ? new Date(r.finished_at) : null,
    durationMs: r.duration_ms,
    status: r.status,
    abortReason: r.abort_reason,
    errorMessage: r.error_message,
    sheetId: r.sheet_id,
    sheetTitle: r.sheet_title,
    sheetModifiedTime: r.sheet_modified_time
      ? new Date(r.sheet_modified_time)
      : null,
    triggeredBy: r.triggered_by,
    triggerSource: r.trigger_source,
    addedCount: r.added_count,
    modifiedCount: r.modified_count,
    deactivatedCount: r.deactivated_count,
    unchangedCount: r.unchanged_count,
    skippedCount: r.skipped_count,
    diffPayload: r.diff_payload,
    assertions: r.assertions,
  };
}



/**
 * Render a UUID as the short form used by the CLI history table:
 * first 4 hex chars + "-" + last 4 hex chars (hyphens stripped). Useful
 * for callers that want a display label without re-implementing.
 */
export function shortId(uuid: string): string {
  const cleaned = uuid.replace(/-/g, "").toLowerCase();
  if (cleaned.length < 8) return uuid;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(-4)}`;
}
