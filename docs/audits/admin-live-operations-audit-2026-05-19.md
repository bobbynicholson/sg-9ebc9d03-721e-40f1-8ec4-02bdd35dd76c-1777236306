# `/admin/tracking` (Live operations) audit (2026-05-19)

**Scope:** Third page of the admin per-page audit programme.
Linked from AdminNav as "Live operations" (Today group); routes to
`/admin/tracking`. The owner's "what's flying right now" surface.

**File:** `src/pages/admin/tracking.tsx` (806 lines).

**Test tenant:** Spit Braai Delivery.

---

## A. What's on the page

1. **Header** - title + intro copy.
2. **KPI strip** (4 cards) - At risk / In transit / Preparing / Ready.
3. **Filter bar** - search, status select, driver select, Auto-Refresh
   toggle, Refresh Now, Export CSV.
4. **Tabs** - Map view (default) and List view.
5. **Map view** - 2-col grid. Left: AdminTrackingMap with driver pins
   + venue markers. Right: scrollable sidebar with one card per active
   order showing client, venue, status, driver, ETA, margin, risk
   badge. Click a card -> swaps the sidebar to OrderDetailsPanel.
6. **List view** - one card per order with venue, time, driver, phone,
   last-updated. "View on Map" button per row.

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity |
|---|---|---|
| LO-1 | No `@ts-nocheck` - file is type-checked. ✓ | none |
| LO-2 | No `ProtectedRoute` wrapper. Middleware (`src/middleware.ts`) gates `/admin/*` to admin roles so this is not a P0 security hole, but every other admin page wraps in ProtectedRoute as defense-in-depth. Inconsistent. | P2 |
| LO-3 | Component is 806 lines with two large render branches inline (map sidebar + list view). Could shed ~200 lines by extracting `<ActiveOrderCard>` (used in both branches with subtle drift). | P3 |
| LO-4 | `useState<any[]>` everywhere. Order shape is well-known on this page (ETA, margin, risk fields are appended in loadTrackingData). A real `LiveOrder` type would catch drift. | P3 |

### B.2 Data integrity / one source of truth

| # | Finding | Severity |
|---|---|---|
| LO-5 | `stats.total` = `orders.length` - which **includes delivered orders**, so the "total" badge doesn't reflect "in flight". The card has no label hint either - operator could read it as "active". Either rename or strip delivered. | **P1** |
| LO-6 | List view + Map sidebar render largely the same per-order info but diverge: list view has driver phone, last-updated; map sidebar has risk badges, ETA, margin. Two sources, no shared component. | P2 |
| LO-7 | Risk thresholds (85 / 60 / 30) live in `computeRiskScore` service - single source. ✓ Tooltip on "At risk" explains the rule. ✓ | none |
| LO-8 | "Active" stat reads `status === "in_transit"` only. "Preparing" and "Ready" are separate stats - good - but operator doing mental arithmetic to figure out "how many orders are out of the kitchen" has to add preparing + ready + in_transit. A "Total in flight" stat (= total minus delivered) would help. | P2 |

### B.3 Chain reactions

| # | Finding | Severity |
|---|---|---|
| LO-9 | Realtime sub on `gps_tracking` INSERT - recomputes ETA + margin + risk. ✓ | none |
| LO-10 | Realtime sub on `orders` UPDATE - refetches everything on any order change. Also handles the geofence-arrival toast. ✓ | none |
| LO-11 | When the operator changes status from this page... they can't. Status changes happen elsewhere (driver portal, kitchen portal). This is read-only by design - call that out in the header copy. | P3 |

### B.4 Role / visibility mapping

| # | Finding | Severity |
|---|---|---|
| LO-12 | Region-admin sees all regions' orders here. RLS on `orders` should narrow by region, but worth a manual check on Spit Braai with a region_admin profile. | P2 |

### B.5 Missing features

| # | Finding | Severity |
|---|---|---|
| LO-13 | "View on Map" button in list view sets `selectedOrder` but doesn't switch tab. User clicks it expecting the map - lands on the same list. Broken UX. | **P1** |
| LO-14 | No print-friendly status sheet. Morning standup wants paper: "Here's what's flying today, here's what's at risk, here's who's driving what." Same recipe as DI-B. | **P1** |
| LO-15 | Driver phone in list view is plain text. `tel:` link would let dispatch tap-to-call from a tablet without copy-paste. | P2 |
| LO-16 | No "Phone driver" / "Phone client" shortcut on at-risk cards. When an order is going to be late, the owner needs the phone right there. | P2 |

### B.6 Performance

| # | Finding | Severity |
|---|---|---|
| LO-17 | `orderService.getAllOrders(companyId)` returns the whole history then `activeOrders.filter(...)` narrows client-side. Same problem as DI-14. Server-side `.in("status", [...]).gte("event_date", today)` keeps the wire payload predictable. | P2 |

---

## C. Priority fix list

**P0** (broken / safety): none on this page (middleware already gates
admin routes).

**P1** (UX critical):
- LO-5: Strip delivered from `stats.total` or relabel
- LO-13: "View on Map" actually switches the tab
- LO-14: Print-friendly run-status sheet for the morning standup

**P2** (data integrity + chain reactions):
- LO-2: Add ProtectedRoute wrapper (defense-in-depth)
- LO-6: Extract `<ActiveOrderCard>` so map sidebar + list view share a render
- LO-8: Replace "Total" with "In flight" (preparing + ready + in_transit)
- LO-15: `tel:` links on driver phones
- LO-16: Phone-driver / phone-client shortcuts on at-risk cards
- LO-17: Server-side date+status filter on the order load

**P3** (polish):
- LO-3: Extract subcomponents
- LO-4: Type the order shape
- LO-11: Header copy clarifies "read-only - status changes happen in driver / kitchen portals"

---

## D. First-wave PRs

| PR | Title |
|---|---|
| LO-A | Fix stats + "View on Map" tab switch (LO-5 + LO-13, P1 batch) |
| LO-B | Print-friendly live-ops run-status sheet (LO-14, P1) |
| LO-C | Server-side date+status filter on tracking load (LO-17, P2) |
| LO-D | ProtectedRoute wrapper + tel: links on driver phones (LO-2 + LO-15, P2 batch) |
| LO-E | `<ActiveOrderCard>` shared component (LO-6, P2) |

This push ships LO-A first (the two P1 UX bugs).
