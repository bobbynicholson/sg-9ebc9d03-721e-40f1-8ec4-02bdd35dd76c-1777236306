-- Wave 67 Phase A: outsource provider foundation.
--
-- New concept: "outsource provider" = an external person/company we
-- engage PER ORDER to fulfil a specific service. Distinct from
-- suppliers (we buy standing goods from them) and from staff (they
-- have a portal account + are paid via payroll). Examples: on-site
-- chef cooking a spit braai at the venue, florist delivering flowers
-- the morning of, photographer, sound engineer, security guard.
--
-- Architecture:
--   outsource_providers      -- registry of who we work with
--   outsource_assignments    -- per-order row (one provider per fulfilment)
--   menu_items.fulfilment_type + default_outsource_provider_id
--     -- declare a menu item as outsourced so the quote builder auto-
--        assigns a provider when added.
--   user_role gains 'outsource' enum value so providers MAY (optional)
--     hold a magic-link or auth account. Most won't; admin actions on
--     their behalf via email/WhatsApp + a magic-token accept page.

-- ── 1. Enum value -- 'outsource' role ─────────────────────────────────────
-- ALTER TYPE...ADD VALUE can't run in a transaction with subsequent uses
-- of the enum, so commit this first. The value is harmless to add even
-- before any provider holds it.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'outsource';

