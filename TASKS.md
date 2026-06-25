# CateringMS — Task List

> Raj's working task board. Add new tasks here. Mark status as you go.
> Status: `[ ]` todo | `[~]` in progress | `[x]` done

---

## How to add a task

```
- [ ] T.NNN — Short title
  **What:** one sentence on what needs to change
  **Why:** the business/user reason
  **Files:** key files to look at first
  **Done when:** acceptance criteria
```

Use the next available T.NNN number.

---

## Open Work from Handover (Bobby's list)

- [x] T.001 — Purge test orders ORD-003830 and ORD-003831
  **What:** Remove the two spit-braai-delivery test orders left in production
  **Why:** They pollute the tenant's order list and reporting
  **Files:** `/admin/orders` → row → "Cancel or remove" → Purge (TIGHTEN I.121)
  **Done when:** Both orders gone from `/admin/orders` for `spit-braai-delivery`

- [x] T.002 — Alert for late equipment return (no 24h timeout)
  **What:** When a cleaning handover sits in `expected` state overnight, send an alert to the operator
  **Why:** Collection-next-morning events leave equipment untracked with no automatic follow-up
  **Files:** `src/pages/api/cron/`, `cleaning_event_handovers` table
  **Done when:** Cron job fires an alert if a handover is `expected` >20h after event end

- [x] T.003 — Damage broadcast to kitchen lead mid-service
  **What:** When cleaning flags damage during an event, push a realtime notification to kitchen lead
  **Why:** Currently damage reports don't reach kitchen in realtime — upgrade candidate from HANDOVER §18.5
  **Files:** `src/services/cleaning/`, `src/hooks/useOrderRefreshSignal.ts`
  **Done when:** Kitchen lead sees a toast/badge when damage_reports row is inserted for their event

- [x] T.004 — Enforce receipt capture on shopping list close
  **What:** Block `shopping_list.status='completed'` unless a receipt image or a "no receipt" reason is attached
  **Why:** Compliance drift — lists close without receipts, breaking tax-purchase audit trail
  **Files:** `/team-portal/shopping/dashboard`, shopping list completion API
  **Done when:** UI shows a validation error on submit if neither receipt nor reason provided

- [x] T.005 — Orphan shopping list cleanup cron
  **What:** Find `shopping_list` rows stuck in `in_progress` for >7 days and notify the operator
  **Why:** Orphan lists accumulate silently, distorting demand outlook
  **Files:** `src/pages/api/cron/`, `shopping_lists` table
  **Done when:** Cron runs daily, sends one email per tenant listing stale lists

- [x] T.006 — Cost variance flag on shopping list completion
  **What:** When actual_total_spent differs from estimated cost by >15%, surface a warning to operator
  **Why:** Currently mismatch passes silently — no feedback loop on estimation accuracy
  **Files:** `/team-portal/shopping/dashboard`, `/admin/payables`
  **Done when:** Warning banner shown on completion + audit log entry

- [x] T.007 — Outsource provider auto-fallback on decline
  **What:** When the primary outsource provider declines, surface a "Reassign" prompt and optionally auto-assign next available provider
  **Why:** Currently manual reassignment only — event can go without outsource coverage silently
  **Files:** `src/pages/api/admin/outsource-assignments/`, outsource_assignments table
  **Done when:** Decline action triggers reassignment flow (at minimum a notification + prompt)

---

## New Tasks (add yours below)

### Orders: timeline + details for everyone (Raj, 2026-06-25)

- [ ] T.008 — Invoice itemized breakdown (read-only, like the order)
  **What:** Show the same line items as the order/quote (menu items, equipment/hire-in, packages) on the invoice, READ-ONLY.
  **Why:** Invoice currently shows only totals; client can't see what they're paying for.
  **Files:** `src/pages/pay/i/[token].tsx`, `src/pages/api/public/invoices/[token]/get.ts` (data is in `invoice_data` JSON snapshot); reference layout `src/pages/q/[token].tsx`.
  **Done when:** Invoice lists menu + equipment read-only; totals sum + agree.

- [ ] T.009 — Order-timeline colour legend
  **What:** Add a visible legend: GREEN=done, RED=problem, ORANGE=needs-to-be-done, GREY=not started; audit every status maps right.
  **Why:** Colours already used but nothing tells users what they mean.
  **Files:** `src/components/admin/orders/TimelineTrack.tsx` (already colours stages correctly; no legend exists).
  **Done when:** Legend visible near the timeline on every order surface; colours stay literal (not brand-*).

- [ ] T.010 — Kitchen: admin-style timeline, role-scoped (no finances)
  **What:** Show the shared order status timeline to kitchen; hide all finances; fix the menu price leak.
  **Why:** Kitchen has no admin-style timeline; kitchen must not see pricing.
  **Files:** kitchen order view; finance leak at `src/pages/team-portal/kitchen/menu.tsx:258` (`R {base_price}`).
  **Done when:** Kitchen sees the timeline + menu/equipment, zero finance data; menu price leak gone.

- [ ] T.011 — One status timeline for all roles
  **What:** Identical timeline (stages + colours + behaviour) for admin/client/kitchen/driver/cleaning/shopping; only surrounding detail differs.
  **Why:** Avoid per-surface drift.
  **Files:** `src/components/order/sections/OrderTimelineSection.tsx`, `TimelineTrack.tsx`.
  **Done when:** All roles consume one shared timeline + one stage definition.

