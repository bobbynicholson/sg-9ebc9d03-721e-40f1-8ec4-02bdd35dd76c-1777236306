# `/admin/wages` (Wages dashboard) audit (2026-05-19)

**Scope:** 19th page of the admin per-page audit programme. Fourth
in Money group.

**File:** `src/pages/admin/wages.tsx` (1,043 lines).

**Test tenant:** Spit Braai Delivery.

---

## A. What's on the page

1. **Department tabs** - kitchen, drivers, all.
2. **KPI strip** - total hours, total wages, OT split, premium.
3. **Per-staff row** - hours, rate, OT hours, wage total.

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity |
|---|---|---|
| WAG-5 | No `@ts-nocheck`. ✓ A few scattered `as any` casts (profile/user/supabase) - light. | P3 |

### B.2 Data integrity / one source of truth

Wages totals derive from `kitchenStaffService.listShiftsInRange` and
`driverPayService.getPaySummary` - service-side computation. ✓

### B.3 Chain reactions

| # | Finding | Severity |
|---|---|---|
| WAG-2 | No supabase realtime sub on `kitchen_shifts` / `profiles`. Colleague clocks in staff in another tab -> wage row stale until manual range re-apply or refresh. | P2 |

### B.4 Role / visibility mapping

| # | Finding | Severity |
|---|---|---|
| WAG-1 | ProtectedRoute gates to [SUPER_ADMIN, COMPANY_ADMIN] only. ADMIN role excluded - intentional per the code comment (wages are sensitive even within admin tier; only directors). sales_admin / region_admin correctly excluded. ✓ Consistent with Skylight finance-visibility rule. | none |

### B.5 Missing features

| # | Finding | Severity |
|---|---|---|
| WAG-4 | No OT threshold alerts (e.g., "OT exceeds 25%"). No validation that hourly_rate / overtime_rate are set on all staff (rows show "not set" but keep calculating). | P3 |

### B.6 Performance

| # | Finding | Severity |
|---|---|---|
| WAG-3 | Driver profile data fetched on every department tab change. No debounce / caching. With 20+ drivers, redundant parallel queries. | P2 |

---

## C. Priority fix list

**P0** (safety): none.

**P1**: none.

**P2** (data + perf):
- WAG-2: Realtime sub on kitchen_shifts + profiles
- WAG-3: Cache driver data across tab changes; debounce

**P3** (polish):
- WAG-4: OT threshold alerts + missing-rate validation
- WAG-5: Type-safety pass

---

## D. First-wave PRs

| PR | Title |
|---|---|
| WAG-A | Realtime subs + driver data caching (WAG-2 + WAG-3, P2) |
| WAG-B | OT threshold alerts + missing-rate validation (WAG-4, P3) |
