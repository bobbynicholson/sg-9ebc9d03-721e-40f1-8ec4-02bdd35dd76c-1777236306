# Cashflow cost-mapping plan

**Date:** 2026-05-18
**Status:** plan-then-execute, per Bobby's directive
**Driver:** Cashflow Forecast Card phases 1-4 shipped; this plan
closes the remaining cost-side gaps so the forecast counts
real COGS + real payables + real fixed costs.

## Strategic decision

Cost-per-ingredient was rejected. Per-menu-item cost is the right
granularity because:

1. **Single owner-touchpoint.** The owner already prices the sell
   side per menu item on /admin/menu (base_price). Adding a cost
   field next to it is one extra input on a form they already
   fill in, not a new workflow.

2. **Direct flow through quote -> invoice -> order.** Every
   order_items row references menu_item_id. Cashflow lookups
   become `JOIN menu_items ON menu_item_id` - no inventory_
   transactions aggregation, no per-ingredient rollup.

3. **Stable historical reports.** Snapshot cost onto order_items
   at quote-accept (new `unit_cost` column) so a later menu-cost
   edit doesn't retroactively change last quarter's profit
   margins.

4. **Honest profit-margin tile.** The `/admin/financial-dashboard`
   Profit Margin tile currently reads `null` because the
   inventory_transactions COGS pipeline never landed. Menu-item
   cost makes the tile produce real numbers immediately.

## Current state vs target state

### menu_items (already has the field)
- `cost_per_unit` numeric column EXISTS in the live schema.
- Today: **invisible in the UI**. /admin/menu doesn't render
  it, owners can't set it. Every row sits at the default 0 or
  NULL.
- Target: surface it in the menu builder, role-gate the cost
  column to owner / company_admin / admin (Skylight finance-
  visibility rule: kitchen / driver / shopping never see it),
  inline-edit alongside base_price.

### order_items (needs a snapshot column)
- Current columns: `menu_item_id, quantity, unit_price,
  line_total, item_name, description, special_instructions`.
- No `unit_cost`. Reading menu_items.cost_per_unit at report
  time would re-price history every time the owner tweaks
  menu cost.
- Target: add `unit_cost numeric NULL` snapshot column.
  Populated at quote-accept via the existing
  `acceptQuoteAtomic` flow that creates order_items from
  quote line items. Existing rows stay NULL; the UI shows
  "cost unknown" for orders that pre-date the column.

### suppliers / supplier_payables (no payables ledger exists)
- `suppliers` carries contact info + `payment_terms` (integer
  days). No outstanding-balance ledger.
- Without it, every supplier cash-out is invisible to the
  cashflow forecast until the owner manually types it into
  the Contingency input.
- Target: NEW `supplier_payables` table:
  ```sql
  id uuid PK
  company_id uuid NOT NULL REFERENCES companies
  supplier_id uuid REFERENCES suppliers
  amount_cents bigint NOT NULL
  due_date date NOT NULL
  invoice_ref text          -- supplier's invoice number
  notes text
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','disputed','written_off'))
  paid_at timestamptz
  paid_by uuid REFERENCES profiles
  created_at + updated_at + deleted_at
  ```
- Tenant-scoped RLS (same shape as cleaning_event_handovers).
- Cashflow integration: pending rows where due_date in window
  bucket onto their due_date as a same-day cash-out.

### fixed_costs (no recurring-costs table)
- Rent, software, vehicles - all currently uncaptured. The
  Contingency input is the only catch-all today and it doesn't
  scale (a tenant with 6 fixed costs wants line items, not a
  number).
- Target: NEW `fixed_costs` table:
  ```sql
  id uuid PK
  company_id uuid NOT NULL REFERENCES companies
  label text NOT NULL                 -- e.g. "Office rent"
  amount_cents bigint NOT NULL
  cadence text NOT NULL
    CHECK (cadence IN ('weekly','monthly','quarterly','annual'))
  next_due_date date NOT NULL
  active boolean NOT NULL DEFAULT true
  notes text
  created_at + updated_at + deleted_at
  ```
- Tenant-scoped RLS.
- Cashflow integration: walk the window; for each active row
  whose next_due_date falls inside, add the cost on that day
  and advance next_due_date in-memory by cadence to catch
  multiple periods inside a long horizon (90d for a weekly
  cost = up to ~13 hits).
- Source-of-truth advance: a daily cron walks fixed_costs and
  advances next_due_date when crossed in real time. Saves the
  forecast from drifting if the owner doesn't open the page
  for weeks.

## Chain reactions

Every action below must keep these surfaces honest. Each
arrow is a place where a tsc / runtime regression would tell
us we missed an integration point.

1. **Owner edits menu_items.cost_per_unit on /admin/menu**
   -> Existing quotes / order_items are NOT touched (snapshot
      preserves their accepted economics).
   -> Next quote built that references the item picks up the
      new cost when accepted.
   -> The /admin/menu UI shows a "margin: X%" badge next to
      each item (base_price - cost_per_unit) / base_price.

