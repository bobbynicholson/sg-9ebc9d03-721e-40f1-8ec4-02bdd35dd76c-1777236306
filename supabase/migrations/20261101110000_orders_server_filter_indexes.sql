-- Keep server-side Orders filters selective as tenant histories grow.
-- pg_trgm allows the list's substring search to use indexes instead of
-- scanning every live order for the company.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_orders_company_status_created_id
  ON public.orders (company_id, status, created_at DESC NULLS LAST, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_company_event_date
  ON public.orders (company_id, event_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_company_client_created_id
  ON public.orders (company_id, client_id, created_at DESC NULLS LAST, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_company_region_created_id
  ON public.orders (company_id, region_id, created_at DESC NULLS LAST, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_company_chef_created_id
  ON public.orders (company_id, assigned_chef_id, created_at DESC NULLS LAST, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_company_driver_created_id
  ON public.orders (company_id, assigned_driver_id, created_at DESC NULLS LAST, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_order_amendments_pending_company_order
  ON public.order_amendment_requests (company_id, order_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_cancellations_pending_company_order
  ON public.cancellation_requests (company_id, order_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_orders_company_client_name_trgm
  ON public.orders USING GIN (client_name extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_company_number_trgm
  ON public.orders USING GIN (order_number extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_company_event_name_trgm
  ON public.orders USING GIN (event_name extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_company_venue_trgm
  ON public.orders USING GIN (venue_address extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;

COMMENT ON INDEX public.idx_orders_company_status_created_id IS
  'Supports company-scoped order pages filtered by lifecycle status.';
COMMENT ON INDEX public.idx_orders_company_event_date IS
  'Supports company-scoped event date filters on the Orders page.';
COMMENT ON INDEX public.idx_orders_company_client_created_id IS
  'Supports company-scoped orders for one client.';
COMMENT ON INDEX public.idx_orders_company_region_created_id IS
  'Supports company-scoped orders in one region.';
COMMENT ON INDEX public.idx_orders_company_chef_created_id IS
  'Supports the Mine only filter for chef-assigned orders.';
COMMENT ON INDEX public.idx_orders_company_driver_created_id IS
  'Supports the Mine only filter for driver-assigned orders.';
COMMENT ON INDEX public.idx_order_amendments_pending_company_order IS
  'Supports company-scoped pending amendment filters.';
COMMENT ON INDEX public.idx_cancellations_pending_company_order IS
  'Supports company-scoped pending cancellation filters.';
