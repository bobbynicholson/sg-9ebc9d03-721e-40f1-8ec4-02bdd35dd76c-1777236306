# `/admin/regions` (Regions) audit (2026-05-19)

**Scope:** 13th page of the admin per-page audit programme. Third
in Operations group. Linked from AdminNav as "Regions".

**File:** `src/pages/admin/regions.tsx` (1,033 lines).

**Test tenant:** Spit Braai Delivery.

---

## A. What's on the page

1. **List** - per row: region name, delivery radius km, operating
   hours, drivers covered, MTD orders / revenue, active toggle.
2. **Create / edit dialog** - name, polygon, radius, hours,
   VAT rate override, deposit %, delivery cost per km, min fee.
3. **MTD KPI cards** - per region rollup.

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity |
|---|---|---|
| REG-1 | `@ts-nocheck` on line 2 - disables type-checking on 1,033 lines. Region interface missing `vat_rate`, `deposit_percent`, `delivery_cost_per_km`, `min_delivery_fee`; reads with `as any` casts on lines 297-300. | **P0** |

### B.2 Data integrity / one source of truth

| # | Finding | Severity |
|---|---|---|
| REG-2 | VAT, deposit, delivery overrides read/written with unchecked numeric casting. No server-side validation that percentages stay 0-100 or costs are positive. A "150" VAT typo persists silently. | P1 |
| REG-5 | MTD enrichment runs 5 separate selects in Promise.all per region. On a 20+ region tenant, load time grows O(n). Region timezone vs server-local also has off-by-one-day risk. | P2 |

### B.3 Chain reactions

| # | Finding | Severity |
|---|---|---|
| REG-4 | No event emitted after create / update / delete. Orders / quotes / staff linked to a region don't know if it toggles inactive. Kitchen page won't see operating_hours changes; dispatch won't see delivery_radius shifts. | P2 |

### B.4 Role / visibility mapping

| # | Finding | Severity |
|---|---|---|
| REG-3 | ProtectedRoute gates to [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. region_admin (their region edit + KPI), sales_admin (delivery_radius_km + operating_hours for quote feasibility) excluded. | P1 |

### B.5 Missing features

| # | Finding | Severity |
|---|---|---|
| REG-6 | No polygon / geofence editor. Delivery radius is a single number; drivers outside aren't blocked visually. | P2 |
| REG-7 | No per-region trend dashboard (orders this week vs target, revenue trend, on-shift driver count, pending quote age). | P3 |
| REG-8 | No bulk actions (activate/deactivate batch, CSV import/export with overrides). | P3 |

---

## C. Priority fix list

**P0** (safety):
- REG-1: Remove @ts-nocheck + complete Region interface

**P1** (UX critical + role coverage + validation):
- REG-2: Server-side numeric bounds on override fields
- REG-3: Admit region_admin (their region) + sales_admin (read-only)

**P2** (chain reactions + perf):
- REG-4: Emit cateringms:region-updated event
- REG-5: Batch MTD query + respect region timezone
- REG-6: Polygon editor

**P3** (polish):
- REG-7: Per-region trend dashboard
- REG-8: Bulk actions + CSV

---

## D. First-wave PRs

| PR | Title |
|---|---|
| REG-A | Remove `@ts-nocheck` + complete Region interface (REG-1, P0) |
| REG-B | Role coverage + event emit + numeric bounds (REG-2 + REG-3 + REG-4 batch) |
| REG-C | Batch MTD query + region timezone (REG-5, P2) |
| REG-D | Polygon editor (REG-6, P2 - separate, bigger) |
| REG-E | Trend dashboard + bulk actions (REG-7 + REG-8, P3) |
