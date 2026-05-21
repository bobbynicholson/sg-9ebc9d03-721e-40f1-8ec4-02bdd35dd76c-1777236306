# Performance, observability, ops

**Audit date:** 2026-05-21
**Auditor:** Phase 6 (Wave 80) - final phase of the 6-phase audit.
**Scope:** List pagination, realtime channel scoping, observability stack, slow-query hot spots, the top-10 incident runbook. Closes out the 10,000-hour audit.

---

## 1. List pagination

### 1.1 Unbounded SELECTs found

**`getAllOrders`** in `src/services/order/orderCRUD.ts:182-202` selects `*` plus 7 nested foreign-key hydrations (`order_items(*)`, profiles, vehicles, quote, etc.) with no `.limit()` or `.range()`. Fired on every `/admin/orders` page load. On a tenant with 1000 orders this is several MB of JSON over the wire and a wide multi-table read on Postgres.

**`getQuotes`** in `src/services/quoteService.ts:70-76` - same pattern. Unbounded `select *` for the company.

Phase 6 doc'd, deferred to a focused PR. The fix is two-part:
- Add `.range(from, to)` to both functions.
- Split the heavy `getOrderById` (detail) shape away from the light `getOrdersListShallow` (list) shape - the list page doesn't need every joined row, just id/order_number/status/client_name/event_date.

### 1.2 Bounded queries (good citizens)

- `/admin/contacts` already paginates via `.range(from, to)` (`src/pages/admin/contacts.tsx:308`).
- `/admin/invoices` uses targeted lookups (`.limit(1)` per query when fetching a single invoice).

### 1.3 Pattern to follow

When you add a new admin list page:
1. Server-side pagination: `.range(offset, offset + pageSize - 1)`.
2. Server-side search: `.ilike(column, "%term%")` instead of client-side `Array.filter`.
3. Detail shapes (full joins) live in `getXById`. List shapes are explicit narrow `.select()` strings.

---

## 2. Realtime channel scoping

### 2.1 The pattern

Every `supabase.channel()` should:
1. Include the tenant in the channel name (`channel:${companyId}` or `channel:${userId}`) so the broadcast namespace is partitioned.
2. Include a `filter: 'company_id=eq.<id>'` on every `postgres_changes` event subscription so the backend never sends cross-tenant payloads over the wire.

The filter is the security gate; the channel name is the noise filter. Both matter.

### 2.2 Phase 6 fixes

**FIXED - cross-tenant realtime amplification + payload leak on `/admin/dashboard`**

`src/pages/admin/dashboard.tsx:434-437` previously used:
```
.channel("admin-dashboard-orders")
.on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => loadMetrics())
```

Channel name was global. The `postgres_changes` subscription had **no filter clause**. Result:
- Every order INSERT/UPDATE/DELETE on every tenant globally re-triggered `loadMetrics()` on every admin dashboard session in the world. Massive amplification under load.
- Postgres_changes payloads ride the channel even when the receiving session can't read the row under RLS. Other tenants' order row contents transited the wire.

Now: per-tenant channel name + `filter: 'company_id=eq.<companyId>'`. Same shape used elsewhere in the codebase (orders, quotes, kitchen).

**FIXED - same bug on `/admin/order-assignments`** (the dispatch queue)

`src/pages/admin/order-assignments.tsx:238-242`. Channel name was `"dispatch-queue"` (global), both `postgres_changes` subs had no filter. Same fix.

**TIGHTENED - per-tenant channel names** on three more places that already had the filter but used global channel names (less critical, just noisy):
- `/team-portal/driver/dashboard.tsx:429` `driver-orders` -> `driver-orders:${user.company_id}`
- `src/components/shopping/LowStockAlerts.tsx:35` `inventory-changes` -> `inventory-changes:${profile.company_id}`

### 2.3 Audit recommendation

Add a CI lint rule: `.channel(` calls must take an interpolated string that includes one of `companyId`, `company_id`, `user_id`, `userId`. Catches future drift. Same pattern as `scripts/check-migration-rls.mjs`. Deferred follow-up.

---

## 3. Observability stack

### 3.1 What exists today

**Nothing in production.** No Sentry SDK, no DataDog, no PostHog, no Logtail. Errors land in `console.error()` and are visible only in the user's browser DevTools (or Vercel's function logs for server errors). Tenant tags don't exist.

The platform-side `/admin/platform/tech-costs.tsx:134` budgets "$5/mo for monitoring (Sentry baseline)". `/admin/platform/running-todo.tsx:638` lists "Sentry error monitoring wired up" as a TODO. Both pre-date this audit.

### 3.2 What this means in practice

- A failed webhook (PayFast IPN, Stripe checkout completion, Resend bounce) is invisible to ops unless a customer complains.
- A silent enum-cast failure (the kind that bit `quote_rejected` in Phase 4) sits in production unnoticed until someone dashboards a count and sees zero where there should be hundreds.
- An RLS regression that breaks one tenant's reads silently is invisible until they raise a ticket.

### 3.3 Recommendation - explicitly deferred

