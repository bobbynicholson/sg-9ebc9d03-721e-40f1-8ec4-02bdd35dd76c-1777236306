# `/admin/calendar` (Calendar) audit (2026-05-19)

**Scope:** Fourth page of the admin per-page audit programme.
Linked from AdminNav as "Calendar" (Today group); routes to
`/admin/calendar`. The owner's diary triage surface.

**File:** `src/pages/admin/calendar.tsx` (1,109 lines).

**Test tenant:** Spit Braai Delivery.

---

## A. What's on the page

1. **Header** - title + month picker, Today button, prev/next
   month arrows, keyboard hints, refresh, CSV export.
2. **KPI strip** - bookings this month, revenue this month, capacity
   pressure (vs maxConcurrent), open quotes count.
3. **Month grid** - one cell per day, event pills (truncated client
   names) with status colour, today-pulse, weekend dim.
4. **Day-detail sheet** - opens on day click; lists confirmed
   orders + open quotes for the day; deep-links to each.
5. **Keyboard nav** - arrows / T / [ / ].
6. **Open-quotes diary** - open quotes overlaid on dates so the
   operator sees where slots could convert.

---

## B. Findings

### B.1 Architecture / code health

| # | Finding | Severity |
|---|---|---|
| CAL-1 | `@ts-nocheck` on line 2 - disables type-checking on the 1,109-line file. Same pattern as /admin/dashboard pre-AD-1, /admin/order-assignments pre-DI-A. | **P0** |
| CAL-6 | `<DayDetailSheet>` is ~260 lines of inline markup (lines 852-end of sheet) plus inline `DAY_MODE_META` + mode badge render. Extract to own component. | P2 |
| CAL-7 | 16 useMemo / useState hooks in one component, no logical grouping (filters, calendar math, KPIs all intermingled). | P3 |

### B.2 Data integrity / one source of truth

| # | Finding | Severity |
|---|---|---|
| CAL-5 | `maxConcurrent` capacity threshold loaded from localStorage (lines 205-214), not from the operations settings table. Clear cache or open on another device -> stale value. Operations dispatch settings live in `dispatchService.getDispatchSettings`; should pull from there. | P2 |

### B.3 Chain reactions

| # | Finding | Severity |
|---|---|---|
| CAL-2 | No supabase realtime subscription on `orders`. The page listens only to: window focus + `cateringms:order-updated` event + mount. If a dispatcher in another browser tab changes a pickup_time / event_date / status via the realtime channel (no event emit), the calendar doesn't refresh until focus or manual refresh. /admin/tracking has the same pattern AND a realtime sub - calendar should too. | **P1** |

### B.4 Role / visibility mapping

| # | Finding | Severity |
|---|---|---|
| CAL-4 | ProtectedRoute gates to `[SUPER_ADMIN, COMPANY_ADMIN, ADMIN]`. `region_admin` and `sales_admin` enum members can reach /admin/* per middleware but are blocked here. Calendar is a diary view they need (sales_admin to slot quotes, region_admin to see their region's schedule). Verify RLS narrows orders by region for region_admin before adding. | P2 |

### B.5 Missing features

| # | Finding | Severity |
|---|---|---|
| CAL-8 | No print-friendly day or week view. CSV export covers spreadsheet need; print covers the "diary on the wall" need. Same pattern as DI-B / LO-B. | P3 |
| CAL-9 | No way to create a quote / order directly from an empty day cell. Operator sees a gap -> has to navigate to /admin/quotes / new and pick the date manually. | P3 |

### B.6 Performance

| # | Finding | Severity |
|---|---|---|
| CAL-3 | `orderService.getAllOrders(companyId)` (line 130) returns the whole company history. Calendar shows one month at a time; we haul years of orders to render 30 cells. Unlike Dispatch / Live ops, the user CAN navigate to any month so we can't ship a hard "today-only" filter - but a sliding 12-month window around the currently-visible month would still trim 90%+ on a multi-year tenant. | **P1** |

---

## C. Priority fix list

**P0** (safety):
- CAL-1: Remove `@ts-nocheck`

**P1** (UX critical):
- CAL-2: Add narrow realtime sub on `orders` so cross-tab edits land without a manual refresh
- CAL-3: Server-side sliding date window (±6 months around current view)

**P2** (data integrity + role coverage):
- CAL-4: Add region_admin + sales_admin to allowedRoles (after RLS check)
- CAL-5: Pull `maxConcurrent` from dispatchService.getDispatchSettings
- CAL-6: Extract DayDetailSheet

**P3** (polish):
- CAL-7: Hook grouping
- CAL-8: Print-friendly week view
- CAL-9: "Add quote on this date" CTA on empty cells

---

## D. First-wave PRs

| PR | Title |
|---|---|
| CAL-A | Remove `@ts-nocheck` (P0) |
| CAL-B | Realtime sub + sliding date window (CAL-2 + CAL-3 batch, P1) |
| CAL-C | maxConcurrent from settings + role coverage (CAL-4 + CAL-5 batch, P2) |
| CAL-D | Extract DayDetailSheet (CAL-6, P2) |

This push ships CAL-A (the safety fix). CAL-B through CAL-D land in subsequent PRs.
