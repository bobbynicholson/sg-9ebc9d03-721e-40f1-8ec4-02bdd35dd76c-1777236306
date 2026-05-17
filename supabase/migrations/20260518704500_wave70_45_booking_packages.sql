-- Wave 70.45 -- Booking packages.
--
-- Bobby's brief: multi-day events (wedding setup Fri + function Sat
-- + strike Sun) are currently three independent orders. The kitchen
-- doesn't know they're related, the driver doesn't know the venue
-- is the same, the client gets three invoices, and the calendar
-- shows them as three unconnected blocks.
--
-- A booking_package is the parent container that groups orders into
-- one logical "event package". Each child order keeps its own
-- event_date / event_time / menu / equipment -- the package just
-- adds:
--   1. A shared label ("Smith Wedding")
--   2. A shared primary contact / client
--   3. A status (draft / active / completed / cancelled) that lets
--      one cancel cascade to every linked order
--   4. Optional shared notes
--
-- Each order gains a nullable package_id. NULL = standalone order
-- (the default and most common case). Set = part of a package.
--
-- UI lands in Wave 70.45b. This migration just creates the
-- foundation: table + FK + indexes + RLS.

-- ── 1. booking_packages table ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.booking_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Display label. Operator-set ("Smith Wedding"), shown everywhere
  -- the package surfaces (calendar, order lists, client portal).
  name text NOT NULL,

  -- Primary contact + client links. Inherited by child orders when
  -- the package is created from an existing order. Edit-friendly --
  -- changing on the package does NOT cascade to existing orders
  -- (operator may have intentionally diverged a child); the UI
  -- offers an explicit "apply to all" action when needed.
  primary_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  primary_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,

  -- Lifecycle. Mirrors the order status discipline so a package's
  -- effective state is at-a-glance:
  --   draft     -- planning, no events confirmed yet
  --   active    -- one or more child orders are confirmed/in flight
  --   completed -- every child order delivered or completed
  --   cancelled -- the whole package was cancelled (cascades)
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),

  -- Shared free-text notes -- internal only, never client-facing.
  notes text,

  -- Optional shared venue + date range. The child orders carry the
  -- authoritative per-event venue + date; these are just the
  -- package-level summary the calendar etc. show when displaying
  -- the package as a single block.
  venue_summary text,
  starts_at date,
  ends_at date,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Soft delete -- mirrors the orders / quotes pattern so the audit
  -- trail survives.
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_booking_packages_company_id
  ON public.booking_packages(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_booking_packages_status
  ON public.booking_packages(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_booking_packages_date_range
  ON public.booking_packages(company_id, starts_at, ends_at) WHERE deleted_at IS NULL;

-- ── 2. orders.package_id FK ──────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.booking_packages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_package_id
  ON public.orders(package_id) WHERE package_id IS NOT NULL;

-- ── 3. updated_at trigger ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_booking_package_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_packages_updated_at ON public.booking_packages;
CREATE TRIGGER trg_booking_packages_updated_at
  BEFORE UPDATE ON public.booking_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_booking_package_updated_at();

-- ── 4. RLS ───────────────────────────────────────────────────────────

ALTER TABLE public.booking_packages ENABLE ROW LEVEL SECURITY;

-- Tenant-scoped read: company members see their company's packages.
CREATE POLICY booking_packages_tenant_read ON public.booking_packages
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- Tenant-scoped insert: any company member with admin role can
-- create packages. Restricted further at the API layer.
CREATE POLICY booking_packages_tenant_insert ON public.booking_packages
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- Tenant-scoped update: same tenancy check.
CREATE POLICY booking_packages_tenant_update ON public.booking_packages
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- ── 5. Helpful comments ──────────────────────────────────────────────

COMMENT ON TABLE public.booking_packages IS
  'Wave 70.45 -- groups multiple orders into one logical event package (e.g. wedding setup Fri + function Sat + strike Sun). Each child order via orders.package_id FK.';
COMMENT ON COLUMN public.orders.package_id IS
  'Wave 70.45 -- when set, this order is part of a multi-event booking package. NULL = standalone (default).';