Wiring Sentry is a 3-hour job:
1. `npm i @sentry/nextjs`.
2. Initialise in `_app.tsx` + `_document.tsx` with `companyId` + `userId` + `route` as tags on every event.
3. Replace ~15 strategic `console.error` calls with `Sentry.captureException`.
4. Add an alert routing rule for `urgent` priority notifications - if those start firing in a tenant, ops sees it before the tenant tickets.

This is the single highest-ROI follow-up in the audit. Deferred to a dedicated PR because it touches infrastructure decisions (account, project naming, retention) that need a real product call.

---

## 4. Slow-query hot spots

### 4.1 The expensive ones

| Site | Issue |
|---|---|
| `orderCRUD.ts:189-202` `getAllOrders` | `*` + 7 nested `(*)` joins, no limit. Single biggest cost on any /admin/orders load. |
| `quoteService.ts:70-76` `getQuotes` | `*` + foreign-key hydrations, no limit. |
| Various list pages | Client-side `.filter()` over the full result set instead of server-side `.ilike()`. Memory + render cost on big sets. |

### 4.2 Defensive helpers worth adding

- A wrapper around `.select("*, ...)` that logs in dev when the result exceeds N rows or M bytes. Caught early during local dev before mature-tenant production loads.
- A Supabase advisor-style nightly query that flags any table with > 50k rows but no related index on `company_id`.

Both deferred follow-ups.

---

## 5. Top-10 incident runbook

The product-specific incidents most likely to actually happen. For each: symptom (what the operator sees), first place to look, fix recipe.

### 5.1 PayFast IPN landed but order didn't flip to paid

- **Symptom**: customer says "I paid", PayFast dashboard shows the payment, but `/admin/orders` still says "Deposit pending".
- **First look**: `src/pages/api/webhooks/payment-confirmation.ts` and the `payments` table - did a row land for this order?
- **Second look**: was `setOrderPaymentStatus` rejected by the transition allowlist (Phase 2)? Logs would show "Invalid payment_status transition" warn.
- **Fix**: manually call `setOrderPaymentStatus(orderId, 'partial')` once the payment row exists; investigate why the webhook didn't (signature failure / IP allowlist drop).

### 5.2 Driver bell shows 5 unread for 2 hours, none clearable

- **Symptom**: driver portal bell badge stuck.
- **First look**: `notifications` table for that user. Are there stale rows older than `STALE_NOTIFICATION_DAYS`?
- **Second look**: is the `markAsRead` UPDATE landing? Realtime might be cached.
- **Fix**: bulk-clear via the "Clear stale" UI added in PR #199-205; if not stale, `update notifications set is_read=true where recipient_id=...`.

### 5.3 Kitchen tablet showing yesterday's prep tasks

- **Symptom**: chef opens `/team-portal/kitchen/today`, sees prep tasks for the wrong day.
- **First look**: timezone mismatch. `toLocalISO` computes day boundaries from `Date.now()` in the browser's timezone, but the company timezone is `companies.timezone`. Drift if the device is in a different zone than the kitchen.
- **Fix**: force a hard reload; longer-term, derive "today" from the server's tenant-zone-aware response, not the browser.

### 5.4 Quote sent but client never got the email

- **Symptom**: `/admin/quotes/[id]` shows "Sent at 14:23", client says no email arrived.
- **First look**: `email_automation_log` for that quote_id. Status `pending` / `failed` / `sent`?
- **Second look**: `outgoing_email_log` (the actual provider attempt log). Resend reject reason? Domain not verified?
- **Fix**: if domain unverified, `/admin/email-settings`; if rejected, check the client's inbox classification (spam folder); resend via `/admin/quotes/[id]` send button (idempotent on the email_automation_log row).

### 5.5 Same invoice number issued to two orders

- **Symptom**: two different orders have `invoice_number = "INV-2026-0047"`. Accountant flags it.
- **First look**: was the second one created via the `convert_quote_to_order` RPC path (which uses `consume_next_document_number` - safe) or via a different path that minted the number client-side?
- **Fix**: the RPC path is correct. Any new code that issues invoice numbers MUST go through `consume_next_document_number`. Add a CI grep that flags `invoice_number:` writes outside that function.

### 5.6 Tenant A's order shows up in tenant B's dispatch queue

- **Symptom**: SaaS-killer bug. Cross-tenant data leak.
- **First look**: Phase 1 audit dropped two anon RLS policies that allowed this. Re-check `docs/security-posture.md` section 1.3 - those policies should be gone.
- **Second look**: realtime channel filters. Phase 6 fixed the two unfiltered channels (dashboard + dispatch). Any new channel added since then must follow `docs/perf-and-ops.md` section 2.1.
- **Fix**: drop the offending policy / add the filter / verify with a two-tenant test.

### 5.7 Driver clock-in notification points admin into the wrong portal

- **Symptom**: admin clicks the bell notification "Kitchen staff clocked in" and lands on the kitchen-staff portal (wrong audience).
- **First look**: Phase 3b PR #209 fixed this by re-pointing the link to `/admin/kitchen-schedule`. If it's recurring, check whether a new notification producer was added with the old URL pattern.
- **Fix**: update the link in the producer; the redirect at `/admin/kitchen-duty-tracking` still catches old notification rows.

