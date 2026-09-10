-- Client-facing order notifications were silently dropped.
--
-- Root cause: sendStatusNotifications() resolves the customer's auth uid
-- from orders.client_id -> clients.user_id (orders.user_id is the ADMIN
-- creator, not the client). That lookup reads the `clients` table with
-- the caller's own Supabase client. When a STAFF member (kitchen/admin)
-- flips an order's status from the browser, their session can INSERT
-- notifications (so the driver/admin pushes land) but canNOT SELECT the
-- RLS-protected `clients` table, so resolveClientUserId() returns null
-- and every client-facing in-app push is skipped. The customer hears
-- nothing from confirmed -> delivered.
--
-- Fix: a SECURITY DEFINER resolver that returns clients.user_id for a
-- given client id, but ONLY to a caller who is entitled to it:
--   - the service role (auth.uid() is null), or
--   - a staff/admin member of that client's company, or
--   - the client themselves.
-- It exposes a single uuid (the auth link), never the client's PII, so
-- it is safe to grant to authenticated. Idempotent.

CREATE OR REPLACE FUNCTION public.resolve_client_user_id(p_client_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT c.user_id
  FROM public.clients c
  WHERE c.id = p_client_id
    AND (
      auth.uid() IS NULL
      OR c.company_id = public.get_user_company_id(auth.uid())
      OR c.user_id = auth.uid()
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_client_user_id(uuid) TO authenticated, service_role;
