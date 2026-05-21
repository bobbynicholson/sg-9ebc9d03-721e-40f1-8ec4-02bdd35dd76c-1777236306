# Cleaning persona - UX decisions

**Audit date:** 2026-05-21
**Auditor:** Phase 3c cleaning sweep (Wave 80)
**Scope:** Cleaning team portal (`src/pages/team-portal/cleaning/**`) + admin-side cleaning surfaces (`src/pages/admin/cleaning-schedule.tsx`, `src/pages/admin/teams/cleaning.tsx`). Sibling docs: [`admin.md`](./admin.md), [`kitchen.md`](./kitchen.md).

---

## 1. Who cleaning staff are

Depot-based operators who cycle equipment through a dirt -> wash -> ready loop tied to orders. Two flavour modes:

- **Pre-event readiness pass**: tomorrow's orders need clean equipment in the right counts. Cleaner checks the equipment is washed, the kitchen is wiped, the chiller is clean, signs off so the kitchen team can start prep on a known state.
- **Post-event return + clean cycle**: equipment comes back from a delivery, cleaner verifies count, flags any damage, runs the wash, marks ready for the next event.

Cleaners work on **shared depot tablets** at the wash bay, often with wet hands. Touch targets and offline-tolerant flows matter.

---

## 2. Cleaning team portal inventory (10 pages)

| Page | URL | Job-to-be-done | Status |
|---|---|---|---|
| `dashboard.tsx` | `/team-portal/cleaning` | Today's handovers, jobs queue, pre-event readiness, equipment verification panel, damage flag form | Primary surface |
| `tasks.tsx` | `/team-portal/cleaning/tasks` | Scheduled cleaning tasks (today/mine/all filter) | Live, overlaps with schedules |
| `schedules.tsx` | `/team-portal/cleaning/schedules` | Recurring cleaning roster (create / assign / complete) | Live, overlaps with tasks |
| `equipment.tsx` | `/team-portal/cleaning/equipment` | Equipment inventory verification, flag missing/damage inline | Core day-of |
| `supplies.tsx` | `/team-portal/cleaning/supplies` | Cleaning consumables stock tracker | Live |
| `damage.tsx` | `/team-portal/cleaning/damage` | Damage ledger - add + cost estimate, resolved toggle | Live (Phase 3c notification added) |
| `workflows.tsx` | `/team-portal/cleaning/workflows` | SOPs by equipment category (chafing dish, dishware, etc.) | Live, under-linked |
| `handovers/[id].tsx` | `/team-portal/cleaning/handovers/:id` | Per-event handover detail, mark all done, sign-off notes | Live |
| `notifications.tsx` | `/team-portal/cleaning/notifications` | Cleaning inbox, stale filter | Live |
| `settings.tsx` | `/team-portal/cleaning/settings` | Photo requirements, auto-bill missing, cost multiplier, low-stock alerts | Live |

**FLAG**: `tasks.tsx` vs `schedules.tsx` near-overlap. Schedules is the recurring roster, tasks is the today completion view. Boundary is real but unclear in the UI. Documented as a follow-up.

---

## 3. Admin-side cleaning surfaces (2 pages)

| Page | URL | Job-to-be-done | Status |
|---|---|---|---|
| `admin/cleaning-schedule.tsx` | `/admin/cleaning-schedule` | Weekly roster grid (same UI as kitchen-schedule) | Live |
| `admin/teams/cleaning.tsx` | `/admin/teams/cleaning` | Team landing - hero + stats + shortcuts to schedule + staff filter | Live |

**GAP**: no admin dashboard aggregating damages by category, supply par-rate trends, or day-of cleaning incidents. Admin has to navigate `damage.tsx` -> `supplies.tsx` -> `cleaning-schedule.tsx` separately to correlate.

---

## 4. Phase 3c changes

### 4.1 FIXED - damage reports now ping admin

`src/pages/team-portal/cleaning/damage.tsx` `saveCreate()` inserted into `equipment_damages` and stopped. Kitchen and admin had no signal until someone manually opened the damage ledger - which meant a broken chafing dish at Friday's event got discovered while packing Saturday's. Cleaner already knew about it on Friday afternoon.

