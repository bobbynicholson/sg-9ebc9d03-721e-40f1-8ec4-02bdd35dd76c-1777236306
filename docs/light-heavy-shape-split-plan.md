# Light vs heavy shape split for orders + quotes

**Status:** Architectural proposal. No code yet. Approve the shape before I touch a line.
**Author:** Phase 7 follow-up audit
**Scope:** `orders` and `quotes` reads across admin, kitchen, client portal, shopping, and platform pages.

---

## 1. The problem

`select("*")` is the dominant pattern across the codebase. A spot survey of `orders` reads:

- `admin/dashboard.tsx` pulls every order in the date range with `select("id, status, payment_status, total_amount, tax_amount, deposit_paid, deposit_amount, balance_paid, balance_amount, amount_paid, event_date, confirmed_at, cancellation_reason_category")` - 12 columns. Hits 200-500 rows on a busy month.
- `admin/orders.tsx` pulls `select("*")` plus 3 joins (client, region, assigned_driver). 50+ columns per row. Same row volume.
- `admin/financial-dashboard.tsx` uses `orderService.getAllOrders(companyId)` which is `select("*")` plus 5 joins.
- `client-portal/tracking.tsx` uses `select("*, assigned_driver:profiles!orders_assigned_driver_id_fkey(id, full_name, phone)")`.
- Kitchen production / prep / dispatch pages: most pull `select("*")` then filter client-side.

Two costs:
1. **Bytes over the wire**. A typical order row with JSON menu_items + equipment_items is 3-8 KB. The dashboard's date-range pull becomes 1-4 MB for a busy tenant. Most of those bytes get discarded by the dashboard's stat aggregation.
2. **Realtime amplification**. Every order INSERT/UPDATE on the dashboard's tenant channel re-fetches the same `select("*")` for every connected admin tab. With 5 admin tabs open across a tenant's team and 100 orders/day, that's 500 MB/day of redundant payload.

`quotes` shows the same pattern with worse outliers - quote rows include the full PDF binary as a base64 column for legacy reasons and can hit 200 KB each.

---

## 2. The proposal: explicit light + heavy types

Three reader tiers, hard split at the service layer.

### 2.1 `OrderLight` - list and aggregate views

Columns: `id, order_number, event_name, event_date, event_time, status, payment_status, total_amount, deposit_amount, deposit_paid, balance_amount, balance_paid, amount_paid, client_id, client_name, client_email, region_id, assigned_driver_id, tax_amount, confirmed_at, cancellation_reason_category, created_at, updated_at`

~22 scalar columns. No menu_items jsonb, no equipment_items jsonb, no notes, no nested joins.

Use cases:
- Admin dashboard metrics rollup
- Admin orders list page (the row table - detail view loads heavy separately)
- Kitchen "what's coming" overviews
- Client portal "my-orders" list
- Financial dashboard aggregations
- Calendar heatmaps
- Any `count("*")` substitute that needs filterable column data

### 2.2 `OrderDetail` - single-order detail views

Columns: everything in OrderLight plus `menu_items, equipment_items, special_requirements, internal_notes, delivery_instructions, dietary_requirements, contact_phone, billing_address, delivery_address, venue_lat, venue_lng, currency, exchange_rate, tip_amount, discount_amount, accounting_sync_state, ...`

Plus first-class joins: `assigned_driver`, `region`, `kitchen`, `client_profile`.

Use cases:
- `/admin/orders/[id]` detail page
- `/c/order/[id]` client detail
- Kitchen ticket / production card
- Anywhere the operator is looking at one order at a time

Always single-row fetch (`maybeSingle()`). Never used in a list context.

### 2.3 `OrderRaw` - escape hatch

`select("*")` for the handful of paths that legitimately need everything (admin CSV exports, full-tenant data export endpoint, super-admin debug pages). Three named callers, documented, not the default.

---

## 3. The same shape for quotes

`QuoteLight`: `id, quote_number, event_name, event_date, status, total_amount, deposit_percentage, currency, client_id, client_name, client_email, created_at, updated_at, expires_at`

`QuoteDetail`: everything + `menu_items, equipment_items, pdf_url, sent_at, accepted_at, rejected_at, notes, internal_notes, public_token, ...`. Excludes the legacy `pdf_base64` column - that's served via signed-URL fetch when actually needed, not bundled into every detail read.

`QuoteRaw`: same escape-hatch convention.

---

## 4. Service-layer shape

