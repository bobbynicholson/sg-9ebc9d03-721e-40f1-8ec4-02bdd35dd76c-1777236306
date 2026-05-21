# Security Posture - CateringMS

**Audit date:** 2026-05-21
**Auditor:** Phase 1 foundation audit (Wave 80)
**Scope:** RLS on every public table, every API route under `src/pages/api/**`, every `SECURITY DEFINER` function, every Postgres trigger, every scheduled job (pg_cron + Vercel cron).

This doc is the single starting point for any security question. Every finding lands in one of three buckets:

- **FIXED** - migration or code change in this phase
- **ACCEPT** - intentional, with the reason written down so the next auditor doesn't re-flag it
- **DEFER** - real issue, scoped out of this phase, tracked for a follow-up

If you find something that isn't here, the audit missed it - update this file in the same PR as the fix.

---

## 1. Row Level Security (RLS)

### 1.1 Coverage

- 156 tables in `public` schema.
- 155 have RLS enabled.
- 1 has RLS disabled: `spatial_ref_sys` (PostGIS-owned, reference table, **ACCEPT**).
- 3 have RLS enabled with 0 policies (effectively service-role-only, fail-safe): `api_key_rate_limits`, `embed_rate_limits`, `payment_gateway_credentials`. **ACCEPT**.

### 1.2 Permissive `USING (true)` policies

All five are intentional:

| Table | Policy | Role | Reason |
|---|---|---|---|
| `blog_posts` | `public_read` | public | Public-facing blog. **ACCEPT**. |
| `platform_pricing_plans` | `pricing_plans_public_read` | public | Public marketing page. **ACCEPT**. |
| `public_holidays` | `public_holidays_read_all` | public | Shared reference. **ACCEPT**. |
| `quote_acceptances` | `service_insert` | service_role | service_role bypasses RLS anyway. **ACCEPT**. |
| `quote_change_requests` | `service_insert` | service_role | Same. **ACCEPT**. |

### 1.3 Cross-tenant leak via anon policies

**FIXED** in migration `20260521090000_drop_open_anon_invoice_quote_policies.sql`.

Two policies allowed any anonymous request to read every row across every tenant:

- `invoices.anon_read_invoice_by_token` - qual was `(deleted_at IS NULL)`, no token check.
- `quotes.anon_read_quote_by_token` - same.

The policy names imply token-gating but the qual never matched against a token. The client portal flow goes through service-role RPCs (`client_view_order`, `client_view_account`) and the public quote flow goes through `/api/public/quotes/[token]/*` API routes, so no app code depends on direct anon SELECT against these tables. Both policies dropped.

### 1.4 Tables filtered by `user_id = auth.uid()` instead of `company_id`

`notifications`, `onboarding_state`, `purchase_history`, `user_saved_views`, `email_notification_preferences`, `blog_posts`.

**ACCEPT** - each row is bound to a single user; the user can only see their own. Cross-tenant leak is bounded because a user's `auth.uid()` only matches their own rows. Adding a `company_id` check would be defence-in-depth but the current policies are not actually leaky.

---

## 2. API routes

### 2.1 Coverage

- 153 API route files under `src/pages/api/**`.
- 27 cron routes, all 27 use `requireCronAuth` (Vercel cron bearer OR super_admin session). **ACCEPT**.
- 6 webhook routes (`/api/webhooks/*` + `/api/cron/reconcile-payfast.ts`), all verify HMAC / signature before processing. **ACCEPT**.
- 3 routes use `SUPABASE_SERVICE_ROLE_KEY`: `orders/[id]/force-close.ts`, `admin/create-user.ts`, `admin/delete-user.ts`. Each wraps the service-role call behind a super_admin / company_admin check. **ACCEPT**.

### 2.2 Routes that accept `company_id` from request body

| Route | Behaviour |
|---|---|
| `admin/numbering-settings.ts` | super_admin only, body `company_id` lets them target any tenant. **ACCEPT**. |
| `payment-gateways/index.ts` | super_admin only, ditto. **ACCEPT**. |
| `payment-gateways/[id]/activate.ts` | super_admin only, ditto. **ACCEPT**. |

No route accepts a body `company_id` and trusts it for a non-super-admin caller.

### 2.3 Token-gated public routes

- `/api/public/quotes/[token]/*`, `/api/public/embed/[token]/*`, `/api/client-tokens/*`, `/api/outsource/accept/[token]`.
- Each verifies the token (hash + scope + expiry + tenant binding) before any DB write.
- None expose direct anon access to underlying tables - they call service-role RPCs / service-role clients. **ACCEPT**.

---

## 3. `SECURITY DEFINER` functions

64 SECURITY DEFINER functions in `public`. Audit focused on the ones reachable by anon/authenticated callers with arguments that influence which tenant's data they touch.

### 3.1 Safe pattern - api_* functions with key-hash gating

`api_create_lead`, `api_create_quote`, `api_mark_invoice_paid`.

Each takes `p_key_hash` and looks up `api_keys.key_hash` to resolve the company. The caller-supplied payload can never reach a different tenant - the company is derived from the key. **ACCEPT**.

### 3.2 Safe pattern - claim_order

