-- P1-10: enforce one client per (company, email) per tenant
--
-- Without this constraint, the embed form / Zapier inbound / manual
-- create paths can each independently insert a clients row for the
-- same email, leading to:
--   - duplicate clients in the CRM
--   - public quote tokens minted against the "wrong" duplicate
--   - magic-link login by email matching multiple rows
--   - reports double-counting revenue against the same end customer
--
-- Functional unique index on (company_id, lower(trim(email)))
-- excluding soft-deleted rows. Case-insensitive + whitespace-trim so
-- "Foo@bar.com" and " foo@bar.com " can't bypass.
--
-- Verified zero duplicates against live (vsuyzovzqtrngorpqnhy) before
-- creating the index. If new duplicates ever surface, the index would
-- block their insert and the application would surface the conflict
-- to the operator rather than silently fan out.

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_company_email_unique
  ON public.clients (company_id, lower(trim(email)))
  WHERE deleted_at IS NULL AND email IS NOT NULL;
