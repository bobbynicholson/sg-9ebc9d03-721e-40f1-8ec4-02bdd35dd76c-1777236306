# CateringMS megaprogramme Phase 7 (driver fleet) closeout

**Date:** 2026-05-07
**Branch:** `phase-7-driver/megaprogramme-2026-05` (off `phase-6-ui/megaprogramme-2026-05`)
**Audit doc:** [docs/audits/megaprogramme-2026-05.md](megaprogramme-2026-05.md)
**Prior closeouts:** phases [1](megaprogramme-2026-05-phase-1.md) · [2](megaprogramme-2026-05-phase-2.md) · [3](megaprogramme-2026-05-phase-3.md) · [4](megaprogramme-2026-05-phase-4.md) · [5 arch](megaprogramme-2026-05-phase-5-arch.md) · [6 ui](megaprogramme-2026-05-phase-6-ui.md)

## Disposition summary

Third of the six character-grouped follow-up PRs queued in the Phase
4 closeout. Driver fleet group: closes the dispatch-side gaps the
audit flagged around assignment safety and the client-side gap
around live ETA.

- **5 items shipped** (one was already in tree; verified + closed)
- **0 deferred**

## What landed in Phase 7

| ID | Title | Commit |
|---|---|---|
| P1-08 + P1-18 | Same-day time-overlap check on driver assignment | `658f454` |
| P1-07 | Admin force-reassign on replacement request | `cf93a45` |
| P1-34 | Driver-portal proof-of-delivery capture | already in tree |
| P1-37 | Live haversine ETA on client tracking page | `2a88ec6` |

3 commits, 5 audit items closed.

## P1-08 + P1-18 -- driver double-booking gate

The audit flagged two related gaps: there was no time-conflict check
on reassign (P1-08) and no double-booking detection on the assign
write path (P1-18). Both fold into one fix.

New `dispatchService.checkDoubleBooking` looks for any other order
the same driver is already on for the same `event_date` whose
`event_time` is within +/- 3h of the new order. If found, returns
`{ ok: false, conflictOrderNumber, conflictTime, reason }`.

Wired into `assignDriverWithGate` as the second gate after capacity
(only when `enforceGates: true` -- callers that want warn-and-allow
behaviour skip both gates exactly as before). Bulk assign and
replacement-accept paths both flow through this method, so a single
fix covers every assign surface.

3-hour buffer is heuristic but defensible: covers prep + load +
drive + serve + return for the typical event. Configurable via
optional `bufferHours` arg if a tenant runs a tighter or looser
window.

## P1-07 -- admin force-reassign

The replacement flow was auction-only: a driver requests bail, the
request broadcasts to other drivers, the first to accept gets the
job. If nobody bites and the event is in 4 hours, the admin had no
in-flow way to pick someone and put them on it.

New `driverReplacementService.forceReassignReplacement(...)` lets
an admin pick the new driver directly:
- Marks the request as accepted, attributed to the chosen driver
- Flips `orders.assigned_driver_id`
- Audit row uses a distinct `driver_replacement_force_reassigned`
  action so reports can separate auction wins from admin overrides
- Reuses the same notifier shapes (original driver "you're off",
  new driver "you're on it now") as the auction path

Service-layer only this PR. Wiring an "Assign manually" button into
the replacement-requests admin UI is an obvious follow-up that
isn't blocked by anything.

## P1-34 -- already shipped

The audit listed PoD capture as a "missing-feature" but the
implementation was already in tree at audit time:
- [src/components/driver/PodCaptureDialog.tsx](src/components/driver/PodCaptureDialog.tsx)
  -- photo + signature pad + recipient name + storage upload to
  the `pod` bucket + writes pod_photo_url, pod_signature_url,
  pod_recipient_name, pod_captured_at + flips status to delivered
- Wired into `team-portal/driver/dashboard.tsx` as the
  "Confirm delivery" button on each non-terminal job
- Surfaced back to the client via `OrderDetailsPanel.tsx` --
  the photo + signature show on the tracking page after capture

Verified the full path; no change needed. Closing the ledger entry.

## P1-37 -- live haversine ETA

`/client-portal/tracking` showed "Calculating..." indefinitely
because `order.estimated_arrival` was never populated. The driver's
GPS row was already being read into `driverLocation` for the map.

New `calculateETA` falls back through three strategies in order:
1. If we have a driver GPS lat/lng + venue lat/lng, compute
   haversine distance and divide by a 35 km/h urban average.
   Returns "Arriving now" / "~12 minutes" / "~1h 30m".
2. Else if `estimated_arrival` is populated, compute from that.
3. Else "Calculating..." (the prior behaviour).

The 30-second poll already refreshes both `driverLocation` and
`orders`, so the ETA updates automatically as the driver drives.

35 km/h is heuristic for South-African urban catering routes
(faster than peak-hour Cape Town, slower than open road). Good
enough for the client's "is it 10 minutes or an hour?" decision,
which is what the panel needs to answer.

## What's still deferred

Nothing from this group. The two related items the audit ledger
mentions adjacent to this group remain queued for their respective
character groups:

- P1-19 (driver replacement audit trail) -- already shipped earlier
- P2-08 (driver-replacement-accepted notification copy) -- already
  shipped in Phase 4

## What's next

Two character-grouped PR groups left from the Phase 4 closeout:

1. ~~Architecture cleanup~~ done in Phase 5
2. ~~UI consistency sweep~~ done in Phase 6
3. ~~Driver fleet~~ done in Phase 7 (this PR)
4. Xero / accounting (P1-20 / P1-21 / P1-24)
5. Skylight tenant health (P1-32 / P2-15)
6. Polish trickle (P1-23 / P2-01 / P2-04 -- P2-04 already shipped in Phase 6)

Plus the deferrals: P1-29 (form sweep), the cleaning dashboard
MetricCard upgrade, P2-13 file splits, the P2-10 ts-nocheck
remainder.

## Verification

`npx tsc --noEmit` clean after every commit. `npx next build`
end-of-phase reports compile success and a clean prerender pass.
Pre-push hook ran tsc on each push (passed).
