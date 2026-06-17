-- Schema audit 2026-06-17: add columns the application code already reads/writes
-- but which were never added to this database. Without these the affected
-- queries 400 (PostgREST 42703 "column does not exist").
--
-- 1. accounting_integrations.metadata  (jsonb)
--    Sage/Xero/QB settings bag. Read in:
--      - api/accounting/sage/settings.ts (GET + save)
--      - api/accounting/sage/sync-invoice.ts
--      - api/accounting/sage/sync-payment.ts
--    Selecting it unconditionally 400'd, so Sage config could never load/save.
ALTER TABLE public.accounting_integrations
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. region_id on operational tables. The multi-region rollout added region_id
--    to orders/quotes/clients/leads/profiles/kitchen_prep_tasks/kitchen_staff_members
--    but missed these four, while the admin team hubs still filter them by
--    region_id when a region filter is active (then 400'd for multi-region
--    tenants). Add the column + backfill from the parent order/company so
--    existing rows stay visible under a region filter.
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.regions(id) ON DELETE SET NULL;
ALTER TABLE public.equipment_damages
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.regions(id) ON DELETE SET NULL;
ALTER TABLE public.kitchen_duty_shifts
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.regions(id) ON DELETE SET NULL;
ALTER TABLE public.cleaning_event_handovers
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.regions(id) ON DELETE SET NULL;

-- Backfill from the linked order's region where there is one.
UPDATE public.equipment_damages d
   SET region_id = o.region_id
  FROM public.orders o
 WHERE d.order_id = o.id
   AND d.region_id IS NULL
   AND o.region_id IS NOT NULL;

UPDATE public.kitchen_duty_shifts k
   SET region_id = o.region_id
  FROM public.orders o
 WHERE k.order_id = o.id
   AND k.region_id IS NULL
   AND o.region_id IS NOT NULL;

UPDATE public.cleaning_event_handovers h
   SET region_id = o.region_id
  FROM public.orders o
 WHERE h.order_id = o.id
   AND h.region_id IS NULL
   AND o.region_id IS NOT NULL;

-- For any rows still null (and all of equipment, which is company-wide stock),
-- default to the company's first region so single-region tenants keep working
-- and region-filtered views still show pre-existing data.
UPDATE public.equipment e
   SET region_id = (SELECT r.id FROM public.regions r WHERE r.company_id = e.company_id ORDER BY r.created_at LIMIT 1)
 WHERE e.region_id IS NULL;

UPDATE public.equipment_damages d
   SET region_id = (SELECT r.id FROM public.regions r WHERE r.company_id = d.company_id ORDER BY r.created_at LIMIT 1)
 WHERE d.region_id IS NULL;

UPDATE public.kitchen_duty_shifts k
   SET region_id = (SELECT r.id FROM public.regions r WHERE r.company_id = k.company_id ORDER BY r.created_at LIMIT 1)
 WHERE k.region_id IS NULL;

UPDATE public.cleaning_event_handovers h
   SET region_id = (SELECT r.id FROM public.regions r WHERE r.company_id = h.company_id ORDER BY r.created_at LIMIT 1)
 WHERE h.region_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_region ON public.equipment(region_id);
CREATE INDEX IF NOT EXISTS idx_equipment_damages_region ON public.equipment_damages(region_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_duty_shifts_region ON public.kitchen_duty_shifts(region_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_event_handovers_region ON public.cleaning_event_handovers(region_id);
