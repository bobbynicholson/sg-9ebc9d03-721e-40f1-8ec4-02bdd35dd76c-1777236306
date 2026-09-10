-- Wave 39: cleaning_duty_logs was sitting on a 5-column skeleton
-- (id, company_id, on_duty, created_at, user_id) but the
-- equipmentTrackingService that writes to it expected 5 more
-- columns that nobody ever migrated:
--
--   duty_started_at
--   duty_ended_at
--   equipment_verified
--   equipment_verified_at
--   verification_notes
--
-- Every startCleaningDuty / endCleaningDuty / verifyEquipmentCount
-- call has been silently 42703-erroring since the service shipped.
-- The CleaningDutyWidget that consumes them was never even mounted
-- on the dashboard (Wave 39 wires that up too) so the failures
-- never surfaced.
--
-- Adding the columns now so the existing service code starts
-- working. Default for equipment_verified is FALSE so a new shift
-- starts un-verified.

ALTER TABLE public.cleaning_duty_logs
  ADD COLUMN IF NOT EXISTS duty_started_at         TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS duty_ended_at           TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS equipment_verified      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS equipment_verified_at   TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS verification_notes      TEXT;

-- Index for the "currently on duty" lookup the widget refreshes
-- every 30s.
CREATE INDEX IF NOT EXISTS cleaning_duty_logs_active_idx
  ON public.cleaning_duty_logs (company_id)
  WHERE on_duty = true;
