-- client_access_tokens stores two flavours of token:
--   scope = 'order'  -> ties a public link to ONE order (order_id required)
--   scope = 'client' -> account-level magic link for a repeat customer
--                       (no order_id; the token grants browsing every
--                       order under client_email + company_id).
--
-- The column was originally declared NOT NULL when only 'order' scope
-- existed. Once mint_client_account_token landed it began inserting
-- order_id = NULL for 'client' rows, which works *until* the trigger
-- on order INSERT fires that mint inside trg_order_email -- the
-- 23502 NOT NULL violation rolls the whole accept-on-behalf
-- transaction back, leaving the operator with a generic "Accept
-- failed" toast and no order.
--
-- Drop the column-level NOT NULL and replace it with a row-level
-- CHECK that requires order_id only when scope = 'order'. Same
-- semantic guarantee, no false positive on account tokens.

ALTER TABLE public.client_access_tokens
  ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE public.client_access_tokens
  ADD CONSTRAINT chk_client_access_tokens_order_required_for_order_scope
  CHECK (scope <> 'order' OR order_id IS NOT NULL);
