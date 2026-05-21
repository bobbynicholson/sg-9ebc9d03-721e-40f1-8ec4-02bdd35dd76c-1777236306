# Client persona - UX decisions

**Audit date:** 2026-05-21
**Auditor:** Phase 3e client sweep (Wave 80)
**Scope:** Authenticated client portal (`src/pages/client-portal/**`) + token-gated post-acceptance surfaces (`src/pages/c/**`) + public pre-acceptance quote (`src/pages/q/[token].tsx`). Sibling docs: [`admin.md`](./admin.md), [`kitchen.md`](./kitchen.md), [`cleaning.md`](./cleaning.md), [`shopping.md`](./shopping.md).

Related prior audit: `docs/audits/client-dashboard-deep-audit-2026-05-19.md`.

---

## 1. Who client is

The catering customer. A bride, a corporate events manager, the parent organising a 100-person birthday. They land on the system from the **outside** - usually via an emailed quote link - and never see the operator-side surfaces. They are the highest-stakes persona because:

- Trust is fragile and there is no internal feedback loop to compensate for bad UX.
- Every surface is the catering company's brand to the client; CateringMS is invisible.
- Money decisions happen here (accept quote, pay deposit, pay balance) and they happen on a phone.
- A confusing cancellation flow becomes a refund dispute.

Three distinct visit modes:

1. **Pre-acceptance**: public quote at `/q/[token]`. No login, no account. Decides to accept, decline, or request changes.
2. **Post-acceptance, token-only**: magic link to `/c/order/[id]` or `/c/account`. No password. Sees event details, payment status, tracking, can amend / postpone / cancel.
3. **Authenticated**: `/client-portal/*`. Repeat customer with a full account.

---

## 2. Surface inventory

### 2.1 Public pre-acceptance (1 page)

| URL | Job-to-be-done | Status |
|---|---|---|
| `/q/[token]` | View quote, accept / decline / request changes, see deposit size on the accept CTA | Live (Phase 3e improved) |

### 2.2 Token-gated post-acceptance (2 pages)

| URL | Job-to-be-done | Status |
|---|---|---|
| `/c/account` | Magic-link account home, lists upcoming + past orders for the email | Live |
| `/c/order/[id]` | Per-order detail, payment status, amend / postpone / cancel, contact card | Live |

### 2.3 Authenticated client portal (7 pages)

| URL | Job-to-be-done | Status |
|---|---|---|
| `/client-portal/dashboard` | Headline picker (upcoming or last delivered), tiles, notifications | Live |
| `/client-portal/my-orders` | Filter tabs (All / Active / Completed), per-row timeline, amend/postpone/cancel/book-again | Live |
| `/client-portal/billing` | Invoice history, deposit + balance rows, pay buttons, PDF download | Live |
| `/client-portal/tracking` | Live order status, realtime timeline, ETA | Live |
| `/client-portal/quotes` | Quote history, link to accept or renegotiate | Live |
| `/client-portal/notifications` | Alert centre - payment due, delivery window, event reminders | Live |
| `/client-portal/profile` | Account settings - email, phone, delivery address, payment method | Live |

---

## 3. The client journey end-to-end

1. **Lead in**: client fills a form on the catering company's website (or admin creates a lead manually).
2. **Quote sent**: admin builds + sends a quote. Client receives email with `/q/[token]` link.
3. **Public view + accept**: client opens `/q/[token]`, reads menu/equipment/totals, taps Accept. Now sees the deposit amount on the button itself (Phase 3e fix).
4. **Accept records**: `/api/public/quotes/[token]/accept` -> `quote.status='accepted'`, fires `convert_quote_to_order` RPC. Order created in `confirmed` status. Quote-confirmation email goes out with the deposit invoice link.
5. **Deposit paid**: client clicks the deposit invoice's pay button -> gateway -> webhook -> `payments` row -> `setOrderPaymentStatus(order, 'partial' | 'paid')` (Phase 2 chokepoint).
6. **Per-order magic link**: admin emails the client a `/c/order/[id]?t=<token>` link. Cookie set; client lands on the order page.
7. **Tracking + amendments**: client watches the status timeline tick through preparing -> ready -> in_transit -> delivered. Can request guest-count amendments, postpone, or cancel via the wizard.
8. **Delivery + balance**: order hits `delivered`. Balance invoice fires. Client pays via the same gateway flow. `setOrderPaymentStatus(order, 'paid')` -> order eventually moves to `completed`.
9. **Repeat or rate**: authenticated clients return via `/client-portal/dashboard` for the next event.

---

## 4. Phase 3e changes

### 4.1 FIXED - deposit amount surfaced before accept

The single highest-trust improvement in this PR.

Before: the public quote at `/q/[token]` told the client "the catering company will send the deposit invoice" without saying how much. The client tapped Accept on a multi-thousand-rand commitment without knowing whether the deposit was 10% or 50%.

Changes:
- `PublicQuoteView` in `publicQuoteService.ts` now includes `deposit_percentage` (nullable - quotes without a configured deposit fall back to the original copy).
- `fetchByToken()` SELECT updated.
- `/q/[token]` derives `depositAmount = total_amount * (deposit_percentage / 100)` client-side.
- Three surfaces now show the deposit:
  - Pre-accept CTA copy: "Happy with the quote? Hit accept and `<company>` will send a `R5,000` deposit invoice (15% of `R33,333`)."
  - Confirm acceptance dialog body: same shape.
  - Post-accept success card step 2: "Deposit invoice - `R5,000` (15%) deposit. `<company>` will send the `R5,000` deposit invoice to lock in your event date."

