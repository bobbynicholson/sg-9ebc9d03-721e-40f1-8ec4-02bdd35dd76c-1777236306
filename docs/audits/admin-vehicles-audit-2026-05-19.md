# `/admin/vehicles` (Vehicles) audit (2026-05-19)

**Scope:** 12th page of the admin per-page audit programme. Second
in Operations group. Linked from AdminNav as "Vehicles".

**File:** `src/pages/admin/vehicles.tsx` (1,245 lines).

**Test tenant:** Spit Braai Delivery.

---

## A. What's on the page

1. **Header** - title, two tabs (Roster + Utilisation).
2. **Roster tab** - per row: plate, nickname, refrigerated /
   warmer / capacity, owner_kind, requires_two_people,
   next_service_due, active. CRUD dialog.
3. **Utilisation tab** - rollup over 7/30/90 days: jobs covered,
   km, kitchen-cold-chain compliance %.

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity |
|---|---|---|
| VEH-1 | `@ts-nocheck` on line 2 - disables type-checking on 1,245 lines. 14 `as any` casts; user/profile shape mismatches + service log tuple. Same pattern as AD-1 / DI-A. | **P0** |

### B.2 Data integrity / one source of truth

| # | Finding | Severity |
|---|---|---|
| VEH-7 | Service log writes to `vehicle_maintenance_log`; the `vehicle.next_service_due` is updated by trigger. The roster reads next_service_due directly - relies on trigger fidelity. Worth a sanity check on Spit Braai. | P3 |

### B.3 Chain reactions

| # | Finding | Severity |
|---|---|---|
| VEH-3 | No supabase realtime sub on `vehicles`. Colleague hires a fridge truck in another tab -> roster doesn't refresh until manual reload. | P2 |
| VEH-4 | Service log update doesn't emit any cross-page event. Dispatch readiness (orderReadiness reads next_service_due) misses the signal until the page is reloaded. | P2 |

### B.4 Role / visibility mapping

| # | Finding | Severity |
|---|---|---|
| VEH-2 | ProtectedRoute gates to [SUPER_ADMIN, COMPANY_ADMIN, ADMIN]. sales_admin should see capability matrix to advise clients (refrigerated yes/no); region_admin should see regional fleet only. Same omission pattern as ORD-6 / LDS-10. | P1 |

### B.5 Missing features

| # | Finding | Severity |
|---|---|---|
| VEH-5 | Missing: print fleet roster (paper handover for the driver), fuel/odometer log (cost per km tracking), cold-chain cert expiry (fridge COP / vehicle CoR), service alert to driver. | P3 |

### B.6 Performance

None observed - vehicles is a small dataset.

---

## C. Priority fix list

**P0** (safety):
- VEH-1: Remove @ts-nocheck

**P1** (UX critical):
- VEH-2: Admit sales_admin + region_admin

**P2** (chain reactions):
- VEH-3: Realtime sub on vehicles
- VEH-4: Emit event after service log

**P3** (polish):
- VEH-5: Print roster, fuel log, cert tracking
- VEH-7: Service-trigger sanity check

---

## D. First-wave PRs

| PR | Title |
|---|---|
| VEH-A | Remove `@ts-nocheck` (VEH-1, P0) |
| VEH-B | Role coverage + realtime sub + service event emit (VEH-2 + VEH-3 + VEH-4 batch) |
| VEH-C | Print roster + fuel/cert tracking (VEH-5, deferred) |
