-- Phase 1.1 of the lead -> quote -> order -> client lifecycle refactor.
--
-- The conversion-pointer columns (leads.converted_to_client_id and
-- quotes.converted_to_order_id) exist but were declared as plain UUID
-- without foreign-key constraints -- so the moment we start populating
-- them, dangling pointers become possible. Add FKs + indexes now,
-- before any data flows through. Both columns are 100% NULL in
-- production today (the audit confirmed this), so adding the FK can't
-- violate existing rows.
--
-- ON DELETE SET NULL on both: if a client row is hard-deleted, the
-- pointer goes NULL rather than blocking the delete. Same for orders.

ALTER TABLE public.leads
  ADD CONSTRAINT leads_converted_to_client_id_fkey
  FOREIGN KEY (converted_to_client_id)
  REFERENCES public.clients(id)
  ON DELETE SET NULL;

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_converted_to_order_id_fkey
  FOREIGN KEY (converted_to_order_id)
  REFERENCES public.orders(id)
  ON DELETE SET NULL;

-- Indexes for the "find leads that became this client" /
-- "find quote that produced this order" lookup paths the new
-- /admin/clients + /admin/orders pages will use.
CREATE INDEX IF NOT EXISTS idx_leads_converted_to_client_id
  ON public.leads (converted_to_client_id)
  WHERE converted_to_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_converted_to_order_id
  ON public.quotes (converted_to_order_id)
  WHERE converted_to_order_id IS NOT NULL;

COMMENT ON COLUMN public.leads.converted_to_client_id IS
  'Set when a lead is promoted to a client (typically on quote acceptance). NULL means the lead has not yet been converted -- they are still a prospect.';

COMMENT ON COLUMN public.quotes.converted_to_order_id IS
  'Set when a quote is accepted and the resulting order is created. NULL means the quote has not yet produced an order.';
