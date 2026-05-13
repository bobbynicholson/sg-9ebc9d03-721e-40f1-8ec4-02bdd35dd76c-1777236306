-- Soft-delete column for equipment. Audit (May 2026): deleteEquipment
-- was a hard DELETE which either tripped FK constraints from
-- equipment_bookings / equipment_damages / equipment_shortage_flags
-- or wiped the audit trail behind them. Switching to deleted_at
-- so the row stays referenceable while disappearing from active
-- catalog reads.
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS equipment_deleted_at_idx
  ON public.equipment(company_id) WHERE deleted_at IS NULL;
