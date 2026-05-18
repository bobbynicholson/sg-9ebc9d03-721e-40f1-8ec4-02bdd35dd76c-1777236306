-- PR-B of the cashflow cost-mapping plan
-- (docs/audits/cashflow-cost-mapping-plan.md). order_items needs a
-- unit_cost snapshot column so historical profit-margin reports
-- don't move when the owner edits menu_items.cost_per_unit later.
-- The snapshot is populated at quote-accept (postCreationCascade)
-- + at amendment-apply (propagateQuoteEdit). Pre-existing rows
-- stay NULL; UI surfaces "cost unknown" for them.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS unit_cost numeric;

COMMENT ON COLUMN public.order_items.unit_cost IS
  'Per-unit COGS snapshot from menu_items.cost_per_unit at the moment the order_item row was created (quote-accept or amendment-apply). Drives the Profit Margin tile + per-order COGS panel + cashflow forecast COGS bucket. NULL for legacy rows that pre-date the snapshot.';
