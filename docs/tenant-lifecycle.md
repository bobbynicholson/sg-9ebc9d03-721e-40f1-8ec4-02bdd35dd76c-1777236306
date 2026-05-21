# Tenant lifecycle + multi-region

**Audit date:** 2026-05-21
**Auditor:** Phase 5 (Wave 80)
**Scope:** Self-serve signup -> onboarding -> first order -> first event delivered. Multi-region scoping rules. Offboarding + data export. Subscription -> feature gating tie-in.

---

## 1. Self-serve signup

### 1.1 Entry points

- `/auth/register` - the personal signup. Creates a user with `role='client'` by default. The form links to `/company-signup` for business signup.
- `/company-signup` (separate flow) - business signup that creates a `companies` row alongside the user profile and stamps `role='company_admin'`.
- `/auth/login` - returning users.

### 1.2 First-login redirect

`src/middleware.ts:319-328` runs an onboarding-aware landing override. When the signed-in user is `company_admin / admin / owner` AND `companies.onboarding_completed_at IS NULL` AND a `userCompanySlug` is resolved, the middleware redirects them to `/${userCompanySlug}/admin/onboarding` instead of the dashboard. The intent: don't stare at a wall of zeros - pick up where setup left off.

### 1.3 What was broken (Phase 5 fix)

In Next.js Pages Router, `pages/admin/onboarding.tsx` (literal file) shadows `pages/admin/onboarding/index.tsx` (directory index). Both claimed `/admin/onboarding`. The literal file (a 245-line progress dashboard) won the route, and the wizard at `index.tsx` (1187 lines, 9 steps, source of truth per its own file header) was unreachable from any nav or middleware redirect.

So new tenants landed on a dashboard that tiled out "Welcome -> Company -> Address -> ..." with "Start" buttons pointing at separate admin pages (`/admin/company-profile`, `/admin/staff`, etc.). That's a different mental model from the wizard's "fill these forms inline, save & continue, mark complete". Neither was wrong - but the wizard was the canonical product intent (per its file header explaining the middleware redirect) and it was dead.

**Fix**: deleted `src/pages/admin/onboarding.tsx`. The wizard at `src/pages/admin/onboarding/index.tsx` now claims `/admin/onboarding`. Middleware redirect lands new tenants on the wizard. Returning tenants who visit the URL see the wizard pre-populated with their current settings.

### 1.4 The wizard steps

From `src/pages/admin/onboarding/index.tsx:101-111`:

1. **Welcome** - intro + "skip and bulk import" shortcut.
2. **Business** - name, email, phone, legal name, registration number, tax number.
3. **Address** - HQ / kitchen address (the source of truth for delivery distance).
4. **Branding** - primary + secondary colour, logo.
5. **Banking** - optional; enables EFT on the client portal.
6. **VAT** - VAT registration toggle; drives "Tax Invoice" doc title.
7. **Email** - Resend domain + verify.
8. **Clients** - import existing client list (csv).
9. **Finish** - stamp `onboarding_completed_at`, redirect to dashboard.

Per-step persistence: each "Save & continue" writes the relevant `companies` columns immediately. Mid-flow leave is safe - middleware brings the tenant back next time.

---

## 2. First-order path (new tenant -> first event delivered)

Once `onboarding_completed_at` is stamped, the new tenant lands on `/admin/dashboard` (per `getRoleLandingPage()` in `src/lib/authGuards.ts`).

Recommended first-event happy path:
1. `/admin/menu` - add menu items.
2. `/admin/equipment` - add equipment.
3. `/admin/contacts` - add a test client.
4. `/admin/quotes/new` - build a quote for that client.
5. Quote accept -> order created via `convert_quote_to_order` RPC (Phase 1 hardened).
6. Deposit invoice fires (auto from trigger).
7. `/admin/order-assignments` - assign driver.
8. Day-of: kitchen preps, driver delivers.
9. `/admin/invoices` shows the balance invoice.
10. Order completes.

No formal "first-event walkthrough" UI exists today. The wizard ends at step 9 (finish) and dumps the tenant into the dashboard cold. Open follow-up.

---

## 3. Multi-region scoping

### 3.1 The model

`regions` table per tenant (per `companies` row). Region columns: `id, company_id, name, code, country, city, address, manager_user_id, timezone, currency, operating_hours, delivery_radius, is_active, notes`.

Tables that carry a `region_id` (most tenant-data tables): `orders, quotes, clients, leads, kitchen_prep_tasks, deliveries, driver_assignments`, others.

Roles that respect region scoping:
- `region_admin` - scoped to one or more regions via `profiles.regions_covered`.
- `sales_admin` - cross-region but read-only for kitchen / dispatch.
- `super_admin` + `company_admin` - cross-region full access (see `CROSS_BRANCH_ADMIN_ROLES`).

### 3.2 Enforcement audit

**Where it's enforced**:
- RLS policies named `region_scope_*` on `quotes, clients` (verified in Phase 1 security audit) using `user_can_access_region(region_id)` helper.
- `RegionFilterContext` on the client side, surfaced as the global region dropdown in admin nav.

**Where it isn't (gaps)**:
- Accounting sync endpoints (`/api/integrations/xero/*`, `/api/integrations/quickbooks/*`) filter on `company_id` only. A cross-region admin can sync any region's data without scoping.
- The wizard does NOT create a default region during onboarding. New tenants land in the dashboard with zero regions, and the first order they create has `region_id=NULL`. Region scoping silently fails open for these orders.
- No `region_id NOT NULL` enforcement on orders / clients / quotes - rows can land without a region.

### 3.3 The default-region question

