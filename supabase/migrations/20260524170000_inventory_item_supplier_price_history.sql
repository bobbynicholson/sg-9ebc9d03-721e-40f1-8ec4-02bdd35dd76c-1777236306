-- SUP-D (suppliers price-creep, 2026-05-24): per-supplier per-item
-- price history table + capture trigger.
--
-- Why: caterers feel the squeeze when their meat supplier nudges
-- prices up 3% every month and nobody notices until margin is gone.
-- The current data shape (inventory_item_suppliers.unit_price as a
-- single mutable value) makes "prices rising" invisible.
--
-- Capture every change of unit_price on inventory_item_suppliers,
-- write a history row. Detail page + supplier list page can then
-- compute "median price rose X% in the last 90 days" and surface a
-- chip so the operator phones the supplier before margin erodes.

CREATE TABLE IF NOT EXISTS public.inventory_item_supplier_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  unit_price numeric NOT NULL,
  pack_size text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'edit',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_iisph_supplier_recorded
  ON public.inventory_item_supplier_price_history (supplier_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_iisph_item_recorded
  ON public.inventory_item_supplier_price_history (inventory_item_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_iisph_company_recorded
  ON public.inventory_item_supplier_price_history (company_id, recorded_at DESC);

COMMENT ON TABLE public.inventory_item_supplier_price_history IS
  'SUP-D: append-only history of unit_price changes on inventory_item_suppliers. Drives the per-supplier price-creep chip on /admin/suppliers and the detail page price-history widget.';

-- RLS: read scoped to caller's company, write scoped to insert-only
-- via the trigger. No direct UI write surface.
ALTER TABLE public.inventory_item_supplier_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_history_select_own_company ON public.inventory_item_supplier_price_history;
CREATE POLICY price_history_select_own_company
  ON public.inventory_item_supplier_price_history
  FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- ── Capture trigger ────────────────────────────────────────────────
-- Fires on INSERT and on UPDATE-of-unit_price. Writes a history row.
-- Idempotent: if the price is unchanged the trigger short-circuits.

CREATE OR REPLACE FUNCTION public.iisph_capture()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF NEW.unit_price IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.unit_price IS NOT DISTINCT FROM NEW.unit_price THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.inventory_item_supplier_price_history (
    company_id, supplier_id, inventory_item_id, unit_price, pack_size, source, user_id
  ) VALUES (
    NEW.company_id, NEW.supplier_id, NEW.inventory_item_id,
    NEW.unit_price, NEW.pack_size,
    CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'edit' END,
    v_user
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_iisph_capture ON public.inventory_item_suppliers;
CREATE TRIGGER trg_iisph_capture
  AFTER INSERT OR UPDATE OF unit_price ON public.inventory_item_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.iisph_capture();

-- ── Per-supplier creep summary RPC ─────────────────────────────────
-- Returns one row per supplier with the percentage delta between
-- their median price NOW (last 30 days) vs median price 60-90 days
-- ago. Items missing one or the other side of the comparison are
-- excluded. Returned shape is the source of the chip on the list
-- page so it stays one round-trip.

CREATE OR REPLACE FUNCTION public.supplier_price_creep_summary(p_company_id uuid)
RETURNS TABLE (
  supplier_id uuid,
  items_compared int,
  median_pct_change numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH recent AS (
    SELECT h.supplier_id, h.inventory_item_id,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY h.unit_price) AS price
      FROM public.inventory_item_supplier_price_history h
     WHERE h.company_id = p_company_id
       AND h.recorded_at >= now() - interval '30 days'
     GROUP BY h.supplier_id, h.inventory_item_id
  ),
  baseline AS (
    SELECT h.supplier_id, h.inventory_item_id,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY h.unit_price) AS price
      FROM public.inventory_item_supplier_price_history h
     WHERE h.company_id = p_company_id
       AND h.recorded_at < now() - interval '60 days'
       AND h.recorded_at >= now() - interval '120 days'
     GROUP BY h.supplier_id, h.inventory_item_id
  ),
  paired AS (
    SELECT r.supplier_id, r.inventory_item_id,
           ((r.price - b.price) / NULLIF(b.price, 0)) * 100.0 AS pct_change
      FROM recent r JOIN baseline b
        ON b.supplier_id = r.supplier_id
       AND b.inventory_item_id = r.inventory_item_id
     WHERE b.price > 0
  )
  SELECT supplier_id,
         COUNT(*)::int AS items_compared,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY pct_change) AS median_pct_change
    FROM paired
   GROUP BY supplier_id;
$$;

GRANT EXECUTE ON FUNCTION public.supplier_price_creep_summary(uuid) TO authenticated;

COMMENT ON FUNCTION public.supplier_price_creep_summary(uuid) IS
  'SUP-D: per-supplier median price-change percentage. Compares median price NOW (last 30d) vs baseline (60-120d ago) per item, returns the per-supplier median across items.';
