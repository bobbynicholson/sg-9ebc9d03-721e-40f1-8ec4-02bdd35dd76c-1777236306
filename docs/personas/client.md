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

### 5.2 Cancellation flow consequence copy is inconsistent

`/c/order/[id]` postpone panel (~line 740) says "your deposit travels with you" but the cancellation wizard at line 819+ shows the full refund / forfeit consequence. Clients don't know cancellation rules until the wizard's final step. Postpone copy should mirror the wizard's consequence preview style.

### 5.3 Delivered orders disappear from the dashboard headline

`/client-portal/dashboard.tsx` headline picker skips orders with `status='delivered'`. Client who just had an event delivered yesterday sees a stale "upcoming" event or no event at all. Should keep delivered orders headlined for 24h with a "thanks for the booking" feel + a rating CTA.

(Already flagged in `docs/audits/client-dashboard-deep-audit-2026-05-19.md` as CLI-9.)

### 5.4 Client-id lookup duplicated across 3 portal pages

`dashboard.tsx`, `billing.tsx`, `tracking.tsx` each resolve the client_id list independently. Cleanup target: shared `useTenantClientIds()` hook.

(Already flagged as CLI-10 in the dashboard audit.)

### 5.5 No realtime listeners on payments / quotes for the client view

Client tracking + dashboard only re-fetch on mount. If a payment lands or a quote status changes while the client has the page open, the UI is stale. Realtime channel subscriptions would close the gap.

(Dashboard audit CLI-16, CLI-20.)

### 5.6 Rating stars below 44px tap target on mobile

Post-delivery rating component on the dashboard - tap targets too small.

(Dashboard audit CLI-43.)

### 5.7 No contact fallback when phone is null

`/c/order/[id]` contact card only shows phone. If the company hasn't set one, client has no way to reach the caterer from the system. Add email fallback (always present) and an inline message-the-caterer form.

---

## 6. Open follow-ups summary

1. "Request a new link" CTA on `/c/order/[id]` error card (5.1).
2. Unify cancellation/postpone consequence copy (5.2).
3. Dashboard headline includes delivered orders for 24h (5.3).
4. `useTenantClientIds` shared hook to dedupe lookups (5.4).
5. Realtime listeners on payments + quotes for the client view (5.5).
6. Rating stars >= 44px tap target (5.6).
7. Contact card email fallback + message-the-caterer form (5.7).
8. Pull through the existing `docs/audits/client-dashboard-deep-audit-2026-05-19.md` items not yet addressed (CLI-* numbered backlog).
