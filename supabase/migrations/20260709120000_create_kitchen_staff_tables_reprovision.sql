-- Reprovision safety: CREATE TABLE for the two core wage tables.
--
-- kitchen_staff_members and kitchen_staff_shifts have only ever been
-- ALTERed in this repo - no migration ever CREATEd them (they predate
-- the tracked migration history). That means the schema cannot be
-- rebuilt from scratch, which matters given the documented prod
-- wipe/restore history: a fresh Supabase project would have every
-- payroll ALTER fail on a missing table.
--
-- This migration reconstructs both tables from the LIVE schema (columns
-- + types + defaults verified via PostgREST introspection 2026-07-09).
-- Everything is IF NOT EXISTS / guarded, so on the existing prod DB
-- (where both tables already exist) this is a complete no-op. Its only
-- job is to make a from-zero reprovision possible.

-- ── kitchen_staff_members ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kitchen_staff_members (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  full_name                TEXT NOT NULL,
  role_title               TEXT,
  phone                    TEXT,
  email                    TEXT,
  hourly_rate              NUMERIC(10, 2),
  overtime_rate            NUMERIC(10, 2),
  standard_hours_per_day   NUMERIC(5, 2) NOT NULL DEFAULT 9,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  linked_profile_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at               TIMESTAMPTZ,
  pay_type                 TEXT NOT NULL DEFAULT 'hourly'
                             CHECK (pay_type IN ('hourly', 'monthly', 'shift')),
  monthly_salary           NUMERIC(10, 2),
  shift_rate               NUMERIC(10, 2),
  departments              TEXT[] NOT NULL DEFAULT ARRAY['kitchen']::text[],
  id_number                TEXT,
  start_date               DATE,
  emergency_contact_name   TEXT,
  emergency_contact_phone  TEXT,
  sunday_holiday_rate      NUMERIC(10, 2),
  weekly_ordinary_hours    NUMERIC(5, 2) NOT NULL DEFAULT 45,
  -- STA-C optional per-branch scope. Kept FK-less here so the
  -- reprovision doesn't depend on the regions table's create order;
  -- the live column is a plain uuid.
  region_id                UUID
);

-- ── kitchen_staff_shifts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kitchen_staff_shifts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  staff_member_id   UUID NOT NULL REFERENCES public.kitchen_staff_members(id) ON DELETE CASCADE,
  shift_start       TIMESTAMPTZ NOT NULL,
  shift_end         TIMESTAMPTZ,
  break_started_at  TIMESTAMPTZ,
  total_break_min   INTEGER NOT NULL DEFAULT 0,
  standard_min      INTEGER,
  overtime_min      INTEGER,
  clocked_in_by     UUID,
  clocked_out_by    UUID,
  manual_override   BOOLEAN NOT NULL DEFAULT false,
  override_reason   TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  department        TEXT NOT NULL DEFAULT 'kitchen',
  sunday_holiday_min INTEGER NOT NULL DEFAULT 0
);

-- ── Indexes (match the ALTER-era migrations) ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_kitchen_staff_members_departments
  ON public.kitchen_staff_members USING GIN (departments);
CREATE INDEX IF NOT EXISTS idx_kitchen_staff_members_company
  ON public.kitchen_staff_members (company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kitchen_staff_members_linked_profile
  ON public.kitchen_staff_members (linked_profile_id) WHERE linked_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kitchen_staff_shifts_department
  ON public.kitchen_staff_shifts (department);
CREATE INDEX IF NOT EXISTS idx_kitchen_staff_shifts_member_start
  ON public.kitchen_staff_shifts (staff_member_id, shift_start DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kitchen_staff_shifts_company_start
  ON public.kitchen_staff_shifts (company_id, shift_start DESC) WHERE deleted_at IS NULL;

-- ── updated_at triggers (idempotent) ─────────────────────────────────
DROP TRIGGER IF EXISTS kitchen_staff_members_updated_at ON public.kitchen_staff_members;
CREATE TRIGGER kitchen_staff_members_updated_at
  BEFORE UPDATE ON public.kitchen_staff_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS kitchen_staff_shifts_updated_at ON public.kitchen_staff_shifts;
CREATE TRIGGER kitchen_staff_shifts_updated_at
  BEFORE UPDATE ON public.kitchen_staff_shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS: company-scoped, matching the rest of the tenant tables ──────
ALTER TABLE public.kitchen_staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_staff_shifts  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kitchen_staff_members' AND policyname='kitchen_staff_members_company_access') THEN
    CREATE POLICY kitchen_staff_members_company_access
      ON public.kitchen_staff_members FOR ALL
      USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
      WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kitchen_staff_shifts' AND policyname='kitchen_staff_shifts_company_access') THEN
    CREATE POLICY kitchen_staff_shifts_company_access
      ON public.kitchen_staff_shifts FOR ALL
      USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
      WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  END IF;
END
$$;

COMMENT ON TABLE public.kitchen_staff_members IS
  'Company staff roster across departments (kitchen/cleaning/shopping/...). Carries pay model (pay_type + hourly_rate / monthly_salary / shift_rate) and BCEA caps. Backs /admin/staff, /admin/wages and settlement.';
COMMENT ON TABLE public.kitchen_staff_shifts IS
  'Manager-entered / clocked shift roster with BCEA minute splits (standard/overtime/sunday_holiday). Source of truth for the /admin/wages hours roll-up.';
