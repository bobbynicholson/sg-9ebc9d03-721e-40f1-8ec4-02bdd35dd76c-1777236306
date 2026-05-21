# Shopping persona - UX decisions

**Audit date:** 2026-05-21
**Auditor:** Phase 3d shopping sweep (Wave 80)
**Scope:** Shopping team portal (`src/pages/team-portal/shopping/**`) + admin shopping / payables / suppliers surfaces. Sibling docs: [`admin.md`](./admin.md), [`kitchen.md`](./kitchen.md), [`cleaning.md`](./cleaning.md).

---

## 1. Who shopping staff are

The procurement leg. One or two staff members responsible for keeping the kitchen stocked, the receipts captured, and the books square with what came in the door. A shopper's day:

1. Open the shopping dashboard, see today's active list.
2. Check the buy-list view for shortfalls + par-driven re-orders, bulk-add to the list.
3. Glance at kitchen demand (next 7/14/30 days) for the early-warning view.
4. Go shopping in the real world.
5. At checkout, scan supplier receipts via the in-portal scanner.
6. Reconcile each receipt line - maps to `purchase_receipts` (tax log) + `inventory_items` (stock bump).
7. Back at depot, mark items received; admin's payables ledger gets the supplier invoice.

Shoppers work mostly on a phone (in-store) and occasionally on the depot tablet. The receipt scanner is the highest-traffic surface.

---

## 2. Shopping team portal inventory (11 pages)

| Page | URL | Job-to-be-done | Status |
|---|---|---|---|
| `dashboard.tsx` | `/team-portal/shopping` | Active shopping list, tick items as bought, persists to DB | Primary |
| `buy-list.tsx` | `/team-portal/shopping/buy-list` | Canonical action surface - checkboxes + bulk-add | Primary |
| `kitchen-demand.tsx` | `/team-portal/shopping/kitchen-demand` | Raw demand from upcoming orders (7/14/30d) | Insight |
| `receipts.tsx` | `/team-portal/shopping/receipts` | Scan supplier receipts post-shopping | Primary |
| `inventory.tsx` | `/team-portal/shopping/inventory` | Stock levels + cost + history | Reference |
| `suppliers.tsx` | `/team-portal/shopping/suppliers` | Supplier contacts, rating, compose email | Reference |
| `orders.tsx` | `/team-portal/shopping/orders` | Orders requiring shopping, link to buy list | Peripheral |
| `invoices.tsx` | `/team-portal/shopping/invoices` | Shopping list history + receipts, filter by status | Reference |
| `notifications.tsx` | `/team-portal/shopping/notifications` | Inbox | Meta |
| `settings.tsx` | `/team-portal/shopping/settings` | Shopper prefs - receipt required, variance %, lead time | Config |
| `alerts.tsx` | `/team-portal/shopping/alerts` | **DEPRECATED redirect to /buy-list** (Phase 3d) | Stub |

---

## 3. Admin-side shopping surfaces (4 pages)

| Page | URL | Job-to-be-done | Status |
|---|---|---|---|
| `admin/shopping.tsx` | `/admin/shopping` | Smart shopping dashboard - 3 tabs (Buy now / Plan ahead / By supplier), per-supplier email compose | Live |
| `admin/payables.tsx` | `/admin/payables` | Supplier invoice ledger, add/mark-paid/disputed/written-off | Live |
| `admin/suppliers/index.tsx` | `/admin/suppliers` | All suppliers, rolling spend totals, one-click compose | Live |
| `admin/suppliers/[id].tsx` | `/admin/suppliers/:id` | Supplier detail - contact, purchase analytics, inventory_item_suppliers join, receipts filtered to supplier | Live |

---

## 4. Phase 3d changes

### 4.1 FIXED - canonical "Buy list" surface was orphaned from nav

`buy-list.tsx` is the canonical action-driven buy surface (Wave 70.30). The file header acknowledges that `alerts.tsx` was kept as a deprecated alias for back-compat. But the static-fallback mobile nav in `ShoppingNav.tsx` still pointed "Buy list" at `/alerts`, and the admin's "Build shopping list" CTA on `/admin/inventory` did the same. The canonical surface was effectively unreachable from any primary nav action - shoppers and admins both landed on the legacy passive table.

Changes:
- `src/components/navigation/ShoppingNav.tsx` mobile quick action "Buy list" now points at `/team-portal/shopping/buy-list`.
- `src/pages/admin/inventory.tsx` "Build shopping list" CTA repointed to `/team-portal/shopping/buy-list`.
- `src/pages/team-portal/shopping/alerts.tsx` collapsed from a 500-line passive table to a 15-line redirect stub. Existing bookmarks land at `/buy-list` within one render.

The full delete of the alerts file is queued for 60 days after this PR (once bookmark traffic to `/alerts` is effectively zero).

---

## 5. Day-of-procurement friction findings (follow-ups)

### 5.1 ~~Buy list doesn't refresh when kitchen adds to an order~~ - Done

Resolved in post-audit follow-up. `buy-list.tsx` now subscribes to a per-tenant `buy-list:${companyId}` realtime channel listening to all `order_items` changes, and re-fetches the demand outlook on any signal. A 60-second polled fallback covers the case where the realtime channel is mid-reconnect or the row mutated server-side without an emit (cron, bulk import).

### 5.2 Receipt reconciliation has no atomic "accept all"

`ReconcileSlipDrawer.tsx` requires line-by-line reconciliation of each scanned receipt line. If the drawer closes mid-flow, the partial state is lost - no localStorage draft. A 30-line grocery receipt becomes 30 separate clicks.

Fix shape: "Accept all lines" button when the scanner has high confidence on every row; localStorage draft if the drawer is closed before completion.

### 5.3 ~~Receipt scan -> stock bump is captured, but payable creation is manual~~ - Done

Resolved in post-audit follow-up. `receiveStock()` now auto-creates a `supplier_payables` row when the receipt has a known supplier + at least one priced line. Total = sum of `qty * unitCost` across lines (rounded to cents). Due date = `receivedDate + suppliers.payment_terms` days (defaults to 30). Idempotent: a dedup probe on `(company_id, supplier_id, invoice_ref)` prevents double-billing if the same receipt is committed twice. Non-fatal: payables insert failure logs but doesn't roll back the stock receive - the stock IS in the building, AP can catch up via `/admin/payables` manual entry.

### 5.4 No shopper-handoff visibility on the buy list

Two shoppers working the same day cannot see which one claimed which buy-list line. Risk of duplicate purchases.

Fix shape: add `assigned_shopper_id` column to `shopping_list_items`, badge each row "claimed by @X" on the buy list. Schema change required.

### 5.5 Suppliers list stale (no realtime)

`suppliers.tsx` loads once on mount. If admin adds a supplier on the admin side, the shopper has to hard-refresh to see it. Low impact (suppliers don't change often) but flagged for the realtime sweep.

### 5.6 No "expected delivery date" tracking on receipts

Useful for flagging late deliveries vs the supplier's promised lead time. Defer - product backlog item, not friction.

---

## 6. Open follow-ups summary

1. `buy-list.tsx` realtime refresh on demand changes (5.1).
2. Atomic receipt reconciliation + localStorage draft (5.2).
3. Auto-create `supplier_payables` from successful `receiveStock` (5.3).
4. `shopping_list_items.assigned_shopper_id` schema + badge (5.4).
5. `suppliers.tsx` realtime refresh (5.5).
6. Delete `alerts.tsx` redirect stub after 60 days of zero bookmark traffic (4.1).
7. Supplier detail page should show related orders pulling from this supplier (admin audit gap).
8. Bulk import of supplier payables (admin audit gap).
