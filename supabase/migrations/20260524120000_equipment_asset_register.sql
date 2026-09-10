-- EQP-B (equipment deferred, 2026-05-24): asset-register fields on
-- equipment. Pre-EQP-B the table treated equipment as catalogue
-- only (name + quantity + price). Real catering ops need:
--
--   supplier_of_record_id  - who we bought it from (FK to suppliers)
--   purchase_date          - when bought (drives age + depreciation)
--   purchase_cost          - original purchase rand value
--   serial_number          - asset tag / serial for insurance claims
--   expected_lifespan_years- vendor-stated or operator-estimated lifespan
--   insurance_policy_ref   - the policy line this asset is listed on
--
-- The catalogue UI stays primary; these fields live in an optional
-- "Asset register" drawer for the finance side. NULL on legacy rows
-- so the migration is safe to apply to live data.
--
-- replacement_cost already exists (line 3129 in generated types),
-- driving the buy-vs-rent recommendation engine; we keep that as
-- the "what would it cost to buy a new one TODAY" field.

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS supplier_of_record_id uuid
    REFERENCES public.suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS purchase_date date;

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS purchase_cost numeric(12, 2);

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS serial_number text;

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS expected_lifespan_years int;

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS insurance_policy_ref text;

CREATE INDEX IF NOT EXISTS idx_equipment_supplier_of_record
  ON public.equipment (supplier_of_record_id)
  WHERE supplier_of_record_id IS NOT NULL;

COMMENT ON COLUMN public.equipment.supplier_of_record_id IS
  'EQP-B: supplier we bought this asset from. Used for insurance claims and warranty look-up. Distinct from the day-of hire-in supplier.';
COMMENT ON COLUMN public.equipment.purchase_date IS
  'EQP-B: original purchase date. Drives age in years and depreciation calc.';
COMMENT ON COLUMN public.equipment.purchase_cost IS
  'EQP-B: original purchase cost in tenant currency. Distinct from replacement_cost which is today-value.';
COMMENT ON COLUMN public.equipment.serial_number IS
  'EQP-B: asset tag / serial. Insurance claims usually require this.';
COMMENT ON COLUMN public.equipment.expected_lifespan_years IS
  'EQP-B: expected useful life. Drives the "due for replacement" chip when purchase_date + lifespan is past.';
COMMENT ON COLUMN public.equipment.insurance_policy_ref IS
  'EQP-B: policy line reference. Free-text - tenants use varying policy formats.';
