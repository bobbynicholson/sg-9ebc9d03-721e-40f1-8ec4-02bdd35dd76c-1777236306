# Subscription webhooks

**Status:** scaffold (env-driven no-op until configured)
**Code:** `src/pages/api/webhooks/subscriptions/{stripe,payfast}.ts`
**Schema:** migration `20260522080000_subscription_webhook_scaffold.sql`

---

## What this is

The SaaS-billing webhook leg of the platform. Tenants pay Skylight via Stripe (UK/US) or PayFast (SA) for using CateringMS; the providers POST event notifications to these endpoints, and we update `companies.subscription_status` + log `billing_history` + maintain a `subscriptions` row per tenant.

Separate from the per-tenant order webhooks (`/api/webhooks/stripe-confirmation`, `/api/webhooks/payment-confirmation`) which handle client-side payments for the tenant's own catering jobs. Different provider account, different signing secret, different event vocabulary.

---

## Endpoints

- `POST /api/webhooks/subscriptions/stripe`
- `POST /api/webhooks/subscriptions/payfast`

Both are env-driven no-ops: if the required env vars are missing, they return `{ ok: true, scaffold: true }` so the provider's retry queue doesn't pile up while we're not yet configured.

---

## Env vars

### Stripe

| Variable | Purpose |
|---|---|
| `STRIPE_PLATFORM_SECRET_KEY` | Platform `sk_live_...` for the Skylight Stripe account |
| `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` | `whsec_...` for this specific endpoint (Stripe dashboard -> Developers -> Webhooks) |

### PayFast

| Variable | Purpose |
|---|---|
| `PAYFAST_PLATFORM_MERCHANT_ID` | Platform merchant id |
| `PAYFAST_PLATFORM_MERCHANT_KEY` | Platform merchant key |
| `PAYFAST_PLATFORM_PASSPHRASE` | Optional passphrase used in signature verification. Must match the PayFast dashboard setting exactly (empty if unset there). |

All set per environment in Vercel.

---

## Tenant resolution

Provider events identify the customer via:

- Stripe: `data.object.customer` (a `cus_...` id) → resolve via `companies.stripe_customer_id`
- PayFast: `token` (billing token) or `custom_str1` (we set this to the company id when initiating the subscription) → resolve via `companies.payfast_subscription_token`

When no company matches, the event is logged with `rejection_reason='no_company_for_customer'` (or `no_company_for_token`) and acknowledged with `200 OK`. Provider sees success; ops can grep the table to see orphaned events.

---

## Idempotency

`subscription_webhook_events` has `UNIQUE (provider, event_id)`. Every event is logged on arrival; the unique constraint catches re-deliveries and we return `{ ok: true, duplicate: true }` without re-running side effects.

---

## Events handled

### Stripe

| Event | Effect |
|---|---|
| `customer.subscription.created` | Upsert `subscriptions` row; set `companies.subscription_status` from `sub.status` |
| `customer.subscription.updated` | Same as created (UPSERT) |
| `customer.subscription.deleted` | Mark `companies.subscription_status='cancelled'`, stamp `subscriptions.cancelled_at` |
| `invoice.payment_succeeded` | Insert `billing_history` row with `status='completed'` |
| `invoice.payment_failed` | Insert `billing_history` row with `status='failed'`, flip `companies.subscription_status='past_due'` |
| anything else | Log + `rejection_reason='unhandled_event:<type>'`, acknowledge |

### PayFast

| Field combination | Effect |
|---|---|
| `payment_status=COMPLETE`, `subscription_type=1` | First payment of a new subscription. Set `subscription_status='active'`, persist `payfast_subscription_token`, log `billing_history` |
| `payment_status=COMPLETE` on later runs | Renewal. Refresh status to `active`, log `billing_history` |
| `payment_status=CANCELLED` | Set `subscription_status='cancelled'` |
| `payment_status=FAILED` | Set `subscription_status='past_due'`, log `billing_history` with `status='failed'` |
| `payment_status=PENDING` | Set `subscription_status='trial'` (pre-completion) |

---

## Status mapping

Stripe has more subscription states than we track. We collapse:

- Stripe `active` → our `active`
- Stripe `trialing` → our `trial`
- Stripe `past_due` / `unpaid` → our `past_due`
- Stripe `canceled` → our `cancelled`
- Stripe `incomplete` / `incomplete_expired` / `paused` → our `suspended`

---

## Manual testing

### Stripe

1. Install Stripe CLI: `stripe login`.
2. Forward to local dev: `stripe listen --forward-to localhost:3000/api/webhooks/subscriptions/stripe`. Copy the `whsec_...` it prints into `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET`.
3. Trigger an event: `stripe trigger customer.subscription.created`.
4. Verify a row landed in `subscription_webhook_events`, `subscriptions`, and `companies.subscription_status` updated.

### PayFast

PayFast doesn't ship a CLI tunnel. Use the sandbox dashboard:

1. Configure the sandbox merchant ID + key + passphrase in env.
2. Use `https://<your-ngrok-url>/api/webhooks/subscriptions/payfast` as the notify URL on a sandbox subscription create.
3. PayFast posts a real ITN once the buyer completes the test transaction.

---

## What this does NOT do

Listed so we don't pretend the scaffold is complete:

- No Stripe Checkout / PayFast subscription-create flow. Pure receiver - the create side (sending the buyer to a hosted page) is a separate PR keyed to `/admin/subscription/upgrade` once Bobby approves the pricing tiers.
- No customer-facing portal (Stripe Customer Portal, PayFast subscription cancel flow). Operators have to handle cancellations manually via the provider dashboards for now.
- No plan-change handling (upgrade from Starter to Growth). When that flow ships, it'll fire `customer.subscription.updated` which IS handled; we'll just need to map `sub.items.data[0].price.id` to an internal plan slug on the tenant.
- No proration / invoice preview. The webhook trusts Stripe / PayFast's amounts.
- No grace-period logic. A `past_due` tenant immediately loses subscription-gated features unless the gating code explicitly tolerates it.

---

## Open follow-ups before charging real money

1. Wire `/admin/subscription/upgrade` to create a Stripe Checkout session / PayFast subscription URL, including `metadata.companyId` (Stripe) / `custom_str1=companyId` (PayFast) so the webhook can resolve the tenant.
2. Add an `/admin/billing` page that reads `billing_history` + `subscriptions` and renders the timeline + Manage Subscription button.
3. Decide grace-period behaviour for `past_due` (3 days? 7 days?) before feature gates harden.
4. Audit RLS on `subscriptions` + `billing_history` - operators in the same tenant should see their own; right now I only added the super_admin policy on `subscription_webhook_events`.
5. Backfill `stripe_customer_id` for any test tenants already created in the platform Stripe account.
