# CateringMS megaprogramme audit, Phase 0

**Date originally produced:** 2026-05-07
**Date landed on main (refresh):** 2026-05-18
**Branch:** `audit/megaprogramme-2026-05-refresh` (off main)
**Status:** Reconnaissance only. No code changes in this phase.
**Live tenant under review:** Spit Braai Delivery (slug `spit-braai-delivery`).
**Skylight as platform admin** (super_admin role).

This document is the Phase 0 deliverable for the multi-phase audit-and-implementation
programme. It walks every surface, journey, and data path across the four audiences
(Skylight, tenant admin, tenant staff, tenant client) and lands a prioritised
findings ledger that the implementation phases run off.

> **Refresh note (2026-05-18).** Phases 1-10 have already shipped against this
> audit (closeouts at `docs/audits/megaprogramme-2026-05-phase-{1..10}.md`).
> The body of this document is the original Phase 0 deliverable, preserved
> verbatim so every closeout's `P0-NN` / `P1-NN` reference still resolves.
> The new **Appendix A** at the bottom maps every finding to its current
> disposition (fixed in which phase, deferred, or operator-action). Use the
> appendix for "what's still open" and the body for "what each finding meant
> when it was raised". This refresh adds no code changes.

> **Relationship to `src/pages/admin/platform/running-todo.tsx`.** The operator
> already maintains a structured running-todo with Phase 2A--2F sub-phases, plus
> an integrations / testing / launch backlog. That document is the authoritative
> shipping log. This audit cross-references those Phase IDs (2A through 2F) where
> findings overlap and flags new findings the running-todo does not yet capture.
> The intent is to add to the operator's shipping log, not replace it.

---

## How this document is laid out

| Section | Topic |
|---|---|
| 1 | System inventory (pages, services, API routes, tables, cross-cutting concerns) |
| 2 | Persona journey maps (4 audiences, 13 journeys, 4-axis scoring) |
| 3 | Data integrity audit (schema, RLS, FKs, lifecycle, audit trails) |
| 4 | UI / UX consistency audit |
| 5 | Communication flows audit (every email and notification, end to end) |
| 6 | Money flow audit (pricing, deposits, balances, refunds, accounting, reconciliation) |
| 7 | Onboarding gaps (signup -> first invoice sent) |
| 8 | Findings ledger (P0 / P1 / P2 / P3, by audience, by type, with effort) |

A quick legend used throughout:

- **P0** -- broken, unsafe, or blocks the lead-to-cash core flow. Fix in Phase 1.
- **P1** -- weekly friction or missing affordance on a key flow. Fix in Phase 2.
- **P2** -- polish: visual, micro-copy, accessibility. Fix in Phase 3.
- **P3** -- strategic upgrade: new capability, not a bug. Phase 4 design docs.
- **[2A]**, **[2B]** etc -- cross-references to running-todo phase IDs.

---

# Section 1: System inventory

## 1.1 Pages by audience

### Public (unauthenticated marketing + entry)

- `src/pages/index.tsx` -- marketing homepage
- `src/pages/pricing.tsx`, `uk/pricing.tsx`, `us/pricing.tsx`, `eu/pricing.tsx` -- regional pricing
- `src/pages/uk/index.tsx`, `us/index.tsx`, `eu/index.tsx` -- regional landing
- `src/pages/features.tsx` plus six `features/<topic>.tsx` deep-dives
- `src/pages/blog/index.tsx`, `blog/[slug].tsx`, `page/[slug].tsx` -- CMS
- `src/pages/contact.tsx`, `support.tsx`, `security.tsx`, `terms.tsx`, `privacy.tsx`, `demo.tsx`
- `src/pages/404.tsx`, `_document.tsx`

### Auth + signup

- `src/pages/auth/login.tsx`, `register.tsx`, `reset-password.tsx`, `callback.tsx`
- `src/pages/company-signup.tsx` (863 lines, full new-tenant flow)
- `src/pages/[company_slug]/login.tsx`, `[company_slug]/auth/callback.tsx`
- `src/pages/[company_slug]/client/login.tsx` -- client magic-link login

### Tenant admin (`/admin/*`, ~104 pages, daily driver)

Dashboards / pipeline:
- `admin/dashboard.tsx`, `admin/calendar.tsx`, `admin/leads/index.tsx`, `admin/leads/new.tsx`,
  `admin/quotes/index.tsx`, `admin/quotes/new.tsx`, `admin/quotes/[id].tsx`,
  `admin/orders.tsx` (2427 lines), `admin/contacts.tsx`, `admin/clients.tsx` (41-line redirect)

Money:
- `admin/invoices.tsx`, `admin/payments.tsx`, `admin/refunds.tsx`,
  `admin/financial-dashboard.tsx`, `admin/payment-gateways.tsx`, `admin/subscription.tsx`

Operations:
- `admin/menu.tsx`, `admin/inventory.tsx`, `admin/inventory-tracking.tsx`,
  `admin/inventory-recipes.tsx`, `admin/stock.tsx`, `admin/equipment.tsx`,
  `admin/vehicles.tsx`, `admin/suppliers/index.tsx`, `admin/suppliers/[id].tsx`,
  `admin/shopping.tsx`, `admin/route-planning.tsx`, `admin/tracking.tsx`,
  `admin/order-assignments.tsx`

People / payroll:
- `admin/users.tsx`, `admin/staff.tsx` (15-line stub), `admin/kitchen-staff.tsx`,
  `admin/driver-management.tsx`, `admin/driver-settlement.tsx`,
  `admin/teams/{index,kitchen,drivers,cleaning}.tsx`, `admin/staff-hours.tsx`,
  `admin/wages.tsx`, `admin/public-holidays.tsx`, `admin/hr-solutions.tsx`

Settings + comms:
- `admin/settings.tsx` (1241 lines), `admin/company-profile.tsx`, `admin/email-settings.tsx`,
  `admin/email-templates.tsx`, `admin/messaging-templates.tsx`,
  `admin/notification-settings.tsx`, `admin/notifications.tsx`, `admin/white-label.tsx`,
  `admin/tax-purchases.tsx`

Onboarding:
- `admin/onboarding.tsx`, `admin/onboarding/index.tsx` (1191 lines),
  `admin/onboarding/import.tsx`, `admin/onboarding/imports.tsx`,
  `admin/onboarding/clients.tsx`, `admin/onboarding/receipts.tsx`

Integrations + embed:
- `admin/integrations.tsx`, `admin/integrations/embed.tsx`,
  `admin/integrations/embed/[id].tsx`, `admin/integrations/embed/new.tsx` (18-line stub)

Stubs / redirects flagged:
- `admin/clients.tsx` (41 lines, redirects to contacts), `admin/staff.tsx` (15 lines),
  `admin/integrations/embed/new.tsx` (18 lines), `admin/job-progress-overview.tsx`
  (10 lines), `admin/kitchen-duty-tracking.tsx` (37 lines),
  `admin/[company_slug]/admin/dashboard.tsx` (3 lines)

### Platform admin / Skylight (`/admin/platform/*`)

- `admin/platform/dashboard.tsx`, `admin/platform/company-database.tsx`,
  `admin/platform/subscription-management.tsx`, `admin/platform/trial-management.tsx`,
  `admin/platform/user-management.tsx`, `admin/platform/financial-dashboard.tsx`,
  `admin/platform/pricing-management.tsx`, `admin/platform/tax-rules.tsx`,
  `admin/platform/currency-monitoring.tsx`, `admin/platform/tech-costs.tsx`,
  `admin/platform/cms-blog.tsx`, `admin/platform/cms-pages.tsx`,
  `admin/platform/settings.tsx`, `admin/platform/running-todo.tsx` (1751 lines)

Plus `super-admin.tsx`, `super-admin/admin/dashboard.tsx`.

### Tenant staff (team portals, `/team-portal/*`, 65 pages, mobile-first)

- Driver: `dashboard, routes, tracking, deliveries, earnings, schedule, notifications`
- Kitchen: `dashboard, duty, prep-list, menu, production, stock, settings, notifications`
- Shopping: `dashboard, inventory, orders, suppliers, receipts, alerts, invoices,
  kitchen-demand, settings, notifications`
- Cleaning: `dashboard, tasks, schedules, equipment, supplies, workflows, damage,
  settings, notifications`
- General: `team-portal/general/job-progress.tsx`

### Tenant client

Authenticated portal:
- `client-portal/{dashboard, my-orders, quotes, billing, tracking, notifications, profile}.tsx`

Tokenised (no login):
- `q/[token].tsx` -- public quote view + accept + change-request
- `c/order/[id].tsx` -- public order view (order-token)
- `c/account.tsx` -- legacy client account page (likely redirect candidate)
- `pay/i/[token].tsx`, `pay/i/[token]/success.tsx` -- public invoice payment
- `pay/invoice/[id].tsx`, `pay/invoice/[id]/success.tsx` -- legacy stubs (~40 lines)

Subscription:
- `subscription/checkout.tsx`, `subscription/success.tsx`, `client/subscription-invoices.tsx`

### Account + misc

- `account/settings.tsx`, `account/achievements.tsx`

**Totals:** ~262 page files. ~33 are stubs / redirects / very thin shims.

## 1.2 Services inventory

96 service files. The thirteen heaviest:

| Service | Lines | `@ts-nocheck` | Role |
|---|---:|:---:|---|
| `order/orderWorkflow.ts` | 1237 | -- | Order state machine and transitions |
| `invoiceGenerationService.ts` | 1354 | -- | Auto-invoice + numbering |
| `kitchenPrepService.ts` | 1255 | -- | Prep task generation + tracking |
| `dispatchService.ts` | 1051 | -- | Order dispatch to drivers |
| `emailService.ts` | 874 | -- | Email sending orchestrator (Resend / SMTP) |
| `accountingIntegrationService.ts` | 853 | -- | QuickBooks + Xero sync |
| `paymentProcessingService.ts` | 753 | -- | Payment gateway orchestration |
| `inventoryService.ts` | 748 | -- | Inventory CRUD + stock checks |
| `equipmentTrackingService.ts` | 740 | -- | Equipment checkout / location |
| `notificationService.ts` | 676 | yes | Unified notification creation + broadcast |
| `subscriptionService.ts` | 665 | -- | Subscription CRUD + trial |
| `kitchenStaffService.ts` | 664 | -- | Kitchen staff profiles + roster |
| `driverPayService.ts` | 655 | -- | Driver earnings + settlement |

Files carrying `// @ts-nocheck` per running-todo Phase 2F: 14 of the 15 worst-offender
money / auth services. Confirmed in the inventory: `order/postCreationCascade.ts`,
`notificationService.ts`, `lifecycleService.ts` carry `@ts-nocheck` plus the others
listed in Phase 2F.

## 1.3 API routes

~150 endpoints across `src/pages/api/**`. Grouped:

- **Auth / token:** `auth/{client-magic-link, client-provision-profile}`,
  `client-tokens/{validate, account, view}`
- **Public / embed / webhook:** `public/embed/[token]/{config, estimate, submit}`,
  `public/quotes/[token]/{view, accept, change-request}`,
  `integrations/{quotes, invoice-paid, leads, test-webhook}`,
  `webhooks/{payment-confirmation, stripe-confirmation, yoco-confirmation}`,
  `contact-form`
- **Admin user / domain:** `admin/{create-user, delete-user, email-failures,
  resend-email, embed/*, leads/[id]/convert-to-order, numbering-settings,
  resend/{create-domain, delete-domain, dns-check, verify-domain},
  backfill-lifecycle}`
- **Order:** `orders/[id]/{cancel, pause, resume, driver-ack, preview-as-client}`,
  `orders/{amendment-request, amendment-review, cancellation-request,
  cancellation-review}`
- **Email:** `send-email`, `send-invoice-email`, `cms/{upload-image, ai-draft}`,
  `emails/{non-login-welcome, owner-welcome}`, `process-email-notifications`,
  `cron/process-email-queue`
- **Payment:** `payments/{create-session, claim-eft, verify-claim}`,
  `payment-gateways/{[id]/activate, [id]/test, index}`
- **Import:** `imports/{upload, [id]/preview, [id]/map, [id]/commit, [id]/rollback,
  [id]/index, [id]/rows/[rowId]/{decision, repair}, templates/[type], receipts/upload}`,
  `onboarding/clients/bulk`
- **Accounting:** `accounting/quickbooks/{sync-invoice, callback}`,
  `accounting/xero/{sync-invoice, callback}`
- **Refund:** `refunds/[id]/{mark-paid, retry}`
- **Misc:** `receipts/[id]/rescan`, `quotes/request-edits`, `staff/[id]/invite-login`,
  `platform/{app-config, pricing-plans}`, `version`, `cron/{currency-check,
  late-event-check, process-pending-reviews}`
- **Debug / test:** `test-db`, `test-email`, `hello`, `integrations/test-webhook`,
  `admin/backfill-lifecycle`

