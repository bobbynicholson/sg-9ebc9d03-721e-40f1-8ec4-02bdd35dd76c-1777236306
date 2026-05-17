-- Wave 70.51a -- schema cleanup for the final cancellation cascade gaps.
--
-- Three discrete changes, all backwards-compatible:
--   1. shopping_list_items.source_order_id + removed_at -- so cancelled
--      orders can release their pending shopping items instead of
--      leaving operators to buy ingredients for events that aren't
--      happening (the highest direct wasted-spend leak after hire-in).
--   2. 'voided' added to invoice_status enum -- distinct from
--      'written_off' (which conflates "the order never happened" with
--      "bad debt" in the accountant's eye). Cancel cascade will use
--      'voided' going forward; 'written_off' stays for genuine
--      write-offs (debt forgiveness, etc.).
--   3. cancellation_category enum + CHECK on orders -- categorisation
--      was free text, no validation, allowing typos and ad-hoc values
--      to escape the API enum guard. Adds the enum at DB level so
--      reporting can group on a known set without parsing/normalising.

-- ── 1. shopping_list_items -- per-order linkage + soft-remove ───────
ALTER TABLE public.shopping_list_items
  ADD COLUMN IF NOT EXISTS source_order_id uuid
    REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_reason text;

COMMENT ON COLUMN public.shopping_list_items.source_order_id IS
  'Wave 70.51 -- order that this item was added for. NULL = added manually by the operator (the legacy default). Lets the cancel cascade soft-remove pending items when their parent order is cancelled, so we stop buying ingredients for events that no longer exist.';
COMMENT ON COLUMN public.shopping_list_items.removed_at IS
  'Wave 70.51 -- when set, this item was soft-removed from the shopping list (UI filters it out). Set automatically when source_order_id is cancelled. The row survives for audit / reorder reference.';
COMMENT ON COLUMN public.shopping_list_items.removed_reason IS
  'Wave 70.51 -- short tag for WHY it was removed (e.g. "order_cancelled"). Audit-friendly.';

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_source_order
  ON public.shopping_list_items(source_order_id) WHERE source_order_id IS NOT NULL;

-- ── 2. invoice_status += 'voided' ──────────────────────────────────
-- ALTER TYPE ... ADD VALUE is atomic + safe; old rows keep their
-- existing status. Wave 70.51b will switch the cascade write target
-- from 'written_off' to 'voided'.
DO $$ BEGIN
  ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'voided';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. cancellation_category enum + check ──────────────────────────
DO $$ BEGIN
  CREATE TYPE public.cancellation_category AS ENUM (
    'client_cancelled',
    'no_payment',
    'kitchen_capacity',
    'weather',
    'force_majeure',
    'venue_changed',
    'duplicate',
    'package_cancelled',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Backfill any pre-existing values that aren't in the enum to 'other'.
-- Pre-cascade: production has 2 rows, both 'client_cancelled' (verified
-- via MCP before migration). This UPDATE is idempotent on already-clean
-- rows.
UPDATE public.orders
SET cancellation_reason_category = 'other'
WHERE cancellation_reason_category IS NOT NULL
  AND cancellation_reason_category NOT IN (
    'client_cancelled', 'no_payment', 'kitchen_capacity',
    'weather', 'force_majeure', 'venue_changed', 'duplicate',
    'package_cancelled', 'other'
  );

-- Add a CHECK so future writes can't escape the enum. We keep the
-- column type as text rather than converting to the enum type --
-- preserves backwards compat with the existing API + service layer
-- that pass strings, and avoids a destructive column rewrite on a
-- live table.
DO $$ BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_cancellation_category_check
    CHECK (
      cancellation_reason_category IS NULL OR
      cancellation_reason_category IN (
        'client_cancelled', 'no_payment', 'kitchen_capacity',
        'weather', 'force_majeure', 'venue_changed', 'duplicate',
        'package_cancelled', 'other'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;

COMMENT ON CONSTRAINT orders_cancellation_category_check ON public.orders IS
  'Wave 70.51 -- restricts the freeform text column to a known set. The cancellation_category enum type is the canonical reference. Adding a value requires (a) ALTER TYPE cancellation_category ADD VALUE, (b) drop+recreate this constraint with the new value.';
