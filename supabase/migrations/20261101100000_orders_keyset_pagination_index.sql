-- Supports the tenant-scoped keyset page used by /admin/orders.
-- The partial predicate matches the list's deleted_at IS NULL filter.
CREATE INDEX IF NOT EXISTS idx_orders_company_created_at_id
  ON public.orders (company_id, created_at DESC NULLS LAST, id DESC)
  WHERE deleted_at IS NULL;

COMMENT ON INDEX public.idx_orders_company_created_at_id IS
  'Supports tenant-scoped keyset pagination for the admin orders list.';
