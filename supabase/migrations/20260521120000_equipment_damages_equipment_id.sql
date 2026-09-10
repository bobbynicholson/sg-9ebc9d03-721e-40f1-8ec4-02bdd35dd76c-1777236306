-- Cleaning persona follow-up: the /team-portal/cleaning/damage form
-- has had an equipment dropdown for months that collects an
-- equipment_id but the table has no column to store it. The value is
-- silently dropped on every insert. Admins reviewing the damage
-- ledger see "damage / R200 / broken" with no link back to the
-- specific item, which means inventory shortage flags don't fire
-- and the kitchen can't see what they're missing.
--
-- Add the column. Nullable for backward compatibility - legacy rows
-- (and any future damage report where the cleaner can't identify
-- the specific item) keep working. FK to equipment(id) so the join
-- on the ledger UI is cheap, with ON DELETE SET NULL so an
-- equipment row that gets retired doesn't break historical
-- damage rows.
--
-- See docs/personas/cleaning.md section 5.1.

ALTER TABLE public.equipment_damages
  ADD COLUMN IF NOT EXISTS equipment_id uuid REFERENCES public.equipment(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_damages_equipment_id
  ON public.equipment_damages(equipment_id)
  WHERE equipment_id IS NOT NULL;

COMMENT ON COLUMN public.equipment_damages.equipment_id IS
  'Optional FK to equipment(id). Populated by the cleaning damage form''s equipment-picker. Nullable for legacy rows + reports where the specific item isn''t identifiable.';
