-- HIR-B (hire-in deferred, 2026-05-24): plumbing for the hire-in
-- procurement loop. Three concerns wrapped into one migration:
--
-- 1. Schema honesty: equipment_hire_orders.supplier_name + .supplier_contact
--    are free text. Operators end up with "Coastal Hire" / "coastal hire"
--    / "Coastal Hire Co" all pointing at the same supplier. Add a
--    supplier_id FK so the row can be aggregated properly. Free text
--    columns stay as the display fallback for any unlinked row.
--
-- 2. Per-equipment preferred hire supplier. equipment.supplier_of_record_id
--    (added in EQP-B) is the supplier we BOUGHT the asset from. The
--    hire-in supplier is usually different - the rental shop down the
--    road, not the manufacturer. So we need a separate
--    equipment.preferred_hire_supplier_id that hire-in row creation
--    pulls from on insert.
--
-- 3. Payable reconciliation. Confirming a hire-in commits real money.
--    Link the equipment_hire_orders row to a supplier_payables row so
--    finance sees the upcoming bill the moment procurement confirms.
--    payable_id is nullable - drafts don't have one; confirmed rows
--    write one; reverting to draft / cancelling soft-deletes the
--    payable.
--
-- 4. Status enum honesty. equipment_hire_orders.status is plain text
--    with no CHECK. Trigger 20260519200000_orders_cascade references
--    'completed' which isn't a valid state. Tighten the enum to the
--    five real states (draft / confirmed / picked_up / returned /
--    cancelled). NOT VALID + VALIDATE so historic rows surface
--    explicitly if they hold a bad value.

-- ── 1. supplier_id FK on equipment_hire_orders ───────────────────
ALTER TABLE public.equipment_hire_orders
  ADD COLUMN IF NOT EXISTS supplier_id uuid
  REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_hire_orders_supplier_id
  ON public.equipment_hire_orders (supplier_id)
  WHERE supplier_id IS NOT NULL;

COMMENT ON COLUMN public.equipment_hire_orders.supplier_id IS
  'HIR-B: FK to suppliers. Replaces free-text supplier_name as the source of truth. Free text retained as display fallback for rows that pre-date the FK or where the supplier was not in the address book at create time.';

-- ── 2. preferred_hire_supplier_id on equipment ───────────────────
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS preferred_hire_supplier_id uuid
  REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_preferred_hire_supplier
  ON public.equipment (preferred_hire_supplier_id)
  WHERE preferred_hire_supplier_id IS NOT NULL;

COMMENT ON COLUMN public.equipment.preferred_hire_supplier_id IS
  'HIR-B: default supplier we rent this item from when stock runs short. Distinct from supplier_of_record_id (who we BOUGHT the asset from). Used to auto-prefill equipment_hire_orders.supplier_id on insert.';

