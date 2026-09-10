-- 1. Partial unique index on clients(company_id, lower(email)).
--    Tenant-scoped email uniqueness prevents the "two client rows
--    for same person at same company" drift the magic-link relink
--    flow used to create. Partial because email is nullable for
--    walk-in clients added without contact details, and excludes
--    soft-deleted rows so a recreate-after-archive still works.
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_company_lower_email
  ON public.clients (company_id, lower(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

-- 2. ALTER VIEW won_then_cancelled_quotes SET (security_invoker=on)
--    so it respects the caller's RLS instead of the view owner's.
--    The other reporting views (inventory_demand_outlook,
--    order_ingredient_demand) and driver_shifts already have
--    security_invoker on; this was the last lagging view.
ALTER VIEW public.won_then_cancelled_quotes SET (security_invoker = on);