Now broadcasts a `notification_type: equipment_shortage` (the existing enum value that already carries the kitchen-impact semantic - no new enum migration required) to `company_admin`, `admin`, `owner` roles with:
- Title: `Equipment damage logged: <type>`
- Message: damage type + equipment name (if selected from dropdown) + repair-cost estimate + first 120 chars of notes
- Priority: high
- Link: `/admin/equipment?tab=shortages` (the existing shortages surface)
- Related entity: `equipment_damage / <id>`
- Dedup: 60-minute window so a cleaner editing the same row in quick succession doesn't spam the bell

Non-fatal: a notification broadcast failure logs `console.warn` but doesn't roll back the damage row. The damage ledger is the source of truth, the notification is a heads-up.

---

## 5. Day-of friction findings (follow-ups)

Documented, each landing as its own focused PR.

### 5.1 Equipment table has no equipment_id link to damages

`equipment_damages` schema has `company_id, order_id, damage_type, resolved, handover_id, created_at, reported_by, notes, repair_cost` - but no `equipment_id`. The damage.tsx form has an equipment dropdown (state var `equipmentId`) but the value is never persisted because there's no column. Cleaner picks "Chafing dish - 8L" and the link is silently dropped.

Fix shape: migration to add `equipment_id uuid REFERENCES equipment(id)`, update the insert payload, update damage ledger UI to show the equipment name from the join. Defer because the fix touches the equipment shortage detail page too.

### 5.2 ~~Post-return doesn't notify kitchen~~ - Done

Resolved in post-audit follow-up. `handovers/[id].tsx` `handleCompleteHandover` now broadcasts a notification to `kitchen_staff / company_admin / admin / owner` when the post-return handover is signed off. Message includes the order number + verified item count. Dedup window 60min on the same handover. Uses notification_type `delivered` (kitchen's "equipment back in stock" signal). Non-fatal on broadcast failure.

### 5.3 Supplies low without proactive alert

`supplies.tsx` has a manual "below par only" checkbox. Cleaner has to remember to check it. `settings.tsx:notifyShoppingOnLowStock` exists but isn't wired to anything that emits an alert on the cleaning dashboard.

Fix shape: dashboard banner when any cleaning supply hits 60% of par, plus a `stock_low` notification (existing enum value) to admin when it crosses 30%.

### 5.4 Workflow SOPs not linked from equipment.tsx

`workflows.tsx` has SOPs by category but nothing on `equipment.tsx` or `EquipmentVerificationPanel.tsx` links to them inline. A cleaner verifying a chafing dish can't tap "how to clean this" from where they are - they have to switch pages.

Fix shape: add an inline "How to clean?" icon next to each equipment row that links to `workflows.tsx?category=<x>`.

### 5.5 tasks.tsx and schedules.tsx near-duplicates

Both show scheduled cleaning work. Schedules owns recurring assignment, tasks owns one-off completion. The boundary works but the discovery is poor - cleaners hit both with similar expectations.

Fix shape: either consolidate to a single page with tabs (Recurring | One-off), or clarify the headers + add cross-page links explaining the split.

### 5.6 Admin landing page is sparse

`/admin/teams/cleaning` is essentially a tile grid. Missing: damages-this-week card (count + top 3 categories), supplies-below-par card, day-of incident summary. Admin currently has to navigate three separate pages to correlate.

Fix shape: add 2 widget cards to the landing page reading from `equipment_damages` + `inventory_items` (cleaning category) - similar pattern to the dashboard widget rack.

---

## 6. Open follow-ups summary

1. `equipment_damages` schema add `equipment_id` column + form persistence.
2. Post-return handover completion -> kitchen notification.
3. Cleaning supplies low-stock dashboard banner + notification wiring.
4. `equipment.tsx` inline "How to clean?" link to `workflows.tsx`.
5. `tasks.tsx` / `schedules.tsx` consolidation or clearer split.
6. `/admin/teams/cleaning` add damages + low-supply summary cards.