-- ── 3. payable_id link on equipment_hire_orders ──────────────────
ALTER TABLE public.equipment_hire_orders
  ADD COLUMN IF NOT EXISTS payable_id uuid
  REFERENCES public.supplier_payables(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_hire_orders_payable_id
  ON public.equipment_hire_orders (payable_id)
  WHERE payable_id IS NOT NULL;

COMMENT ON COLUMN public.equipment_hire_orders.payable_id IS
  'HIR-B: FK to supplier_payables row created on Confirm. NULL on drafts. Lets finance see the upcoming bill the moment procurement commits. Set NULL again when the hire is cancelled or reverted to draft.';

-- ── 4. status CHECK constraint ───────────────────────────────────
-- First clean up any historic rows whose status doesn't match. The
-- earlier cascade trigger sometimes wrote 'completed' which has no
-- meaning here; rewrite those to 'returned' (the closest matching
-- terminal state for a hire).
UPDATE public.equipment_hire_orders
  SET status = 'returned'
  WHERE status = 'completed';

UPDATE public.equipment_hire_orders
  SET status = 'draft'
  WHERE status NOT IN ('draft', 'confirmed', 'picked_up', 'returned', 'cancelled');

ALTER TABLE public.equipment_hire_orders
  DROP CONSTRAINT IF EXISTS equipment_hire_orders_status_chk;

ALTER TABLE public.equipment_hire_orders
  ADD CONSTRAINT equipment_hire_orders_status_chk
  CHECK (status IN ('draft', 'confirmed', 'picked_up', 'returned', 'cancelled'));

-- ── 5. Inherit defaults trigger on insert ────────────────────────
-- HIR-B: on insert, if supplier_id is NULL but equipment_id has a
-- preferred_hire_supplier_id, fill it in. Same for hire_in_cost_per_unit
-- defaulting to equipment.hire_in_cost. Operator can still override
-- via the edit dialog - this just kills the "all 9 rows have no
-- supplier and one has R 0" reality every fresh tenant hits.
CREATE OR REPLACE FUNCTION public.equipment_hire_orders_inherit_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_pref_supplier uuid;
  v_supp_name text;
  v_hire_cost numeric;
BEGIN
  IF NEW.equipment_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT preferred_hire_supplier_id, hire_in_cost
    INTO v_pref_supplier, v_hire_cost
    FROM public.equipment WHERE id = NEW.equipment_id;

  IF NEW.supplier_id IS NULL AND v_pref_supplier IS NOT NULL THEN
    NEW.supplier_id := v_pref_supplier;
    SELECT name INTO v_supp_name FROM public.suppliers WHERE id = v_pref_supplier;
    IF v_supp_name IS NOT NULL AND (NEW.supplier_name IS NULL OR NEW.supplier_name = '') THEN
      NEW.supplier_name := v_supp_name;
    END IF;
  END IF;

  IF (NEW.hire_in_cost_per_unit IS NULL OR NEW.hire_in_cost_per_unit = 0)
     AND v_hire_cost IS NOT NULL AND v_hire_cost > 0 THEN
    NEW.hire_in_cost_per_unit := v_hire_cost;
    NEW.total_cost := COALESCE(NEW.quantity, 1) * v_hire_cost;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_equipment_hire_orders_inherit_defaults ON public.equipment_hire_orders;
CREATE TRIGGER trg_equipment_hire_orders_inherit_defaults
  BEFORE INSERT ON public.equipment_hire_orders
  FOR EACH ROW EXECUTE FUNCTION public.equipment_hire_orders_inherit_defaults();

-- ── 6. Stale-draft sweeper ───────────────────────────────────────
-- HIR-B: orders that get cancelled or completed leave their hire-in
-- drafts orphaned. Auto-cancel drafts whose parent order is in a
-- terminal state and whose expected pickup is in the past. Run as
-- a scheduled function via pg_cron when wired; for now the function
-- is callable by hand from /admin (or by the cron worker when set
-- up). Audit-logged so the operator can see what swept.
CREATE OR REPLACE FUNCTION public.sweep_stale_hire_drafts()
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int := 0;
BEGIN
  WITH stale AS (
    SELECT h.id, h.company_id
    FROM public.equipment_hire_orders h
    LEFT JOIN public.orders o ON o.id = h.order_id
    WHERE h.status = 'draft'
      AND h.expected_pickup_date IS NOT NULL
      AND h.expected_pickup_date < current_date
      AND (
        o.id IS NULL  -- orphaned (parent deleted)
        OR o.status IN ('completed', 'cancelled', 'declined')
        OR o.deleted_at IS NOT NULL
      )
  ),
  upd AS (
    UPDATE public.equipment_hire_orders h
       SET status = 'cancelled',
           updated_at = now(),
           supplier_notes = COALESCE(supplier_notes, '') || E'\n[auto-cancelled by stale-draft sweeper on ' || to_char(current_timestamp, 'YYYY-MM-DD HH24:MI') || ']'
      FROM stale
     WHERE h.id = stale.id
    RETURNING h.id, h.company_id
  ),
  audit AS (
    INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, details)
    SELECT company_id, NULL, 'hire_in_auto_cancelled', 'equipment_hire_order', id,
           jsonb_build_object('reason', 'stale_draft_sweeper')
    FROM upd
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM audit;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.sweep_stale_hire_drafts() IS
  'HIR-B: cancel Draft hire-in orders whose parent order is terminal/deleted AND whose pickup date has passed. Writes an audit row per cancellation. Designed for pg_cron daily; can be called by hand.';