Routes called out in running-todo Phase 2A as untrusted-input vectors and re-confirmed
here (need lockdown):
- `admin/create-user` -- accepts role + company_id from request body, no auth gate. **[2A]**
- `test-email`, `send-email` -- open SMTP relay, no auth in some branches. **[2A]**
- `integrations/{leads, quotes, invoice-paid}` -- per-key rate limit missing. **[2A]**

## 1.4 Shared components and cross-cutting concerns

Layout / nav components (and their near-duplication problem flagged in Phase 2D):
- `src/components/admin/AdminNav.tsx` -- tenant admin sidebar, master pattern
- `src/components/admin/PlatformNav.tsx` -- Skylight super_admin sidebar
- `src/components/navigation/{ClientNav, DriverNav, KitchenNav, ShoppingNav, CleaningNav}.tsx`
- A second `src/components/client/ClientNav.tsx` exists (duplicate of the navigation one)
- `src/components/Layout.tsx`, `src/components/PortalSwitcher.tsx`, `src/components/CompanySwitcher.tsx`
- `src/components/DynamicNav.tsx` -- router-aware nav switcher

Auth / guard:
- `src/components/ProtectedRoute.tsx` (uses `src/lib/authGuards.ts`)

Compose drawer (single source per running-todo + ui-conventions):
- `src/components/messaging/ComposeDrawerHost.tsx`
- `src/components/messaging/MessageComposer.tsx`

Cross-cutting helpers / pointers:
- Notification creation: `src/services/notificationService.ts:createNotification`,
  `:broadcastNotification`. Notification destination contract lives in
  `src/services/notifications/notificationDestinations.md`.
- Post-order cascade: `src/services/order/postCreationCascade.ts`. Idempotent guards
  on invoice, email, kitchen prep. Invoked from `quoteService.convertQuoteToOrder` and
  `pages/api/admin/leads/[id]/convert-to-order.ts`.
- Email pipeline: `src/services/emailService.ts:sendEmail`. Template resolver:
  `src/services/email/templateResolver.ts`. Cancellation emails:
  `src/services/email/cancellationEmails.ts`. Billing email templates:
  `src/services/billingEmailService.ts`.
- Service-role Supabase client: `src/lib/supabase/service.ts:getServiceSupabase`
  (used by branding lookup, embed APIs, lead-to-order convert, onboarding imports,
  payment service).
- Slug + tenant URL: `src/lib/tenantUrl.ts:useTenantHref`,
  `src/lib/navActiveMatcher.ts:matchesHref` etc.
- Currency: `src/lib/currencyUtils.ts` (FX rates currently hardcoded; running-todo
  Phase 2C item 9 calls for replacement).
- PayFast service: `src/lib/payfastService.ts`.

## 1.5 Database tables

The repo ships several master schema SQL files of varying staleness. The running-todo
Phase 2B explicitly calls out that the repo and the live DB have drifted: "no SQL file
matches live". The most recently authored migrations under `supabase/migrations/`
(109 of them, latest dated 2026-05-06) are authoritative for net-new and net-changed
DDL.

The base tables observed across `CATERINGMS_MASTER_DATABASE_SCHEMA.sql` and the
recent migrations:

Tenancy + auth: `companies`, `profiles`, `app_config` (per Phase 2B, `app_config`
ships without RLS).

CRM: `leads`, `clients`, `client_subscriptions`.

Sales + ops: `quotes`, `quote_items`, `orders`, `order_items`, `order_status_history`,
`order_amendment_requests`, `order_assignments`, `pending_reviews`,
`menu_items`, `recipes`, `recipe_ingredients`, `recipe_allergens`.

Money: `invoices`, `payments`, `refunds`, `payment_reminders`, `payment_gateways`,
`payment_claims`, `xero_integration_settings`, `quickbooks_integration_settings`,
`exchange_rates`, `tax_rules`, `sa_tax_deductibility_rules`, `invoice_counters`,
`document_number_settings`.

Inventory + procurement: `inventory_items`, `inventory_transactions`, `suppliers`,
`supplier_prices`, `purchase_history`, `shopping_lists`, `shopping_list_items`,
`receipt_uploads`, `receipt_items`, `import_sessions`, `import_rows`,
`import_quarantine`.

Equipment + cleaning: `equipment_inventory`, `equipment_assignments`,
`equipment_shortage_reports`, `cleaning_schedules`, `cleaning_duty_logs`.

Logistics: `driver_assignments`, `driver_replacement_requests`, `driver_confirmations`,
`driver_pay_rates`, `driver_shifts`, `optimized_routes`, `delivery_route_stops`,
`gps_tracking`, `delivery_feedback`.

Kitchen: `prep_lists`, `prep_list_items`, `kitchen_prep_tasks`, `kitchen_duties`.

People: `staff_invitations`, `user_departments`, `time_clock_entries`,
`shifts`, `public_holidays`.

Communication: `notifications`, `email_provider_settings`, `email_templates`,
`outgoing_email_queue`, `outgoing_email_log`, `email_automation_log`, `whatsapp_messages`,
`messaging_templates`, `blocked_contacts`.

Ops: `audit_logs`, `complaint_tickets`, `support_tickets`, `support_ticket_messages`,
`feedback`, `account_deletion_requests`, `billing_history`.

Embed forms: `embed_forms`, `embed_form_submissions`, `embed_rate_limits`.

CMS + platform: `blog_posts`, `cms_pages`, `pricing_plans`, `feature_flags`.

> No table grepped through `src/` came up cold. Earlier rounds flagged some
> "potentially orphaned" tables; the running-todo notes them as actively used.

---

# Section 2: Persona journey maps

For each journey: **steps with file pointers**, then a **scoring table** (1 worst, 5
best, on Friction / Reliability / Visibility on failure / Brand quality), then the
**top gaps** that flow into the findings ledger.

## A. Tenant admin journeys

### A1. Lead -> reply -> quote -> client accepts -> deposit -> order -> kitchen -> driver -> balance -> review

Steps:

1. **Lead enters.** Three entry points:
   - public quote-request form (embed forms, `/api/public/embed/[token]/submit`)
   - direct in-app at `/admin/leads/new`
   - Zapier webhook at `/api/integrations/leads`.
   `src/services/leadService.ts:52` creates a `leads` row, then fires an in-app
   notification (`leadService.ts:91-102`) and a region-manager notification
   (`:110-119`, in a non-blocking try/catch).
2. **Quote built.** Admin opens `admin/quotes/new` (1962 lines) or converts the lead.
   `src/services/quoteService.ts:44-143` inserts the quote; the lead status flip on
   `:104-105` is non-blocking (silent if it fails). Quote number comes from RPC
   `consume_next_document_number` (`:55-67`) with a silent warn-only fallback.
3. **Quote sent.** Admin clicks "send quote" -- routed through the shared compose
   drawer (`src/components/messaging/ComposeDrawerHost.tsx`). PDF render via
   `src/services/pdf/QuoteDocument.tsx` (590 lines), email via `/api/send-email`
   with `attachQuotePdf=true` (`pages/api/send-email.ts:218-251`). Logged to
   `email_automation_log` with detailed `error_code` mapping
   (`emailService.ts:479-507`, surfaces fix-link to `/admin/email-settings`).
4. **Client opens public quote.** `src/pages/q/[token].tsx`. View stamp is fire-and-
   forget at `:143`. Branding picked up via CSS-var injection (`:113-126`).
5. **Client accepts.** `src/pages/q/[token].tsx:159-174`. `recordAccept` returns
   `{ ok, error }`. On failure, `setAcceptError` shows an inline message; there is
   no toast and no retry button. Server-side acceptance writes to `quotes.status` +
   `accepted_at` via the public API.
6. **Quote -> order conversion.** Atomic via Postgres function
   `convert_quote_to_order` (`supabase/migrations/20260506110000_convert_quote_to_order_function.sql`).
   Locks the quote row. Sets `quotes.converted_to_order_id` atomically with the
   order insert.
7. **Post-order cascade.** `src/services/order/postCreationCascade.ts:61-183`:
   - `ensureInvoiceForOrder` (`:79`) -- idempotent on existence
   - `emailService.sendEmail` confirmation (`:133-150`) -- in try/catch, sets
     `receipt.email.ok` on failure
   - `kitchenPrepService.ensurePrepTasksForOrder` (`:167-172`) -- idempotent
   The receipt object reports per-step `ok / reason` but is not surfaced into a
   visible operator UI today. Failures land in console + `email_automation_log`.
8. **Deposit invoice link.** Public link at `/pay/i/[token]` resolves invoice by
   `public_token` (`pages/pay/i/[token].tsx:115-128`), branding applied
   (`:94-107`). PayFast init at `:141-155`. If PayFast merchant credentials are
   missing the user sees a generic "Payment gateway not configured" with no
   recovery path.
9. **Deposit webhook.** `pages/api/webhooks/payment-confirmation` checks
   `isDuplicatePayFastPayment` (line ~62), updates `invoices.status='paid'` /
   `balance_due=0`. Order's `payment_status` is **not** updated in the same
   transaction (see Section 6 for detail). No email receipt to client on success
   despite the seeded `deposit_payment_received` template.
10. **Kitchen prep.** Staff lands on `/team-portal/kitchen/prep-list` (634 lines)
    or `/dashboard`. Tasks come from `ensurePrepTasksForOrder` per (7) above.
11. **Driver assignment.** Admin opens `/admin/order-assignments` (1182 lines) ->
    `dispatchService.getDispatchSuggestions` -> `assignDriver`
    (`src/services/order/orderWorkflow.ts:156-180`). In-app + WhatsApp
    notifications fire non-blocking.
12. **Driver portal.** `/team-portal/driver/{dashboard,deliveries,routes,tracking}`.
    Status transitions via `orderWorkflow.updateOrderStatus`.
13. **Balance payment.** Same public-pay flow as step 8-9, second invoice.
14. **Review.** On `delivered`, `pending_reviews` upsert is queued
    (`orderWorkflow.ts:114-147`). Cron `/api/cron/process-pending-reviews`
    drains and emails (24h after delivery). The review email body lives hardcoded
    in `notificationService.ts:615-660` (not in `email_templates`).

Score:

| Friction | Reliability | Visibility on failure | Brand quality |
|:--:|:--:|:--:|:--:|
| 3 | 2 | 2 | 4 |

Top gaps for findings ledger:

1. Post-order cascade failures (invoice, email, kitchen prep) are logged to
   console only -- no operator UI surface even though the cascade returns a
   structured `receipt` (P1).
2. Lead -> quote pipeline status never advances to `quoted` if the silent flip
   on `quoteService.ts:104-105` fails -- funnel metrics drift (P1).
3. PayFast misconfig surfaces as a single generic message; there's no
   "configure now" deep-link from the public payment page (P1).
4. Deposit / balance receipt emails are templated and seeded but never fire
   -- the webhook silently does not call `sendEmail` (P0, see Section 5).
5. Order amendments after acceptance do not regenerate the invoice or kitchen
   prep tasks; both go stale (P0, see Section 3).

### A2. Day-of-event chaos: driver no-shows

Steps:

1. SLA-at-risk indicator on `/admin/order-assignments` from
   `dispatchService.minutesUntilSlaBreach`. There is no auto-detection of a
   driver going offline.
2. Driver replacement request at `src/services/driverReplacementService.ts:32-54`.
   Admin notification fires (`:48`), drivers broadcast
   (`broadcastToAvailableDrivers`, `:51`) -- offline drivers do not see the
   request.
3. Acceptance: `:59-92`. The `.eq('status','pending')` guard on `:70` plus
   `.single()` prevents two drivers both getting the row. The follow-up
   `orders.update(assigned_driver_id)` on `:77-80` is **not** in the same
   transaction with the request acceptance, and there is no conflict check
   against an already-assigned driver who's elsewhere. Notifications to admin,
   original driver, and WhatsApp on `:83-89` are non-blocking.
4. No driver-availability check (no shift / vehicle / overlap). Original driver
   notification fires after the unassign, which can confuse the on-call driver.

Score:

| Friction | Reliability | Visibility on failure | Brand quality |
|:--:|:--:|:--:|:--:|
| 2 | 2 | 2 | 2 |

Top gaps:

1. Replacement is auction-based, not directed. If no driver is online, request
   silently sits at `pending` until manually escalated (P1).
2. No conflict check on the order assignment (a replacement driver could
   already be assigned to another delivery in the same window) (P1).
3. Original driver notified after unassignment fact -- copy is generic and
   doesn't explain who took over (P2).
4. No "force reassign" admin path for the operator who already knows who
   should take it (P1).

### A3. Set up email sending

Steps:

1. `src/pages/admin/email-settings.tsx`. Tabs for Resend / SMTP / Gmail / MS365
   / Mailchimp. Provider list per running-todo roadmap; OAuth flows for Gmail
   / MS365 are unbuilt (roadmap "Direct email send" item).
