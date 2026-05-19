# `/admin/packages` (Booking packages) audit (2026-05-19)

**Scope:** Ninth page of the admin per-page audit programme. Fifth
in Pipeline group. Linked from AdminNav as "Packages".

**Files:**
- `src/pages/admin/packages/index.tsx` (307 lines) - list + create
- `src/pages/admin/packages/[id].tsx` (456 lines) - detail + link orders

**Test tenant:** Spit Braai Delivery.

---

## A. What's on the page

1. **List** - tabs (active / draft / completed / cancelled / all),
   one card per package showing name, dates, venue.
2. **Create dialog** - name, venue summary, start/end dates, notes.
3. **Detail** - metadata edit, linked-orders timeline, link by
   order number, cancel-package (cascades to orders).

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity |
|---|---|---|
| PKG-1 | No `@ts-nocheck` on either file. ✓ | none |
| PKG-2 | Uses `/api/booking-packages` route - clean server-side data layer, no raw supabase calls from the page. ✓ Best pattern of any page audited so far. | none |

### B.2 Data integrity / one source of truth

| # | Finding | Severity |
|---|---|---|
| PKG-3 | Total revenue + total guests derived from `orders` array of the package (line 107-108 of [id].tsx). Single source. ✓ | none |
| PKG-4 | Cancel cascade: cancelling a package calls a server endpoint that cancels every linked order. Audit assumes the endpoint is transactional - worth verifying that a failed mid-cascade leaves consistent state. | P2 |

### B.3 Chain reactions

| # | Finding | Severity |
|---|---|---|
| PKG-5 | No realtime sub on `booking_packages` or `orders` from this page. When the dispatch team flips a linked order's status, the package's "active" timeline doesn't reflect it until the operator refreshes. Same pattern as CAL-2 / CTS-2. | P2 |
| PKG-6 | No `cateringms:order-updated` listener on the detail page. When an order is edited from /admin/orders the package timeline goes stale. | P2 |

### B.4 Role / visibility mapping

| # | Finding | Severity |
|---|---|---|
| PKG-7 | Both files gate to [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. sales_admin builds packages (wedding sales reps); region_admin sees their region's packages. Same omission pattern as QTS-8 / ORD-6. | P2 |

### B.5 Missing features

| # | Finding | Severity |
|---|---|---|
| PKG-8 | No "duplicate package" - rebooking the same client's annual conference needs a template starting point. | P3 |
| PKG-9 | No print pack overview (wedding day pack: orders + venues + drivers). Same recipe as DI-B / LO-B but applied to a multi-day event. | P3 |

### B.6 Performance

| # | Finding | Severity |
|---|---|---|
| PKG-10 | List loads via `/api/booking-packages` with no pagination. Currently fine because tenants rarely have > 100 packages, but the same pattern as CTS-4 / LDS-3 / QTS-14. Defer until needed. | P3 |

---

## C. Priority fix list

**P0** (safety): none.

**P1** (UX critical): none. Packages is the cleanest page in the
audit programme to date.

**P2** (data integrity + chain reactions + role coverage):
- PKG-4: Verify cancel-cascade transactionality (server endpoint review)
- PKG-5 / PKG-6: Realtime sub + order-updated listener on the detail page
- PKG-7: Admit sales_admin + region_admin

**P3** (polish):
- PKG-8: Duplicate package
- PKG-9: Print pack overview
- PKG-10: Pagination (deferred)

---

## D. First-wave PRs

| PR | Title |
|---|---|
| PKG-A | Role coverage + order-updated listener on detail (PKG-5 + PKG-6 + PKG-7 batch) |
| PKG-B | Cancel-cascade transactionality review (PKG-4 - server-side) |
| PKG-C | Duplicate package (PKG-8) |
| PKG-D | Print pack overview (PKG-9) |

This push ships PKG-A.