-- ── 2. outsource_providers registry table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outsource_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  whatsapp_number text,
  -- What roles this provider can fulfil. Multi-role lets one entity
  -- be both a "florist" AND an "on_site_chef" if the same person
  -- offers multiple services. Free-text array (no enum) so tenants
  -- can coin their own roles -- 'sax_player', 'magician', etc.
  provider_roles text[] NOT NULL DEFAULT '{}',
  specialty text,
  service_radius_km numeric,
  -- Commercial defaults applied when an assignment row is created.
  -- rate_type: 'per_event' | 'per_hour' | 'per_guest' | 'quoted'.
  -- 'quoted' means cost is negotiated per booking and default_rate
  -- is just a guideline.
  default_rate_type text NOT NULL DEFAULT 'per_event'
    CHECK (default_rate_type IN ('per_event', 'per_hour', 'per_guest', 'quoted')),
  default_rate numeric,
  default_currency text NOT NULL DEFAULT 'ZAR',
  payment_terms_days integer,
  preferred_contact_channel text NOT NULL DEFAULT 'whatsapp'
    CHECK (preferred_contact_channel IN ('whatsapp', 'email', 'sms', 'phone')),
  notes text,
  rating numeric CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  -- Unified history: when this provider is also on the suppliers
  -- list (e.g. they sell hire flowers AND deliver them on the day),
  -- linked_supplier_id keeps both surfaces showing one entity.
  linked_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  -- Optional portal account. Most providers won't have one; admin
  -- communicates with them externally and accepts/declines on their
  -- behalf via the magic-link page in Phase D.
  linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outsource_providers_company
  ON public.outsource_providers (company_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_outsource_providers_active
  ON public.outsource_providers (company_id, is_active)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_outsource_providers_supplier_link
  ON public.outsource_providers (linked_supplier_id)
  WHERE linked_supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outsource_providers_user_link
  ON public.outsource_providers (linked_user_id)
  WHERE linked_user_id IS NOT NULL;

COMMENT ON TABLE public.outsource_providers IS
  'Wave 67 Phase A. External per-order service providers (on-site chefs, florists, photographers). Distinct from suppliers (procurement) and staff (payroll). Some have a linked auth user (portal account); most action via admin + magic-link.';

-- ── 3. outsource_assignments per-order row ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outsource_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.outsource_providers(id) ON DELETE RESTRICT,
  -- Optional tie to a specific order_items line so the cost lands
  -- against the right item on the invoice. NULL when the assignment
  -- is order-level (e.g. "security for the whole event").
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  service_description text NOT NULL,
  -- When they need to be on site / when we expect them to start.
  required_on_site_at timestamptz,
  scope_notes text,
  -- Status flow mirrors driver_assignments. 'requested' until they
  -- respond; 'accepted' or 'declined' once they do; 'cancelled' if
  -- the order cancels.
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'accepted', 'declined', 'en_route', 'on_site', 'completed', 'cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  decline_reason text,
  en_route_at timestamptz,
  on_site_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  -- Cost. quoted_cost is what we agreed to pay them; actual_cost is
  -- set only when invoice received and it differs (overtime,
  -- additional scope, etc).
  quoted_cost numeric NOT NULL,
  cost_currency text NOT NULL DEFAULT 'ZAR',
  rate_type text NOT NULL DEFAULT 'per_event'
    CHECK (rate_type IN ('per_event', 'per_hour', 'per_guest', 'quoted')),
  actual_cost numeric,
  invoice_received boolean NOT NULL DEFAULT false,
  invoice_paid boolean NOT NULL DEFAULT false,
  invoice_received_at timestamptz,
  invoice_paid_at timestamptz,
  -- Magic-link accept token. Provider clicks the link in the request
  -- email/WhatsApp -> /p/accept/[token] -> one-tap accept/decline.
  -- Expires after the event date.
  accept_token text UNIQUE,
  accept_token_expires_at timestamptz,
  -- Provenance + admin overrides.
  requested_by uuid REFERENCES public.profiles(id),
  manually_marked_accepted boolean NOT NULL DEFAULT false,
  manually_marked_by uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outsource_assignments_order
  ON public.outsource_assignments (order_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_outsource_assignments_provider_status
  ON public.outsource_assignments (provider_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_outsource_assignments_company_status
  ON public.outsource_assignments (company_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_outsource_assignments_token
  ON public.outsource_assignments (accept_token)
  WHERE accept_token IS NOT NULL;

COMMENT ON TABLE public.outsource_assignments IS
  'Wave 67 Phase A. Per-order outsource service assignment. Status flow: requested -> accepted/declined -> en_route -> on_site -> completed. Magic-link accept_token avoids requiring providers to hold a CateringMS account.';

-- ── 4. menu_items fulfilment columns ──────────────────────────────────────
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS fulfilment_type text NOT NULL DEFAULT 'in_house'
    CHECK (fulfilment_type IN ('in_house', 'outsourced', 'hybrid')),
  ADD COLUMN IF NOT EXISTS default_outsource_provider_id uuid REFERENCES public.outsource_providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outsource_unit_cost numeric,
  ADD COLUMN IF NOT EXISTS outsource_lead_hours integer;

COMMENT ON COLUMN public.menu_items.fulfilment_type IS
  'Wave 67 Phase A. in_house = we make/serve it. outsourced = external provider fulfils. hybrid = we make some, they do the rest (e.g. we provide salads, they cook the spit). Drives quote-line auto-assignment + kitchen ticket render.';
COMMENT ON COLUMN public.menu_items.default_outsource_provider_id IS
  'Wave 67 Phase A. When an outsourced menu item is added to a quote/order, this provider is the auto-suggested fulfilment party. Operator can override per-order.';
COMMENT ON COLUMN public.menu_items.outsource_unit_cost IS
  'Wave 67 Phase A. What we expect to pay the provider per unit of this item (per event, per hour, per guest -- matches the provider rate_type). Surfaces on quote builder so the operator sees margin live.';
COMMENT ON COLUMN public.menu_items.outsource_lead_hours IS
  'Wave 67 Phase A. Minimum notice the provider needs (e.g. 48h for a fine-dining chef). Drives the readiness chip + a soft block on quote acceptance inside the lead window.';

-- ── 5. RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.outsource_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outsource_assignments ENABLE ROW LEVEL SECURITY;

-- Providers: any non-client staff of the company can read; only
-- company_admin / admin / super_admin can write. Super admin reads all.
CREATE POLICY outsource_providers_select ON public.outsource_providers
  FOR SELECT TO authenticated
  USING (
    ((company_id IS NOT NULL) AND public.auth_user_is_company_staff(company_id))
    OR public.is_super_admin()
  );
CREATE POLICY outsource_providers_write ON public.outsource_providers
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (company_id = public.get_user_company_id((SELECT auth.uid())) AND public.is_company_admin((SELECT auth.uid())))
  )
  WITH CHECK (
    public.is_super_admin()
    OR (company_id = public.get_user_company_id((SELECT auth.uid())) AND public.is_company_admin((SELECT auth.uid())))
  );

-- Assignments: same shape as providers + the provider's linked_user_id
-- can read their own assignments when they hold a portal account.
CREATE POLICY outsource_assignments_select ON public.outsource_assignments
  FOR SELECT TO authenticated
  USING (
    ((company_id IS NOT NULL) AND public.auth_user_is_company_staff(company_id))
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.outsource_providers op
      WHERE op.id = outsource_assignments.provider_id
        AND op.linked_user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY outsource_assignments_write ON public.outsource_assignments
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (company_id = public.get_user_company_id((SELECT auth.uid())) AND public.is_company_admin((SELECT auth.uid())))
  )
  WITH CHECK (
    public.is_super_admin()
    OR (company_id = public.get_user_company_id((SELECT auth.uid())) AND public.is_company_admin((SELECT auth.uid())))
  );

-- ── 6. updated_at triggers ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._outsource_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_outsource_providers_updated_at ON public.outsource_providers;
CREATE TRIGGER trg_outsource_providers_updated_at
  BEFORE UPDATE ON public.outsource_providers
  FOR EACH ROW EXECUTE FUNCTION public._outsource_touch_updated_at();

DROP TRIGGER IF EXISTS trg_outsource_assignments_updated_at ON public.outsource_assignments;
CREATE TRIGGER trg_outsource_assignments_updated_at
  BEFORE UPDATE ON public.outsource_assignments
  FOR EACH ROW EXECUTE FUNCTION public._outsource_touch_updated_at();