2. Resend domain: `ResendDomainCard` calls
   `pages/api/admin/resend/{create-domain, dns-check, verify-domain, delete-domain}`.
3. Save handler `:175-204` writes `email_provider_settings` and explicitly resets
   `is_verified=false` on every save (`:189`). The comment "re-verify on every
   save" is intentional, but not surfaced to the operator -- editing daily-cap
   or auto-attach toggles silently invalidates an already-verified domain. P1.
4. No first-test-send path before "go live". A merge-tag mistake in
   `email_templates` is invisible until production.
5. Daily caps per subscription tier: trial=100, starter=200, growth=500,
   pro=1500, scale=5000 (`email-settings.tsx:74-80`). Enforcement happens via
   `outgoing_email_log` count comparison.

Score:

| Friction | Reliability | Visibility on failure | Brand quality |
|:--:|:--:|:--:|:--:|
| 2 | 2 | 2 | 3 |

Top gaps:

1. Saving any unrelated email-settings field silently flips `is_verified` to
   false. Operator may not realise; production mail then routes through fallback
   sender (P1).
2. No "send test email" button visible in `email-settings.tsx` excerpt --
   merge-tag bugs surface only in production (P1).
3. The shared-fallback sender (`noreply@send.cateringms.com`) is invoked
   automatically on misconfig but the fallback is not advertised in the UI;
   tenants think they cannot send until DNS verifies (P1).

### A4. Configure team (invite drivers / kitchen / shopping / cleaning)

Verified surfaces:
- `src/pages/admin/users.tsx` (571 lines), `admin/staff.tsx` (15-line stub),
  `admin/kitchen-staff.tsx`, `admin/driver-management.tsx`,
  `admin/teams/{kitchen, drivers, cleaning}.tsx`
- `src/pages/api/admin/create-user.ts` (running-todo Phase 2A flag: open auth)
- `src/pages/api/staff/[id]/invite-login.ts`

The full invite journey was not deep-traced in this audit pass. Per the
running-todo, `/api/admin/create-user` is an open endpoint with no auth gate, so
the journey works but the underlying API is a P0 lockdown target **[2A]**. A
follow-up trace in Phase 1 should walk the staff invite end-to-end with the
hardened endpoint.

### A5-A7. Bulk import / day-of-month financial close / repeat-customer rebooking

Surfaces exist:
- Imports: `admin/onboarding/import.tsx` (1040 lines), `admin/onboarding/imports.tsx`,
  `admin/onboarding/clients.tsx`, plus `pages/api/imports/*`.
- Financial close: `admin/financial-dashboard.tsx`, `admin/wages.tsx`,
  `admin/driver-settlement.tsx`, `admin/tax-purchases.tsx`, plus accounting
  routes (`api/accounting/{quickbooks, xero}/*`).
- Repeat rebooking: `client-portal/quotes.tsx`, `client-portal/dashboard.tsx`
  rebook flow, `c/account.tsx` magic-link landing page.

These journeys are partial-trace in this pass and flagged for Phase 1 follow-up
walkthroughs. Specific known gaps already in the running-todo (Phase 2E):
`leadService.convertLeadToQuote` only flips status today, doesn't actually
create a quote row; `Repeat-customer "email me my orders" magic link` API
missing.

## B. Tenant staff journeys

### B1. Driver morning -> deliveries -> picked up -> delivered -> clock out

Steps:

1. `/team-portal/driver/dashboard` (732 lines). On load, fetches today's orders
   and shifts.
2. `/team-portal/driver/deliveries` (369 lines). Filter is
   `assigned_driver_id.eq.<user.id>` OR `driver_id.eq.<user.id>`. The dual filter
   handles legacy data; flag for cleanup once the new column wins everywhere
   (P2).
3. Navigate: external map app via `googleMapsService` -- there's no in-app
   turn-by-turn (acceptable for v1).
4. Mark picked up / delivered: status transitions go through
   `orderWorkflow.updateOrderStatus` which writes `order_status_history`. The
   review prompt queue on `:114-147` is wrapped in a non-blocking try/catch.
5. Clock out: `shiftService` / `timeClockService`. Behaviour with pending
   deliveries unclear from a fresh read; flag for trace (P2).

Score:

| Friction | Reliability | Visibility on failure | Brand quality |
|:--:|:--:|:--:|:--:|
| 4 | 3 | 3 | 3 |

Top gaps:

1. No proof-of-delivery capture (photo / signature) before marking delivered
   (P1).
2. Review-queue insert silent failure means the 24h follow-up email is never
   queued for some orders, undetectably (P1).
3. No offline mode: a poor-signal day at a remote venue can wipe the route
   list (P3 / strategic).
4. Touch-target audit on the Mark buttons (Bobby asked for >= 44px) not
   verified in this pass (P2).

### B2. Kitchen: prep tasks -> allergens -> mark done

Surfaces: `team-portal/kitchen/{dashboard, prep-list, production, duty}.tsx`,
`src/services/kitchenPrepService.ts`, `src/services/kitchenDutyService.ts`.

Trace highlights:
- Tasks created idempotently in `postCreationCascade.ts:167`.
- Allergen surfacing: depends on `recipe_allergens` table. There is no
  validation gate at order time that allergen flags exist; kitchen sees blank
  if menu items haven't been tagged.
- No bulk mark-done.

Score: 3 / 3 / 2 / 3.

Top gaps:
1. Allergen completeness is not enforced at quote time. A blank allergen panel
   reads as "no allergens" not "unknown" (P0 if a real allergic incident
   happens).
2. No order-priority weighting in the prep list -- 16:00 collection and 19:00
   plated event get the same chronological treatment (P1).
3. Special instructions per item not consistently surfaced (P1).

### B3. Shopping: today's list -> mark bought -> upload receipt

Surfaces: `team-portal/shopping/*`, `pages/api/imports/receipts/upload.ts`,
`src/services/shoppingService.ts`.

Trace partial. Flagged for Phase 1 deeper trace. Known via running-todo:
receipt scanner is OCR-ready (running-todo) but full ingredient-to-inventory
linkage is the substance of `link_receipt_items_to_inventory_and_rules` (recent
migration).

### B4-B5. Kitchen on-duty / cleaning / day-of-event

Listed in inventory but not deep-traced this pass. Phase 1 should walk
cleaning's broken-equipment flow end-to-end -- it touches money via
write-offs. Surfaces present: `team-portal/cleaning/{dashboard, tasks,
schedules, equipment, supplies, workflows, damage}.tsx`.

## C. Tenant client journeys

### C1. Quote received -> public link -> request changes / accept -> pay deposit

Steps already covered under A1 from the admin angle. From the client side:

- `q/[token].tsx`. Auto-print on `?print=1`. Branding via CSS vars. Accept
  surfaces with optional "accepted by" name field. Inline error rendering on
  failure (no toast).
- Change request: `:178-...` and `pages/api/public/quotes/[token]/change-request`.
- Pay deposit: `pay/i/[token].tsx`.

Score: 3 / 3 / 3 / 4.

Top gaps:
1. No retry button on accept failure -- the user re-types acceptor name and
   re-clicks (P1).
2. Public token has no displayed expiry -- no "this quote expires on..." next
   to the accept button (P2).
3. Change-request submission has no acknowledgement email back to the client
   (P1).
4. The PDF download path (auto-print + `?print=1`) works in Chromium but is
   untested in Safari (P2).

### C2. Track order on event day

Surfaces: `client-portal/tracking.tsx`, `client-portal/dashboard.tsx`
embedding `ClientTrackingMap` (skeleton at load), and `c/order/[id].tsx` for
tokenised access.

Trace partial. The client gets a live map only when status flips to
`out_for_delivery`. There is no driver ETA shown (P1) and no SMS / WhatsApp
arrival nudge on the public path (P2).

### C3. Repeat-customer rebooking via `/c/account` magic link

Surfaces: `c/account.tsx`, `client-portal/dashboard.tsx`.
`pages/api/auth/client-magic-link.ts` is built; per running-todo Phase 2E the
"email me my orders" trigger that fires the magic-link email is missing. Also
the `email_provider_settings.magic_link_repeat_customers` toggle exists in DB
but the queue draining and threshold logic depend on direct email send going
live (roadmap.md "Repeat-customer magic-link auto-send").

Score (visible flow): 3 / 2 / 3 / 4. The build is real but the trigger doesn't
exist; clients have to phone today.

## D. Skylight (super_admin) journeys

### D1. New tenant signed up

Steps:

1. Tenant lands at `/auth/register` or `/company-signup` (863 lines).
2. Skylight sees the tenant at `/admin/platform/dashboard`. **Verified P0:**
   `pages/admin/platform/dashboard.tsx:91-104` ships a hardcoded
   `if (user.email === "dev@cateringms.local")` short-circuit that calls
   `setLoading(false)` without fetching analytics. Any super_admin signed in
   under that email sees an empty dashboard with no data warning. Either
   remove or gate behind `process.env.NODE_ENV !== "production"`.
3. Drill into a tenant via `CompanySwitcher` and `/admin/platform/company-database.tsx`
   (1057 lines).

Score: 3 / 3 / 2 / 2.

Top gaps:
1. Dev-mode email shortcut in production code (P0, verified).
2. No "stuck in onboarding" surface -- a tenant 7 days in with no email
   provider configured doesn't appear anywhere actionable (P1).
3. No per-tenant health score (last-activity, send-failure rate, payment
   volume) (P1 / aligns with roadmap "Platform owner cost dashboard").

### D2. Tenant in trouble / platform health

The `/api/admin/email-failures` endpoint exists but no Skylight-side dashboard
aggregates it across tenants. No outage / error visibility surface beyond
Vercel Analytics. No support-ticket aggregation visible at platform level.
This is the "Tenant health dashboard" Phase 4 strategic upgrade per running-
todo's intent.

Score: N/A (features absent). Findings: P3 strategic upgrade required.

---

# Section 3: Data integrity audit

The cleanest source of truth on schema drift is recent migration files; the
root-level `*_SCHEMA*.sql` files are stale per Phase 2B. Findings below cite
the migration that authoritatively defines each shape.

## 3.1 Core entities

### `companies`
- Schema: lifecycle columns (`trial_ends_at`, `subscription_ends_at`) are
  nullable; running-todo Phase 2B flags `companies.slug` not-null backfill as
  a TODO. **[2B]**
- RLS: previously had USING(true) leak on SELECT, fixed in
  `tighten_companies_profiles_embed_rls`; now routed through
  `get_company_branding(slug)` SECURITY DEFINER RPC for anon login lookups.
- Sensitive columns confirmed locked: `embed_token`, `tax_number`,
  `registration_number`, `owner_id`, `headquarters_lat/lng`. **[shipped, see
  running-todo client-portal-isolation]**

### `profiles`
- Schema: `company_id` nullable (orphan-profile risk). `role` is `text`, no
  enum (running-todo notes Phase 2D-style cleanup item).
- RLS: tightened to own + same-company-staff + super_admin **[shipped]**
- `lock_profile_company_id_and_role` migration prevents users from changing
  their own role / company.
- No soft-delete. Hard cascade via auth.users delete.

### `clients`
- `user_id` nullable -- portal access logic depends on user_id match;
  pre-signup orders carry `client_email` as the matchable handle.
- RLS: split policy (staff see all; clients see only `client_id` linked or
  `client_email` match). **[shipped]**
- `(company_id, email)` UNIQUE missing -- running-todo Phase 2B item. **[2B]**
- `deleted_at` present but inconsistent application-side filter coverage.

### `quotes`
- Schema: `lead_id` and `client_id` both nullable with CHECK requiring at least
  one. `status` enum (`draft -> sent -> viewed -> accepted -> rejected ->
  expired`).
- `quote_number` unique per `(company_id, quote_number)` from the
  `consume_next_document_number` RPC; prior to this migration the
  `Math.random()` approach in the running-todo Phase 2C is now resolved.
- `converted_to_order_id` ON DELETE SET NULL: if an order is deleted the
  quote stays at `accepted` with a broken link. P2 (low impact in practice
  -- orders are soft-deleted; hard delete is rare).
- `delivery_fee` added in `20260501160000_add_delivery_fee_to_quotes.sql`.

### `orders`
- Schema: `client_id` ON DELETE RESTRICT (good), `quote_id` ON DELETE SET NULL.
- `amount_paid`, `balance_paid`, `balance_amount`, `deposit_amount` all
  nullable; auto-invoice trigger uses `COALESCE(0)` (see Section 6 for the
  ramifications).
- `transaction_id` columns added recently
  (`20260506110000_orders_add_transaction_id_columns.sql`) plus
  `backfill_orders_from_payment_schedules.sql` (then `payment_schedules`
  was dropped on the same day).
