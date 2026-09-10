-- OUT-C (outsource providers deferred, 2026-05-24):
--
-- Six additions + two drops on outsource_providers driven by the
-- audit follow-up:
--
-- 1. region_id - multi-region tenants need to scope providers to a
--    region. Mirrors staff.region_id pattern (REG-D).
-- 2. vat_number - SARS-readiness, same column as suppliers got in
--    SUP-C.
-- 3. insurance_provider / insurance_policy_number / insurance_expiry -
--    Public Liability and similar cover. Photographers + security
--    providers especially need this on file. Drives an expiry chip
--    on the detail page (within 30d = rose, expired = red).
-- 4. certification_notes - free-text annotation for FAS / food
--    handling / first aid / health certificates.
--
-- 5. Drop service_radius_km - shipped unused; geographic radius is
--    too coarse for catering (region_id is the right axis).
--
-- linked_supplier_id stays (FK to suppliers, read on detail page).
-- linked_user_id stays - the outsource_assignments RLS policy
-- references it (lets a linked provider see their own assignments).
-- The audit thought this column was dead; it's not.
-- rating stays (read on detail, will be writable from the form).

ALTER TABLE public.outsource_providers
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.regions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS insurance_provider text,
  ADD COLUMN IF NOT EXISTS insurance_policy_number text,
  ADD COLUMN IF NOT EXISTS insurance_expiry date,
  ADD COLUMN IF NOT EXISTS certification_notes text;

CREATE INDEX IF NOT EXISTS idx_outsource_providers_region
  ON public.outsource_providers (region_id)
  WHERE region_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outsource_providers_insurance_expiry
  ON public.outsource_providers (insurance_expiry)
  WHERE insurance_expiry IS NOT NULL;

COMMENT ON COLUMN public.outsource_providers.region_id IS
  'OUT-C: optional region scope. Multi-region tenants filter the list to providers covering this region. Null = available everywhere.';
COMMENT ON COLUMN public.outsource_providers.vat_number IS
  'OUT-C: SARS VAT registration number. Optional - not every provider is VAT-registered.';
COMMENT ON COLUMN public.outsource_providers.insurance_provider IS
  'OUT-C: name of the insurer carrying Public Liability / professional indemnity cover.';
COMMENT ON COLUMN public.outsource_providers.insurance_policy_number IS
  'OUT-C: policy number on file. Helpful when filing a claim.';
COMMENT ON COLUMN public.outsource_providers.insurance_expiry IS
  'OUT-C: cover renewal date. Detail page chip turns amber within 30 days, rose when expired.';
COMMENT ON COLUMN public.outsource_providers.certification_notes IS
  'OUT-C: free-text annotation for FAS / food handling / first aid / health certifications - whatever the operator wants captured.';

-- service_radius_km is truly unused; no callsites, no policy refs.
ALTER TABLE public.outsource_providers DROP COLUMN IF EXISTS service_radius_km;