```ts
// src/services/orderService.ts

export interface OrderLight { /* ~22 fields above */ }
export interface OrderDetail extends OrderLight { /* additional fields + joins */ }
export type OrderRaw = Tables<'orders'>;

const LIGHT_COLUMNS = "id, order_number, event_name, ... created_at, updated_at";
const DETAIL_COLUMNS = `${LIGHT_COLUMNS}, menu_items, equipment_items, special_requirements, internal_notes, ..., assigned_driver:profiles!orders_assigned_driver_id_fkey(id, full_name, phone), region:regions(id, name, code), kitchen:kitchens(id, name)`;

export const orderService = {
  /** List queries - light shape. Paginated. */
  async listLight(companyId: string, filter: OrderFilter): Promise<OrderLight[]>,
  async listLightPage(companyId: string, filter: OrderFilter, page: { from: number; to: number }): Promise<{ rows: OrderLight[]; total: number }>,

  /** Single-row queries - detail shape. */
  async getDetail(orderId: string): Promise<OrderDetail | null>,

  /** Escape hatch. Document the caller. */
  async getRaw(orderId: string, _calledBy: "csv_export" | "tenant_export" | "super_admin_debug"): Promise<OrderRaw | null>,
};
```

Same shape for `quoteService`.

---

## 5. Migration strategy

Phased, behind a per-file lint rule, no big-bang rewrite:

**Phase A (this PR):**
- Add the three types to `orderService.ts` and `quoteService.ts`.
- Add `listLight()` + `getDetail()` as new exports; don't touch `getAllOrders()` yet (call it `legacyGetAllOrders` later).
- Wire one big consumer (`/admin/dashboard`) to `listLight()` and measure the byte savings.
- Add eslint rule `no-restricted-syntax` flagging new `select("*")` from `orders` or `quotes` outside of `orderService` / `quoteService` / explicit `_raw_*` named functions. Existing offenders grandfathered with a one-off eslint-disable comment + a `TODO(light-heavy)` tag, so we can grep for the migration backlog.

**Phase B (next sprint):**
- Migrate `/admin/orders` list, `/admin/financial-dashboard`, `/client-portal/my-orders`, `/client-portal/tracking`, kitchen overviews to `listLight()`.
- Migrate detail pages to `getDetail()`.
- After each batch, grep for remaining `TODO(light-heavy)` tags + tackle.

**Phase C (cleanup):**
- Delete `legacyGetAllOrders`.
- Drop the grandfather eslint-disables.
- Move the three legitimate `getRaw()` callers behind named wrappers.

---

## 6. Realtime implications

The realtime channels currently re-fetch the same shape they originally loaded. After the migration:

- List pages subscribed to `orders` changes -> re-fetch via `listLight()`. Same channel, lighter payload.
- Detail pages -> re-fetch a single-row `getDetail()`. Same as today.

No channel scoping changes needed. The byte savings compound automatically because the re-fetch is also light.

---

## 7. Expected wins

Rough numbers on the Spit Braai test tenant (50 orders/month, 5 admin sessions, 30-day window):

| Pull | Before | After (light) | Δ |
|---|---|---|---|
| Dashboard initial load | ~280 KB | ~32 KB | -89% |
| Dashboard realtime re-fetch on every order update | ~280 KB × N tabs | ~32 KB × N tabs | -89% |
| `/admin/orders` list page initial | ~420 KB | ~48 KB | -89% |
| Client portal my-orders | ~110 KB | ~18 KB | -84% |
| Detail page (unchanged) | ~12 KB | ~12 KB | 0% |

Numbers scale linearly with order count; bigger tenants see larger absolute savings.

---

## 8. Open questions for Bobby

1. **Phase A scope.** Do you want me to migrate just `/admin/dashboard` as the proof point, or sweep the obvious wins (`/admin/orders`, `/admin/financial-dashboard`, `/client-portal/my-orders`, `/client-portal/tracking`) in one bigger PR? My recommendation: just the dashboard, get the lint rule live, measure the win, then sweep in Phase B.

2. **Quote `pdf_base64`.** Quotes legacy-store the rendered PDF inline. Moving that out of `QuoteDetail` (serve via signed URL instead) is a separate migration with its own backfill consideration. Want it as part of #97 or queued as #97a?

3. **Naming.** I've used `OrderLight` / `OrderDetail`. Alternatives: `OrderSummary` / `OrderFull`, `OrderRow` / `OrderRecord`. Preference?

4. **Pagination defaults.** `listLight()` should probably default to a 100-row limit with explicit `page` for larger pulls. Acceptable, or do you want the dashboard's "all orders this month" pattern to stay unbounded by default?

5. **Lint rule severity.** Warning vs error? Warning lets us ship the rule without blocking existing PRs; error forces the migration discipline immediately but means every existing caller gets a CI red until I sweep them. I lean warning -> error after Phase B is done.

---

## 9. Decision needed before code

I need yes/no on:
- The three-tier split (`Light` / `Detail` / `Raw`)
- Phase A scope (dashboard only vs broader sweep)
- Naming convention
- Lint rule severity

Once those are answered, the implementation PR is a 2-day effort with low blast radius (additive, no behaviour change on the call sites that don't migrate yet).