- `inventory_deducted_at` nullable -- intended idempotency key for inventory
  deduction (Phase 2C item 8).
- No state-machine guard on the `status` enum -- order can in principle flip
  from `pending` straight to `delivered`. **[2C]**

### `order_amendment_requests`
- Defined by `20260503170000_order_amendments.sql`.
- Stores `proposed_changes` JSONB and `applied_snapshot` JSONB.
- The migration comment (lines 13-21) explicitly states cascading side-
  effects (auto-invoice / kitchen prep / confirmation email) "stay in
  TS-land and run AFTER". **This is a correctness gap:** if the TS service
  crashes mid-cascade after approval, the order is amended but the invoice
  and prep tasks are stale. There is no idempotent re-run today. P0.
- RLS scoped via `company_id IN (SELECT company_id FROM profiles WHERE id =
  auth.uid())`. The subquery returns NULL for users without a profile-bound
  company; `NULL IN (...)` is falsy so access is denied -- correct, but
  fragile and worth tightening to `AND company_id IS NOT NULL` in the
  subquery.

### `invoices`
- `order_id` ON DELETE SET NULL leaves orphan rows.
- `invoice_number` unique per `(company_id, invoice_number)`.
- Auto-create trigger `20260504130000_auto_invoice_on_order_completion.sql`:
  fires on `status='completed'`, no-ops if invoice exists, computes number as
  `INV-` plus order-number.
- `balance_due` is captured at creation and **not** recalculated on amendment
  approval. P0.
- Soft-delete column present; some RLS policies do not filter `deleted_at`
  -- needs sweep (P1).

### `payments`
- `invoice_id` added late in `20260504170100_payments_add_invoice_id.sql`. No
  guarantee historical rows are backfilled; flag for Phase 1 sweep (P1).
- `status` column was a free-text in older schemas; recent migration
  `20260506130000_drop_payments_status_text.sql` removes the duplicated
  text column in favour of the enum.
- No CHECK constraint that `payment.amount <= invoice.total_amount`.

