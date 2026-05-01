-- Phase 3: orphan deactivation in the same atomic transaction as upsert.
--
-- The function gains a 6th parameter `p_deactivate_ids` (jsonb array of
-- venue_ids that the importer's diff identified as orphans) and a new
-- `deactivated` field in the return jsonb. Both upsert and deactivation
-- run inside the function's implicit transaction — partial failure rolls
-- the whole thing back, preventing the half-applied state that produced
-- the London-restaurants problem during the wipe-and-replace.
--
-- The Phase 2 5-parameter overload is dropped explicitly. Postgres treats
-- different argument lists as separate functions, so without the DROP we
-- would leave a dormant overload that any caller could accidentally
-- invoke (and which would silently skip deactivation).
--
-- Soft delete only — sets active=false, never removes rows. Image keys,
-- saved itineraries that reference the venue, and other downstream data
-- stay intact for safe reactivation if the venue returns to the sheet.
--
-- Same security note as Phase 2: the four text fragments come from typed
-- TS constants in src/lib/venues/columns.ts — never from user input,
-- never from sheet data. Dynamic SQL is safe ONLY under that invariant.

DROP FUNCTION IF EXISTS composer_apply_venue_import(text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION composer_apply_venue_import(
  p_columns text,             -- "venue_id, name, neighborhood, ..."
  p_set_clause text,          -- "name = EXCLUDED.name, resy_venue_id = COALESCE(EXCLUDED.resy_venue_id, composer_venues_v2.resy_venue_id), ..."
  p_select_list text,         -- "venue_id, name, neighborhood, ..." (matches the recordset column order)
  p_recordset_typedef text,   -- "venue_id text, name text, neighborhood text, ..."
  p_rows jsonb,               -- array of row objects to upsert
  p_deactivate_ids jsonb      -- array of venue_id strings to mark active=false
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
  v_deactivated int := 0;
  v_sql text;
BEGIN
  -- Reject non-array shapes early so callers get a clear error rather
  -- than a malformed dynamic SQL.
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array (got %)', jsonb_typeof(p_rows);
  END IF;
  IF p_deactivate_ids IS NULL OR jsonb_typeof(p_deactivate_ids) <> 'array' THEN
    RAISE EXCEPTION 'p_deactivate_ids must be a JSON array (got %)', jsonb_typeof(p_deactivate_ids);
  END IF;

  v_total := jsonb_array_length(p_rows);

  -- Upsert path (Phase 2 behavior, unchanged). Skip cleanly when there's
  -- nothing to write — supports deactivation-only applies.
  IF v_total > 0 THEN
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
  END IF;

  -- Deactivation path (Phase 3 — new). The `AND active = true` filter is
  -- defensive: it ensures `v_deactivated` reflects rows actually changed,
  -- not rows that were already inactive. The TS layer is supposed to send
  -- only active venue_ids (computeDiff filters on `active === true`), but
  -- the SQL doesn't trust that.
  IF jsonb_array_length(p_deactivate_ids) > 0 THEN
    UPDATE composer_venues_v2
       SET active = false
     WHERE venue_id IN (SELECT jsonb_array_elements_text(p_deactivate_ids))
       AND active = true;

    GET DIAGNOSTICS v_deactivated = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'inserted',    v_inserted,
    'updated',     v_updated,
    'total',       v_total,
    'deactivated', v_deactivated
  );
END;
$$;

REVOKE ALL ON FUNCTION composer_apply_venue_import(text, text, text, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION composer_apply_venue_import(text, text, text, text, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION composer_apply_venue_import(text, text, text, text, jsonb, jsonb) IS
  'Atomic upsert + soft-delete for venue importer. Called from src/lib/venues/apply.ts. The four text params are trusted because the caller builds them from typed constants in src/lib/venues/columns.ts.';
