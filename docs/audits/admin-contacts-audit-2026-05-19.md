# `/admin/contacts` (Contacts CRM) audit (2026-05-19)

**Scope:** Fifth page of the admin per-page audit programme. First
page of the Pipeline group. Linked from AdminNav as "Contacts"
(Pipeline group); routes to `/admin/contacts`.

**File:** `src/pages/admin/contacts.tsx` (2,201 lines).

**Test tenant:** Spit Braai Delivery.

---

## A. What's on the page

1. **Header** - title + KPI strip (hot leads, active clients, quiet,
   cold, VIP, etc).
2. **Filter bar** - search, status filter, source filter, refresh.
3. **Contacts table** - one row per person ever on the company's
   radar (clients + leads + past order placers, de-duped).
4. **Per row** - derived status (hot lead / active / quiet / cold /
   VIP), next-action suggestion, last touch, total spend (admin-only).
5. **Quick-mail panel** - Gmail / Outlook / default mail / clipboard
   shortcuts for personal follow-ups.
6. **Contact form dialog** + delete-confirm flow.

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity |
|---|---|---|
| CTS-1 | `@ts-nocheck` on line 2 - disables type-checking on the 2,201-line file. 26 `as any` / `: any` instances inside the file. Same pattern as AD-1 / DI-A / CAL-A. Cleanup will be heavy. | **P0** |
| CTS-6 | Inline subcomponents: ComposeDrawer (lines 1718-1793), ClientFormDialog (1801-2193), delete-confirm (1600-1650). All embedded; ClientFormDialog alone is ~400 lines. Extract to own files. | P3 |

### B.2 Data integrity / one source of truth

| # | Finding | Severity |
|---|---|---|
| CTS-3 | Contact status (hot_lead / active / quiet / etc) is derived from 4 independent feeds (clients, leads, orders, invoices) joined client-side at lines 552-579. No transactional guarantee that an order cancelled elsewhere updates the contact's status until reload. | P2 |
| CTS-7 | Delete fan-out (8 separate mutations across clientIds + leadIds + orderIds + quoteIds + invoiceIds) has no atomic guard. Mid-fan-out failure leaves a half-deleted contact. | P2 |

### B.3 Chain reactions

| # | Finding | Severity |
|---|---|---|
| CTS-2 | No supabase realtime sub on orders / leads / quotes. Same pattern as CAL-2: page only refreshes on mount + manual Refresh. A new quote sent elsewhere doesn't change the suggested next-action from "send a quote" to "chase the quote". | **P1** |

### B.4 Role / visibility mapping

| # | Finding | Severity |
|---|---|---|
| CTS-5 | ProtectedRoute gates to [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. sales_admin is excluded - but the page is the sales rep's primary surface ("Chase the quote" suggestions). Same omission as CAL-4. | P2 |

### B.5 Missing features

| # | Finding | Severity |
|---|---|---|
| CTS-8 | No tap-to-call on phone numbers (same as LO-15 pattern). | P3 |
| CTS-9 | No print for the day's chase list. The owner-on-coffee at 6am pattern from DI-B / LO-B applies here too: "Here's the 12 people I'm phoning today". | P3 |

### B.6 Performance

| # | Finding | Severity |
|---|---|---|
| CTS-4 | Loads ALL clients + ALL leads + ALL orders + ALL quotes into memory then computes status client-side. `DISPLAY_CAP = 500` (line 774) caps the render, but the in-memory dataset is uncapped. Scales poorly on tenants with 5,000+ contact rows. Server-side pagination + status computation via a view would fix it properly. | P2 |

---

## C. Priority fix list

**P0** (safety):
- CTS-1: Remove `@ts-nocheck`

**P1** (UX critical):
- CTS-2: Realtime sub on orders / leads / quotes

**P2** (data integrity + role + performance):
- CTS-3: Status-derivation transactionality (revisit when CTS-4 lands)
- CTS-4: Server-side pagination + view-backed status
- CTS-5: Add sales_admin to allowedRoles
- CTS-7: Atomic delete (rpc or single deletion endpoint)

**P3** (polish):
- CTS-6: Extract inline subcomponents
- CTS-8: tel: links on phone numbers
- CTS-9: Print today's chase list

---

## D. First-wave PRs

| PR | Title |
|---|---|
| CTS-A | Remove `@ts-nocheck` + targeted type fixes (P0) |
| CTS-B | Realtime sub on orders / leads / quotes (P1) |
| CTS-C | Add sales_admin to allowedRoles + tel: links (P2/P3 batch) |
| CTS-D | Server-side pagination + view-backed status (P2 - separate, bigger) |

This push ships CTS-A. CTS-B and CTS-C follow; CTS-D is a deferred
performance lift.