Two options:
- **Implicit default**: middleware or onboarding creates a "Main" region on first run. Every subsequent create defaults to it.
- **Required step**: add a region setup step to the wizard before "Finish". Tenant must define at least one region before completing onboarding.

The implicit default is the correct pragmatic answer for single-region tenants (most caterers). Multi-region tenants add more regions later. Documented as a follow-up.

---

## 4. Tenant offboarding + data export

### 4.1 The flow today

`/admin/subscription` line 138-149 has a "Cancel my account" button that calls `subscriptionService.requestAccountDeletion(userId, reason, exportData)`. This inserts into `account_deletion_requests` (which has RLS + a single SELECT policy).

`/api/admin/delete-user.ts` performs the actual delete:
1. Soft-deletes the user (`deleted_at = now()`, `is_active = false`).
2. Bans the auth user for ~100 years (effectively forever).
3. Inserts an audit_logs row.
4. Leaves the tenant's order history intact for reporting.

### 4.2 What's missing

- **No data export.** The `exportData` flag is collected on the form but the export endpoint doesn't exist. GDPR / POPIA compliance gap.
- **No cooldown period.** Deletion is immediate. A typical SaaS pattern is "30-day grace, then hard delete". The soft-delete + 100-year ban achieves a similar effect by accident but isn't documented as the policy.
- **No tenant-level offboarding.** `/api/admin/delete-user.ts` deletes ONE user. There's no "wind down the whole tenant" path - if the owner leaves, the company row stays and other users keep accessing.

Open follow-ups.

---

## 5. Subscription -> feature gating

### 5.1 The two sources

Per `src/services/subscriptionService.ts:1-38`:
- `companies.subscription_status` - denormalized cache on the company row. Source of truth in practice.
- `subscriptions` table - ledger. Populated by gateway webhooks (Stripe/PayFast). **Currently 0 rows** because no webhook is live.

### 5.2 Where gates exist

The codebase has very few subscription gates. A grep for `subscription_status ===` / `tier ===` / `plan ===` turns up only display logic on the `/admin/subscription` page itself, not feature locks elsewhere.

In practice: **every feature is unlocked regardless of tier**. The pricing plans table exists (`platform_pricing_plans`), the UI advertises tier-specific limits, but nothing enforces them.

### 5.3 Why this is OK for now

CateringMS has one tenant in real production (Spit Braai Delivery, the test/demo tenant). Adding feature gates before there's a paying tier to gate against creates work that's hard to QA in isolation. Documented for the day pricing tiers go live.

---

## 6. Phase 5 changes

### 6.1 FIXED - onboarding routing conflict

Deleted `src/pages/admin/onboarding.tsx` (the 245-line progress dashboard). The 1187-line wizard at `src/pages/admin/onboarding/index.tsx` now claims `/admin/onboarding`. Middleware redirect lands new tenants there as originally intended. Verified `tsc --noEmit` clean - no internal references to the deleted file.

The `onboardingProgressService.ts` helper continues to exist and is still imported by `FirstStepsCard.tsx`, `/api/admin/resend/verify-domain.ts`, and the wizard itself.

### 6.2 Documented

This document.

---

## 7. Open follow-ups

### Done in Phase 5 follow-up PR

- **Default region at onboarding** - `onboardingProgressService.markComplete` now idempotently inserts a "Main" region for the company if none exist. Seeds country / city / address / lat / lng from the `companies` HQ fields. Non-fatal on insert failure (tenant can still create a region manually from `/admin/regions`).
- **Data export endpoint** - `/api/admin/export-company-data` (GET) returns a JSON blob with company + clients + orders + invoices + quotes + payments. 50,000-row cap per entity with metadata flagging capped entities. Super-admin can override the target via `?company_id=`. Wired into the `/admin/subscription` deletion form so ticking "Export my data" downloads the dump in-browser before the deletion request fires.
- **Subscription gating scaffold** - `src/lib/subscriptionGate.ts` exports `requireSubscriptionFeature(client, companyId, feature)`. Reads `companies.subscription_status`, blocks `cancelled` / `suspended`, allows `trial` / `active` / `past_due`. Permissive by default so the codebase stays shippable while the tier matrix is being designed. Wired as proof-of-concept on `/api/admin/leads/[id]/convert-to-order.ts` (returns 402 with `code: "subscription_gate"` when the gate blocks).

### Deferred with reasons

- **Accounting sync region scope** - reclassified as accept-with-reason. Xero / QuickBooks / Sage integrations are per-tenant (one external org per CateringMS company). Pushing all of a company's invoices to its single Xero org doesn't leak cross-region data - the books are unified at the tenant level. Region filtering would be wrong here.
- **`orders.region_id NOT NULL`** + backfill migration. Risky on live data because existing orders have NULL region_id. Phase 5 follow-up addresses the new-row case (default region at onboarding); the backfill needs a deliberate migration with rollback plan.
- **Tenant-level offboarding flow** - "wind down the whole tenant" path with 30-day cooldown + final data export. Today only single-user delete via `/api/admin/delete-user.ts`. Deferred to a focused PR.
- **First-event walkthrough coachmarks** - wizard dumps the tenant into the dashboard cold after step 9. Lightweight coachmarks for menu -> client -> quote -> order -> delivered. Deferred - product design call needed first.
- **Subscription tier matrix** - the gating scaffold is in place but every access-granting status unlocks every feature. When pricing tiers go live, replace the permissive default in `requireSubscriptionFeature` with a real tier -> feature map.
- **Stripe/PayFast subscription webhook** - the `subscriptions` ledger is 0 rows because no webhook populates it. Real integration work; deferred until a paying tier exists.
