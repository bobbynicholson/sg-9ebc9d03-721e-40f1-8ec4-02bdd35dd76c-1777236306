# `/team-portal/shopping/dashboard` audit (2026-05-19)

**Scope:** 43rd page. Shopping staff dashboard.

**File:** `src/pages/team-portal/shopping/dashboard.tsx` (406 lines).

## Findings

| # | Finding | Severity |
|---|---|---|
| SHP2-1 | No `@ts-nocheck`. Clean TypeScript. ✓ | none |
| SHP2-2 | **CRITICAL MISSING FEATURE - Bobby's priority ask: "Print-friendly shopping list for shopping staff"**. Admin /admin/shopping got print in AD-2; staff dashboard didn't. The shopper on a phone needs paper at the supplier. | **P0** |
| SHP2-3 | Data scoping correct via `useActiveShoppingList()` filtering `shopper_id = current_user OR unassigned`. DynamicNav gates userRole=SHOPPING_STAFF. No ProtectedRoute wrapper but hook blocks unauthenticated. | none |
| SHP2-4 | No realtime sub on shopping_list_items. Multi-device tick-off doesn't sync until refresh. | P2 |
| SHP2-5 | No mid-list cost tally or supplier budget check. Actual cost only at "Mark complete". | P2 |

## First-wave PRs
- SHP2-A: Print-friendly shopping list for staff dashboard (SHP2-2, P0) - **ships in this push**
- SHP2-B: Realtime sub on shopping_list_items (SHP2-4)
- SHP2-C: Mid-list cost tally (SHP2-5)
