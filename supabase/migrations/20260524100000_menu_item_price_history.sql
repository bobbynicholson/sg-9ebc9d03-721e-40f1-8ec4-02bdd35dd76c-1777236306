-- MNU-B (menu deferred, 2026-05-24): price-change history per menu
-- item. Drives the per-item sparkline in the edit dialog so the
-- operator can see "this item used to be R 65, went to R 75 in
-- March, now R 85" at a glance. Same intel pattern that wages page
-- uses for hourly-rate change history.
--
-- Schema:
--   menu_item_id    FK to menu_items
--   old_price       previous base_price
--   new_price       new base_price after the update
--   changed_at      when (defaults to now)
--   changed_by_user_id  auth.users.id of whoever flipped the price
--                       (NULL when the trigger fired without a user
--                       context, e.g. service-role migrations)
--   reason          optional free text for bulk-adjust callers
--
-- The trigger fires on UPDATE of base_price so any caller (UI, bulk
-- adjust, future imports) gets the row stamped automatically. The
-- bulk-adjust service ALSO writes the row explicitly so callers
-- without a database session still log under their actor.

CREATE TABLE IF NOT EXISTS public.menu_item_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  old_price numeric(10, 2),
  new_price numeric(10, 2) NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text
);

CREATE INDEX IF NOT EXISTS idx_menu_item_price_history_item
  ON public.menu_item_price_history (menu_item_id, changed_at DESC);

-- RLS: the same company that owns the menu item owns its history.
ALTER TABLE public.menu_item_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS menu_item_price_history_select ON public.menu_item_price_history;
CREATE POLICY menu_item_price_history_select
  ON public.menu_item_price_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.menu_items mi
      WHERE mi.id = menu_item_id
        AND mi.company_id = (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS menu_item_price_history_insert ON public.menu_item_price_history;
CREATE POLICY menu_item_price_history_insert
  ON public.menu_item_price_history
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.menu_items mi
      WHERE mi.id = menu_item_id
        AND mi.company_id = (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
    )
  );

-- Trigger: stamp a row on every base_price UPDATE. Only fires when
-- the price actually changed so a save that touches description
-- doesn't pollute the history.
CREATE OR REPLACE FUNCTION public.stamp_menu_item_price_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.base_price IS DISTINCT FROM OLD.base_price THEN
    INSERT INTO public.menu_item_price_history (
      menu_item_id, old_price, new_price, changed_by_user_id
    ) VALUES (
      NEW.id, OLD.base_price, NEW.base_price, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_item_price_change ON public.menu_items;
CREATE TRIGGER trg_menu_item_price_change
  AFTER UPDATE ON public.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_menu_item_price_change();

COMMENT ON TABLE public.menu_item_price_history IS
  'MNU-B: append-only price-change log per menu item. Populated by trigger on menu_items.base_price update + by explicit inserts from the bulk-adjust service.';
