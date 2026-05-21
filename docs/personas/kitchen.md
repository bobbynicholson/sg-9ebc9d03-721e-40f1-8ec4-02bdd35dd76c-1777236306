# Kitchen persona - UX decisions

**Audit date:** 2026-05-21
**Auditor:** Phase 3b kitchen sweep (Wave 80)
**Scope:** Kitchen team portal (`src/pages/team-portal/kitchen/**`) + admin-side kitchen surfaces (`src/pages/admin/kitchen-*`, `src/pages/admin/teams/kitchen.tsx`). Sibling persona doc: [`docs/personas/admin.md`](./admin.md).

This is the canonical reference for how kitchen-side work is done in the product, what the day actually looks like, and what the next change to a kitchen surface should preserve.

---

## 1. Who kitchen staff are

Two related personas share these surfaces:

- **Kitchen staff** (`role='kitchen_staff'`) - the chefs on the floor. They live on the kitchen team portal. They clock in, work through prep tasks, mark orders ready, hand off to drivers, clock out.
- **Kitchen-aware admins** (`role IN ('admin', 'company_admin', 'owner')`) - the owner / kitchen manager looking at staffing, settings, settlement. They live on the admin-side kitchen pages.

This audit treats both as one persona because the boundary between them is fluid in small caterers (the owner cooks on busy weekends).

The kitchen staff workflow runs on **shared tablets** at workstations, not personal phones. Touch targets, large readable type, and high-contrast colour matter more here than on the admin pages.

---

## 2. Kitchen team portal inventory (10 pages)

| Page | URL | Job-to-be-done | Status |
|---|---|---|---|
| `dashboard.tsx` | `/team-portal/kitchen` | Today's orders, mark ready, clock-in/out, alerts, demand preview | Primary surface |
| `today.tsx` | `/team-portal/kitchen/today` | Alias to dashboard (re-export) | Live |
| `duty.tsx` | `/team-portal/kitchen/duty` | Clock in/out, handover notes, payslip preview | Live |
| `production.tsx` | `/team-portal/kitchen/production` | 24-hour timeline grid per order, task status blocks | Live |
| `prep-list.tsx` | `/team-portal/kitchen/prep-list` | Ingredient demand aggregated across orders | Live |
| `menu.tsx` | `/team-portal/kitchen/menu` | Recipe lookup, allergens, yield | Live |
| `stock.tsx` | `/team-portal/kitchen/stock` | Stock check + log consumption (recipe-linked items only) | Live |
| `notifications.tsx` | `/team-portal/kitchen/notifications` | Inbox, all/unread, stale filter | Live |
| `settings.tsx` | `/team-portal/kitchen/settings` | **Redirect to /today** (settings moved to admin) | Live, intentional |
| `orders/[id]/ticket.tsx` | `/team-portal/kitchen/orders/:id/ticket` | Order ticket detail (re-export from admin) | Live, namespace-only |

No stale or placeholder pages. Every surface has a clear job and live wiring.

---

## 3. Admin-side kitchen surfaces (5 pages + 1 redirect)

| Page | Job-to-be-done | Status |
|---|---|---|
| `admin/teams/kitchen.tsx` | Team landing - hero, quick stats (active chefs, hours/week, jobs/today), tile shortcuts | Live |
| `admin/kitchen-schedule.tsx` | Weekly roster grid, events overlay, late/missed badges | Live, mobile-broken (section 5) |
| `admin/kitchen-staff.tsx` | Staff CRUD - hire, pay rates, departments, archive | Live |
| `admin/kitchen-settings.tsx` | Prep timing, BCEA thresholds, hot-hold limits, dietary alerts | Live |
| `admin/kitchen-settlement.tsx` | Pay periods, payslip issue, CSV export | Live |
| `admin/kitchen-duty-tracking.tsx` | **Redirect**: now points at `/admin/kitchen-schedule` (section 4.2) | Live, scheduled for removal |

---

## 4. Phase 3b changes

### 4.1 FIXED - kitchen notification links pointed admins into the wrong portal

`kitchenDutyService.ts` produced two kinds of admin notifications - `kitchen_clock_in` and `kitchen_clock_out` - both with `link: "/admin/kitchen-duty-tracking?shiftId=..."`. That URL is a redirect stub. The original redirect target was `/team-portal/kitchen/duty` (the kitchen-staff clock-in page), which bounced admins into the staff portal lens - wrong context for an admin who clicked the notification to see who's clocked in.

