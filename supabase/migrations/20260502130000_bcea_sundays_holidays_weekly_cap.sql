-- BCEA-correct shift split:
--   Sundays + public holidays = 2x ALL hours (no daily/weekly cap)
--   Daily ordinary cap: 9 hours/day -> overtime at 1.5x
--   Weekly ordinary cap: 45 hours/week -> spillover hours become overtime

CREATE TABLE IF NOT EXISTS public.public_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  date date NOT NULL,
  name text NOT NULL,
  is_recurring boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, date)
);

ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_holidays_read_all" ON public.public_holidays;
CREATE POLICY "public_holidays_read_all" ON public.public_holidays
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_holidays_company_write" ON public.public_holidays;
CREATE POLICY "public_holidays_company_write" ON public.public_holidays
  FOR ALL TO authenticated
  USING (
    company_id IS NULL OR company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_public_holidays_date
  ON public.public_holidays (date);
CREATE INDEX IF NOT EXISTS idx_public_holidays_company
  ON public.public_holidays (company_id);

ALTER TABLE public.kitchen_staff_shifts
  ADD COLUMN IF NOT EXISTS sunday_holiday_min int NOT NULL DEFAULT 0;

ALTER TABLE public.kitchen_staff_members
  ADD COLUMN IF NOT EXISTS sunday_holiday_rate numeric(10,2),
  ADD COLUMN IF NOT EXISTS weekly_ordinary_hours numeric(5,2) NOT NULL DEFAULT 45;

COMMENT ON COLUMN public.kitchen_staff_members.sunday_holiday_rate IS
  'Explicit Sunday + public holiday rate. NULL = use hourly_rate * 2 (BCEA s16).';
COMMENT ON COLUMN public.kitchen_staff_members.weekly_ordinary_hours IS
  'BCEA weekly ordinary-hours cap. SA default 45h/week per s9. Anything above splits to overtime even if daily threshold not hit.';

INSERT INTO public.public_holidays (company_id, date, name, is_recurring, notes)
VALUES
  (NULL, '2026-01-01', 'New Year''s Day',           true, NULL),
  (NULL, '2026-03-21', 'Human Rights Day',           true, NULL),
  (NULL, '2026-04-03', 'Good Friday',                false, 'Date varies year to year'),
  (NULL, '2026-04-06', 'Family Day',                 false, 'Monday after Good Friday'),
  (NULL, '2026-04-27', 'Freedom Day',                true, NULL),
  (NULL, '2026-05-01', 'Workers'' Day',              true, NULL),
  (NULL, '2026-06-16', 'Youth Day',                  true, NULL),
  (NULL, '2026-08-09', 'National Women''s Day',      true, NULL),
  (NULL, '2026-08-10', 'National Women''s Day (observed)', false, '9 Aug 2026 is a Sunday -> Mon observed per Public Holidays Act'),
  (NULL, '2026-09-24', 'Heritage Day',               true, NULL),
  (NULL, '2026-12-16', 'Day of Reconciliation',      true, NULL),
  (NULL, '2026-12-25', 'Christmas Day',              true, NULL),
  (NULL, '2026-12-26', 'Day of Goodwill',            true, NULL),

  (NULL, '2027-01-01', 'New Year''s Day',           true, NULL),
  (NULL, '2027-03-21', 'Human Rights Day',           true, NULL),
  (NULL, '2027-03-22', 'Human Rights Day (observed)', false, '21 Mar 2027 is a Sunday -> Mon observed'),
  (NULL, '2027-03-26', 'Good Friday',                false, NULL),
  (NULL, '2027-03-29', 'Family Day',                 false, NULL),
  (NULL, '2027-04-27', 'Freedom Day',                true, NULL),
  (NULL, '2027-05-01', 'Workers'' Day',              true, NULL),
  (NULL, '2027-06-16', 'Youth Day',                  true, NULL),
  (NULL, '2027-08-09', 'National Women''s Day',      true, NULL),
  (NULL, '2027-09-24', 'Heritage Day',               true, NULL),
  (NULL, '2027-12-16', 'Day of Reconciliation',      true, NULL),
  (NULL, '2027-12-25', 'Christmas Day',              true, NULL),
  (NULL, '2027-12-27', 'Day of Goodwill (observed)', false, '26 Dec 2027 is a Sunday -> Mon observed')
ON CONFLICT (company_id, date) DO NOTHING;
