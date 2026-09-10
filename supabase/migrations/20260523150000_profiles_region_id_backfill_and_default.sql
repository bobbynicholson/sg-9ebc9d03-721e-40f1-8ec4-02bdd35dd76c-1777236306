-- REG-C (branches staff-linkage): backfill profiles.region_id for staff
-- in single-region tenants + add a BEFORE-INSERT trigger that defaults
-- region_id on new profiles in the same situation.
--
-- Spit Braai (and any tenant with one region predating the multi-branch
-- feature) had 11 profiles with region_id IS NULL, so the Branches page
-- showed "Linked staff: 0" with no UI to fix it. For tenants with
-- exactly one active region, the linkage is unambiguous - every staff
-- profile belongs to that one branch. Backfilling is safe.
--
-- Roles excluded:
--   - 'client' (the customer portal user, not staff)
--   - 'super_admin' (cross-company access, not branch-scoped)
-- Everyone else (admin, company_admin, sales_admin, region_admin,
-- driver, kitchen_staff, cleaning_staff, shopping_staff, etc.) gets
-- the default.

-- 1. One-shot backfill. Only touches profiles where:
--    * region_id IS NULL
--    * company has exactly ONE region row
--    * role is not 'client' or 'super_admin'
-- Postgres has no MIN(uuid); HAVING COUNT(*)=1 guarantees exactly
-- one row per company so array_agg(id)[1] returns the right value.
WITH single_region_companies AS (
  SELECT company_id, (array_agg(id))[1] AS region_id
  FROM regions
  GROUP BY company_id
  HAVING COUNT(*) = 1
)
UPDATE profiles p
SET region_id = src.region_id
FROM single_region_companies src
WHERE p.company_id = src.company_id
  AND p.region_id IS NULL
  AND p.role NOT IN ('client', 'super_admin');

-- 2. BEFORE-INSERT trigger so new profiles in a single-region tenant
--    inherit the region automatically. Skips if the caller already set
--    region_id (multi-region tenants make their own choice via the
--    Branches "Assign staff" affordance or signup flow).
CREATE OR REPLACE FUNCTION public.default_profile_region_for_single_region_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  single_region UUID;
  region_count INT;
BEGIN
  -- Only fire when the caller didn't explicitly set region_id.
  IF NEW.region_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Client + super_admin never get auto-assigned to a region.
  IF NEW.role IN ('client', 'super_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO region_count FROM regions WHERE company_id = NEW.company_id;
  IF region_count = 1 THEN
    SELECT id INTO single_region FROM regions WHERE company_id = NEW.company_id LIMIT 1;
    NEW.region_id := single_region;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_profile_region ON profiles;
CREATE TRIGGER trg_default_profile_region
BEFORE INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION public.default_profile_region_for_single_region_tenant();

COMMENT ON FUNCTION public.default_profile_region_for_single_region_tenant() IS
  'REG-C: auto-default profiles.region_id on insert when the company has exactly one region. Skips client + super_admin + already-set rows.';
