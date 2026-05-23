-- VEH-B (vehicles audit, VEH-1 + VEH-2): vehicle_type backfill + plate uniqueness.
--
-- VEH-1: rows have vehicle_type='car' but the /admin/vehicles dropdown only
-- offers 'sedan'. Result: opening the edit dialog showed the dropdown's
-- default option ('bakkie' in some cases), and clicking Save silently
-- overwrote the original value. Backfilling 'car' -> 'sedan' aligns the
-- data with the UI's canonical type list.
--
-- VEH-2: vehicles has zero unique constraint on plate. ORD-003831's owning
-- tenant (Spit Braai, 0e139a19-6526-4e1f-9bf7-87d6adbee5f8) had plate
-- 'CY435314' written twice - once as a soft-deleted driver-owned 'car' and
-- once as an active company-owned 'suv'. Without a unique index, dispatch
-- can route the wrong vehicle, the row labels become ambiguous, and the
-- driver-portal handover screen can render either. The partial unique index
-- enforces uniqueness only across non-deleted rows so soft-deletes don't
-- block future re-additions of the same plate.

-- 1. Backfill the legacy 'car' value to the canonical 'sedan'.
--    `car` is not a UI option, only `sedan` is.
UPDATE vehicles
SET vehicle_type = 'sedan'
WHERE vehicle_type = 'car';

-- 2. Partial unique index on active rows. Soft-deleted rows are excluded so
--    a plate can be re-used after the previous holder is archived.
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_company_plate_active_uniq
  ON vehicles (company_id, plate)
  WHERE deleted_at IS NULL;
