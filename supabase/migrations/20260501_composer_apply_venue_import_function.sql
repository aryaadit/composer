-- Atomic upsert for the venue importer (Phase 2).
--
-- The TypeScript caller (src/lib/venues/apply.ts) builds the column list,
-- SET clause, SELECT list, and recordset typedef from the typed constants
-- in src/lib/venues/columns.ts and passes them as text parameters here.
-- This function then composes a single INSERT ... ON CONFLICT statement
-- via dynamic SQL and executes it inside the function's implicit
-- transaction.
--
-- All-or-nothing: if EXECUTE fails partway through, the function rolls
-- back. The legacy admin route batched in chunks of 100 with NO transaction
-- wrapper, leaving the DB in a half-applied state on failure. This
-- function is the fix.
--
-- Security note: the four text parameters are interpolated into dynamic
-- SQL via format() with %s. This is safe ONLY because the TS caller builds
-- them from typed constants — never from user input, never from the sheet,
-- never from anywhere a string could be injected. Do not relax this
-- without an explicit threat-model review.

CREATE OR REPLACE FUNCTION composer_apply_venue_import(
  p_columns text,             -- "venue_id, name, neighborhood, ..."
  p_set_clause text,          -- "name = EXCLUDED.name, resy_venue_id = COALESCE(EXCLUDED.resy_venue_id, composer_venues_v2.resy_venue_id), ..."
  p_select_list text,         -- "venue_id, name, neighborhood, ..." (matches the recordset column order)
  p_recordset_typedef text,   -- "venue_id text, name text, neighborhood text, ..."
  p_rows jsonb                -- array of row objects
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int := 0;
  v_existing_count int := 0;
  v_inserted int := 0;
  v_updated int := 0;
  v_sql text;
BEGIN
  -- Reject empty payloads early so callers get a clear error rather than
  -- a malformed dynamic SQL.
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array (got %)', jsonb_typeof(p_rows);
  END IF;

  v_total := jsonb_array_length(p_rows);
  IF v_total = 0 THEN
    RETURN jsonb_build_object('inserted', 0, 'updated', 0, 'total', 0);
  END IF;

  -- Compute insert/update split *before* the upsert so the counts reflect
  -- pre-state, not post-state. After the upsert, every venue_id in the
  -- payload exists in the table — we can no longer tell which were new.
  SELECT count(*) INTO v_existing_count
  FROM composer_venues_v2
  WHERE venue_id IN (
    SELECT (elem->>'venue_id')::text
    FROM jsonb_array_elements(p_rows) elem
  );

  v_updated  := v_existing_count;
  v_inserted := v_total - v_existing_count;

  v_sql := format(
    'INSERT INTO composer_venues_v2 (%s) ' ||
    'SELECT %s FROM jsonb_to_recordset($1) AS t(%s) ' ||
    'ON CONFLICT (venue_id) DO UPDATE SET %s',
    p_columns, p_select_list, p_recordset_typedef, p_set_clause
  );

  EXECUTE v_sql USING p_rows;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'updated',  v_updated,
    'total',    v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION composer_apply_venue_import(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION composer_apply_venue_import(text, text, text, text, jsonb) TO service_role;

COMMENT ON FUNCTION composer_apply_venue_import(text, text, text, text, jsonb) IS
  'Atomic upsert for venue importer. Called from src/lib/venues/apply.ts. The four text params are trusted because the caller builds them from typed constants in src/lib/venues/columns.ts.';