### 5.8 Refund issued but order still marked paid

- **Symptom**: cancellation wizard fired a refund payment row, but `orders.payment_status` is still `paid`.
- **First look**: Phase 2 audit added `setOrderPaymentStatus` chokepoint. Is the refund cascade going through it? Check `runAutoCancel.ts` after Phase 2 PR.
- **Second look**: did the transition allowlist block the flip (`paid -> refunded` is allowed; `paid -> partially_refunded` is allowed; failures land as warn-log only).
- **Fix**: manual `setOrderPaymentStatus(orderId, 'refunded')` if the payment row is real; investigate why the cascade's call returned `!success`.

### 5.9 New tenant lands on a blank "your progress is 0%" page instead of the wizard

- **Symptom**: after signup, the new tenant lands on `/admin/onboarding` but sees a dashboard with no clear "start setup" CTA.
- **First look**: Phase 5 PR #215 deleted the conflicting `onboarding.tsx` shadow. If it's recurring, check whether the file was recreated or another file shadows the wizard.
- **Fix**: ensure `pages/admin/onboarding/index.tsx` is the only file claiming the route.

### 5.10 Order ready notification fires the day before the event

- **Symptom**: customer / driver gets "Order ready for pickup" 24 hours too early.
- **First look**: Phase 1 PR #205 hardened the `notify_driver_order_ready` trigger. It now requires either `ready_at IS NOT NULL` (kitchen actually marked it ready) OR `collection_time <= now()` (it's actually time). Check whether the trigger fired despite both being false - DB function would have been re-deployed.
- **Fix**: re-apply the migration if the function was overwritten; investigate why something else flipped `orders.status='ready'` (manual SQL, smoke test, broken admin flow).

---

## 6. Phase 6 changes

### 6.1 FIXED - two cross-tenant realtime leaks

`/admin/dashboard` and `/admin/order-assignments` realtime channels rewired (section 2.2). Per-tenant channel names + `company_id=eq` filter on every postgres_changes subscription.

### 6.2 TIGHTENED - three realtime channels with shared names

`/team-portal/driver/dashboard`, `/components/shopping/LowStockAlerts`, and (now-fixed) dispatch queue - per-tenant channel names everywhere. Filter was already in place on the driver + low-stock ones; this is the noise-side fix.

### 6.3 Documented - this file

Sections 1-5. Phase 6 also closes out the 6-phase audit; see Section 7 for the wrap.

---

## 7. The 10,000-hour audit wrap

Six phases done, plus follow-ups on Phase 5. The canonical docs are:

| Doc | Phase | What it covers |
|---|---|---|
| [`docs/security-posture.md`](./security-posture.md) | 1 | RLS, API routes, SECURITY DEFINER, triggers, schedulers, CI guard |
| [`docs/money-flow.md`](./money-flow.md) | 2 | Order/payment/invoice/quote state machines, `setOrderPaymentStatus` chokepoint, cancellation invariants |
| [`docs/personas/admin.md`](./personas/admin.md) | 3a | Tenant-admin pages + IA + follow-ups |
| [`docs/personas/kitchen.md`](./personas/kitchen.md) | 3b | Kitchen team portal + admin-side kitchen surfaces |
| [`docs/personas/cleaning.md`](./personas/cleaning.md) | 3c | Cleaning team portal + admin-side cleaning surfaces |
| [`docs/personas/shopping.md`](./personas/shopping.md) | 3d | Shopping team portal + admin shopping/payables/suppliers |
| [`docs/personas/client.md`](./personas/client.md) | 3e | Public quote, magic-link order pages, client portal |
| [`docs/personas/owner.md`](./personas/owner.md) | 3f | Owner persona (currently a fiction; canonical role is company_admin) |
| [`docs/notifications.md`](./notifications.md) | 4 | Producer map, channel matrix, tenant settings, enum drift fixed |
| [`docs/tenant-lifecycle.md`](./tenant-lifecycle.md) | 5 | Signup -> onboarding -> first event, region scoping, offboarding, subscription gating |
| [`docs/perf-and-ops.md`](./perf-and-ops.md) | 6 | This doc |

15 PRs landed (PR #199 through PR #216, plus this one). Each PR was scoped to a single phase or a single follow-up.

### Open follow-ups still owned by phase docs (not by this one)

- Phase 5: `orders.region_id NOT NULL` backfill, tenant-level offboarding, first-event coachmarks, subscription tier matrix, Stripe webhook.
- Phase 4: consumer-side preference wiring on `broadcastNotification`, WhatsApp event triggers, SMS provider, type-vs-channel unification.
- Phase 3 personas: each persona doc carries its own follow-up list.

### Top remaining-priority items across all phases

1. **Wire Sentry with tenant tags** - section 3.3. Single highest-ROI follow-up.
2. **`getAllOrders` + `getQuotes` pagination** - section 1.1.
3. **Consumer-side wiring for notification preferences** - the toggles in `/admin/notification-settings` persist but don't yet affect delivery.
4. **`orders.region_id` backfill + NOT NULL** - Phase 5 deferred.
5. **CI lint for realtime channel scoping** - section 2.3.
