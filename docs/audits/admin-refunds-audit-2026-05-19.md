# `/admin/refunds` audit (2026-05-19)

**Scope:** 18th page of the admin per-page audit programme. Third
in Money group.

**File:** `src/pages/admin/refunds.tsx` (817 lines).

**Test tenant:** Spit Braai Delivery.

---

## A. What's on the page

1. **Timeline of refund-class payments** (refund, credit issue,
   credit redeem).
2. **KPI strip** - pending, processed, total refunded.
3. **Per row** - parent order, refund reason, status, mark-paid
   action.
4. **CSV export** for bank reconciliation.

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity |
|---|---|---|
| REF-5 | `user` cast as `any` (line 154). Light touch type-safety. | P3 |

### B.2 Data integrity / one source of truth

| # | Finding | Severity |
|---|---|---|
| REF-3 | CSV export walks client-side filtered rows. If a "Pending" filter is active and the operator exports for bank reconciliation, the CSV is incomplete - they need the full timeline. UI should clarify scope ("Export filtered" vs "Export all"). | P2 |

### B.3 Chain reactions

| # | Finding | Severity |
|---|---|---|
| REF-2 | No supabase realtime sub on `payments` (where payment_type IN refund/credit_issue/credit_redeem). Colleague marks a refund paid in another tab -> row stale until manual refresh. | P2 |

### B.4 Role / visibility mapping

| # | Finding | Severity |
|---|---|---|
| REF-1 | ProtectedRoute gates to [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. ✓ Tight finance scope is correct per Skylight finance-visibility rule. region_admin / sales_admin correctly excluded. | none |

### B.5 Missing features

| # | Finding | Severity |
|---|---|---|
| REF-4 | No mark-pending / mark-rejected affordance. If a refund was wrongly flipped paid, no UI path to revert (SQL only). | P3 |

---

## C. Priority fix list

**P0** (safety): none.

**P1**: none.

**P2** (data + chain reactions):
- REF-2: Realtime sub on payments
- REF-3: CSV export scope clarification

**P3** (polish):
- REF-4: Revert / mark-rejected affordances
- REF-5: Type-safety pass

---

## D. First-wave PRs

| PR | Title |
|---|---|
| REF-A | Realtime sub on payments (REF-2, P2) |
| REF-B | CSV scope clarification (REF-3, P2) |
| REF-C | Revert affordances + type-safety (REF-4 + REF-5, P3) |
