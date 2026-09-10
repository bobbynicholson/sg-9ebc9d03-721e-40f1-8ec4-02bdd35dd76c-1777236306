-- Two partial unique indexes were both protecting
-- clients(company_id, lower(email)) WHERE deleted_at IS NULL:
--
--   idx_clients_company_email_unique  (lower(trim(email)))   -- earlier, stricter
--   uq_clients_company_lower_email    (lower(email))         -- later, redundant
--
-- The earlier one trims whitespace, so it's the stricter dedup
-- and the one we want to keep. Both fire on every clients
-- insert/update, so dropping the redundant one halves the
-- write cost on a write-hot tenant without any change in
-- uniqueness guarantees.
--
-- Safe DROP IF EXISTS so the migration is idempotent across
-- environments where one or both may already be missing.

DROP INDEX IF EXISTS public.uq_clients_company_lower_email;
