-- Order amendment workflow.
--
-- Bobby's clarification (May 2026): orders are CONFIRMED at quote
-- acceptance (no "pending" review step), but clients still need a
-- way to request late changes -- adjusted guest count, swap a menu
-- item, change drop-off time -- up to a configurable cutoff before
-- the event date. The catering team approves or rejects each
-- request, and an approval triggers cascading updates across
-- kitchen prep, shopping list, inventory deductions and the invoice.
--
-- This migration lays the foundation:
--   - amendment_cutoff_days on companies (per-tenant setting,
--     default 3 days)
--   - order_amendment_requests table that captures every request,
--     its status, and the resulting diff of fields that changed
--   - helper RPC is_order_amendable(order_id) that returns true if
--     the order's event_date is still > now() + cutoff_days
--
-- Cascade behaviour (kitchen prep regen, shopping list refresh,
-- invoice diff) is implemented in application code -- this migration
-- only owns the data model.

-- 1. Per-tenant cutoff.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS amendment_cutoff_days INTEGER NOT NULL DEFAULT 3
    CHECK (amendment_cutoff_days >= 0 AND amendment_cutoff_days <= 30);

COMMENT ON COLUMN public.companies.amendment_cutoff_days IS
  'How many days before event_date the client can still request amendments. 0 = up to event day, 30 = aggressive lockdown. Default 3.';

-- 2. The request table.
CREATE TABLE IF NOT EXISTS public.order_amendment_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Who requested it. Either an authenticated client (auth.users.id)
  -- or NULL when the request came in via email / phone and was
  -- typed up by the catering team on behalf of the client.
  requested_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The proposed changes, as a structured diff. Keys mirror the
  -- orders columns the team allows clients to amend
  -- (guest_count, menu_items, equipment_items, special_instructions,
  -- delivery_time, venue_address). Values are the NEW desired
  -- values; the original is kept on the orders row until approval.
  proposed_changes JSONB NOT NULL,
  -- Free-text reason / context from the client.
  client_notes    TEXT,
  -- Lifecycle.
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'auto_rejected_late', 'cancelled_by_client')),
  reviewed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  review_notes    TEXT,
  -- Snapshot of the order fields BEFORE we applied the diff. Lets
  -- the admin UI show a clear before/after, and lets us roll back
  -- if approval was a mistake.
  applied_snapshot JSONB,
  applied_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS oar_order_idx
  ON public.order_amendment_requests (order_id);
CREATE INDEX IF NOT EXISTS oar_company_status_idx
  ON public.order_amendment_requests (company_id, status);

-- 3. RLS scoped to owning company.
ALTER TABLE public.order_amendment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY oar_company_select ON public.order_amendment_requests FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY oar_company_insert ON public.order_amendment_requests FOR INSERT
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
    -- Public client tokens can also insert; the API route gates that
    -- separately via service-role auth.
  );

CREATE POLICY oar_company_update ON public.order_amendment_requests FOR UPDATE
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- 4. Is this order still amendable? Returns true when:
--    - the order exists, is not cancelled / completed, and
--    - event_date is still in the future by more than the company's
--      amendment_cutoff_days.
CREATE OR REPLACE FUNCTION public.is_order_amendable(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.companies c ON c.id = o.company_id
    WHERE o.id = p_order_id
      AND o.deleted_at IS NULL
      AND o.status NOT IN ('cancelled', 'completed', 'delivered')
      AND o.event_date IS NOT NULL
      AND o.event_date > (CURRENT_DATE + (c.amendment_cutoff_days || ' days')::INTERVAL)::DATE
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_order_amendable(UUID)
  TO authenticated, service_role;
