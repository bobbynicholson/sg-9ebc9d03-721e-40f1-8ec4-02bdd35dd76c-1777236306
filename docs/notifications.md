# Notifications + comms backbone

**Audit date:** 2026-05-21
**Auditor:** Phase 4 (Wave 80)
**Scope:** Every notification producer (in-app, email, SMS, WhatsApp), every dedup rule, every tenant-facing toggle. The canonical reference. The next person who adds a notification reads this first.

Companion doc: [`src/services/notifications/notificationDestinations.md`](../src/services/notifications/notificationDestinations.md) (per-type link targets).

---

## 1. The canonical service

`src/services/notificationService.ts`. Public surface:

| Method | What it does |
|---|---|
| `getNotifications(userId, unreadOnly?, activeRole?, filters?)` | Read - paginated, role-filtered, optional type/priority/date filters |
| `markAsRead(notificationId)` | Mark single |
| `markAllAsRead(userId, activeRole?)` | Bulk |
| `deleteNotification(notificationId)` | Hard delete (rarely used) |
| `createNotification({...})` | Single-recipient insert |
| `broadcastNotification({...})` | Fan-out by role + region + dedup |

**Priority model**: `"normal" | "high" | "urgent" | "low"`. Surfaced in the UI as a coloured chip. The `effectivePriority()` helper in `src/lib/notificationDisplay.ts` degrades stale urgents to `normal` so a 19-day-old "URGENT" doesn't keep shouting.

**Dedup model**: `broadcastNotification` takes `dedup: boolean` (default false) and `dedupWindowMinutes: number` (default 60). When set, the service runs a probe query against `notifications` for the same `(company_id, type, relatedEntityId)` within the window; if a hit, the broadcast is a no-op. The probe is best-effort: a probe-query failure logs `console.warn("dedup probe failed; inserting anyway")` and proceeds, so a transient DB read failure can't silently drop legitimate notifications.

**Enum whitelist**: `NOTIFICATION_TYPE_ENUM_VALUES` (Set, line ~131). Mirrors the Postgres `notification_type` enum. When the two drift, broadcasts of the missing value silently fall back to populating only the text column and the typed `type` column stays null - dashboards that group by `type` miss the event. (Drift instance fixed in this phase: `quote_rejected` migration applied to live.)

---

## 2. Producers

### 2.1 In-app

**Canonical path - through `notificationService`**:

