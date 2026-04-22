-- Migrate composer_users.context from single text to text[].
-- Existing single values are wrapped into a single-element array.

BEGIN;

ALTER TABLE composer_users
  ADD COLUMN context_new text[] NOT NULL DEFAULT '{}';

UPDATE composer_users
SET context_new = CASE
  WHEN context IS NULL OR context = '' THEN '{}'::text[]
  ELSE ARRAY[context]
END;

ALTER TABLE composer_users DROP COLUMN context;
ALTER TABLE composer_users RENAME COLUMN context_new TO context;

COMMIT;