`claim_order(p_order_id)` derives the caller via `auth.uid()`, looks up their profile for `company_id`, and rejects if the order is not in the same company. **ACCEPT**.

### 3.3 Safe pattern - client_view_* / mint_*

`client_view_order`, `client_view_account` - token-hash gated, service-role-only EXECUTE.
`mint_client_account_token`, `mint_client_order_token` - service-role-only EXECUTE.
`record_invoice_payment`, `record_order_payment`, `redeem_client_credit`, `dispatch_webhook` - service-role-only EXECUTE.

All callable only from API routes that have already authenticated the caller. **ACCEPT**.

### 3.4 FIXED - convert_quote_to_order grant overreach

**FIXED** in migration `20260521090100_lock_down_security_definer_rpcs.sql`.

`convert_quote_to_order(p_quote_id, p_company_id, p_actor_user_id, p_order_payload)` had EXECUTE granted to `anon, authenticated, service_role`. The function verifies `quote.company_id = p_company_id` but did not verify that the caller has any relationship to that company. An anon caller who could obtain or guess a `quote_id` + `company_id` pair could force-create a confirmed order under that tenant.

Fix:
- In-function guard added: when `auth.uid()` is non-NULL, the caller must be `super_admin` OR a profile member of `p_company_id`. service_role still passes because its `auth.uid()` is NULL.
- EXECUTE revoked from `anon`.
- `authenticated` retains EXECUTE because `src/services/quoteService.ts` and `src/pages/admin/quotes/new.tsx` call the RPC via the browser anon supabase client. The in-function guard blocks cross-tenant abuse.

### 3.5 FIXED - rotate_company_embed_token unauthenticated rotation

**FIXED** in same migration as 3.4.

`rotate_company_embed_token(p_company_id uuid)` had EXECUTE granted to `anon, authenticated`. The function did no caller check at all - it just `UPDATE companies SET embed_token = gen_random_uuid() WHERE id = p_company_id`. Any anonymous client could rotate any tenant's embed token, breaking their embed form and (if combined with the new-token capture) enabling targeted abuse.

Fix:
- In-function guard added: when `auth.uid()` is non-NULL, the caller must be `super_admin` OR an `owner / admin / company_admin` whose `profile.company_id = p_company_id`. service_role passes because its `auth.uid()` is NULL.
- EXECUTE revoked from `anon`.
- The legitimate caller is `/api/admin/embed/rotate-token.ts` (service-role behind a super_admin / company-admin check).

### 3.6 Trigger helper functions

Functions starting with `tg_*`, `trg_*`, `_*_touch_updated_at`, etc. are trigger payloads. They need EXECUTE grants to anon/authenticated only because the trigger executes them under the caller's role context. Their inputs are `NEW`/`OLD` records, not caller-supplied arguments. **ACCEPT** as a class.

---

## 4. Triggers

81 triggers across `public`. Distribution highlights:

| Table | Side-effect triggers | Notes |
|---|---|---|
| `orders` | 13 distinct (excluding `updated_at`) | High blast radius - any single UPDATE on `orders` fires up to 13 procedures. The #205 landmine class lives here. Each is documented inline in its migration. |
| `quotes` | 6 distinct | Auto-spawn hire orders, propagate edits to order, send email, dispatch webhook. |
| `payments` | 1 (`trg_recalc_invoice_on_payment_change`) on I/U/D | Single recalc fan-in. Clean. |
| `gps_tracking` | 1 (`tg_geofence_auto_arrived`) | Auto-flips delivery to `arrived` when GPS hits the geofence. |
| `payment_gateways` | 1 (`payment_gateways_audit`) | Audit row on I/U. |

**No must-fix triggers found.** `trigger_notify_driver_order_ready` was the #205 landmine and is already hardened.

**ACCEPT-WITH-CAUTION:** The orders trigger fan-out is large enough that any future trigger added here MUST come with a docstring at the top of its migration explaining: what it does, when it fires, what it could do wrong, who owns it.

---

## 5. Scheduled jobs

### 5.1 pg_cron

Only one job:

| Job | Schedule | Command |
|---|---|---|
| 1 | `15 3 * * *` | `SELECT public.prune_embed_rate_limits();` |

**ACCEPT.**

### 5.2 Vercel cron

27 routes under `/api/cron/*`. Schedule lives in `vercel.json`. All gated by `requireCronAuth`. See section 2.1.

---

## 6. CI guard

A new CI check (`scripts/check-migration-rls.mjs`, wired into the `typecheck` workflow) scans every migration under `supabase/migrations/`. Any `CREATE TABLE public.<name>` without a paired `ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY` in the same migration fails the build. Override with the comment `-- RLS_OPT_OUT: <reason>` on the line above the `CREATE TABLE`, which forces the author to explain themselves in the diff.

---

## 7. Open follow-ups (deferred)

- **DEFER**: Audit `dispatch_webhook` payload contents for tenant-data leakage to external URLs. Owner: webhook audit pass.
- **DEFER**: Add per-tenant rate-limiting on `/api/cron/order-stage-notify` reply storms.
- **DEFER**: Lock down `_outsource_cancel_routing_siblings` execution to service_role (currently anon-executable via the outsource_assignments trigger path).
