# `/admin/invoices` audit (2026-05-19)

**Scope:** 17th page of the admin per-page audit programme. Second
in Money group.

**File:** `src/pages/admin/invoices.tsx` (~2,400 lines).

**Test tenant:** Spit Braai Delivery.

---

## A. What's on the page

1. **KPI strip** - outstanding, overdue, paid this month.
2. **Filter bar** - status, date range, search.
3. **Invoice table** - per row: number, client, total, balance,
   status, due date. Bulk + per-row actions (send, mark paid).
4. **Mark-paid modal** + composer.

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity |
|---|---|---|
| INV-5 | 88+ `as any` casts. No `@ts-nocheck` but heavy unsafe casts on user, supabase nested selects, errors. | P1 |

### B.2 Data integrity / one source of truth

| # | Finding | Severity |
|---|---|---|
| INV-2 | Invoice total read from `invoices.total_amount` column. No server-side reconciliation that the column matches the source order's items × qty × price + tax. Same gap as ORD-3 / QTS-4. | P2 |

### B.3 Chain reactions

| # | Finding | Severity |
|---|---|---|
| INV-3 | Mark-paid (bulk + per-row) DOES emit `cateringms:order-updated` ✓. Realtime sub on payments ✓. Gap: no cross-emit to accountingIntegrationService sync queue (Xero / QuickBooks) - bookkeeper must manually push. | P2 |

### B.4 Role / visibility mapping

| # | Finding | Severity |
|---|---|---|
| INV-1 | **No ProtectedRoute wrapper.** Inline auth check at line 1142-1143 with `allowedRoles = ["admin","super_admin","company_admin","sales_admin","region_admin","owner"]` and a redirect-if-not block. Defense-in-depth missing - the page DOM starts rendering before auth context resolves; mirror LO-2 / ORD-6 / QTS-8 pattern. | **P1** |

### B.5 Missing features

| # | Finding | Severity |
|---|---|---|
| INV-X | Bulk print packet, bulk send chase, tap-to-call, batch mark-paid affordances. | P3 |

### B.6 Performance

| # | Finding | Severity |
|---|---|---|
| INV-4 | `supabase.from("invoices").select(...).eq("company_id", ...)` - no .limit() or .range(). Loads ALL company invoices. Client-side fuzzy search + status filter. 5-year-old tenant with 10k invoices freezes. Same pattern as ORD-9 / QTS-14. | P2 |

---

## C. Priority fix list

**P0** (safety): none.

**P1** (UX critical):
- INV-1: ProtectedRoute wrapper
- INV-5: Type-safety pass

**P2** (data + perf):
- INV-2: Server-side reconciliation
- INV-3: Accounting sync emit on mark-paid
- INV-4: Server-side pagination + date window

**P3** (polish): print packet / bulk send / tap-to-call

---

## D. First-wave PRs

| PR | Title |
|---|---|
| INV-A | ProtectedRoute wrapper (INV-1, P1) |
| INV-B | Type-safety pass (INV-5, P1) |
| INV-C | Server-side pagination + date window (INV-4) |
| INV-D | Reconciliation + accounting sync emit (INV-2 + INV-3) |
| INV-E | Polish batch |