- [ ] T.012 — Route all roles to the unified order document (UMBRELLA — mostly exists)
  **What:** Point every staff portal's "open order" link at the unified `/order/[id]` document instead of bespoke pages.
  **Why:** `src/components/order/OrderDocument.tsx` ALREADY does timeline + menu/equipment for all roles with finance auto-gating + client-scoping. Driver already deep-links to it.
  **Files:** GAP — kitchen still links to its own ticket: `src/pages/team-portal/kitchen/dashboard.tsx:1228` and `:1941` → `/team-portal/kitchen/orders/[id]/ticket`. Audit shopping/cleaning/waiter too.
  **Done when:** Every role opens `/order/[id]`; bespoke kitchen ticket retired or print-only. (Knocks out most of T.010/T.011/T.013.)

- [ ] T.013 — Fix duplicated prep/cook display (show once, same for all)
  **What:** Prep/cook shows twice on a particular order; render once with consistent wording.
  **Why:** Confusing duplicate ("prep cook" + "prep and cook").
  **Files:** `src/components/order/sections/KitchenSection.tsx` (renders once, lines 423-428), `src/components/kitchen/KitchenPrepTasksCard.tsx`, kitchen ticket page; or duplicate `kitchen_prep_tasks` rows in data.
  **Done when:** Prep/cook appears once per item, identical for all users; data deduped if needed.

### Manager / team model for kitchen & cleaning (Raj, 2026-06-25)

> Today kitchen + cleaning are flat (kitchen_staff / cleaning_staff, no manager tier).
> Raj wants a MANAGER + TEAM model for both: managers receive work, assign tasks to
> their team, clock team in/out, see more; staff just do their assigned task and see
> nothing else. Manager has extra roles and doesn't have to do the hands-on work.

- [ ] T.014 — Manager/team role model (UMBRELLA)
  **What:** Add manager tier for kitchen + cleaning; manager assigns tasks to team + clocks team in/out; staff locked to own task only.
  **Why:** No manager tier exists today; teams need a lead who delegates.
  **Files:** `user_role` enum (likely add `kitchen_manager` + `cleaning_manager` — mind enum gotchas, no short forms), `middleware.ts` ROUTE_GUARDS, `authGuards.ts` landing pages, `user_departments` mapping, RLS.
  **Done when:** Manager + staff roles exist for both teams with correct landing, permissions, RLS. (Confirm enum + permission design with Raj first.)

- [ ] T.015 — [26] Multiple managers, admin selects + availability, cross-team, staff limited
  **What:** Multiple managers allowed; admin picks which + sees availability (clocked-in/on-shift); kitchen manager can see cleaning dashboard; staff see only their task.
  **Why:** Admin needs to assign the right available manager; managers need cross-team view.
  **Files:** admin user/assignment UI, availability surface, cleaning dashboard access for kitchen manager.
  **Done when:** Admin can select among multiple managers with availability shown; kitchen mgr sees cleaning dashboard; staff stripped to own task. (Depends on T.014.)

- [ ] T.016 — [27] Manager clocks staff in/out (and self)
  **What:** Manager can clock a chosen team member in/out, plus themselves; record who did it.
  **Why:** Manager runs attendance for the team.
  **Files:** check for existing clock-in/shift/attendance tables first; manager dashboard.
  **Done when:** Manager clocks team in/out with audit of actor; feeds availability (T.015). (Depends on T.014.)

- [ ] T.017 — [30] Kitchen should see the shopping list
  **What:** Kitchen (manager and/or staff) sees the shopping list for their order(s), read-only.
  **Why:** Kitchen needs to know what's being bought.
  **Files:** `OrderDocument` ShoppingSection visibility for kitchen, or a dedicated read-only view.
  **Done when:** Kitchen sees the relevant shopping list read-only. (Confirm manager-only vs all-kitchen.)

- [ ] T.018 — [29] Default window of 7 days incl. kitchen  — NEEDS CLARIFICATION
  **What:** Default date/range window = 7 days, also applied to kitchen.
  **Why:** (TBC) consistent default lookahead.
  **Files:** TBC once the target view is confirmed.
  **Done when:** Confirmed view(s) default to 7 days incl. kitchen. **Clarify: 7-day default for WHICH view?**

- [ ] T.019 — [28] "Add to list" → "Added" confirmation  — NEEDS CLARIFICATION
  **What:** When adding to a list, confirm with an "Added" state/feedback.
  **Why:** (TBC) user feedback on add.
  **Files:** TBC once the list/button is confirmed.
  **Done when:** Add action shows confirmation. **Clarify: which list/button, and label vs toast vs real persistence?**

---

## Completed

<!-- Move tasks here with [x] when done, with the PR number -->

- [x] 2026-06-25 — T.001-T.007 completed. Also patched client dashboard audit items CLI-13 through CLI-20 from `docs/audits/client-dashboard-deep-audit-2026-05-19.md`.

---

## Notes

- Latest TIGHTEN tag: **I.129**
- Branch: `main` — push directly, PRs squash-merge, CI must pass
- Vercel auto-deploys on every push to `main`
- Run before every push: `npx tsc --noEmit` + `npm run check:status-filters`
