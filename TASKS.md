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

- [ ] T.001 — Purge test orders ORD-003830 and ORD-003831
  **What:** Remove the two spit-braai-delivery test orders left in production
  **Why:** They pollute the tenant's order list and reporting
  **Files:** `/admin/orders` → row → "Cancel or remove" → Purge (TIGHTEN I.121)
  **Done when:** Both orders gone from `/admin/orders` for `spit-braai-delivery`

- [ ] T.002 — Alert for late equipment return (no 24h timeout)
  **What:** When a cleaning handover sits in `expected` state overnight, send an alert to the operator
  **Why:** Collection-next-morning events leave equipment untracked with no automatic follow-up
  **Files:** `src/pages/api/cron/`, `cleaning_event_handovers` table
  **Done when:** Cron job fires an alert if a handover is `expected` >20h after event end

- [ ] T.003 — Damage broadcast to kitchen lead mid-service
  **What:** When cleaning flags damage during an event, push a realtime notification to kitchen lead
  **Why:** Currently damage reports don't reach kitchen in realtime — upgrade candidate from HANDOVER §18.5
  **Files:** `src/services/cleaning/`, `src/hooks/useOrderRefreshSignal.ts`
  **Done when:** Kitchen lead sees a toast/badge when damage_reports row is inserted for their event

- [ ] T.004 — Enforce receipt capture on shopping list close
  **What:** Block `shopping_list.status='completed'` unless a receipt image or a "no receipt" reason is attached
  **Why:** Compliance drift — lists close without receipts, breaking tax-purchase audit trail
  **Files:** `/team-portal/shopping/dashboard`, shopping list completion API
  **Done when:** UI shows a validation error on submit if neither receipt nor reason provided

- [ ] T.005 — Orphan shopping list cleanup cron
  **What:** Find `shopping_list` rows stuck in `in_progress` for >7 days and notify the operator
  **Why:** Orphan lists accumulate silently, distorting demand outlook
  **Files:** `src/pages/api/cron/`, `shopping_lists` table
  **Done when:** Cron runs daily, sends one email per tenant listing stale lists

- [ ] T.006 — Cost variance flag on shopping list completion
  **What:** When actual_total_spent differs from estimated cost by >15%, surface a warning to operator
  **Why:** Currently mismatch passes silently — no feedback loop on estimation accuracy
  **Files:** `/team-portal/shopping/dashboard`, `/admin/payables`
  **Done when:** Warning banner shown on completion + audit log entry

- [ ] T.007 — Outsource provider auto-fallback on decline
  **What:** When the primary outsource provider declines, surface a "Reassign" prompt and optionally auto-assign next available provider
  **Why:** Currently manual reassignment only — event can go without outsource coverage silently
  **Files:** `src/pages/api/admin/outsource-assignments/`, outsource_assignments table
  **Done when:** Decline action triggers reassignment flow (at minimum a notification + prompt)

---

## New Tasks (add yours below)

<!-- Example:
- [ ] T.008 — Feature name
  **What:** ...
  **Why:** ...
  **Files:** ...
  **Done when:** ...
-->

---

## Completed

<!-- Move tasks here with [x] when done, with the PR number -->

---

## Notes

- Latest TIGHTEN tag: **I.128** — next one you ship should be I.129
- Branch: `main` — push directly, PRs squash-merge, CI must pass
- Vercel auto-deploys on every push to `main`
- Run before every push: `npx tsc --noEmit` + `npm run check:status-filters`
