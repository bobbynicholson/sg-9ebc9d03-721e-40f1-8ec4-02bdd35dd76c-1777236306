-- 20260615120000_fix_equipment_damages_handovers_schema.sql
--
-- Ops audit (2026-06-15): the cleaning-portal damage + handover flows
-- (DamageFlagForm, DamageAnalytics, RecentDamagesStrip,
-- EquipmentVerificationPanel) and equipmentTrackingService were written
-- against a richer schema than was ever applied to prod. Every
-- reportDamage / resolveDamage / confirmHandoverReceipt call inserts or
-- updates columns that do not exist on equipment_damages /
-- equipment_handovers, so PostgREST rejects the write at runtime and the
-- cleaner's "Flag damage" button 500s. DamageAnalytics also reads
-- total_cost / quantity_damaged / damage_stage which simply weren't
-- there.
--
-- This migration brings both tables up to the schema the live code
-- expects. All ADD COLUMN statements use IF NOT EXISTS so this is safe
-- to re-run and safe if a partial migration was applied earlier (the
-- EquipmentVerificationPanel comment hints company_id was once intended).
--
-- Cost convention: equipment_damages.repair_cost (pre-existing) is the
-- actual repair spend; unit_cost / total_cost added here capture the
-- replacement-value impact the cleaner's form estimates from
-- equipment.replacement_cost * quantity. They are kept separate on
-- purpose. These are rand decimals (not integer cents) to match the
-- existing repair_cost / replacement_cost columns on these tables.

BEGIN;

-- ── equipment_damages ────────────────────────────────────────────────
ALTER TABLE public.equipment_damages
  ADD COLUMN IF NOT EXISTS quantity_damaged    integer       NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS damage_stage        text,
  ADD COLUMN IF NOT EXISTS unit_cost           numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost          numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS responsible_user_id uuid,
  ADD COLUMN IF NOT EXISTS responsible_name    text,
  ADD COLUMN IF NOT EXISTS description         text,
  ADD COLUMN IF NOT EXISTS photo_url           text,
  ADD COLUMN IF NOT EXISTS resolution_notes    text,
  ADD COLUMN IF NOT EXISTS resolved_at         timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by_user_id uuid;

-- Analytics (DamageAnalytics / getDamageCostBreakdown) scan by tenant +
-- date; getDamages orders by created_at. Index the hot path.
CREATE INDEX IF NOT EXISTS idx_equipment_damages_company_created
  ON public.equipment_damages (company_id, created_at DESC);

-- ── equipment_handovers ──────────────────────────────────────────────
-- equipment_id is genuinely fundamental (you must know which item is
-- being handed over); company_id lets the verification panel scope by
-- tenant instead of the broken order.user_id JS filter it used before.
ALTER TABLE public.equipment_handovers
  ADD COLUMN IF NOT EXISTS company_id          uuid,
  ADD COLUMN IF NOT EXISTS equipment_id        uuid,
  ADD COLUMN IF NOT EXISTS received_at         timestamptz,
  ADD COLUMN IF NOT EXISTS quantity_received   integer,
  ADD COLUMN IF NOT EXISTS discrepancy_noted   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discrepancy_reason  text;

-- FK to equipment so the equipment:equipment_id(...) embed resolves.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_handovers_equipment_id_fkey'
  ) THEN
    ALTER TABLE public.equipment_handovers
      ADD CONSTRAINT equipment_handovers_equipment_id_fkey
      FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_equipment_handovers_company_stage_received
  ON public.equipment_handovers (company_id, to_stage, received_at);

COMMIT;
