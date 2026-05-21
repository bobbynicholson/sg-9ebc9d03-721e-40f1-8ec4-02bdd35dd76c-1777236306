# Owner persona - UX decisions

**Audit date:** 2026-05-21
**Auditor:** Phase 3f owner sweep (Wave 80) - final persona of the Phase 3 portal sweep.
**Scope:** What the "owner" persona is, what it currently isn't, and what shape an owner-only surface should take when it lands. Sibling docs: [`admin.md`](./admin.md), [`kitchen.md`](./kitchen.md), [`cleaning.md`](./cleaning.md), [`shopping.md`](./shopping.md), [`client.md`](./client.md).

---

## 1. Headline finding - owner is a fiction in the codebase today

The `user_role` Postgres enum and the TypeScript `UserRole` enum do **not** contain an `OWNER` member. Confirmed members of both: `super_admin`, `company_admin`, `region_admin`, `sales_admin`, `admin`, `kitchen_staff`, `shopping_staff`, `cleaning_staff`, `driver`, `client`, plus `outsource` (DB only).

But the codebase has roughly 66 literal-string checks against `"owner"` or `'owner'` across `src/services`, `src/components`, and 12 admin pages. Examples:

- `src/pages/admin/financial-dashboard.tsx:94` - `role === "owner" || role === "company_admin" || ...`
- `src/pages/admin/invoices.tsx:1145` - `allowedRoles = [..., "owner"]`
- `src/pages/admin/dashboard.tsx:112` - similar gate
- 63 more across components + services + RLS policy SQL (e.g. `quote_change_requests` policy from migration history)

**Every one of these branches is dead.** Because the role doesn't exist, no profile row ever has `role='owner'` or `active_role='owner'` (verified against the live database - the distinct `active_role` values in production are `shopping_staff, kitchen_staff, cleaning_staff, super_admin, admin, company_admin, client, driver` - no `owner`).

The canonical "business owner" persona today is `company_admin`. It is in `FULL_COMPANY_ACCESS_ROLES` and unlocks all the finance-gated views (financial dashboard, cashflow, payment gateways, subscription).

---

## 2. Decision - keep the dead branches, defer the real owner role

Three options were considered:

| Option | Pros | Cons |
|---|---|---|
| **A. Add `OWNER` to both enums, migrate existing company owners, activate the branches** | Real owner persona becomes possible; dead code becomes live | Migration risk; needs onboarding update + UI work; conflicts with Bobby's existing "defer owner-only dashboard" directive |
| **B. Strip every `"owner"` string** | Removes confusion for future readers | Touches 66+ files; diff churn; loses the prepared scaffolding for the future owner role |
| **C. Keep the dead branches, document the situation, treat owner as a synonym for company_admin** | Zero behaviour change; zero risk; scaffolding intact for the day OWNER lands | Future readers must still understand the situation |

**Decision: Option C.** Aligns with Bobby's documented intent (owner = admin same persona for now; owner-only dashboard deferred). Captured inline in `src/lib/authGuards.ts` above `FULL_COMPANY_ACCESS_ROLES` so the next person reading the role guards sees the explanation without having to dig.

---

## 3. When owner becomes a real role - the shape

If and when an owner-only surface ships, this is the persona it should serve.

### 3.1 Who owner is

The business owner. Often the founder of a single-location caterer; in multi-location tenants, the principal of the whole tenant (not a regional manager). Distinct from a hired manager who also has admin access because:

- Reads the books, not the operations. Wants P&L, cashflow, margin, not "who's clocked in".
- Compensates and disciplines staff. Sees full pay rates, full payslip ledger.
- Owns subscription + billing decisions for the tenant's CateringMS account.
- Sets policy (deposit %, cancellation tiers, BCEA overrides) and forgets it.

Visit cadence: **weekly to monthly**, not daily. The owner is the persona who logs in on Sunday evening to look at how the week went.

### 3.2 What the owner-only landing page should surface

Single dashboard tab. Five sections:

1. **Trailing 30-day P&L strip**: revenue, COGS, gross margin, net profit. Source: existing `cashflow-dashboard` + `financial-dashboard` queries.
2. **Forward 30-day cashflow**: confirmed orders + deposits expected + payables + fixed costs. Source: `payables` + `recurring-invoices` + the cashflow forecast already on `/admin/cashflow-dashboard`.
3. **People cost rollup**: total wages this period, by team (kitchen / drivers / cleaning / shopping). Source: settlement pages.
4. **Top 5 clients YTD**: by revenue, with last-event date. Source: existing client lookup.
5. **Policy quick-tweak strip**: deposit %, cancellation tiers, kitchen lead hours - three sliders the owner can twist without diving into `/admin/kitchen-settings` etc.

Read-only by design. Owners don't manage operations from the dashboard; they sense-check and tweak policy.

### 3.3 What the owner role unlocks beyond company_admin

Nothing data-wise - company_admin already sees everything. What changes:

- **Default landing page**: `/admin/owner` instead of `/admin/dashboard`.
- **Nav order**: MONEY section moves to top, OPERATIONS section collapses by default.
- **Headline branding**: "Owner view" badge so the operator doesn't get confused when an owner pairs over their shoulder.
- **No edit access by default** on operational settings (orders, dispatch). Pure read + acknowledge. Toggleable to "act as admin" via the existing active-role dropdown.

### 3.4 The migration

When OWNER lands:

1. Migration: `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'owner';`
2. TypeScript enum: add `OWNER = "owner"`.
3. Backfill: set `role='owner'` for every profile that's currently `company_admin` AND has `is_founding_user=true` or equivalent flag (need to design the marker).
4. Add `UserRole.OWNER` to `FULL_COMPANY_ACCESS_ROLES`.
5. Build `/admin/owner` page.
6. Activate the existing `"owner"` literal checks (which become live the moment the migration applies).

---

## 4. Phase 3f changes

### 4.1 Documented the owner-is-a-fiction situation

Inline comment block added above `FULL_COMPANY_ACCESS_ROLES` in `src/lib/authGuards.ts` explaining the 66 dead branches and why they stay.

### 4.2 No nav / page changes

There are no owner-only surfaces today, so there's nothing to clean up in nav. The existing dead branches are kept verbatim per Section 2.

---

## 5. Open follow-ups

- **Future phase**: build `/admin/owner` per Section 3.2, gated on `UserRole.OWNER` (which doesn't exist yet).
- **Future phase**: introduce `is_founding_user` (or similar) on `profiles` so the OWNER role can be backfilled at migration time.
- **Audit follow-up**: when the OWNER role lands, run a sweep over the 66 dead `"owner"` branches and confirm each one's gate is still correct semantically (they were written before the role list was rationalised, so some may have intended `company_admin` instead).
- **CI follow-up (low priority)**: an eslint rule that flags literal-string role checks (`role === "owner"`) and forces them through the `UserRole` enum. Would have caught this drift class earlier.

---

## 6. Phase 3 wrap-up

This was the sixth and final persona of the Phase 3 portal sweep. The six docs together (`admin`, `driver`, `kitchen`, `cleaning`, `shopping`, `client`, `owner`) are now the canonical reference for the product's user-facing surfaces. Each ends with an Open follow-ups section feeding the next round of focused PRs.

Driver was completed in PRs #199-205 (in-flight before the Phase 3 framing was named). The five new persona PRs in Phase 3 are: #208 (Admin), #209 (Kitchen), #210 (Cleaning), #211 (Shopping), #212 (Client), and this PR (Owner).

Phase 4 is the Notifications + comms backbone consolidation (see the running roadmap).
