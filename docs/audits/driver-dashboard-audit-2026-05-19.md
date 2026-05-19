# `/team-portal/driver/dashboard` audit (2026-05-19)

**Scope:** 41st page. Driver staff dashboard.

**File:** `src/pages/team-portal/driver/dashboard.tsx` (935 lines).

## Findings

| # | Finding | Severity |
|---|---|---|
| DRV-1 | Data integrity: per-driver scope correct via `.eq("driver_id", user.id)` + OR on `assigned_driver_id`. ✓ | none |
| DRV-2 | Realtime sub on `orders` UPDATE for status="ready" + auto-ack. ✓ | none |
| DRV-3 | Tap-to-call client phone implemented. ✓ | none |
| DRV-4 | GPS clock-in + pinger active. ✓ | none |
| DRV-5 | No `@ts-nocheck`. Job interface well-typed. ✓ | none |
| DRV-6 | Direct orders query loads all active orders per company + dedupes client-side. No date window at query level. Scales poorly on busy tenants. | P2 |
| DRV-7 | Decline-assignment only available pre-pickup, not mid-transit. | P3 |
| DRV-8 | MyShiftTodayCard correctly scoped to multi-role driver shifts. ✓ | none |

## First-wave PRs
- DRV-A: Server-side date window on driver orders query (DRV-6)
- DRV-B: Decline mid-transit affordance (DRV-7)