Quotes with `deposit_percentage=0` or null get the original "deposit invoice will follow" copy unchanged.

---

## 5. Friction findings (follow-ups)

### 5.1 Magic link expired - dead-end error

`/c/order/[id].tsx` line 230-255 renders an error card when the cookie + token validation fails. Copy is "Ask the catering company to send you a fresh link." No CTA. Client is stranded.

The `/api/client-tokens/request` endpoint already exists (POST `{company_slug, email}` -> sends a fresh magic link). The fix is purely UI: form on the error card asking for email + company slug. Slug resolution from the URL path is non-trivial because `/c/order/[id]` doesn't carry the slug; the `[slug]/c/order/[id]` rewrite does. Needs the slug to be persisted somewhere recoverable - cookie, localStorage, or a new "find my order" endpoint that takes email-only.

Defer because the right path picks between "ask for email + slug" (simple, friction) and "find by email + order_id" (zero friction, new endpoint).

### 5.2 ~~Cancellation flow consequence copy is inconsistent~~ - Done

Resolved. The postpone panel on `/c/order/[id]` now renders a consequence-preview block matching the CancellationWizard's tone. Three bullets cover: deposit moves with you (no forfeit), team review + alternative suggestions, same-week postponements may incur committed-cost charges (shopping done, kitchen prep started). Client sees the rules before they commit.

### 5.3 ~~Delivered orders disappear from the dashboard headline~~ - already implemented

Resolved before this phase by `pickJustDeliveredEvent` in `dashboard.tsx`. When there's no upcoming/live headline AND there's a delivered (or completed) order within the last 7 days that hasn't been rated, a celebration banner renders in the headline slot ("How was it? Your {event} on {date} was delivered. Tap a star below to let {company} know how it went."). Brand-coloured border + primary CTA scrolling to the rating row. Matches the audit's intent; flagged as a no-op follow-up after re-verification.

### 5.4 ~~Client-id lookup duplicated across 3 portal pages~~ - hook exists, partial adoption

`src/hooks/useTenantClientIds.ts` is the canonical resolver, exposing both `clientIds` and an `applyTenantClientFilter(builder, email)` helper that composes the standard `client_id.in.(...) OR client_email.ilike <email>` union every portal page needs.

Adoption:
- `billing.tsx` already uses the hook (verified at line 68).
- `dashboard.tsx` keeps an inline clients query because it also needs `client_name` (for the greeting) and the canonical `tenantClientId` (for the inline rating widget) from the same row. The OR-clause pattern is documented inline so future drift is visible.
- `tracking.tsx` - similar pattern, defer migration until a touch-up on that page.

Marked partial - any new portal page should consume the hook from day one. Migrating dashboard / tracking is low-priority polish, not a correctness fix.

### 5.5 ~~No realtime listeners on payments / quotes for the client view~~ - Done

Resolved. `dashboard.tsx` was already subscribed to a per-tenant `client-orders-${user.id}-${tenantCompanyId}` channel listening to orders + invoices + quotes + payments (verified at lines 705-749). `billing.tsx` now subscribes to a per-tenant `client-billing-${user.id}-${tenantCompanyId}` channel listening to invoices + payments. Both follow the docs/perf-and-ops.md realtime pattern (per-tenant channel name + company_id filter).

`tracking.tsx` doesn't subscribe today because it's typically opened only during a live delivery; the existing 30-second polled refresh is sufficient for that window. Documented as accept-with-reason rather than a follow-up.

### 5.6 ~~Rating stars below 44px tap target on mobile~~ - already implemented

Resolved before this phase (CLI-H from the dashboard deep audit). Each interactive star button on past-event tiles has `min-w-11 min-h-11` (44px) tap zones with `w-6 h-6` star icons inside. Touch area scales correctly while the visual row stays compact. Verified at `client-portal/dashboard.tsx:1990-2014`.

### 5.7 ~~No contact fallback when phone is null~~ - Done (partial)

Resolved in post-audit follow-up. Re-verified: email + phone + website are all rendered conditionally - the page never showed phone-only. Three improvements landed in this PR:
- Empty-state fallback: when none of email/phone/website are set, render "No contact info on file. Reply to your booking-confirmation email if you need to reach the team."
- Mailto links now pre-fill the subject with the order number for context.
- All three contact rows bumped to `min-h-11` tap zones for mobile.

Inline "message the caterer" form deferred - the caterer's email link covers 95% of the case and an in-app messaging surface needs its own design call.

---

## 6. Open follow-ups summary

1. ~~"Request a new link" CTA on `/c/order/[id]` error card (5.1).~~ Done in post-audit PR #224.
2. Unify cancellation/postpone consequence copy (5.2).
3. ~~Dashboard headline includes delivered orders for 24h (5.3).~~ Already implemented via `pickJustDeliveredEvent`; verified.
4. `useTenantClientIds` shared hook to dedupe lookups (5.4).
5. Realtime listeners on payments + quotes for the client view (5.5).
6. Rating stars >= 44px tap target (5.6).
7. Contact card email fallback + message-the-caterer form (5.7).
8. Pull through the existing `docs/audits/client-dashboard-deep-audit-2026-05-19.md` items not yet addressed (CLI-* numbered backlog).
