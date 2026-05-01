-- Phase 4: audit trail for venue imports.
--
-- Captures every apply attempt — success, threshold-aborted, assertion-
-- aborted, and outright failure — with enough data to:
--   1. Answer "when did production data last refresh and what changed"
--   2. Investigate failure modes after the fact
--   3. (Future) Power an undo command via the diff_payload before-images
--
-- Operator-friendly [y/N] declines are NOT recorded — those are operator
-- choices, not system events.
--
-- The Phase 5 cutover (admin route → new module) will start populating
-- triggered_by with the operator's user UUID and trigger_source with
-- 'route:...'. Until then everything is 'cli'.

CREATE TABLE composer_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Timing
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms int,

  -- Outcome
  status        text NOT NULL CHECK (status IN ('success', 'failed', 'aborted')),
  abort_reason  text CHECK (abort_reason IS NULL OR abort_reason IN ('assertions', 'threshold')),
  error_message text,

  -- Source identity. Captured at run time so history survives sheet
  -- renames or sheet-ID swaps.
  sheet_id            text NOT NULL,
  sheet_title         text,
  sheet_modified_time timestamptz,

  -- Trigger. Phase 5 will write user UUIDs into triggered_by when the
  -- route invokes the importer; CLI invocations stay as 'cli'.
  triggered_by   text NOT NULL,
  trigger_source text,

  -- Counts (denormalized for fast list queries; full detail in diff_payload).
  added_count       int NOT NULL DEFAULT 0,
  modified_count    int NOT NULL DEFAULT 0,
  deactivated_count int NOT NULL DEFAULT 0,
  unchanged_count   int NOT NULL DEFAULT 0,
  skipped_count     int NOT NULL DEFAULT 0,

  -- Reversibility payload. Shape:
  --   {
  --     "add":        ["venue_id", ...],
  --     "modify":     [{"venue_id": "...", "before": {field: val}, "after": {field: val}}],
  --     "deactivate": ["venue_id", ...]
  --   }
  -- "before" only contains the previous values of changedFields, not
  -- full rows — keeps the payload bounded and is enough for an undo.
  diff_payload jsonb,

  -- Assertion results — AssertionReport.results serialized as-is.
  -- Critical for post-mortem on aborted/failed runs.
  assertions jsonb
);

CREATE INDEX composer_import_runs_started_at_idx
  ON composer_import_runs (started_at DESC);

-- Partial index keeps failure-investigation queries fast without bloating
-- the index for the common (success) case.
CREATE INDEX composer_import_runs_status_idx
  ON composer_import_runs (status)
  WHERE status <> 'success';

-- RLS on, no policies. Service-role bypasses RLS, so the importer can
-- write/read freely; everything else is locked out. Phase 5 may add a
-- policy for admin reads if the route exposes a history endpoint.
ALTER TABLE composer_import_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE composer_import_runs IS
  'Audit trail for venue imports. Written by src/lib/venues/audit.ts. RLS on, no policies — service-role-only access.';