Both `kitchenDutyService.ts` link strings now point directly at `/admin/kitchen-schedule?shiftId=...` (the dispatcher's weekly grid with late/missed badges). `src/services/notifications/notificationDestinations.md` updated to match. New notifications go to the right place.

### 4.2 FIXED - the kitchen-duty-tracking redirect now serves the right audience

`admin/kitchen-duty-tracking.tsx` was kept as a redirect in Phase 3a (PR #208) because existing notification rows still link to it. The redirect target was `/team-portal/kitchen/duty` (wrong audience). It now redirects to `/admin/kitchen-schedule` and preserves the `shiftId` querystring so admins land where they should. The file can be deleted once the 180-day notification retention sweep clears the old rows.

### 4.3 Documented - kitchen day-of friction (see section 5)

This document. The friction items are scoped as follow-ups because their fixes need attention from someone actually working a kitchen shift to validate the right answer.

---

## 5. Day-of-prep friction findings (follow-ups)

These are real friction points found in the audit. Each lands as its own focused PR because the right fix needs in-shift validation, not desktop guessing.

### 5.1 Mobile-broken kitchen-schedule

Already flagged in `docs/personas/admin.md` section 6. The 7-day-by-N-chef grid renders at `min-w-[110px]` per day column, requiring horizontal scroll at any width below ~1200px. A kitchen manager checking tomorrow's roster on their phone gets a soup of overlapping cells.

Fix shape: render a card-stack on mobile (one card per day, expandable for chef list) and keep the existing grid at `md+`. File: `src/pages/admin/kitchen-schedule.tsx` line ~470-654.

### 5.2 No "what's next" cue after a prep task completes

Chef finishes a task on `/team-portal/kitchen/production`, the task row updates in realtime, but nothing surfaces "your next critical task is X". The chef has to scan the full timeline to find it.

Fix shape: after task completion, compute the next-most-urgent task across all orders (sort by `event_time - now - prep_duration`) and surface as a chip near the just-completed row. File: `src/pages/team-portal/kitchen/production.tsx`.

### 5.3 No overdue toast when a prep task's countdown goes negative

The dashboard re-renders every 60s with the new countdown, but a task slipping past its deadline only shows a static red number. Chefs miss it visually during a busy service.

Fix shape: `useEffect` watching each task's `formatCountdown(mins) < 0` flip from false to true, emit a destructive toast + soft alarm sound. File: `src/pages/team-portal/kitchen/production.tsx` (or wherever the countdown logic lives).

### 5.4 prep-list page has no cue when an order is ready for driver handover

Chef is deep in `/team-portal/kitchen/prep-list` working through ingredients when a parallel order hits "ready". The handover panel only renders on the dashboard, so the chef doesn't see it until they navigate back. The handover-pending count should surface as a chip in the `KitchenNav` header so it follows the chef across pages.

Fix shape: subscribe to `orders.status='ready' AND NOT EXISTS (handover signed)` count in `KitchenNav`, show a clickable chip when > 0. File: `src/components/navigation/KitchenNav.tsx`.

### 5.5 Handover panel doesn't distinguish "no driver yet" from "ready to sign"

`HandoverToDriverPanel.tsx` shows "No driver assigned yet" when there's no `driver_assignments` row. The kitchen lead can't tell if dispatch has been notified or is unaware. Should split into two states with different CTAs:
- No driver assigned -> red, action: "Call dispatch"
- Driver assigned, awaiting sign-off -> amber, action: "Sign over to {driverName}"

File: `src/components/kitchen/HandoverToDriverPanel.tsx` line ~170-180.

### 5.6 Restock delta banner only shows the most recent bump

`dashboard.tsx` keyed restock deltas by `inventory_item_id`. If the shopper restocks the same item twice in one day, the second delta overwrites the first - chef sees the latest delta but never knew about the first. Pile them up instead of replacing.

File: `src/pages/team-portal/kitchen/dashboard.tsx` line ~137-244.

---

## 6. IA observation - "Kitchen rules" belongs inside Kitchen team

Already flagged in admin.md section 4. The `/admin/kitchen-settings` page (kitchen prep buffer, BCEA thresholds, hot-hold limits, dietary alerts) is operational, not platform configuration. It currently lives in admin's SETTINGS section. Mental model would be cleaner if it became a tab inside `/admin/teams/kitchen`.

Deferred - the move is small but every breadcrumb / inbound link needs to follow, and the right time to do it is during the next People-persona phase when the SETTINGS / PEOPLE redistribution happens together.

---

## 7. Open follow-ups summary

1. `kitchen-schedule.tsx` mobile redesign (card-stack < md).
2. `production.tsx` "next critical task" chip on task completion.
3. `production.tsx` overdue toast + alarm.
4. `KitchenNav.tsx` handover-pending chip.
5. `HandoverToDriverPanel.tsx` split state for "no driver" vs "awaiting sign".
6. `dashboard.tsx` restock delta pile-up (don't overwrite).
7. Move `/admin/kitchen-settings` into a tab inside `/admin/teams/kitchen` (during the People persona phase).
8. Delete `src/pages/admin/kitchen-duty-tracking.tsx` once the 180-day notification retention sweep clears old rows.
