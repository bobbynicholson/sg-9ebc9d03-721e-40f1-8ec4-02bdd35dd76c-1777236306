-- Inline dedup decisions on import_rows (phase 3a).
--
-- Up to now, dedup ran only at commit time and the decision was
-- hard-coded to "skip if email matches". The operator had no way to
-- say "this is a real update, push the new fields onto the existing
-- record" or "no, this is a fresh record, keep both".
--
-- Three new columns let preview stamp a match candidate, and let the
-- wizard offer the operator a decision per row before commit.
--
--   dedup_match_id     -- existing clients.id or leads.id we matched on
--   dedup_match_table  -- 'clients' | 'leads' | NULL
--   dedup_decision     -- 'skip' (default) | 'update' | 'create_new'
--
-- The commit pass reads dedup_decision and branches:
--   skip       -> current behaviour, mark row 'skipped'
--   update     -> UPDATE matched row with mapped_data, mark 'updated'
--   create_new -> bypass the existence check, insert anyway

ALTER TABLE public.import_rows
  ADD COLUMN IF NOT EXISTS dedup_match_id    UUID,
  ADD COLUMN IF NOT EXISTS dedup_match_table TEXT,
  ADD COLUMN IF NOT EXISTS dedup_decision    TEXT
    CHECK (dedup_decision IN ('skip', 'update', 'create_new'));

-- Quick lookup when the wizard fetches all rows with a match for the
-- "review duplicates" panel.
CREATE INDEX IF NOT EXISTS import_rows_dedup_match_idx
  ON public.import_rows (job_id, dedup_match_table)
  WHERE dedup_match_id IS NOT NULL;
