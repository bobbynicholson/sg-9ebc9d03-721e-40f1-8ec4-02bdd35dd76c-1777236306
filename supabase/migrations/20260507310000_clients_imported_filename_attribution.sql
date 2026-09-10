-- Source attribution per contact. clients.import_job_id already
-- pointers back to the job, but every place that wants to show
-- "imported from X.xlsx" needs to join. Stamping the filename on the
-- client row directly costs us a small amount of denormalisation in
-- exchange for cheap reads on every contact card.
--
-- Audit follow-up to the 2026-05 megaprogramme: client import
-- "Feature C" -- source attribution + rollback. Rollback already
-- ships at /api/imports/[id]/rollback; this is the attribution half.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS imported_filename text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS imported_filename text;

-- Backfill existing rows from their parent import_jobs so contacts
-- imported before this column existed get the same provenance chip.
UPDATE public.clients c
SET imported_filename = j.source_filename
FROM public.import_jobs j
WHERE c.import_job_id = j.id
  AND c.imported_filename IS NULL
  AND j.source_filename IS NOT NULL;

UPDATE public.leads l
SET imported_filename = j.source_filename
FROM public.import_jobs j
WHERE l.import_job_id = j.id
  AND l.imported_filename IS NULL
  AND j.source_filename IS NOT NULL;