### `notifications`
- **Verified RLS leak still present:** master schema ships
  `system_create_notifications ON notifications FOR INSERT WITH CHECK (true)`.
  Any authenticated user can insert a notification for any other user. P0.
  (Running-todo Phase 2B contains a generic "Tighten audit_logs and
  notifications INSERT policies" item that captures this.)
- `notification_type` enum has been amended four times in 2026-05
  (`amendments`, `review_outcomes`, `domain_verified`). Version drift inside
  the enum -- consider a migration that lists every value alphabetically as
  the canonical record (P2).

### `email_provider_settings`
- `smtp_pass_encrypted` is a known wart per programme rules -- audit only,
  do not widen (P1 to revisit storage at rest).
- No `deleted_at` (intentional -- deactivate via provider="none" rather than
  delete).

### `outgoing_email_queue` + `outgoing_email_log` + `email_automation_log`
- Queue scheduling added in `20260503180000_outgoing_email_queue_scheduling.sql`.
- Phase 2E flags missing claim-locking on the queue -- two workers could
  double-send. Confirmed -- no `FOR UPDATE SKIP LOCKED` style worker pattern
  observed. P1.

### `pending_reviews`
- `20260506100000_pending_reviews.sql`. Upserted on order delivery.
- Cron at `/api/cron/process-pending-reviews` consumes. The review email
  body lives hardcoded in `notificationService.ts:615-660`, not in
  `email_templates`.

### `blocked_contacts`
- `20260503150000_blocked_contacts.sql`. Email_lower OR phone required.
- Permanent blocks (no `deleted_at`).
- RLS scoped properly to company.

### `import_quarantine`, `import_rows_dedup_decisions`
- `20260503160000_import_quarantine.sql`,
  `20260505100000_import_rows_dedup_decisions.sql`.
- Quarantine pattern looks robust. Phase 2 should still walk the dedup-
  decision flow end-to-end with a real CSV.

### `driver_shifts` + `driver_pay_rates` + BCEA logic
- `20260505140000_driver_pay_rate_config.sql`,
  `20260505150000_driver_shifts.sql`,
  `20260502130000_bcea_sundays_holidays_weekly_cap.sql`.
- Shift `hours_worked` is a generated column; rate multiplier filled by the
  app layer. Phase 1 should walk a Sunday + holiday + 50h+ week scenario.

## 3.2 RLS audit, gaps remaining beyond the running-todo items

Cross-referenced against running-todo Phase 2B (which lists `app_config`,
`companies + profiles USING(true)` already shipped, and "Tighten audit_logs
and notifications INSERT policies"):

1. `notifications.system_create_notifications` USING(true) is **still open**.
   P0. **[overlaps 2B-tighten-policies]**
2. `sa_tax_deductibility_rules.sa_tax_rules_read_all` ships with USING(true).
   Risk is low (rules are reference data) but it violates the zero-trust
   pattern. P2.
3. RLS on `order_amendment_requests` uses subquery -- correct but worth
   adding `AND company_id IS NOT NULL` (P2).
4. Several invoice / order list queries do not include `deleted_at IS NULL`
   filters at the application layer; Phase 2 should sweep service files
   (`invoiceService.ts`, `orderService.ts`, `dispatchService.ts`) (P1).

## 3.3 Foreign keys + cascade behaviour summary

| Table.col | Parent | Behaviour | Risk |
|---|---|---|---|
| `quotes.converted_to_order_id` | orders | SET NULL | quote stuck `accepted` w/ broken link |
| `order_items.order_id` | orders | CASCADE | items vanish (correct) |
| `order_amendment_requests.order_id` | orders | CASCADE | amendment history lost (acceptable) |
| `invoices.order_id` | orders | SET NULL | orphan invoices accumulate |
| `payments.order_id` | orders | SET NULL | payment orphaned but searchable |
| `payments.invoice_id` | invoices | (added late) | backfill verification needed |
| `refunds.order_id` | orders | (verify) | likely SET NULL |
| `driver_shifts.order_id` | orders | SET NULL | hours preserved (correct) |

## 3.4 Lifecycle integrity

The two highest-risk lifecycle gaps:

1. **Order amendment -> invoice / kitchen prep cascade** is not transactional.
   Approving an amendment updates `orders` but does not regen the invoice or
   kitchen tasks. The `applied_snapshot` JSONB freezes the change, but
   downstream artefacts go stale. P0.
2. **Invoice `balance_due` is a snapshot** at creation, never recalculated on
   subsequent payments or amendments. The auto-invoice trigger was a smart
   move, but the lifecycle is one-way. P0.

## 3.5 Audit trails

- No `audit_logs` mutation-history table for the core entities. Application
  uses `created_at` / `updated_at` only.
- `order_status_history` exists for orders.
- Phase 2B already lists "Tighten audit_logs INSERT policies" so the table
  exists but coverage of mutations is thin. Phase 4 strategic: extend to
  every lifecycle-relevant mutation.

---

# Section 4: UI / UX consistency audit

Cross-reference: docs/ui-conventions.md (canonical patterns) and
docs/ui-breakpoints.md (mobile wrapper rules).

## 4.1 Loading states

Inconsistent: some pages spinner, some skeleton, some `"Loading..."` text.

- `admin/dashboard.tsx:311` -- spinner on refresh button only; main content
  shows last-known data while loading.
- Dynamic imports (`ClientTrackingMap`) use a tailwind `animate-pulse`
  skeleton.
- Most team-portal pages: spinner.

P1 sweep target: agree one pattern (skeleton on first load, spinner on
refresh) and roll across `admin/{dashboard, leads, quotes, orders, clients,
calendar, invoices}` plus team-portal dashboards. **[overlaps 2D-skeleton]**

## 4.2 Empty states

The only verified bespoke empty-state component sits in `admin/wages.tsx:686, 904`.
Other list pages either show generic "No data" copy or empty grids.

P1: roll a single `<EmptyState icon title cta />` primitive and adopt across
`admin/{leads, quotes, orders, clients, calendar, inventory, staff}` and the
team-portal dashboards.

## 4.3 Error / toast patterns

- `admin/dashboard.tsx` -- inline error card (`setError` + render).
- `admin/leads/index.tsx`, kitchen team-portal pages -- `useToast()` hook
  wired (sonner).
- No `alert()` calls grepped this pass (good).

P1: standardise on toast for transient errors, inline for form-field validation,
modal for irreversible-action confirmations. Audit `admin/quotes/new.tsx`
(1962 lines) for inline-vs-toast mixing.

## 4.4 Mobile wrapper compliance

Per docs/ui-breakpoints.md, every authenticated page must wrap in
`lg:pl-64 xl:pl-72 pt-16 lg:pt-0`.

Pages observed missing the wrapper (direct read of file or zero-match grep):
`admin/clients.tsx`, `admin/financial-dashboard.tsx`, `admin/inventory-recipes.tsx`,
`admin/inventory-tracking.tsx`, `admin/job-progress-overview.tsx`,
`admin/refunds.tsx`, `admin/staff.tsx`. Six to seven pages to fix. P1.

## 4.5 Sidebar duplication

Confirmed near-duplicates:
- `src/components/admin/AdminNav.tsx` (master)
- `src/components/admin/PlatformNav.tsx`
- `src/components/navigation/{ClientNav, DriverNav, KitchenNav, ShoppingNav, CleaningNav}.tsx`
- `src/components/client/ClientNav.tsx` -- second copy of ClientNav

Running-todo Phase 2D-3 already targets this with a `<PortalSidebar role accent />`
collapse: 6 nav files into 1. Confirmed in scope.

## 4.6 Branding consistency

- Tokenised + client portal surfaces (`q/[token]`, `pay/i/[token]`,
  `client-portal/dashboard`) hydrate `companies.logo_url` and
  `companies.primary_color` and apply CSS-var injection.
- Admin / team portal surfaces are intentionally system-branded (gradient
  brand-primary -> brand-secondary). This is the correct call -- staff don't
  need their own white-label.
- Running-todo Phase 2D-2 ("Delete BrandingContext, write white-label to
  companies table") still relevant -- a second branding store exists in a
  React context that doesn't always sync with `companies.*` writes. Confirmed.

## 4.7 Compose drawer adoption

Single drawer: `src/components/messaging/{ComposeDrawerHost, MessageComposer}.tsx`.
Verified consumers: admin/calendar, admin/contacts, admin/equipment,
admin/leads/index. No page rolls its own composer. Convention holds.

## 4.8 Form validation patterns

Inconsistent. Phase 2D-6 ("Replace hand-rolled forms with react-hook-form +
zod") is the right scope. Confirmed not done.

---

# Section 5: Communication flows audit

Trace per flow; status grades: WORKS / PARTIAL / BROKEN / NEVER FIRES.
Brand-quality assessment reflects whether the email picks up tenant branding
from `companies.logo_url`, `companies.primary_color`, and the verified
sender domain.

## 5.1 Per-flow inventory

| # | Flow | Trigger | Template source | Channel | Idempotency | Failure surfacing | Brand quality | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Lead-received auto-reply | new lead row | `email_templates.quote_request_received` (seeded) | Resend / SMTP | none | -- | template plain text | **BROKEN** -- no trigger fires it |
| 2 | Quote sent to client | admin send | `email_templates.quote_sent` | Resend / SMTP | none | `email_automation_log` + fix-link | logo + primary_color via PDF | **WORKS** |
| 3 | Quote accepted (admin) | client accept | none seeded | in-app only | n/a | in-app bell | n/a | **BROKEN** -- no admin email |
| 4 | Order confirmation (client) | order create | `email_templates.order_confirmed` (seeded) | Resend / SMTP | none | `email_automation_log` | logo + colour | **PARTIAL** -- template seeded, no trigger |
| 5 | Deposit receipt | webhook | `email_templates.deposit_payment_received` | Resend / SMTP | webhook idempotency on pf_payment_id | none for the email | n/a | **BROKEN** -- webhook never calls sendEmail |
| 6 | Balance reminder 14/7/3/1d | cron | none seeded | Resend / SMTP | -- | -- | -- | **NEVER FIRES** -- no cron worker |
| 7 | Final invoice / receipt | order delivered | `email_templates.balance_invoice_issued, invoice_issued` | Resend / SMTP | -- | -- | -- | **BROKEN** -- route exists, never called |
| 8 | Post-event review | cron after delivery | hardcoded in `notificationService.ts:615-660` | Resend / SMTP + in-app | upsert on `pending_reviews.order_id` | partial | partial | **PARTIAL** -- queues; cron-side dispatch not verified |
| 9 | Staff invitation | admin invite | React component `StaffInviteEmail.tsx` | Resend / SMTP | none | -- | -- | **BROKEN** -- component built, no trigger |
| 10 | Magic-link client login | client requests | hardcoded HTML in `client-magic-link.ts:72-100` | Resend / SMTP | rate-limit | silent (privacy) | logo + colour | **WORKS** |
| 11 | Domain-verified | admin DNS verify | none | in-app only | n/a | -- | n/a | **WORKS (limited)** |
| 12 | Order amended | admin edits | none | in-app only | n/a | -- | n/a | **WORKS (limited)** |

## 5.2 The shape of the gap

The pipeline is robust but the trigger points are sparsely populated. The
`/api/send-email` route, the template resolver, the brand hydration, and the
log-and-fix-link UX are all in good shape. What's missing is the connective
tissue from the events that should trigger emails to a `sendEmail` call:

- Webhook -> deposit / balance receipt: deepest gap.
- Order delivered -> final invoice + receipt: dead route.
- Quote accepted -> admin notification: in-app only.
- Lead created -> auto-reply: missing.
- Payment reminders 14/7/3/1: no cron worker.
- Post-event review: queued, dispatch unverified.

These are not architecture problems -- they are six call-site hookups.

## 5.3 Brand quality assessment

- Quote PDF (`pdf/QuoteDocument.tsx`) renders tenant logo and primary colour.
  Verified.
- Magic-link email (`client-magic-link.ts:72-100`) renders tenant brand.
  Verified.
- Seeded text templates carry no brand variables -- they're text-only fallbacks.
  When (e.g.) the order-confirmation trigger lands, the template will need
  brand-variable interpolation in the same shape as the quote PDF and
  magic-link path.

Sender identity:
- If the tenant has verified their domain in Resend, sender is tenant@domain.
- Otherwise fallback to `noreply@send.cateringms.com` with Reply-To set to
  the tenant. Acceptable as fallback; UI doesn't tell the operator which one
  they're on.

---

# Section 6: Money flow audit

## 6.1 Quote pricing

`quoteService.ts:44-143` writes the row but does not run a calculation engine.
Subtotal / tax / discount / total are written by the quote builder UI. There
is no server-side validation that `subtotal + tax_amount - discount_amount =
total_amount`. P1 -- introduce a CHECK or a single calculation entry point.

VAT comes from `companies.vat_rate` (verified in `pages/api/send-email.ts`
hydration). Running-todo Phase 2C-11 calls for the same fix at the quote
write path -- confirmed not yet done in `quoteService` itself.

Delivery fee column added in `20260501160000_add_delivery_fee_to_quotes.sql`
but the application path that computes it has not been verified end-to-end
this pass. Phase 1 should trace the delivery-fee calculation surface.

Waiter fee / service fee: not found in this audit pass. Flag for Phase 1.

## 6.2 Deposit / balance

`paymentProcessingService.ts:60-63` calls `calculateDepositAndBalance(total,
percentage)` with the percentage as a parameter. Default is 30%
(`:55`). There is no `companies.default_deposit_percentage` override visible.
P1.

After `payment_schedules` was dropped, `orders.deposit_amount` and
`orders.balance_amount` are the canonical fields. Backfill ran via
`20260506110100_backfill_orders_from_payment_schedules.sql`.

## 6.3 Balance tracking + reconciliation atomicity

The biggest reconciliation hole, verified:

`pages/api/webhooks/payment-confirmation.ts` (PayFast IPN) updates
`invoices.status='paid'`, `balance_due=0`, `amount_paid=...`. It does **not**
update `orders.payment_status` in the same transaction. Two consequences:

1. After a deposit, `orders.payment_status` may still read `pending_deposit`
   while `invoices.status='paid'`. Operator sees "deposit paid" on the
   invoice page and "awaiting deposit" on the orders page.
2. Drift accumulates over time -- there is no nightly reconciliation job.

Running-todo Phase 2C-1 ("PayFast webhook idempotency") and 2C-2 ("PayFast
webhook, raw body for signature") capture related issues. Add: webhook
should perform the order-status flip in the same transaction, or a
post-write trigger on `payments` should reconcile the order. P0.

## 6.4 Refunds

`refundService.ts` (400 lines) exists and `pages/api/refunds/[id]/{mark-paid,
retry}.ts` are wired. Manual EFT refund path confirmed; PayFast auto refund
not verified this pass. Running-todo Phase 2E-10 ("Cancellation refund
path") captures the pro-rata cancellation gap.

## 6.5 FX / currency

`src/lib/currencyUtils.ts` ships hardcoded rates -- ZAR=1.0, USD=0.054,
EUR=0.049, GBP=0.042, AUD=0.082. `exchange_rates` table exists. Running-todo
Phase 2C-9 ("FX rates from exchange_rates table") and 2C-10 ("Quote-time FX
rate locking") are accurate. P0 (the active live tenant is ZAR-only so
real impact today is low; if any quote is ever issued in another currency
it will be wrong by months).

## 6.6 Numbering atomicity

`consume_next_document_number(company_id, document_type)` is the canonical
sequence. Verified used by quotes (`quoteService.ts:55-67`) and invoices
(`invoice_counters` table + auto-invoice trigger). Running-todo Phase 2C-4
and 2C-5 ("Atomic invoice numbering" / "Atomic order numbering") read the
prior `Math.random()` and `quote.id.substring(0,8)` issues -- those are
addressed in the recent migrations. Status: **resolved** at the database
level. Application call sites should be audited to confirm none still
generate numbers client-side (P1 sweep).

## 6.7 Accounting export (Xero)

`accountingIntegrationService.ts` (853 lines), `xeroIntegrationService.ts`,
`pages/api/accounting/xero/{sync-invoice, callback}.ts`. Running-todo
Phase 2E-5 ("Xero token refresh + 401 retry") and 2E-6 ("Two-way Xero
conflict handling") still open. Confirmed.

Native one-click connect is on the roadmap -- Zapier path covers the gap
today.

## 6.8 Double-fire prevention summary

| Operation | Idempotency | Verified file |
|---|---|---|
| Payment webhook | gateway txn id dedup | `webhooks/payment-confirmation.ts:62` (PayFast) |
| Quote creation | none -- form re-submit fires twice | `quoteService.ts:70-74` |
| Invoice creation (manual) | none | `pages/api/send-invoice-email` (not deep-traced) |
| Invoice creation (trigger) | exists-skip | `auto_invoice_on_order_completion.sql` |
| Email send | per-recipient log row, no claim-lock | `outgoing_email_queue` (Phase 2E-4) |
| Inventory deduction | gated on `inventory_deducted_at` (P1, partial) | `orderWorkflow.ts` |

---

# Section 7: Onboarding gaps

## 7.1 Brand-new tenant journey, signup -> first invoice sent

Phase 1: `/auth/register` -> `/company-signup` (863 lines) -> tenant lands at
`/admin/onboarding` (245 lines) or `/admin/onboarding/index.tsx` (1191 lines).

`companies.onboarding_state` exists per
`20260503100000_companies_onboarding_state.sql`. `onboardingProgressService.ts`
(292 lines) reads checklist signals. Eight steps tracked:

| Step | Required | Signal | Stuck risk |
|---|---|---|---|
| Company info | yes | `companies.name + phone` set | low |
| Email setup | **yes** | `email_provider_settings.provider != 'none'` AND verified | **high (dead-end)** |
| Brand | optional | `logo_url + primary_color` | low |
| Clients imported | optional | `clients` row count > 0 | low |
| Menu items | optional | `menu_items` count > 0 | low |
| Staff invited | optional | `profiles` count > 1 | medium (depends on email) |
| First order | optional | `orders` count > 0 | medium (depends on menu) |
| Payments | yes | `payment_gateways` row with `is_active=true` | **high** |

## 7.2 Stuck-state inventory

1. **No email provider configured** -- the system cannot send quote emails,
   client magic-links, or staff invites. The shared-fallback sender
   `noreply@send.cateringms.com` is wired in `emailService.ts:226-235` but
   the operator is **not told** the fallback exists. Tenants think they're
   blocked until DNS verification completes. P0 to surface the fallback as a
   "send via shared sender now, swap later" option.
2. **Domain DNS lag** -- DNS TTL means a fresh tenant may add records and
   verify-fail repeatedly. No "we'll keep retrying for the next 24h, you're
   safe to leave" UX. P1.
3. **No payment gateway active** -- deposit invoices are generated but
   unpayable. Public `/pay/i/[token]` shows generic "gateway not configured".
   No "configure gateway now" deep-link. P1.
4. **No menu items** -- ad-hoc inline create works on the quote builder,
   so this is a soft stuck state, not a dead end. P2 (improve the empty
   state of `/admin/menu`).
5. **No clients imported** -- ad-hoc inline create on quote builder. Soft
   stuck. The bulk-import path exists but isn't surfaced from the onboarding
   checklist with a clear "skip and add as you go" option. P2.
6. **Staff not invited** -- depends on email setup. Magic-link to staff
   exists per `pages/api/staff/[id]/invite-login.ts`; if the operator can
   copy a link directly out of the staff page (instead of email), that
   should be surfaced. P2.

## 7.3 Hand-holding assessment

`/admin/onboarding` uses progress bars and per-card icons. It does **not**:

- explain what each step unlocks ("email setup is required to send quotes")
- show estimated time per step
- offer a wizard mode vs free-form mode
- detect dead-end states ("you've been stuck on email-setup for 7 days")
- provide an in-context "talk to support" CTA

P1 -- a richer onboarding shell would solve a clear "tenant doesn't know
what to do next" risk.

## 7.4 Defaults applied

| Field | Default | Source |
|---|---|---|
| Deposit % | 30 | `paymentProcessingService.ts:55` |
| VAT rate | from `companies.vat_rate` | `send-email.ts:209` |
| Sequence | per-company RPC | `consume_next_document_number` |
| Email provider | none until configured | `email-settings.tsx` |
| Logo | NULL | `companies` |
| Primary colour | NULL | `companies` |

## 7.5 Skylight visibility

A new tenant 24h into the platform with no email provider configured does
not appear on any Skylight dashboard. `/admin/platform/dashboard` shows
total customer growth and plan distribution, not "stuck-in-onboarding"
counts. P1 -- surface a "tenant health" tile that lights up red when:

- onboarding incomplete past 7 days
- email provider unverified past 14 days
- zero orders past 30 days
- > 5% email send failure rate over the last 7 days
- > 14d trial elapsed without subscribe

This dovetails with running-todo's "Platform owner cost dashboard" roadmap
item but is a different lens (operations, not unit economics).

---

# Section 8: Findings ledger

Notation: **ID** -- short tag. **AUD** -- audience (skylight / tadmin /
tstaff / client / xcut). **TYPE** -- bug / data-integrity / ux /
missing-feature / inconsistency / security / performance / a11y. **EFFORT**
-- S (under a day), M (1-3 days), L (week+), XL (multi-week).
**RT** -- running-todo Phase ID if overlapping.

## 8.1 P0 -- Phase 1 targets

| ID | Title | AUD | TYPE | EFFORT | RT | File pointers |
|---|---|---|---|---|---|---|
| P0-01 | Dev-mode hardcoded email bypass on platform dashboard | skylight | security / bug | S | -- | `src/pages/admin/platform/dashboard.tsx:91-104` |
| P0-02 | `notifications` INSERT policy is `WITH CHECK (true)` | xcut | security | S | 2B | `notifications` table policy |
| P0-03 | `?dev=true` URL backdoor grants client-side super_admin | xcut | security | S | 2A | `AuthContext.tsx` |
| P0-04 | `/api/admin/create-user` open with body-supplied role and company_id | xcut | security | S | 2A | `pages/api/admin/create-user.ts` |
| P0-05 | `/api/test-email`, `/api/send-email` open SMTP relay | xcut | security | S | 2A | `pages/api/test-email.ts`, `pages/api/send-email.ts` |
| P0-06 | OAuth state validation missing on Xero, QuickBooks callbacks | xcut | security | S | 2A | `pages/api/accounting/{xero,quickbooks}/callback.ts` |
| P0-07 | Deposit / balance receipt email never fires from PayFast webhook | tadmin / client | bug / missing trigger | S | -- | `pages/api/webhooks/payment-confirmation.ts` |
| P0-08 | Order amendment approval doesn't regen invoice or kitchen prep | tadmin / tstaff | data-integrity | M | -- | `supabase/migrations/20260503170000_order_amendments.sql`, the TS amendment-review handler |
| P0-09 | Invoice `balance_due` snapshot never recalculated on amendment / partial payment | tadmin / client | data-integrity | M | 2C | `auto_invoice_on_order_completion.sql`, `paymentProcessingService.ts` |
| P0-10 | PayFast webhook does not update `orders.payment_status` atomically | tadmin / client | data-integrity | S | 2C | `pages/api/webhooks/payment-confirmation.ts` |
| P0-11 | PayFast webhook idempotency on raw body + signature still pending | xcut | security / data-integrity | M | 2C-1, 2C-2 | webhook handler |
| P0-12 | Atomic order state machine missing -- pending can flip to delivered | tadmin | data-integrity | M | 2C-6 | `orderWorkflow.ts` |
| P0-13 | FX rates hardcoded in `currencyUtils.ts` -- multi-currency is wrong | xcut | data-integrity | S | 2C-9, 2C-10 | `src/lib/currencyUtils.ts` |
| P0-14 | Final-invoice / order-confirmation / lead-auto-reply emails never trigger | tadmin / client | bug / missing trigger | M | -- | order delivery handler, order create, lead create |
| P0-15 | Allergen completeness not enforced -- kitchen sees blank as "no allergens" | tstaff / client | data-integrity / safety | M | -- | `kitchenPrepService.ts`, `recipe_allergens` |
| P0-16 | Sign-out leaves Domain=.cateringms.com cookies; tokenised cookie scope wider than `/c/` | client | security | S | 2A | `signOut.ts`, tokenised cookie set sites |
| P0-17 | Per-key rate limit on Zapier integration endpoints missing | xcut | security | S | 2A | `pages/api/integrations/{leads,quotes,invoice-paid}.ts` |
| P0-18 | DEV_RETURN_MAGIC_LINK still on in production | client | security | S | client-portal-isolation | `pages/api/auth/client-magic-link.ts` |
| P0-19 | Service-role key was pasted in chat history -- needs rotation | xcut | security | S | client-portal-isolation | Supabase dashboard |

P0 sub-total: 19 findings. ~9 of these align with existing running-todo
Phase 2A (security holes) and Phase 2C (money safety) items. Items P0-01,
07, 08, 09, 10, 14, 15 are net-new from this audit.

## 8.2 P1 -- Phase 2 targets

| ID | Title | AUD | TYPE | EFFORT | RT |
|---|---|---|---|---|---|
| P1-01 | Post-order cascade receipt is logged but not surfaced to admin | tadmin | ux | S | -- |
| P1-02 | Lead -> "quoted" status flip silent failure | tadmin | bug | S | -- |
| P1-03 | Quote acceptance has no retry button on failure | client | ux | S | -- |
| P1-04 | `is_verified` reset on every email-settings save -- silent | tadmin | ux | S | -- |
| P1-05 | No "send test email" before going live | tadmin | missing-feature | S | -- |
| P1-06 | Shared-fallback sender not advertised in `/admin/email-settings` | tadmin | ux / missing-feature | S | -- |
| P1-07 | Driver replacement is auction-only -- no force-reassign | tadmin | missing-feature | M | -- |
| P1-08 | Driver-availability conflict check missing on reassign | tadmin | data-integrity | M | -- |
| P1-09 | Email queue not claim-locked -- two workers double-send | xcut | data-integrity | S | 2E-4 |
| P1-10 | `clients(company_id, email)` UNIQUE missing | xcut | data-integrity | S | 2B |
| P1-11 | `companies.slug NOT NULL` backfill | xcut | data-integrity | S | 2B |
| P1-12 | Atomic state-machine for `orders.status` reject invalid transitions | tadmin | data-integrity | M | 2C-6 |
| P1-13 | `markDelivered` idempotency guard | tadmin | data-integrity | S | 2C-7 |
| P1-14 | Inventory deduction idempotency on `inventory_deducted_at` | tstaff | data-integrity | S | 2C-8 |
| P1-15 | `companies.tax_rate` instead of hardcoded 15% VAT | xcut | data-integrity | S | 2C-11 |
| P1-16 | Cancelled orders excluded from `inventory_demand_outlook` | tstaff | data-integrity | S | 2C-12 |
| P1-17 | `leadService.convertLeadToQuote` actually creates a quote row | tadmin | bug | S | 2E-1 |
| P1-18 | Driver double-booking detection on `assignDriver` | tadmin | data-integrity | M | 2E-2 |
| P1-19 | Driver replacement audit trail | tadmin | data-integrity | S | 2E-3 |
| P1-20 | Xero token refresh + 401 retry | xcut | bug | S | 2E-5 |
| P1-21 | Two-way Xero conflict handling | xcut | data-integrity | M | 2E-6 |
| P1-22 | Repeat-customer "email me my orders" magic-link trigger | client | missing-feature | S | 2E-7 |
| P1-23 | GPS history split (current-location vs log table) | tstaff | data-integrity | M | 2E-9 |
| P1-24 | Cancellation refund pro-rata + Xero credit-note | tadmin | missing-feature | M | 2E-10 |
| P1-25 | `.replaceAll()` in email template variables | xcut | bug | S | 2E-11 |
| P1-26 | Empty-state primitive missing across 8+ list pages | xcut | inconsistency / ux | M | 2D-7 |
| P1-27 | Loading-state skeletons inconsistent across 10+ pages | xcut | inconsistency / ux | M | 2D-7 |
| P1-28 | Mobile wrapper missing on 6+ admin pages | xcut | bug | S | 2D-1 |
| P1-29 | Form validation patterns scattered -- no react-hook-form + zod | xcut | inconsistency | L | 2D-6 |
| P1-30 | BrandingContext duplicates `companies.*` writes | xcut | inconsistency | M | 2D-2 |
| P1-31 | `<PortalSidebar role accent />` collapse 6 nav files into 1 | xcut | inconsistency | M | 2D-3 |
| P1-32 | Tenant health dashboard for Skylight (stuck-in-onboarding etc.) | skylight | missing-feature | M | -- |
| P1-33 | Public quote no expiry surfaced on accept screen | client | ux | S | -- |
| P1-34 | Driver-portal proof-of-delivery (photo / signature) capture | tstaff | missing-feature | M | -- |
| P1-35 | Pending-reviews insert silent-fail leaves orders unreviewed | tadmin | bug | S | -- |
| P1-36 | Order-prep priority weighting on kitchen task list | tstaff | ux / missing-feature | S | -- |
| P1-37 | Live driver ETA on client tracking page | client | missing-feature | M | -- |
| P1-38 | `payments.invoice_id` backfill verification | xcut | data-integrity | S | -- |
| P1-39 | Embed "fix-link" deep-links from public pay page on misconfig | client | ux | S | -- |
| P1-40 | Webhook polling fallback for missed PayFast IPNs | xcut | data-integrity | M | -- |

P1 sub-total: 40 findings. ~15 align with running-todo Phase 2D / 2E /
2C items. The remainder are net-new.

## 8.3 P2 -- Phase 3 polish

- P2-01 Quote PDF print path untested in Safari.
- P2-02 Sa-tax-rules `USING(true)` policy tighten.
- P2-03 Per-tenant favicon, custom domain support (white-label remainder).
- P2-04 Touch-target audit across team-portal pages (>= 44px Bobby rule).
- P2-05 `notification_type` enum canonical-listing migration.
- P2-06 `quotes.converted_to_order_id` ON DELETE behaviour clarification.
- P2-07 Soft-delete filter sweep across `invoiceService`, `orderService`,
  `dispatchService` queries.
- P2-08 Driver-original-driver post-unassign notification copy clarity.
- P2-09 Empty-state copy + CTAs across `admin/{menu, clients, suppliers}`.
- P2-10 Type-safety pass: remove `@ts-nocheck` from 14 money / auth services
  (running-todo Phase 2F).
- P2-11 Strip unused `lucide-react` imports.
- P2-12 Memoise `admin/orders.tsx` filter pipeline (1190 LOC, three filter
  passes per render).
- P2-13 Split `admin/{orders, settings}.tsx`, `account/settings.tsx`,
  `admin/platform/company-database.tsx`, `admin/inventory-tracking.tsx`
  into modular files.
- P2-14 Skip AuthProvider on public pages in `_app.tsx`.
- P2-15 Single signed-cookie cache for middleware profile fetch.
- P2-16 Driver / kitchen / shopping / cleaning dashboards `<MetricCard>`
  upgrade.
- P2-17 a11y sweep -- focus rings, aria labels, keyboard nav across
  `/team-portal/*`.
- P2-18 Public quote / pay tokens displayed expiry chip.

## 8.4 P3 -- Phase 4 strategic upgrades

- P3-01 Driver detail page (currently no per-driver drill-down for admin).
- P3-02 Per-staff order detail routes for team portals.
- P3-03 Lead detail page (currently inline accordion in list view).
- P3-04 Dedicated payment-claims page (today piggy-backs on `/admin/invoices`).
- P3-05 Tenant health dashboard for Skylight (P1-32 expanded).
- P3-06 Real lead-to-conversion analytics over time.
- P3-07 Multi-language support (already a roadmap item).
- P3-08 iOS / Android wrapper for team portals.
- P3-09 Comprehensive mutation `audit_logs` coverage across lifecycle entities.
- P3-10 Native Xero one-click connect (running-todo roadmap item).
- P3-11 Direct email send (SMTP / Gmail / MS365 OAuth) for the queue
  (running-todo roadmap item).
- P3-12 Mailchimp full bulk-send integration (running-todo roadmap item).
- P3-13 White-label custom domain + branded login (running-todo roadmap item).
- P3-14 Universal builds U1-U8 from running-todo Group 7 (allergen engine,
  certificate vault, instant quote calculator, multi-juris VAT, B2B
  account-with-PO, AI menu auto-balancing, carbon-per-portion, surplus-food
  routing).

## 8.5 Findings totals

- P0: 19 (security 9, data-integrity 7, missing-trigger 3)
- P1: 40 (data-integrity 15, ux 10, missing-feature 9, inconsistency 6)
- P2: 18 (polish + a11y + cleanup)
- P3: 14 (strategic upgrades)

Total **91 findings** captured. ~38 of them overlap with running-todo
Phase 2A / 2B / 2C / 2D / 2E / 2F items already on Bobby's shipping log.
~53 are net-new from this audit pass and should be added to the running-
todo when they hit Phase 1 / 2 / 3 / 4 of this programme.

---

# Phase 0 closeout

## What's confidence-rated high

- Section 1 inventory.
- Section 2 journeys A1, A2, A3, B1, C1, C2, D1.
- Section 3 entity-by-entity schema + RLS sweep.
- Section 5 communication-flow status grid.
- Section 6 reconciliation atomicity gap.
- Section 8 P0 ledger (every P0 has a verified file pointer or a verified
  Phase 2A/B/C overlap).

## What's confidence-rated medium

- Journeys A4-A7 (configure team / financial close / repeat rebook) -- partial
  trace; flagged for Phase 1 deeper walks.
- Journey B3 (shopping) -- partial trace.
- Refund auto-flow (PayFast direct refund path) not deep-traced.

## Assumptions written down

1. The running-todo `Phase 2A--2F` IDs are stable and operator-agreed. The
   audit reuses them.
2. The base schema state is what the most recent migration says, even where
   the root-level `*_SCHEMA*.sql` files diverge. Phase 2B will reconcile.
3. The "post-order cascade" architecture is correct; only the surfaces that
   bypass it (webhook, cron, amendment review) are gaps.
4. Spit Braai Delivery is the only live tenant; behaviour observed against
   that data is representative.

## Out of scope for this Phase 0 pass

- A row-by-row sweep of every service file's query for `deleted_at` filter
  coverage -- spot-check only this pass; full sweep is Phase 1 P1-07 work.
- Driver pay calculation correctness against BCEA. The schema is in; the
  application logic deserves its own walkthrough.
- The 1751-line `running-todo.tsx` accordion was read end-to-end for cross-
  reference but not audited as code; it's structured data + JSX.
- Deep load testing, Lighthouse, accessibility audit by tooling.

## Approval to proceed

Phase 0 ends here. Phase 1 starts on operator approval and addresses the 19
P0 findings, atomic-commit-per-fix, with TypeScript + build clean after each
commit. Each P0 fix's commit message will reference the finding ID
(P0-01, P0-02, ...) for traceability.

When phase 1 closeout lands, this document gets a sibling at
`docs/audits/megaprogramme-2026-05-phase-1.md` mapping every P0 finding to
the commit that resolved it (or to a downgrade with justification).

---

# Appendix A: refresh dispositions across phases 1-10 (2026-05-18)

Phase 1-10 closeouts (`docs/audits/megaprogramme-2026-05-phase-{1..10}.md`)
collectively address the 19 P0s, 40 P1s, and most of the 18 P2s from the
ledger above. This appendix collapses those ten reports into a single
lookup table so "what's the status of P1-23?" needs one scroll rather than
ten files.

The commit short SHAs reference resolved-by commits; consult the named
phase closeout for the full narrative and the per-finding context.

## A.1 Per-phase headlines

- **Phase 1** (2026-05-07, `phase-1/megaprogramme-2026-05`): 17/19 P0s
  fixed in code, 1 verified-already-resolved (P0-04), 1 operator-action
  only (P0-19). 6 net-new follow-ups (P2F-1..6) created.
- **Phase 2** (2026-05-07, `phase-2/megaprogramme-2026-05`): 22 items
  fixed (P1 + P2F mix), 24 deferred to Phase 3.
- **Phase 3** (2026-05-07, `phase-3/megaprogramme-2026-05`): 11 items
  shipped from the combined P2 + deferred backlog, 31 deferred to Phase 4.
- **Phase 4** (2026-05-07, `phase-4/megaprogramme-2026-05`): 7 polish-
  trickle items shipped, 24 deferred and split into 6 character-grouped
  PR groups.
- **Phase 5 arch** (2026-05-07, `phase-5-arch/megaprogramme-2026-05`): 3
  architecture items shipped; P2-13 (five-file splits) and the P2-10
  remainder (12 services still on `@ts-nocheck`) deferred.
- **Phase 6 UI** (2026-05-07, `phase-6-ui/megaprogramme-2026-05`): 6 items
  shipped across 5 commits; P1-29 deferred.
- **Phase 7 driver** (2026-05-07, `phase-7-driver/megaprogramme-2026-05`):
  5 driver-fleet items closed in 3 commits (P1-34 verified-already-in-tree);
  0 deferred.
- **Phase 8 Xero** (2026-05-07, `phase-8-xero/megaprogramme-2026-05`): 3
  items shipped; 0 deferred.
- **Phase 9 Skylight** (2026-05-07, `phase-9-skylight/megaprogramme-2026-05`):
  2 items shipped; 0 deferred.
- **Phase 10 polish** (2026-05-07, `phase-10-polish/megaprogramme-2026-05`):
  2 items shipped; the megaprogramme follow-up wave closes.

## A.2 P0 disposition (19 items)

| ID | Status | Phase / commit |
|---|---|---|
| P0-01 | fixed | P1 `5337ccc` |
| P0-02 | fixed | P1 `7ebc170` |
| P0-03 | fixed | P1 `36e403c` |
| P0-04 | verified-resolved | P1 (pre-existing `4f3bc10`) |
| P0-05 | fixed | P1 `2a0bd7c` |
| P0-06 | fixed | P1 `892e1fe` |
| P0-07 | fixed | P1 `ac2ff87` |
| P0-08 | fixed | P1 `94d4698` |
| P0-09 | fixed | P1 `1d7b22e` |
| P0-10 | fixed | P1 `cb1b450` |
| P0-11 | fixed | P1 `199fff8` |
| P0-12 | fixed | P1 `76bc166` |
| P0-13 | fixed (USD/ZAR) + extended in Phase 3 | P1 `c55589c`, P3 `c77993b` |
| P0-14 | fixed | P1 `ca8a0cf` |
| P0-15 | fixed (data layer) + UI surface in Phase 3 | P1 `819ee0c`, P3 `3915992` |
| P0-16 | fixed | P1 `d3170a6` |
| P0-17 | fixed (in-memory) + DB-backed in Phase 3 | P1 `cf8eb7a`, P3 `9fb45a4` |
| P0-18 | fixed | P1 `2991dda` |
| P0-19 | operator-action | P1 (no commit) |

## A.3 P1 disposition (40 items)

| ID | Status | Phase / commit |
|---|---|---|
| P1-01 | fixed | P4 `6ef4d4c` |
| P1-02 | fixed | P2 `4014260` |
| P1-03 | fixed | P2 `6999633` |
| P1-04 | fixed | P2 `d8c3b4a` |
| P1-05 | fixed | P2 `6a01c79` |
| P1-06 | fixed | P2 `6a01c79` |
| P1-07 | fixed | P7 `cf93a45` |
| P1-08 | fixed | P7 `658f454` |
| P1-09 | fixed | P2 `54f5597` |
| P1-10 | fixed | P2 `3484bac` |
| P1-11 | fixed | P2 `e34d412` |
| P1-12 | fixed | P3 `5991c8d` |
| P1-13 | fixed | P2 `4fa8fa9` |
| P1-14 | fixed | P2 `7a1d332` |
| P1-15 | fixed | P2 `5234d37` |
| P1-16 | fixed | P2 `1ca33cc` |
| P1-17 | fixed | P2 `5869354` |
| P1-18 | fixed | P7 `658f454` |
| P1-19 | fixed | P2 `2a634ab` |
| P1-20 | fixed | P8 `3c38206` |
| P1-21 | fixed | P8 `ffc9493` |
| P1-22 | fixed | P4 `b0d9bda` |
| P1-23 | fixed | P10 `2365070` |
| P1-24 | fixed | P8 `e7256eb` |
| P1-25 | fixed | P2 `37831ab` |
| P1-26 | fixed | P2 `5d18858` |
| P1-27 | fixed | P2 `5d18858` |
| P1-28 | fixed | P2 `4999386` |
| P1-29 | still-open | deferred (L-effort form sweep) |
| P1-30 | fixed | P5 `5ebb041` |
| P1-31 | fixed | P5 `7e0fbce` |
| P1-32 | fixed | P9 `1f29d56` |
| P1-33 | fixed | P2 `6999633` |
| P1-34 | verified-already-in-tree | P7 |
| P1-35 | fixed | P2 `116ffb0` |
| P1-36 | fixed | P4 `dcaa949` |
| P1-37 | fixed | P7 `2a88ec6` |
| P1-38 | fixed | P2 `c07b03b` |
| P1-39 | fixed | P2 `245c026` |
| P1-40 | fixed (Query API stub in place) | P4 `4881723` |

## A.4 P2 disposition (18 items)

| ID | Status | Phase / commit |
|---|---|---|
| P2-01 | fixed (Safari CSS); manual QA still pending operator | P10 `a3d10b4` |
| P2-02 | fixed | P3 `a1a7032` |
| P2-03 | still-open | not addressed by any phase |
| P2-04 | fixed | P6 `ce02f46` |
| P2-05 | fixed | P3 `e616118` |
| P2-06 | fixed | P3 `dee9fe2` |
| P2-07 | fixed | 2026-05-18 `8b58643` (post-phase-10 sweep, PR #13) |
| P2-08 | fixed | P4 `44401f3` |
| P2-09 | fixed | P6 `d1d2722` |
| P2-10 | fixed | P5 `9e53759` + 2026-05-18 PRs #14, #15, #16, #17, #18, #19, #20, #21 (all 47 remaining services cleared) |
| P2-11 | fixed | P6 `e41310c` |
| P2-12 | fixed | P4 `2421d06` |
| P2-13 | partial | admin/settings.tsx fully split (PRs #49-#55, A.14); admin/orders.tsx Phase A/B done; Phase C/D deferred; account/settings still pending |
| P2-14 | fixed | P3 `6e4cb40` + P4 reframe `2fbb555` |
| P2-15 | fixed | P9 `9afe16c` |
| P2-16 | fixed (three of four dashboards) | P6 `e5613a9`; cleaning dashboard gated on UX call |
| P2-17 | fixed (chrome scope) | P6 `ce02f46` |
| P2-18 | fixed | P6 `fa60f09` |

## A.5 Net-new follow-ups discovered during phases 1-10

The Phase 1 closeout flagged six items that fell out of P0 work and were
booked as P2F-1..6. All six landed in Phase 3.

| ID | Title | Status | Phase / commit |
|---|---|---|---|
| P2F-1 | Invoice-branch routed through atomic RPC | fixed | P3 `86e7bc5` |
| P2F-2 | DB-backed rate limit on integration endpoints | fixed | P3 `9fb45a4` |
| P2F-3 | Allergens-reviewed UI surface (kitchen + quote) | fixed | P3 `3915992` |
| P2F-4 | `exchange_rates` schema for EUR/GBP/AUD + cron | fixed | P3 `c77993b` |
| P2F-5 | Server-side Xero / QuickBooks OAuth initiator | fixed | P3 `e1db025` |
| P2F-6 | Amendment cascade retry endpoint | fixed | P3 `d30f5d2` |

No fresh `P-NN` tags were introduced beyond the P2F-1..6 series.

## A.6 What remains open at end of Phase 10

- **P0:** none open. P0-19 remains an operator action (service-role key
  rotation).
- **P1:** P1-29 (react-hook-form + zod sweep, L-effort, deferred outside
  the megaprogramme scope).
- **P2:** P2-13 (five-file splits - note `admin/orders.tsx` has grown to
  4,443 lines since the audit and now needs a deeper plan, not a quick
  split), the cleaning-dashboard MetricCard upgrade (gated on a UX call),
  P2-01 Safari manual QA on a real Mac, plus P2-03 which was never
  picked up by any phase. **P2-07 and P2-10 cleared 2026-05-18 in the
  post-phase-10 sweep (PRs #13, #14-#21).**
- **P3 (14 strategic items, P3-01..P3-14):** untouched. The closeouts
  confirm phases 1-10 ran through P0 / P1 / P2 + P2F follow-ups only;
  every strategic upgrade in section 8.4 is still open.

## A.7 Operator actions outstanding

Items only the operator can close, surfaced across the closeouts so they
do not get lost:

1. Rotate `SUPABASE_SERVICE_ROLE_KEY` (P0-19).
2. Clear `DEV_RETURN_MAGIC_LINK` from Vercel production env (P0-18).
3. Populate `PAYFAST_ALLOWED_IPS` on Vercel production (P0-11).
4. Set Xero / QuickBooks OAuth client ID + secret env vars (P2F-5).
5. Schedule the `prune_api_key_rate_limits` cron (P2F-2).
6. Schedule the `reconcile-payfast` cron + wire the PayFast Query API
   credentials (P1-40).
7. Surface the magic-link request form on `/c/account` once SMTP delivery
   is verified (P1-22).
8. Set `MIDDLEWARE_PROFILE_SECRET` (P2-15).
9. Manually verify the Safari print path for the public quote (P2-01).

## A.8 Outside-the-programme work shipped since Phase 0

The closeouts implement the audit's ledger but do not capture every line
of code that landed on main during the same period. Notable parallel
streams shipped against `running-todo.tsx` (not against this audit):
client-portal data-isolation lockdown, the AI onboarding importer,
booking packages, outsource-provider routing, recurring invoices, the
wave-49/49b/50/51/60/64/66/67/70 features, plus the various RLS
performance migrations (`wave45_perf_*`). Those are tracked through the
running-todo, not this audit; see `src/pages/admin/platform/running-todo.tsx`
for the operator's authoritative shipping log.

A Phase 0 v2 (a fresh end-to-end reconnaissance reflecting today's
state, not a refresh of the prior ledger) would be the right next move
before the next implementation programme. That is **not** what this
document is. This document is the historical Phase 0 plus a status
overlay.

## A.9 Post-phase-10 sweep, 2026-05-18

Closed two findings that the phase 1-10 closeouts had left open:

- **P2-07** (soft-delete filter sweep). 15 query sites across
  `dispatchService.ts`, `orderWorkflow.ts`, `orderFinancials.ts`,
  `postCreationCascade.ts` now filter `.is("deleted_at", null)` on
  `orders` / `invoices` / `quotes` reads. Cancelled-and-soft-deleted
  rows no longer leak into driver-load counts, double-booking checks,
  KPI tiles, batchable-order discovery, or the post-order cascade.
  Scope intentionally limited to tables with a verified `deleted_at`
  column. PR #13.

- **P2-10** (the @ts-nocheck removal). All 47 services still carrying
  the suppression after Phase 5 have been cleared - 22 were already
  implicitly type-safe; 25 needed targeted `as any` casts at column /
  value sites where the generated `database.types.ts` is tighter than
  the application code. `clientManagementService` also surfaced a real
  bug (the `loadCompanyClients` query was selecting `orders.total`,
  which doesn't exist - column is `total_amount`); fixed in PR #18.
  PRs #14, #15, #16, #17, #18, #19, #20, #21.

`admin/orders.tsx` has grown from 2,427 lines to 4,443 lines. The
P2-13 split plan needs to be rethought - a clean modular split at
that size is a multi-day refactor with real regression risk, not the
small-effort item the audit graded it as.

## A.10 Enum / CHECK drift sweep, 2026-05-18

The P2-10 cleanup surfaced one suspicious item (`proximityService`
writing status values not in the assignment_status TS enum). Pulling
that thread end-to-end found five **real production bugs** where
application code wrote enum / CHECK values the schema rejected.
Postgres bounced the writes; the call sites either swallowed the
error or sat on inert filters that never matched a row. Bugs ranged
from silent UI confusion to entire features being non-functional.

Bug-by-bug:

- **`proximityService`** (PR #23). Wrote
  `driver_assignments.status = "arrived"` (not in the enum, valid set
  is `assigned | accepted | en_route | picked_up | at_venue |
  delivered | completed | cancelled | rejected`). Also wrote
  `arrived_at` (column is `arrived_at_venue_at`) and on the revert
  path wrote `"in_transit"`. The geofence arrival flow was failing at
  the DB layer; the `!== "arrived"` guard was always true, so the
  client-facing "Driver Has Arrived!" notification fired on every
  poll within 50m. The 10-minutes-away nudge (gated on
  `=== "in_transit"`) never fired at all.
  Fix: write `"at_venue"` + `arrived_at_venue_at`; revert writes
  `"en_route"`; guards compare against the correct values.

- **`driverConfirmationService.startCollection`** (PR #24). Filtered
  on `.eq("status", "pending")` and wrote `"in_progress"` - neither
  in the enum. Every driver tap on "start collection" was a 100%
  silent no-op at the DB layer (autoClockIn opened a shift, but
  dispatch board never saw the assignment go live).
  Fix: filter on `"accepted"`, write `"en_route"`.

- **`DeclineAssignmentDialog`** (PR #25). Wrote `status = "rejected"`,
  not in the enum. The dialog's audit row + order unassign still
  fired, so the UI looked correct, but the driver_assignment row
  stayed at `"accepted"`.
  Fix: migration `20260518710000_assignment_status_rejected.sql`
  added `rejected` as a first-class enum value (semantically
  distinct from `cancelled`: driver-initiated decline vs.
  admin/system terminal). Now the write succeeds.

- **`/team-portal/driver/tracking.tsx`** "Mark Arrived" button
  (PR #25). UI labelled "Mark as Arrived" wrote
  `status = "picked_up"`. That's a valid enum value, but the wrong
  lifecycle moment (`picked_up` = driver collected food from kitchen;
  `at_venue` = driver at delivery venue). Toast said "Status updated
  to picked up" reinforcing the mistake. Active-assignment filters
  on `tracking.tsx` and `driver/dashboard.tsx` listed `picked_up`
  but not `at_venue`, so after the fix an assignment would have
  dropped off the active view.
  Fix: write `"at_venue"`, add `"at_venue"` to active filters, gate
  the button on `!== "at_venue"`.

- **`outgoing_email_queue` end-to-end** (PR #26). The biggest find.
  The CHECK constraint allowed `(queued, sent, failed, cancelled)`
  but every code path past the initial INSERT used different
  vocabulary - the cron drainer (`claim_email_batch` RPC) filtered
  on `status='pending'` and wrote `'in_progress'`; pause/resume on
  `orderWorkflow` used `'paused'` / `'pending'`. None of those four
  values were in the CHECK. **Result: the cron never claimed a
  single row.** 48 rows were sitting in `'queued'` un-drained on
  2026-05-18 - all order-confirmation + quote-sent emails for the
  live tenant, never delivered. Trigger-based queued emails
  (pre-event reminders, after-sales automation) have effectively
  been broken since the queue went live; only direct
  `emailService.sendEmail` calls (Resend / SMTP) worked.
  Fix: migration `20260518720000_email_queue_status_lifecycle.sql`
  extends the CHECK to `(queued, in_progress, paused, sent, failed,
  cancelled)` and re-creates `claim_email_batch` to select `queued`
  (not `pending`). `orderWorkflow.pauseOrder` / `resumeOrder`
  re-pointed at `queued`. Migration applied to live DB. Backlog
  drains on the next 15-min cron tick; no row migration needed.

Net for the day:
- **5 production bugs** fixed (1 UI confusion, 1 customer-spam, 2
  silent feature breakage, 1 entire queue subsystem dead).
- **2 migrations** applied to live DB.
- **0 services** still carrying `@ts-nocheck`.
- **0 query sites** missing soft-delete filters (in the audited
  service files).

Pattern observation: every bug above traces back to
**TypeScript-generated types vs. database schema drift**, made
invisible by either silent error swallowing or filters that simply
never match. The TS column types are tighter than the DB has any
enforcement of, so wrong values type-check while failing at runtime;
the eslint `no-explicit-any` allowance compounds it because `as any`
casts hide the type error too. Worth thinking about a stricter rule
that flags `as any` on Supabase write payloads in PR review, or a
sweep that compares all `.eq("status", "X")` literal filters against
the DB CHECK / enum for that table.

## A.11 Open follow-ups from the 2026-05-18 session

Known issues found but **not** fixed in the session (need product
direction or wider scope):

1. **`subscriptions.status` / `companies.subscription_status` trial
   vs trialing**. Running-todo already flags this: two values in use
   for the same state, normalised in JS. Pick one and migrate the
   other rows. Cross-references `running-todo.tsx` line 1193.

2. **`admin/orders.tsx` is now 4,443 lines**. P2-13's "modular split"
   grade is stale. Needs a fresh plan or accepting the size.

3. **Catch-up email burst risk**. With the queue fixed, 48 stale
   rows drain on the next cron tick (every 15 min). None are >24h
   past their `scheduled_for`, but the catch-up may surprise the
   tenant. PR #26's description includes the SQL to manually purge
   rows older than 24h if the operator wants to suppress the burst.

## A.12 Cron health infrastructure (2026-05-18 evening)

The email-queue investigation surfaced a broader problem: DB probes
suggested Vercel-scheduled crons may not be firing at all in production
(exchange_rates last updated 2026-04-27, 48 queue rows at attempts=0
for 5+ days, no audit_logs rows of any cron kind). Built a shared
infrastructure so we never have to guess again.

`src/lib/cronAuth.ts` exports `requireCronAuth(req, res)` which
accepts either:
- Vercel cron bearer token (`CRON_SECRET` env var)
- An authenticated super_admin session (lets operator hit any cron
  endpoint from the browser to fire it manually + see what happens)

`src/lib/cronHeartbeat.ts` exports `recordCronHeartbeat(supabase,
name, status, meta)` which writes one `audit_logs` row per cron
invocation with `action='cron.<name>'`.

Wired into **all 25 crons** across PRs #28-#30, #36-#37. Operator
health query:

```sql
SELECT action, max(created_at), count(*), max(details::text)
  FROM audit_logs
 WHERE action LIKE 'cron.%'
   AND created_at > now() - interval '24 hours'
 GROUP BY action ORDER BY action;
```

After 24h of Vercel cron running, the result should include every
cron name. Missing rows = that schedule isn't firing.

The 2 outsource crons (`outsource-pre-event-reminder`,
`outsource-post-event-thanks`) preserve their pre-existing `dryRun=1`
owner/admin gate (broader than super_admin so tenant ops can QA
the email preview without sending). Heartbeat captures whether the
fire came from `cron`, `super_admin`, or `owner_dryrun`.

Bug fixes alongside the wiring:

- PR #31 - `claim_email_batch` RPC wrote `updated_at` (column doesn't
  exist on `outgoing_email_queue`). Fixed.
- PR #32 - Cron retry path wrote `status='pending'` (not in CHECK),
  off-by-one on attempts increment, silent supabase-js error
  swallowing. Fixed; 25 orphaned `in_progress` rows reset to queued.
- PR #33 - `recordCronHeartbeat` itself wrote to wrong audit_logs
  columns (`metadata`/`entity_id`) and silently failed every insert.
  Fixed.
- PR #34 - `expire-stale-quotes` filtered on `"viewed"`/`"negotiating"`
  (not in `quote_status` enum); `deposit-paid-sweeper` filtered on
  `"draft"` (not in `order_status` enum). Both 500'd every run.
- PR #35 - `propagateQuoteEdit` wrote `status='requires_dispatch_review'`
  and `status='applied'` to `order_amendment_requests` (CHECK is
  pending/approved/rejected/auto_rejected_late/cancelled_by_client).
  Two more silent feature breakages closed.

## A.13 Open follow-ups from the cron infrastructure work

1. **Cron schedule confirmation**. `vercel.json` schedules every
   cron (~15-min cadence for most, daily for some). Now that
   heartbeats land in `audit_logs`, give it 24h and query - if some
   crons have zero entries after a full day, Vercel scheduling is
   actually broken for them and the env-var / plan / dashboard
   config needs investigation. Manual super_admin triggers work
   regardless and can be used as an interim drain.

2. **Tenant email provider blocking deliveries**. Spit Braai has no
   working provider configured: SMTP row has no password, Resend
   row has `resend_domain_status='pending'` (DNS records added
   2026-05-15 but not verified). The queue and cron infrastructure
   are now correct - the tenant config gate is the only remaining
   blocker. Operator action.

3. **Wider enum / CHECK drift sweep**. The cleanups above audited
   `assignment_status`, `outgoing_email_queue.status`, `quote_status`,
   `order_status`, and `order_amendment_requests.status` end-to-end.
   Other status columns (`subscriptions.status`,
   `kitchen_shifts.status`, `outsource_assignments.status`,
   `billing_history.status`, `cleaning_jobs.status`,
   `kitchen_prep_tasks.status`, etc.) weren't deep-traced. Same
   pattern of TS-types-vs-DB-schema may yield more silent failures.

4. **`recordCronHeartbeat` schema guarantee**. Audit_logs schema
   could drift again (e.g. `details` renamed to `metadata` in a
   future migration). Worth adding a CI check that the helper's
   write shape matches the table.

5. **Notification idempotency on driver_arrived**. PR #23 fixed the
   `assignment.status` mismatch that re-fired the "Driver has
   arrived!" client notification on every proximity poll. Even with
   the fix, a driver loitering within 50m can re-cross the
   threshold and re-trigger. A dedup gate on the notification
   creation would belt-and-braces the fix.

6. **Pattern guardrail**. The session uncovered ~10 distinct bugs
   from one root pattern (TypeScript types vs DB enum/CHECK drift,
   silenced by `as any` casts and supabase-js's `{error}` return
   shape vs throwing). Worth a PR-review check or a lint rule that
   flags `as any` on supabase write payloads as needing explanation.

## A.14 P2-13 admin/settings.tsx split closeout (2026-05-18)

`src/pages/admin/settings.tsx` was 1,241 lines at the time of the
original audit and was carrying every settings tab inline. Split
plan in `docs/audits/p2-13-admin-settings-split-plan.md` laid out
seven phases; all seven shipped in this session:

| Phase | Tab               | PR   | Tab component                                            |
|-------|-------------------|------|----------------------------------------------------------|
| A     | notifications     | #49  | `src/components/admin/settings/NotificationsSettingsTab` |
| B     | automation        | #50  | `src/components/admin/settings/AutomationSettingsTab`    |
| C     | pricing           | #51  | `src/components/admin/settings/PricingSettingsTab`       |
| D     | operations        | #52  | `src/components/admin/settings/OperationsSettingsTab`    |
| E     | company           | #53  | `src/components/admin/settings/CompanySettingsTab`       |
| F     | email-automation  | #54  | `src/components/admin/settings/EmailAutomationSettingsTab` |
| G     | financial         | #55  | `src/components/admin/settings/FinancialSettingsTab`     |

Shared types + per-category `Update*Setting` callback types live in
`src/components/admin/settings/types.ts`. The parent's
`updateSetting(category, key, value)` is partial-applied at the
tab boundary so sub-components stay free of the parent's internal
shape.

Final line counts:
- `src/pages/admin/settings.tsx`: 1,241 -> 675 (`-566`, -46%).
- Inline `lucide-react` imports trimmed (Clock dropped in B; whole
  `@/components/ui/select` import group dropped in G; AddressAutocomplete
  moved with the company tab in E).
- Every tab is now ~100-220 lines of focused JSX rather than buried
  inside a 1,200-line file.

P2-13's admin/settings line ticks off cleanly. The two remaining
P2-13 lines are:
- `admin/orders.tsx` - now 4,288 lines (was 4,443 before A.11; now
  4,288 because of the Phase A/B dialog extraction). Phase C
  (Order Details Modal, 1,708-line inner component) is the next
  pure-LOC win but carries real regression risk because the modal
  is a closure-heavy inner component on a daily-driver page. The
  C1 single-component option in the split plan still applies but
  needs a session that can pair with browser smoke testing.
- `account/settings.tsx` - profile + security tabs still inline.
  Lower-traffic page, can pick up in the same future session.

## A.15 Open follow-ups from the admin/settings split

1. **admin/orders.tsx Phase C**. Order Details Modal (lines
   1826-3534, 1,708 lines) is a closure-heavy inner component
   that reads ~30 parent symbols (selectedOrder, isModalOpen,
   handlers, etc). Lifting them all as props is feasible but every
   change there ships with browser regression risk - it's the
   modal the operator opens for every active booking. Plan: pair
   this with a session that has a live tenant to click through
   each of the 6 inner tabs after the extraction lands.

2. **admin/orders.tsx Phases D1-D3**. KPI tiles, filters bar,
   orders table. Each is a more conventional JSX extraction and
   would each shave 200-700 lines off the parent. Lower risk than
   Phase C; can ship before Phase C if Phase C's browser-verify
   step is the bottleneck.

3. **account/settings.tsx profile + security tabs**. Lower traffic
   than admin/settings, but the same monolithic shape. Same
   split-pattern as the seven settings phases above.

4. **Lint rule for unused state setters after a split**. Several
   of the settings tabs lifted state types that are easy to forget
   to update on the parent if a tab gains a new field. Worth a CI
   check that `keyof XSettings` and the literal keys in the
   parent's default-state object stay in sync.
