-- Phase 1 audit, finding 1.3: invoices.anon_read_invoice_by_token
-- and quotes.anon_read_quote_by_token had qual = `(deleted_at IS NULL)`
-- with no token check. Anon role could SELECT every row across every
-- tenant - a flat-out cross-tenant data leak. The policy names were
-- aspirational; the gating was never implemented.
--
-- No app code depends on direct anon SELECT against these tables:
--   - Client portal: service-role RPCs (client_view_order /
--     client_view_account) verify the token cookie before unlocking.
--   - Public quote flow: /api/public/quotes/[token]/* routes call
--     service-role with token verification first.
--   - Admin / staff: covered by company_access_invoices /
--     Users-can-view-quotes-from-their-company.
--
-- Drop both policies. See docs/security-posture.md section 1.3.

DROP POLICY IF EXISTS anon_read_invoice_by_token ON public.invoices;
DROP POLICY IF EXISTS anon_read_quote_by_token   ON public.quotes;
