# CateringMS megaprogramme Phase 10 (polish trickle) closeout

**Date:** 2026-05-07
**Branch:** `phase-10-polish/megaprogramme-2026-05` (off `phase-9-skylight/megaprogramme-2026-05`)
**Audit doc:** [docs/audits/megaprogramme-2026-05.md](megaprogramme-2026-05.md)
**Prior closeouts:** phases [1](megaprogramme-2026-05-phase-1.md) · [2](megaprogramme-2026-05-phase-2.md) · [3](megaprogramme-2026-05-phase-3.md) · [4](megaprogramme-2026-05-phase-4.md) · [5 arch](megaprogramme-2026-05-phase-5-arch.md) · [6 ui](megaprogramme-2026-05-phase-6-ui.md) · [7 driver](megaprogramme-2026-05-phase-7-driver.md) · [8 xero](megaprogramme-2026-05-phase-8-xero.md) · [9 skylight](megaprogramme-2026-05-phase-9-skylight.md)

## Disposition summary

Final character-grouped follow-up PR from the Phase 4 closeout.
Polish trickle: P1-23 (a real schema fix that ended up in this
group because nothing else was big enough to anchor a phase) plus
P2-01 (Safari print hardening). P2-04 already shipped in Phase 6.

- **2 items shipped**
- **0 deferred from this group**
- **End of the megaprogramme follow-up wave** -- the audit-derived
  backlog is now drained except for the explicit P1-29 / P2-13 /
  P2-10-remainder deferrals carried across earlier phases.

## What landed in Phase 10

| ID | Title | Commit |
|---|---|---|
| P1-23 | Split GPS schema into driver_locations + gps_tracking | `2365070` |
| P2-01 | Harden print CSS for Safari on /q/[token] + /pay/i/[token] | `a3d10b4` |

2 commits.

## P1-23 -- GPS schema split

The previous implementation upserted on `gps_tracking` with
`onConflict("driver_id")`, but `driver_id` wasn't unique on that
table -- behaviour was effectively "insert a fresh row every time"
which:

- Made every "where is the driver right now" lookup a scan +
  order-by-timestamp + limit-1 instead of a PK lookup
- Accumulated history rows that nobody pruned
- Couldn't enforce any per-driver invariant in Postgres (no
  unique constraint to add cleanly without first deduping)

**Migration `20260507280000_driver_locations_current_split`:**

- New table `public.driver_locations` -- one row per driver,
  `driver_id PRIMARY KEY`, with denormalised `company_id` so RLS
  scopes off a column instead of joining through profiles
- Index on `company_id` for the multi-driver lookups
- RLS policies mirroring the gps_tracking shape:
  - driver writes/reads their own row
  - same-company staff read any driver in their tenant
  - clients read the driver currently assigned to one of their orders
- Backfill from the latest `gps_tracking` row per driver
  (DISTINCT ON + ORDER BY) -- one-shot, new code writes both

`gps_tracking` stays as the append-only history log. Nobody
upserts into it any more.

**Code changes:**

- `services/driver/gpsTracking.ts` -- `updateDriverLocation` now
  upserts `driver_locations` AND inserts `gps_tracking` (history).
  `getDriverLocation` reads `driver_locations` (single PK lookup).
  Optional `orderId` arg lets the history row carry the order
  context if the caller knows it.
- `services/dispatchService.ts` -- two readers migrated:
  - The bulk "current GPS for these drivers" lookup in the assign
    feasibility path
  - The "drivers active in last 60 min" count in the dispatch
    health stats (now `driver_locations.updated_at >= sixtyMinAgo`)
- `pages/client-portal/tracking.tsx` -- single-driver current
  location for the live-map panel
- `pages/client-portal/dashboard.tsx` -- headline-event driver pin
  poll
- `pages/admin/driver-management.tsx` -- last-ping timestamp per
  driver in the fleet roster

History readers (the realtime subscription on `gps_tracking` INSERT
in `pages/admin/tracking.tsx`) stay as-is -- that's still the
append-only history log, and the new write path keeps inserting
into it.

The realtime subscription notifications on `gps_tracking` continue
to fire because every location update still appends a history row;
no consumer needs to switch channels.

## P2-01 -- Safari print hardening

The audit listed P2-01 as "manual QA only" -- it needs Bobby on a
Mac to verify the printed quote PDF looks right in Safari. While I
can't run that test, I hardened the print CSS on both
`/q/[token]` and `/pay/i/[token]` against known Safari quirks:

- `html` selector added to the `print-color-adjust` rule (Safari
  sometimes ignores body-level rules)
- `color-adjust: exact` added as the unprefixed fallback alongside
  `-webkit-print-color-adjust: exact` and `print-color-adjust:
  exact`
- `page-break-inside: avoid` + `break-inside: avoid` on
  `.brand-print` so Safari doesn't split the branded header
  across pages (it ignores `break-inside` on flex children
  without `page-break-inside`)

Operator follow-up: open `/q/<some-token>` in Safari on Mac and
hit Save as PDF; verify the brand header tints correctly and
doesn't split a page.

## What's still deferred

Carried across earlier phases:

- **P1-29** -- react-hook-form + zod sweep across all forms.
  L-effort, multi-PR.
- **P2-13** -- file splits on the 5 large pages (admin/orders.tsx
  2442 LOC, admin/settings.tsx 1241, account/settings.tsx 1087,
  admin/platform/company-database.tsx 1057, admin/inventory-
  tracking.tsx 886). Each its own focused PR.
- **P2-10 remainder** -- 12 services still carrying `@ts-nocheck`.
  One commit per service.
- **Cleaning dashboard MetricCard upgrade** -- gated on a UX call
  about the gradient outer-Card framing.

These belong outside the megaprogramme branch stack -- each is a
focused follow-up PR off `main` (or off whichever phase merges
last) when Bobby decides to pick them up.

## Verification

`npx tsc --noEmit` clean after every commit. `npx next build`
end-of-phase reports compile success and a clean prerender pass.
Pre-push hook ran tsc on each push (passed).

## Megaprogramme summary

The audit's 91 findings are now disposed of across 10 phases:

- **Phase 0** -- audit reconnaissance only (the 1391-line ledger)
- **Phase 1-4** -- the originally-budgeted P0/P1/P2/P3 sweeps
- **Phase 5-10** -- the six character-grouped follow-up PRs from
  the Phase 4 deferred backlog

What's left (P1-29, P2-13, P2-10 remainder, cleaning MetricCard,
P2-01 Safari verification) is queued for focused individual PRs as
ops priorities allow.