2. **Quote accepted -> order created**
   -> `acceptQuoteAtomic` (or whichever flow converts the
      quote) snapshots `menu_items.cost_per_unit` onto
      `order_items.unit_cost` for every line.
   -> The Order Details modal now surfaces a
      "Per-order COGS" + "Margin" panel for owner / admin
      roles (gated, never visible to kitchen / driver).
   -> The Cashflow Forecast Card subtracts unpaid-portion
      COGS on the event_date as a "Food COGS" bucket
      (PR-E below).

3. **Supplier invoice arrives -> payable row inserted**
   -> /admin/suppliers gains a "Payables" tab (new UI).
   -> Insert opens the cashflow door: forecast sees it on
      the next refresh.
   -> Cron `process-supplier-payable-reminders` (optional
      phase 2) emails the owner 3/1 days before due_date.

4. **Owner marks payable as paid**
   -> status -> 'paid', paid_at = now(), paid_by = userId.
   -> audit_logs row written
      (action='financial.supplier_payable.paid').
   -> Cashflow drops it from the next refresh.
   -> If linked to a shopping_lists row (when shopping
      becomes a payable on COD vs invoice), shopping list
      status flips.

5. **Owner adds a fixed_cost (e.g. "Office rent R12000 monthly,
   next due 2026-06-01")**
   -> Renders on /admin/settings (new "Fixed costs" tab).
   -> Cashflow forecast for the next horizon now subtracts
      R12k on 2026-06-01 + any later monthly recurrence
      that falls inside the window.
   -> Daily cron advances next_due_date once it passes.

6. **Cron crosses next_due_date**
   -> next_due_date := next_due_date + cadence.
   -> If active=false at the moment of cross, no advancement.
   -> Optional: audit_logs row for each advancement so the
      bookkeeper can reconcile.

7. **Profit margin tile reads real COGS**
   -> /admin/financial-dashboard Profit Margin tile changes
      from "No data yet" to a real percentage.
   -> Calculation: paid orders in last 90d ->
      SUM(line_total) - SUM(unit_cost * quantity).
   -> Owner-only.
   -> Honest about gaps: orders where unit_cost is NULL
      (pre-snapshot) are excluded from both numerator and
      denominator, with a "X orders missing cost data"
      tooltip surfacing the limitation.

## PRs in order

| PR  | Title                                                        | Risk | Migrates DB | Touches user flows |
|-----|--------------------------------------------------------------|------|-------------|--------------------|
| A   | Menu builder cost-per-unit field + margin badge              | Low  | No (column exists) | /admin/menu        |
| B   | order_items.unit_cost snapshot at quote-accept               | Med  | Yes (1 column)     | Quote accept chain |
| C   | supplier_payables table + /admin/suppliers payables tab      | Low  | Yes (1 table)      | /admin/suppliers   |
| D   | fixed_costs table + /admin/settings Fixed costs tab          | Low  | Yes (1 table)      | /admin/settings    |
| E   | Cashflow forecast counts COGS + payables + fixed_costs       | Med  | No                 | /admin/financial-dashboard |
| F   | Profit Margin tile uses real menu-item COGS                  | Low  | No                 | /admin/financial-dashboard |

Each PR ships its own tsc + check:status-filters round and
its own running-todo update. Browser-smoke not required for
A / C / D (new surfaces); needed for B (chain reaction on
the quote-accept hot path) and E (touches the daily-driver
financial dashboard).

## Visibility / role gates

Every cost-side surface honours the Skylight finance-
visibility rule:

- Owner / company_admin / admin: see costs everywhere.
- super_admin: sees cross-tenant for support.
- kitchen / shopping / driver / cleaning / client: NEVER
  see cost numbers, only the menu items / orders / shopping
  lists themselves.

The menu builder cost column hides for non-finance roles
(staff can still edit other menu_items fields). The order
modal "Per-order COGS / Margin" panel does not render at all
for staff roles. The Profit Margin tile, the payables tab,
the fixed_costs tab - all gated.

## Open scope (after PRs A-F)

- **Xero / QuickBooks bank-feed auto-update** stays deferred
  behind the Phase 2E OAuth token-refresh closure in the
  megaprogramme audit. Once that lands, a daily cron pulls
  the bank-feed balance and updates
  companies.cash_on_hand_cents with the same audit_logs row
  the manual edit writes.
- **Per-cost-category override input** (today's contingency
  is a single bucket): once supplier_payables + fixed_costs
  + COGS are flowing in, the owner can override each one
  independently. Defer until the data feeds prove stable.
- **Recipe-level scaling** (recipes are still wired, but
  cost-per-recipe doesn't feed cashflow today). If a tenant
  is using the recipe builder (Phase 6 already shipped),
  the recipe ingredients drive the menu-item cost. Wire
  later as an optional "Auto-cost from recipe" toggle on
  the menu builder.