- `src/services/order/orderWorkflow.ts` `sendStatusNotifications()` - status fan-out (order_confirmed, driver_assigned, out_for_delivery, delivered, etc.).
- `src/services/order/orderWorkflow.ts` `case "confirmed"` - `new_job_available` broadcast to unassigned drivers (Phase 1 PR #202).
- `src/services/kitchenDutyService.ts` - `kitchen_clock_in` / `kitchen_clock_out` (Phase 3b PR #209 re-pointed link to `/admin/kitchen-schedule`).
- `src/services/kitchenPrepService.ts` - prep_completed milestone ping.
- `src/services/cancellation/runAutoCancel.ts` + `fireCancellationNotification.ts` - rich admin notification on cancel.
- `src/services/notificationService.ts` `sendDeliveryUpdate`, `sendReviewRequest`, `sendCustomerOrderUpdate`.
- `src/pages/api/orders/cancellation-review.ts` - admin review actions broadcast `cancellation_approved` / `cancellation_rejected`.
- `src/pages/api/orders/amendment-review.ts` - same for amendments.
- `src/pages/team-portal/cleaning/damage.tsx` - `equipment_shortage` broadcast on damage log (Phase 3c PR #210).
- `src/pages/api/webhooks/payment-confirmation.ts` - `payment_received` after PayFast IPN.
- `src/pages/api/payments/verify-claim.ts` - `payment_claimed` on EFT claim.

**Postgres trigger path (accepted bypass)**:

- `notify_driver_order_ready()` on `AFTER UPDATE OF status ON orders`. Direct INSERT into `notifications`. Gated on `ready_at IS NOT NULL OR collection_time <= now()` (Phase 1 PR #205). Stays as a trigger because:
  - The signal lives in Postgres where the application-layer service can't see it cleanly.
  - The trigger is the natural enforcement point and survives any code-path that flips `orders.status`.
  - The gate logic makes the trigger as restrictive as the service-layer broadcasts.

  Acknowledged escape valve. Future similar triggers MUST come with a docstring at the top of their migration explaining what, when, who-owns, and what could go wrong (per `docs/security-posture.md` section 4).

### 2.2 Email

`src/services/emailNotificationService.ts` drains the `email_automation_log` queue, calls `emailService.sendEmailViaAPI()` per batch. Provider is Resend by default with SMTP fallback per tenant config in `email_provider_settings`.

**Producers** that enqueue email rows:

- Postgres triggers `trg_order_email` (orders insert/status change), `trg_quote_sent_email` (quotes insert/sent).
- `src/services/email/*` modules build branded HTML + insert to the queue.
- `src/pages/api/admin/email-driver-payslip.ts` - direct send (skips the queue).
- `src/pages/api/admin/resend-email.ts` - resend wrapper.

**Drain**: cron at `src/pages/api/cron/process-email-queue.ts` reads `pending` rows, sends, flips to `sent` / `failed`.

**Not wired to the same in-app event**: a quote-sent email and a quote-sent in-app notification are produced by different code paths. They're not synchronised. A bug in the email queue does not show up in the bell badge and vice versa.

### 2.3 SMS

**No SMS integration exists today.** The `/admin/notification-settings` page has SMS toggles for "Critical Alerts" and "Payment Reminders" but there is no provider, no queue, no producer. The toggles are aspirational. Tooltip on the page updated in this phase to be honest about that.

### 2.4 WhatsApp

`src/services/whatsappIntegrationService.ts`. Three manual methods - `sendOrderConfirmation`, `sendDeliveryUpdate`, `sendPaymentReminder` - each calls Meta Cloud API directly.

**Fully manual**: no event-driven sends, no async queue. Caller must invoke the method explicitly. The `whatsapp_templates` table holds approved Meta templates; `connectWhatsApp` lives in `integrations` (May 2026 Wave 7 hardening).

**Guard**: `isCommsAllowed()` checks the phone number isn't on `blocked_contacts` and the tenant has WhatsApp enabled.

**Not wired to the same in-app event**: same drift as email. A WhatsApp send doesn't produce a `notifications` row. Future consolidation: produce an in-app notification AND queue the email/WhatsApp send from a single fan-out helper.

---

## 3. Channel matrix

Per notification type, where it should land. **`yes`** = wired today. **`?`** = produced by a different (parallel) path. **`-`** = not applicable.

| `notification_type` | In-app | Email | SMS | WhatsApp |
|---|:-:|:-:|:-:|:-:|
| `order_confirmed` | yes | yes (trg + queue) | - | ? (manual) |
| `order_ready` | yes (trigger) | ? | - | - |
| `driver_assigned` | yes | yes (trg) | - | - |
| `out_for_delivery` | yes | yes | - | ? (manual) |
| `delivered` | yes | yes | - | - |
| `payment_received` | yes | yes | - | - |
| `payment_reminder` | yes | yes | - | ? (manual) |
| `payment_claimed` | yes | yes | - | - |
| `driver_replacement_needed` | yes | - | - | - |
| `equipment_shortage` | yes | - | - | - |
| `stock_low` | yes | - | - | - |
| `quote_expiring` | yes | yes | - | - |
| `quote_rejected` | yes (Phase 4 enum fix) | - | - | - |
| `new_job_available` | yes (Phase 1) | - | - | - |
| `amendment_*` (4 variants) | yes | - | - | - |
| `cancellation_*` (3 variants) | yes | yes | - | - |
| `postponement_*` (3 variants) | yes | - | - | - |
| `domain_verified` | yes | - | - | - |
| `kitchen_clock_in` / `kitchen_clock_out` | yes | - | - | - |
| `trial_expiring` | yes | yes | - | - |
| `subscription_renewed` | yes | yes | - | - |

Anything marked `?` is a candidate for the consolidation work in section 5.

---

## 4. Tenant-facing settings

### 4.1 `/admin/notification-settings`

Per-user channel toggles. UI shape: `{ email: {orderConfirmation, orderUpdates, paymentReceived, dailySummary}, push: {urgentAlerts, newOrders, staffUpdates, inventoryAlerts}, sms: {criticalAlerts, paymentReminders} }`.

**Phase 4 fix**: persistence migrated from `localStorage` to `email_notification_preferences.preferences` (new `jsonb` column added in migration `20260521100000_notification_preferences_jsonb`). Previously the page saved to `localStorage` only - "Settings Saved" toast was technically true but the preferences had zero effect on delivery and were invisible from any other device.

The page now:
1. Hydrates from the DB on mount.
2. Falls back to `localStorage` if the DB row doesn't exist (first-time visitor) or the read fails (offline).
3. Falls back to in-component defaults if neither has a valid shape.
4. On save: upserts to the DB (source of truth), mirrors to `localStorage` (instant next-load).
5. Tooltips updated to stop lying - they now reference this doc for what's wired and what's pending.

**Consumer-side wiring is the open follow-up** (section 6). `notificationService.broadcastNotification` does not yet read `email_notification_preferences.preferences` before fan-out, so the toggles are saved but not yet honoured per recipient. Tracked.

### 4.2 `/admin/messaging-templates` and `/admin/email-templates`

Template editors for email + WhatsApp content. Tenant-tunable per channel. Independent of the per-user toggles in 4.1.

### 4.3 What's still missing

- Per-tenant "shut off this whole notification type for everyone" toggle. Useful for noisy types the tenant doesn't care about (e.g. `domain_verified` after the first verification).
- Per-recipient channel preference enforcement in the fan-out itself (see section 6).
- SMS provider integration.

---

## 5. Phase 4 changes

### 5.1 FIXED - enum drift

`quote_rejected` was in the TypeScript whitelist but not in the live Postgres enum. The migration file existed in `supabase/migrations/20260514170000_*` but had never been applied to live (`schema_migrations` confirmed). Broadcasts of `quote_rejected` were silently falling back to text-only inserts.

Applied to live via `mcp` apply_migration during this phase. The migration file is now reflected in `schema_migrations`.

### 5.2 FIXED - notification-settings persistence

See section 4.1.

### 5.3 Documented - channel matrix + producer map

This document.

---

## 6. Open follow-ups

1. **Consumer-side wiring for per-user preferences.** `notificationService.broadcastNotification` should look up each candidate recipient's `email_notification_preferences.preferences` and skip recipients whose preference is `false` for the relevant channel. Same for email queue producers.
2. **Per-tenant type-level mute.** A `companies.notification_settings` jsonb or similar so a tenant can shut off whole types without per-user opt-out.
3. **WhatsApp event triggers.** Move `whatsappIntegrationService` from manual-only to producer-pattern (queue + cron drain similar to email). Or merge: a single fan-out that produces in-app + email + WhatsApp from one broadcast.
4. **SMS provider integration.** The UI promises SMS toggles but there's no provider. Either remove the toggles or pick a provider (Twilio / Vonage / local SA).
5. **Type-vs-channel unification.** Consolidate the "channel matrix" (section 3) into a code structure so adding a new notification type forces a deliberate channel choice instead of falling out by accident.
6. **Per-recipient suppression list.** Tenants need to honour STOP/unsubscribe (legal requirement for marketing-adjacent emails). Today's `blocked_contacts` table is WhatsApp-only.
7. **CI guard for enum drift.** Compare `NOTIFICATION_TYPE_ENUM_VALUES` (TS) to the live Postgres enum at build time. Fail if a value exists in one but not the other. Same pattern as `scripts/check-migration-rls.mjs`.
