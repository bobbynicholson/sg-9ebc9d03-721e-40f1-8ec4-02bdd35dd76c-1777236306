-- Extend kitchen_staff_members so it can carry every staff member across
-- departments + every pay model. Naming kept to avoid breaking the
-- existing wages + duty + tile-board code paths that reference it.
ALTER TABLE public.kitchen_staff_members
  ADD COLUMN IF NOT EXISTS pay_type text NOT NULL DEFAULT 'hourly'
    CHECK (pay_type IN ('hourly','monthly','shift')),
  ADD COLUMN IF NOT EXISTS monthly_salary numeric(10,2),
  ADD COLUMN IF NOT EXISTS shift_rate numeric(10,2),
  ADD COLUMN IF NOT EXISTS departments text[] NOT NULL DEFAULT ARRAY['kitchen']::text[],
  ADD COLUMN IF NOT EXISTS id_number text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text;

UPDATE public.kitchen_staff_members
SET departments = ARRAY['kitchen']::text[]
WHERE departments IS NULL OR cardinality(departments) = 0;

COMMENT ON COLUMN public.kitchen_staff_members.pay_type IS
  'hourly = paid per clocked hour with overtime split | monthly = flat salary regardless of hours | shift = paid per shift completed';
COMMENT ON COLUMN public.kitchen_staff_members.departments IS
  'Which departments this staff member can be clocked into. Drives which duty boards they appear on. Default kitchen; can include cleaning, shopping, etc.';
COMMENT ON COLUMN public.kitchen_staff_members.id_number IS
  'SA ID or passport number for tax / UIF compliance.';

ALTER TABLE public.kitchen_staff_shifts
  ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'kitchen';

CREATE INDEX IF NOT EXISTS idx_kitchen_staff_shifts_department
  ON public.kitchen_staff_shifts (department);
CREATE INDEX IF NOT EXISTS idx_kitchen_staff_members_departments
  ON public.kitchen_staff_members USING GIN (departments);
