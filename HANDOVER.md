# CateringMS — Developer Handover Brief

> **For:** Raj (new dev)
> **From:** Bobby (engineering lead / owner)
> **Last updated:** 2026-06-03

A multi-tenant SaaS for catering companies. Each tenant gets a white-labelled portal (admin / team / client / public) under their own slug at `cateringms.com/{slug}/...`. Production is live on Vercel + Supabase. This doc gets you productive in your first week.

**Read in this order:**

- §1 — what catering actually is (skip if you've worked in food service)
- §2 — the stack at a glance
- §3-7 — infrastructure (hosting, DB, email, payments, accounting, observability, env vars, access)
- §8 — first-hour orientation
- §9-11 — multi-tenant, auth, the eight personas
- §12-18 — **the deep persona maps** (the meat — owner, sales, kitchen, shopping, driver, cleaning, client, super-admin)
- §19-25 — cross-cutting flows (lifecycle, money, communication, realtime, audit, cron)
- §26-28 — TIGHTEN tags, CI guardrails, critical-path files
- §29 — glossary
- §30 — known sharp edges + open work
- §31 — per-persona "top 10s" consolidated

---

## 1. Catering industry 101

If you've never worked in catering, this section is non-negotiable. You will get the code wrong without it.

**What a catering company does.** Sells food + service + equipment for an event (wedding, corporate lunch, funeral, conference). The client (the *end customer*) tells them: "we have 80 guests on 15 July at this venue, we want lamb spit, salads, cutlery for 80, drivers to deliver and set up". The caterer prices it, sends a quote, gets a deposit, prepares the food, hires equipment they don't own, drives it to the venue, sets it up, serves (sometimes), collects the equipment, washes it, returns it to stock.

**Why the workflow is brutal.** Every event is bespoke. Guest count moves daily. Menus change. Venues are different. Drivers go to different addresses. Equipment is split between owned (washed in-house) and hired (returned to a third-party hire company). Refunds depend on how close to the event the client cancelled. Margins are thin. One missed prep deadline = bad reviews = dead business.

**Lifecycle in one sentence.**
```
Lead → Quote → (client accepts) → Order → Production → Delivery → Closure
        │                            │                              │
   pre-sale                     post-sale                       wrap-up
```

**Key catering terms you'll see in the code:**

- **Quote** — the proposal sent to the client. Has menu lines, equipment lines, totals, valid-until date.
- **Order** — what a quote becomes once accepted. Has a status, deposit-paid timestamp, prep tasks, equipment bookings, driver assignments.
- **Deposit** — usually 30-50% of total, paid upfront to confirm the booking. Until it lands, the event is not "real".
- **Balance** — the remainder, paid either before or on event day.
- **Per-guest pricing** — menu lines that scale 1:1 with guest count (lamb spit per person × 80 guests). Most lines are per-guest. Equipment too (plates, forks, glasses).
- **Equipment from stock vs hire-in** — every booking splits across the tenant's own inventory and what they have to hire from a third party. The split is computed at booking time.
- **Prep task** — a kitchen task derived from menu lines (e.g., "marinate lamb 24h before service").
- **Setup time** — when the driver arrives at the venue to lay out food before guests arrive (typically 1-2h before event start).
- **Cleaning handover** — once equipment comes back from an event, cleaning staff log what was returned, what was missing, what was damaged, and put it back into stock.
- **Cancellation tiers** — refund schedule based on days-to-event. Typical: full refund if >30 days, 50% if 7-30, nothing inside 7. Configured per-tenant in `companies.cancellation_policy`.
- **Magic link** — a tokenised URL the client clicks from an email to access their quote / order / invoice without logging in. No password. Token is the auth.
- **TIGHTEN tag** — the audit-tracking convention in this repo. Every notable behaviour change in the recent waves carries a `TIGHTEN I.NNN (date)` comment plus a matching PR title. Grep by tag for rationale.

**The eight personas.** Catering ops require multiple specialisations. CateringMS gives each their own portal:

| Persona | Real-world role | Portal entry point |
| --- | --- | --- |
| **Owner / Company Admin** | Runs the business. Sees everything. | `/admin/dashboard` |
| **Sales Admin** | Builds quotes, chases leads, follows up. | `/admin/quotes`, `/admin/leads` |
| **Kitchen Staff** | Preps food, marks tasks done, allergens. | `/team-portal/kitchen` |
| **Shopper** | Procures ingredients, captures receipts. | `/team-portal/shopping` |
| **Driver** | Picks up, delivers, returns equipment. | `/team-portal/driver` |
| **Cleaner** | Washes returned equipment, logs damage. | `/team-portal/cleaning` |
| **Client (end customer)** | Books the event, pays, tracks. | `/c/order/{id}` via magic link, `/client-portal/*` for repeat customers |
| **Super Admin (platform)** | Platform operator. Cross-tenant. Trial / billing. | `/admin/platform/*` |

All eight are mapped in detail in §13-20.

---

## 2. Codebase at a glance

| Item | Value |
| --- | --- |
| Language | TypeScript (strict off, null-checks off — pragmatic) |
| Framework | **Next.js 15.2.8** — Pages Router (NOT App Router), Turbopack dev |
| React | 18.3.1 |
| Node | 22 LTS (Vercel default) |
| Repo | https://github.com/bobbynicholson/sg-9ebc9d03-721e-40f1-8ec4-02bdd35dd76c-1777236306 |
| Branch | `main` (PRs squash-merge, branch protection on, CI must pass) |
| UI | Tailwind 3.4 + tailwindcss-animate, shadcn/ui (Radix), lucide-react |
| Forms | react-hook-form + zod |
| Charts | recharts |
| PDFs | @react-pdf/renderer (server-side), jspdf fallback |
| Maps | react-leaflet + Leaflet (no Google Maps inside the app shell; Google Maps API only for venue autocomplete) |
| Animations | framer-motion |
| Tests | Jest + RTL (`npm test` watch, `npm run test:ci`) |
| Typecheck | `npx tsc --noEmit` runs in GitHub Actions on every PR |

### Repo conventions

- `/src/pages/api/**` — Next API routes
- `/src/pages/{admin,team-portal,client-portal,c,q,pay}/**` — page surfaces
- `/src/services/**` — domain logic (orderWorkflow, emailService, refundService, propagateQuoteEdit, etc.)
- `/src/lib/**` — pure helpers + integrations
- `/src/components/**` — shadcn under `/ui`, domain under `/admin`, `/billing`, etc.
- `/supabase/migrations/**` — every DB change. Timestamped filename. Applied to live DB via Supabase MCP.
- `/scripts/**` — CI guardrails (`check:status-filters`, `check:migration-rls`, `check:realtime-channels`)
- House style: **no em dashes, no `--` double-hyphens in comments, SA English** (colour, organise, fulfil). See `CLAUDE.md` in the repo root for the full rules — they're enforced by code review.

---

## 3. Hosting + Deploys

| Item | Value |
| --- | --- |
| Hosting | **Vercel** |
| Vercel team | `team_uXUuF5exdXVD2qQvpH3gBm3b` |
| Vercel project | `prj_SmtixfxdYs5ARJdMBt5gFiKcdZNK` |
| Production domain | `cateringms.com` (apex) |
| Deploy on | push to `main` (auto) + every PR gets a preview deploy |
| Edge config | `next.config.mjs` rewrites `/{slug}/admin/*`, `/{slug}/q/*`, `/{slug}/c/order/*`, `/{slug}/pay/i/*` to the bare paths with `?company_slug=` |
| Cache headers | `Cache-Control: no-store` on every HTML / JSON response, immutable cache on `/_next/static/*`. See `next.config.mjs > headers()`. |
| CI checks | `typecheck` + Vercel preview + Vercel preview comments. All required to merge. |

---

## 4. Database + Auth

| Item | Value |
| --- | --- |
| DB / Auth | **Supabase** (managed Postgres + GoTrue auth) |
| Project ref | `vsuyzovzqtrngorpqnhy` (region `eu-north-1`) |
| Project name | `cateringms2` |
| Postgres | 17.6 |
| Realtime | enabled on `quotes`, `orders`, plus other tenant tables that subscribe (publication: `supabase_realtime`) |
| RLS | enabled on every public table. Helpers: `get_user_company_id(uid)`, `user_can_access_region(region_id)`, plus `tenant_isolation_*` policies on each table |
| Auth flows | Supabase email/password for staff; **magic-link tokens** for clients (custom — see `client_access_tokens` table + `mint_client_*_token` RPCs) |
| Migrations | SQL files in `/supabase/migrations/`. Applied to prod via Supabase MCP. The file is the spec, prod is the source of truth. Every migration carries its TIGHTEN tag + rationale comment. |

### Tables you'll touch every day

- `companies` — one row per tenant. `slug`, `primary_color`, `accent_color`, `cancellation_policy` (jsonb), `email_settings`, `pricing_includes_vat`, etc.
- `quotes` ↔ `orders` (1:1 via `orders.quote_id` + `quotes.converted_to_order_id`).
- `quotes.menu_items` + `quotes.equipment_items` are JSONB arrays (the snapshot the client accepted).
- `orders` has separate `order_items` and `equipment_bookings` tables (the live truth that kitchen / driver / cleaning work against).
- `payments`, `invoices`, `cancellation_requests` — money trail.
- `client_access_tokens` — magic-link tokens. 24h TTL for bridge tokens, 60d for emailed status-update links.
- `audit_logs` — generic forensics row.
- `email_provider_settings` + `email_templates` — per-tenant Resend / SMTP / template overrides.

The full data model is mapped in §22 (the money pipeline) and §25 (audit trail).

---

## 5. Email

| Item | Value |
| --- | --- |
| Primary provider | **Resend** (org-level account). Tenants can override with their own Resend domain via `email_provider_settings`. |
| SMTP fallback | nodemailer (any tenant can paste in host / user / pass) |
| Templating | tenant override → global default → hardcoded fallback ladder via `resolveEmailTemplate` in `src/services/email/templateResolver.ts` |
| Branded shell | `src/services/email/brandedEmailShell.ts` wraps every send in a tenant-branded HTML email (colour, name, contact footer). Auto-fires from `emailService.sendEmailDetailed`. |
| Compliance | List-Unsubscribe header + one-click unsubscribe `/u/[token]` (HMAC-signed via `EMAIL_UNSUBSCRIBE_SECRET`) |
| Critical paths | `/api/send-email` (generic), `quoteService._fireQuoteSentEmail`, `cancellationEmails.ts`, `orderWorkflow.ts > sendStatusNotifications` |

The full communication pipeline is in §23.

---

## 6. Payments

| Item | Value |
| --- | --- |
| Client deposit / balance | **PayFast** (SA gateway). Live + sandbox toggled by `NEXT_PUBLIC_PAYFAST_TEST_MODE`. |
| Subscription billing (platform) | **Stripe** + PayFast (the subscription tier — tenants pay CateringMS) |
| Refund path | `src/services/refundService.ts > processRefund()` — auto-fires for PayFast, manual EFT otherwise. State in `payments.payment_status`. |
| Refund computation | `get_refund_for_order` RPC reads `companies.cancellation_policy.deposit_refund_tiers` + days-to-event |
| Webhooks | `/api/webhooks/payment-confirmation` (PayFast ITN), `/api/webhooks/subscriptions/stripe`, `/api/webhooks/subscriptions/payfast`, `/api/webhooks/yoco-confirmation` |

The full money pipeline is in §22.

---

## 7. Accounting + Observability + Third-party APIs

| Service | Purpose | Env var(s) |
| --- | --- | --- |
| Xero | OAuth + invoice / credit-note sync / void | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI` |
| QuickBooks | OAuth + invoice sync | `QUICKBOOKS_CLIENT_ID/SECRET/REDIRECT_URI/ENVIRONMENT/DEFAULT_ITEM_ID` |
| Sage | OAuth + invoice / payment sync | `SAGE_CLIENT_ID`, `SAGE_CLIENT_SECRET` |
| Sentry | Server + client error reporting | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` |
| Google Maps | Venue address autocomplete only | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` |
| Cloudflare Turnstile | Public form CAPTCHA | `TURNSTILE_SECRET_KEY` |
| WhatsApp Cloud API | Optional per-tenant quote send | `NEXT_PUBLIC_APP_ORIGIN` |
| PayFast (SA gateway) | Client deposits + tenant subscriptions | `NEXT_PUBLIC_PAYFAST_*` + server-side `PAYFAST_*` |
| Stripe | Tenant subscription billing | `STRIPE_PLATFORM_SECRET_KEY`, `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` |
| Resend | Email sender | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` |

OAuth tokens for accounting providers live in `accounting_integrations` table, encrypted with `ENCRYPTION_KEY` (AES-256-GCM).

The integrations layer is mapped in detail in §20.

---

## 8. Environment variables

Full list lives in Vercel project settings → Environment Variables. Pull locally with `vercel env pull .env.local` once you're invited.

### Core (REQUIRED in every env)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY     # also accepted as SUPABASE_SERVICE_KEY / SUPABASE_SECRET_KEY
NEXT_PUBLIC_APP_URL           # canonical https://cateringms.com
NEXT_PUBLIC_SITE_URL          # legacy alias, same value
CRON_SECRET                   # shared bearer for /api/cron/* and internal fire-and-forget posts
ENCRYPTION_KEY                # 32-byte hex, AES-256-GCM for accounting tokens
EMAIL_UNSUBSCRIBE_SECRET      # HMAC secret for /u/[token]
EMBED_IP_HASH_SALT            # rate-limit hashing for public embed routes
MIDDLEWARE_PROFILE_SECRET     # HMAC for the middleware profile cache
```

### Email (REQUIRED)

```
RESEND_API_KEY
RESEND_WEBHOOK_SECRET
PLATFORM_BRAND_NAME           # "CateringMS"
PLATFORM_FROM_EMAIL           # noreply@send.cateringms.com (shared sender)
PLATFORM_SUPPORT_EMAIL
PLATFORM_SUPPORT_INBOX        # contact-form recipient
```

### Payments (REQUIRED for production billing)

```
# Tenant client-pay flow (PayFast - SA)
NEXT_PUBLIC_PAYFAST_MERCHANT_ID
NEXT_PUBLIC_PAYFAST_MERCHANT_KEY
NEXT_PUBLIC_PAYFAST_PASSPHRASE
NEXT_PUBLIC_PAYFAST_TEST_MODE        # "true" in preview
PAYFAST_PASSPHRASE                   # server-side ITN verify
PAYFAST_ALLOWED_IPS                  # ITN source allowlist

# Subscription billing (CateringMS charges tenants)
STRIPE_PLATFORM_SECRET_KEY
STRIPE_SUBSCRIPTION_WEBHOOK_SECRET
PAYFAST_PLATFORM_MERCHANT_ID
PAYFAST_PLATFORM_MERCHANT_KEY
PAYFAST_PLATFORM_PASSPHRASE
```

### Accounting (OPTIONAL — per-tenant opt-in)

```
NEXT_PUBLIC_XERO_CLIENT_ID
XERO_CLIENT_ID
XERO_CLIENT_SECRET
XERO_REDIRECT_URI

NEXT_PUBLIC_QUICKBOOKS_CLIENT_ID
QUICKBOOKS_CLIENT_ID
QUICKBOOKS_CLIENT_SECRET
QUICKBOOKS_REDIRECT_URI
QUICKBOOKS_ENVIRONMENT               # "sandbox" or "production"
QUICKBOOKS_DEFAULT_ITEM_ID

NEXT_PUBLIC_SAGE_CLIENT_ID
SAGE_CLIENT_SECRET
```

### Observability + dev (OPTIONAL)

```
SENTRY_DSN
NEXT_PUBLIC_SENTRY_DSN
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
TURNSTILE_SECRET_KEY                # Cloudflare Turnstile - public form CAPTCHA
NEXT_PUBLIC_DEV_MODE                # only set in local dev
NEXT_PUBLIC_DEV_USER_PASSWORD       # only set in local dev
NEXT_PUBLIC_BYPASS_HANDOVER_GATE    # debug toggle, leave off in prod
DEV_RETURN_MAGIC_LINK               # only set in local dev for magic-link testing
```

---

## 9. Access checklist for Raj

Tier 1 unlocks day-1 productivity. Tier 2-4 unlock as Raj specialises.

### Tier 1 — code + deploys

- [ ] **GitHub** — invite to repo `bobbynicholson/sg-9ebc9d03-721e-40f1-8ec4-02bdd35dd76c-1777236306` (Admin or Write)
- [ ] **Vercel** — invite to team `team_uXUuF5exdXVD2qQvpH3gBm3b`, project `sg-ebc6a518...` (Developer)
- [ ] **Supabase** — invite to project `cateringms2` (`vsuyzovzqtrngorpqnhy`) as Developer
- [ ] **Local env** — once invited to Vercel, `vercel env pull .env.local`

### Tier 2 — money + comms

- [ ] **Resend** — invite to org account (domain status + delivery logs)
- [ ] **PayFast merchant** — read-only first, full once he's reviewed the webhook flow
- [ ] **Stripe** — read-only on the platform Stripe account
- [ ] **Xero / QuickBooks / Sage** dev dashboards — only when touching accounting code

### Tier 3 — supporting

- [ ] **Sentry** — invite to the project
- [ ] **Cloudflare** account (or whichever DNS host) — DNS for `cateringms.com`
- [ ] **Google Cloud** — Maps API key console
- [ ] **WhatsApp Business** — only if extending WhatsApp quote-send

### Tier 4 — admin access inside the app

- [ ] Create a `super_admin` user for Raj at `/admin/users` (or insert into `profiles` with `role='super_admin'`) so he can see every tenant from the app side.

---

## 10. First-hour orientation

```bash
git clone https://github.com/bobbynicholson/sg-9ebc9d03-721e-40f1-8ec4-02bdd35dd76c-1777236306.git
cd sg-9ebc9d03-721e-40f1-8ec4-02bdd35dd76c-1777236306
npm install
vercel link                  # pick the existing project
vercel env pull .env.local
npm run dev                  # http://localhost:3000
```

**Then read these files in order:**

1. `CLAUDE.md` — house rules (no em dashes, SA English, etc.)
2. `next.config.mjs` — tenant rewrites + redirect map
3. `src/middleware.ts` — auth gating + tenant slug enforcement
4. `src/services/emailService.ts` — central send pipeline
5. `src/services/order/orderWorkflow.ts` + `releaseResources.ts` — order lifecycle + cancellation cascade
6. `src/services/quote/propagateQuoteEdit.ts` + `src/pages/api/quotes/[id]/resync-order.ts` — quote → order mirror
7. Newest 10 migrations in `supabase/migrations/` — the most recent state

The latest TIGHTEN tag is **I.128**. Grep `TIGHTEN I.` to see the audit-tracking convention in action.

---

## 11. Multi-tenant architecture

**One row, one tenant.** Every customer (catering company) is a row in `companies`:

```
id                       UUID PK
slug                     TEXT UNIQUE          e.g. "spit-braai-delivery"
company_name             TEXT
primary_color            TEXT (#hex)
accent_color             TEXT (#hex)
secondary_color          TEXT (#hex)
logo_url                 TEXT
currency                 TEXT (ISO 4217)      e.g. "ZAR"
vat_registered           BOOLEAN
vat_number               TEXT
vat_rate                 NUMERIC              e.g. 15
pricing_includes_vat     BOOLEAN              CRITICAL — see below
cancellation_policy      JSONB                tiered refund schedule
email_settings           JSONB
timezone                 TEXT (IANA)
peak_season_start_month  INT                  for cashflow dashboard banners
peak_season_end_month    INT
amendment_cutoff_days    INT
```

**Tenant rewrites.** `next.config.mjs` rewrites slug-prefixed URLs to bare paths:

```
/spit-braai-delivery/admin/dashboard  →  /admin/dashboard?company_slug=spit-braai-delivery
/spit-braai-delivery/q/{token}        →  /q/{token}?company_slug=spit-braai-delivery
/spit-braai-delivery/c/order/{id}     →  /c/order/{id}?company_slug=spit-braai-delivery
/spit-braai-delivery/pay/i/{token}    →  /pay/i/{token}?company_slug=spit-braai-delivery
```

So the page files live at the bare paths and read `router.query.company_slug` for tenant context. White-label without code duplication. Reserved slugs (never allocated): `admin, api, auth, blog, c, contact, demo, features, pay, page, pricing, privacy, security, super-admin, support, team-portal, terms, uk, us, account, subscription, company-signup`.

**RLS scope.** Every table has a `company_id` column + an RLS policy:

```sql
CREATE POLICY tenant_isolation_select_orders ON orders FOR SELECT
USING (company_id = get_user_company_id(auth.uid()));
```

`get_user_company_id(uid)` resolves the user's company. Super admins return NULL → no RLS (cross-tenant visibility).

**Regions — sub-tenancy within a company.** Larger caterers have multiple kitchens / depots in different cities. Each is a `regions` row. `profiles.region_id` + `company_id` defines what a user sees. `user_can_access_region(user_id, region_id)` RPC gates region-scoped reads.

**Service-role bypass.** Cron jobs, public webhooks, public magic-link endpoints all run with the service-role token (no RLS). They MUST explicitly filter by `company_id` and verify the caller is legitimate (cron secret, signature, token match).

---

## 12. Auth + roles

| Layer | Stack |
| --- | --- |
| Identity | Supabase `auth.users` |
| App profile | `public.profiles` (1:1 with auth.users) |
| Role flags | `profiles.role` + `profiles.active_role` (impersonation override) |
| Role values | `super_admin`, `company_admin`, `owner`, `admin`, `sales_admin`, `region_admin`, `kitchen_staff`, `driver`, `cleaner`, `shopper`, `client`, `waiter` |
| Client auth | **Magic-link tokens** in `client_access_tokens`. 24h TTL for bridge tokens, 60d for emailed status links. No passwords. |
| Middleware | `src/middleware.ts` — gates auth + enforces that the user owns the tenant slug they're hitting. Super-admin bypass. |
| Public unauth endpoints | `/q/{token}`, `/c/order/{id}?t={token}`, `/pay/i/{token}`, `/api/public/*` — token IS the auth |

**Role → portal mapping:**

```
super_admin   → /admin/platform/*
company_admin → /admin/* (everything)
owner         → /admin/* (synonym of company_admin in current code)
sales_admin   → /admin/quotes, /admin/leads, /admin/clients
region_admin  → /admin/* scoped to a region
admin         → /admin/* (slightly reduced)
kitchen_staff → /team-portal/kitchen
driver        → /team-portal/driver
cleaner       → /team-portal/cleaning
shopper       → /team-portal/shopping
waiter        → /team-portal/general
client        → /client-portal/*  (magic link or signed in)
```

Use `<ProtectedRoute allowedRoles={[UserRole.COMPANY_ADMIN, UserRole.SALES_ADMIN]}>` around every page. The middleware enforces the slug; the route guard enforces the role.

---

# THE EIGHT PERSONA MAPS

This is the meat of the document. Each persona's section follows the same shape: real-world intent, where in the app, what they fill in, what the system does, what they see, who downstream is impacted, gotchas, top 10s. Read the persona that matches what you're touching that day.

---

## 13. Owner / Company Admin

**Mental model:** "I run a catering company. I need to see every quote, every order, every payment, every staff cost, every payable in one place. I want to know whether I'm cash-positive next week and which clients owe me money."

### 13.1 Company setup (one-off, day 1 of tenant onboarding)

**File:** `src/pages/admin/company-profile.tsx`

Inputs: business + legal name, brand colours (primary / accent / secondary), kitchen address (lat/lng for delivery fee distance), VAT status + rate, bank details (shown to client on invoice), timezone (IANA), currency (ISO 4217), peak season window, document numbering prefixes (`INV-`, `QUO-`, `ORD-`), Google Places ID for review-email deeplinks, **pricing convention** (`pricing_includes_vat` flag — whether quote/invoice prices are gross or net).

Hidden cost: timezone is critical. Wrong timezone → reports show events on wrong calendar days. `pricing_includes_vat` is even worse — flip it after creating quotes and old quotes break (the line totals were computed under the old convention).

### 13.2 Catalog (menu, equipment, suppliers)

- `/admin/menu` — menu items: name, category, allergens, dietary tags, pricing mode (per_person / per_portion / flat), unit price, cost (for margin)
- `/admin/equipment` — owned equipment: name, category, total quantity, hire-in cost-per-unit (when stock runs out)
- `/admin/inventory` — ingredient costs for COGS
- `/admin/suppliers` — supplier master list

Menu items snapshot at quote time (prices + allergens captured into `quote.menu_items` jsonb). Changing the master menu later does NOT retroactively change past quotes.

### 13.3 Quote lifecycle

`draft → sent → viewed → accepted → converted (order created)` plus `rejected` and `expired`.

- `/admin/quotes/new` — the rich builder (1000+ lines). Auto-saves every 1.5s. Sticky running-total panel. Per-line pricing mode + discount. Quote-level surge / discount / flat-discount. `valid_until` default = today + 30d. Send button flips `status='sent'` and queues the client email through the branded shell.
- `/admin/quotes/{id}` — inline editor. Read-only after acceptance unless the operator routes through "Revise & resend" which sends them to `/admin/quotes/new?fromQuoteId=...`.
- `/admin/quotes` — list view with quote-intelligence chips (Action needed / Sent / Won + booked / Lost) and follow-up nudges.

**Public token in URL.** Every quote has a `public_token` (UUID). The client gets `cateringms.com/{slug}/q/{token}` in their email. That's the magic link.

**Conversion.** When the client accepts (or the operator marks accepted), `convert_quote_to_order` RPC fires:
- creates an `orders` row
- snapshots line items into `order_items` table
- snapshots equipment into `equipment_bookings`
- generates the deposit invoice
- links `quotes.converted_to_order_id = orders.id`

After this, the quote is the **source of truth**. Editing the quote (via `/admin/quotes/new?fromQuoteId=`) propagates the change to the order via `propagateQuoteEditToOrder` (browser) + `/api/quotes/{id}/resync-order` (server-side defensive belt-and-braces, TIGHTEN I.127).

### 13.4 Order lifecycle

`pending → confirmed → preparing → ready → in_transit → delivered → completed` plus `cancelled`. Canonical state machine: `ALLOWED_ORDER_TRANSITIONS` in `src/services/order/orderWorkflow.ts`.

**Confirmation trigger.** `orders.deposit_paid_at IS NOT NULL` — NOT `status='confirmed'`. This is critical. Search for `deposit_paid_at` and understand it before touching order code.

**Post-confirmation lock.** Menu items, guest count, event date are locked at the DB level once confirmed. Operator edits route through `propagateQuoteEditToOrder` which respects post-dispatch refusal (if order is `in_transit / delivered / completed / cancelled`, propagation is refused and an `order_amendment_requests` row is opened for dispatch review).

**Cascade on `updateOrderStatus`** (lines 87+ of `orderWorkflow.ts`):
1. Kitchen prep re-plan (if event_date / setup_time / guest_count moved)
2. Equipment booking re-window (if event_date moved)
3. Driver assignment re-stamp (collection driver notified)
4. Email queue restamps (pre-event reminders, balance-due, thank-you)
5. `order_status_history` + `audit_logs`
6. Status email to client (via `sendStatusNotifications`)
7. Inventory deduction (on `confirmed`)
8. Auto-invoice (on `confirmed`)

### 13.5 Money

- `/admin/financial-dashboard` — cashflow projection, P&L, margin
- `/admin/cashflow-dashboard` — 30/90-day forecasts
- `/admin/invoices` — issued, sent, paid, overdue
- `/admin/recurring-invoices` — standing orders
- `/admin/refunds` — refund ledger
- `/admin/driver-settlement` — driver pay reconciliation
- `/admin/payables` — supplier payments
- `/admin/tax-purchases` — VAT-recoverable purchases
- `/admin/wages` — payroll calculation

**Invoice generation.** Auto-fires on order confirmation. Two tranches: deposit (typically 30-50% of total, due before event) + balance (typically due before event or on completion).

**Refund engine.** `get_refund_for_order` RPC reads `companies.cancellation_policy.deposit_refund_tiers` and computes refund based on days-to-event. Tiers are a jsonb array; first matching tier wins. Fallback: `companies.cancellation_fee_percent`.

**Refund vs credit.** Operator (or client) can choose. Credit is +bonus % (default 10pp) — they get more value if they take it as future credit instead of cash back. Credit lives in `client_credits` with 1-year TTL.

### 13.6 People + Payroll

- `/admin/staff` (or `/admin/kitchen-staff`) — staff roster
- `/admin/kitchen-duty-tracking` — kitchen prep assignments
- `/admin/staff-hours` — clock-in/out
- `/admin/driver-schedule` + `/admin/driver-settlement` — drivers
- `/admin/wages` — payroll

Hourly rate per staff + BCEA (SA labour law) overtime after 45h/week + 1.5x on Sundays / public holidays. `kitchenPayService` + `driverPayService` compute gross.

### 13.7 Integrations + Compliance

- `/admin/integrations` — Zapier webhooks (in/out), API keys, accounting OAuth
- `/admin/payment-gateways` — PayFast / Stripe config
- `/admin/email-settings` — SMTP / Resend
- `/admin/email-templates` — lifecycle email editor (tenant override of global default)
- `/admin/messaging-templates` — WhatsApp + email patterns
- `/admin/notifications` — in-app notification log
- `/admin/audit-logs` — forensics
- `/admin/public-holidays` — premium-pay calendar
- `/admin/regions` — multi-kitchen setup
- `/admin/subscription` — tenant's own billing on CateringMS

### 13.8 Owner gotchas

1. **`deposit_paid_at IS NOT NULL` is the canonical confirmation trigger.** Not `status='confirmed'`.
2. **`pricing_includes_vat` must be consistent across the entire tenant.** Flipping it later breaks old quote totals. No safe migration path.
3. **Quotes are immutable after acceptance unless the operator explicitly routes through the rich editor.** Inline `/admin/quotes/{id}` is read-only for accepted quotes.
4. **Orders are LOCKED at the DB level on confirmation** — menu items, guest count, event date can't change without going through `propagateQuoteEditToOrder`.
5. **Timezone drives every date bucket.** Wrong tz on a UK tenant with SA default → reports off by 2h.
6. **RLS scopes everything to `auth.uid() → user.company_id`.** Never bypass; never query directly with cross-tenant intent unless you're super-admin.
7. **Service layers snapshot data at creation time.** Old quotes show old prices forever — by design.
8. **Postgres triggers queue async work.** Status changes fire triggers that call API routes via `pg_net.http_post`. Add a new status transition → add the trigger.
9. **Lead → quote → order chain.** Pre-sale pipeline. `?leadId=...` on quote builder links the lead. Acceptance flips lead status to converted. Don't lose this chain.
10. **Document numbering is immutable per company + doc type.** Can't regress, can't reuse. Renumbering = new sequence + audit note.

---

## 14. Sales Admin (subset of Owner)

Same pages as the owner, scoped to the sales pipeline:

- `/admin/leads` — incoming, status tracking, follow-ups
- `/admin/quotes` — the full quote lifecycle
- `/admin/clients` — repeat-customer roster
- `/admin/calendar` — what's booked when

Sales admin focus is **converting leads to quotes to accepted orders**. They don't typically touch payroll, payables, or recurring invoices.

Quote-intelligence chips on `/admin/quotes` are how they prioritise: "Action needed (2d old)", "Send next follow-up", "Won + booked", "Lost".

The 5 most-used flows for sales:

1. Lead arrives via embed form (Facebook / website) → `/admin/leads` shows new card → click "Create quote" → routed to `/admin/quotes/new?leadId=...`
2. Build quote → Save & Send → email lands in client's inbox with magic link
3. Quote viewed by client (`viewed_at` stamped via tracking pixel) → quote-list chip flips to "Viewed today"
4. Client clicks Accept on `/q/{token}` → quote flips to `accepted` → order auto-created → deposit invoice queued
5. If client requests changes via `/q/{token}` → `quote_change_requests` row created → sales admin sees a notification → revises quote and re-sends

---

## 15. Kitchen Staff

**Mental model:** "It's 6am. What am I prepping today, what's the deadline pressure, what ingredients do I need, what allergens have to be acknowledged?"

### 15.1 Today's prep dashboard

**File:** `/team-portal/kitchen/prep-list` (and the dashboard re-export at `/team-portal/kitchen/today`).

Two views, synchronised:

- **By order** — each confirmed/preparing/ready order is a card with event date, guest count, menu items + recipe quantities (scaled to guest count via recipe multiplier), equipment to pack (from_stock vs from_hire split), dietary requirements, allergen warnings. Urgency tier: **critical** (slack ≤ 0h), **high** (≤ 4h), **watch** (≤ 12h), **ok**.

- **By ingredient** — aggregated demand across a 7/14/30-day horizon. Ingredient name + total qty needed + on-hand + shortfall + which orders depend on it.

Urgency formula: `(event_start - now) - kitchen_prep_lead_hours` where `kitchen_prep_lead_hours` is per-tenant (default 12h). Orders >100 guests bump up one tier. Orders already in `preparing` get a small boost.

Realtime subs on `orders`, `order_items`, `inventory_items`. Falls back to 60s polling if the websocket reconnects.

**Create shopping list from shortfall.** Button fires `kitchenPrepService.createShoppingListFromShortfall(ingredientDemandArray)` → creates a `shopping_list` row + per-ingredient `shopping_list_items`. The shopper sees it immediately.

### 15.2 Prep tasks

Per task (rows in `prep_tasks`, created by `postCreationCascade.ts` on order confirmation):

- task_type: prep / cook / cool / pack / plate
- ingredient / component name
- estimated duration
- assigned chef
- status: pending → in_progress → done, OR blocked
- notes
- start time + countdown

Status change writes `started_at` / `completed_at` + `completed_by`. If all prep tasks for an order are done, the order may auto-advance `preparing → ready` (logic in `orderWorkflow`). Cancelled order → tasks soft-deleted (`status='skipped'`). **Always filter `WHERE status IN ('pending','in_progress','done')`** in queries — phantom skipped tasks otherwise.

### 15.3 Allergen review gate

Phase 3 #1. Before order can advance to `ready`, kitchen lead must tick the allergen acknowledgment checkbox per order. The acknowledgment creates an audit row + advances the gate. If client adds an allergen post-confirmation, the gate re-arms.

### 15.4 Recipe scaling

Guest count change → recipe multiplier (`guest_count / recipe.base_servings`) re-applied to every per-guest ingredient. Quantities update in realtime on the prep list. **Non-linear cook times** (roasting 4kg doesn't take 2x as long as 2kg) are NOT auto-scaled — that's a known gap. Manual kitchen review still required for very large orders.

### 15.5 Inventory deduction

**At delivery, not at confirmation.** `deductInventoryForOrder` (`src/services/order/inventoryDeductionService.ts`) runs on order completion. Cancelled order → `reverseInventoryForOrder` in `releaseResources.ts` reverses the deduction.

Pre-delivery: nothing's been deducted yet, so cancellation has nothing to reverse. Post-delivery: inventory_transactions rows track usage.

### 15.6 Kitchen pay + settlement

`kitchenPayService` aggregates `prep_tasks.duration_min` summed per chef per period × hourly rate. BCEA overtime + Sunday/holiday multipliers. Settlement state machine: `draft → reviewed → paid`. Once `paid`, the period is immutable.

### 15.7 Kitchen gotchas

1. Inventory deducts at delivery, not at confirmation. Pre-delivery cancellation has nothing to reverse.
2. Recipe scaling is linear by quantity; cook time isn't. Large orders need manual review.
3. Allergen gate must be ticked before `ready`. If clients add allergens post-confirm, gate re-arms.
4. `prep_tasks.status='skipped'` rows are soft-deleted but stay in the DB. Filter explicitly.
5. `kitchen_prep_lead_hours` (default 12) drives every urgency tier. Get it wrong → false panic or false calm.
6. Equipment split (from_stock vs from_hire) is computed at booking time. Kitchen sees both numbers on the prep card.
7. Outsource provider items DON'T appear in kitchen prep (different team handles them).
8. Cleaning handover (after event) is anticipated at order-creation time but only marks `in_progress` after driver returns equipment.
9. Realtime subs are critical — without them, dashboard goes stale within minutes on a busy day.
10. Cross-kitchen load balancing isn't automatic. Multi-kitchen tenants assign manually.

---

## 16. Shopping Staff

**Mental model:** "What do I need to buy today, where do I get it, what's the budget, what do I capture for the receipt?"

### 16.1 Buy list (inventory demand outlook)

**File:** `/team-portal/shopping/buy-list` reads the `inventory_demand_outlook` view:

- ingredient name
- on-hand stock
- shortfall (demand_next_7_days - on-hand, if positive)
- status: shortfall / below_minimum / low / ok
- cost per unit
- preferred supplier

Filter chips (Shortfall / Below par / Low / All). Multi-select → "Add to list" → creates `shopping_list_items` rows. Quantity defaults to `shortfall` or `reorder_qty` or `(min_stock - on_hand)`.

### 16.2 Active shopping list

**File:** `/team-portal/shopping/dashboard`

Grouped by supplier. Per item: ingredient name, qty + unit, estimated cost, claim button, purchased checkbox, "Not here" button (flags OOS), notes field.

Realtime sync: two shoppers on the same list see each other's claims and purchases in seconds.

Barcode-scan FAB: camera → barcode → match → auto-mark purchased.

**List completion.** Marks `shopping_list.status='completed'`, captures actual_total_spent + receipt image (Supabase Storage) + notes. Creates `supplier_payables` row for accounts payable (due_date based on supplier.payment_terms).

### 16.3 Tax-purchase flow

`menu_items.cost_allocation_type`: resale / operational / combined. Tax category propagates to `supplier_payables` row. Used for VAT-recoverable purchase reporting on `/admin/tax-purchases`.

### 16.4 Shopping gotchas

1. **Demand outlook can be 10s stale** after a fresh order confirmation. Realtime catches up.
2. **No upper-bound conflict check** — operator can over-buy.
3. **Supplier stockouts aren't pre-checked.** Shopper discovers them at the till. (`is_oos` on supplier feed is a future feature.)
4. **Receipt capture isn't enforced** — list can close without it. Compliance drift.
5. **Cost variance isn't flagged** — actual vs estimated mismatch passes silently.
6. **Barcode mismatch** can mark wrong item purchased (same supplier, different brand).
7. **Orphan shopping lists** sit in `in_progress` forever if not completed. No cron cleanup.
8. **Tax allocation is proportional** by guest counts when an ingredient hits both resale + operational orders. Manual review for accuracy.
9. Mixed-tenant tax rates aren't supported yet (one VAT rate per tenant).
10. Receipt OCR via Claude API is a deferred feature (not Anthropic-related for this brief).

---

## 17. Driver

**Mental model:** "Next pickup, navigate, confirm food + equipment, hit the road, share GPS, deliver, sign-off, return equipment, settle pay."

### 17.1 Driver dashboard

**File:** `/team-portal/driver/dashboard.tsx` (~1185 lines)

14-day lookahead grouped by date. **Next pickup banner** (job due soonest). **Earnings tile** (today's potential + month-to-date). Job cards with live status: `assigned → accepted → en_route → picked_up → at_venue → setup_started → service_started → departed_venue → delivered`.

**GPS pinging.** `useDriverGPSPing` hook runs every 60s when there's an active assignment. Inserts a `driver_locations` row (lat, lng, timestamp, order_id). Shows on admin tracking map + sends a Google Maps link to client via WhatsApp on driver depart.

Dedup logic between `driver_assignments` (dispatch view) and `orders + order_delivery_meta` (operational view). Assignments win if both exist.

### 17.2 The handover gate (kitchen → driver)

`src/services/driverConfirmationService.ts > confirmDepartedKitchen()`.

When driver taps "departed kitchen", system checks `equipment_handovers` for a row where `from_stage='kitchen' AND to_stage='driver' AND signed_by_user_id IS NOT NULL`. **If no signed row exists → departure blocked** with "Equipment handover not yet signed by kitchen. Ask the kitchen lead to verify the list before you depart."

Bypass for dev: `NEXT_PUBLIC_BYPASS_HANDOVER_GATE=true`. **Never enable in prod.**

On successful depart: `driver_confirmation` row inserted, WhatsApp to client ("On the way, track here: {Google Maps GPS link}"), `updateOrderStatus(order_id, 'en_route')` fires the downstream cascade.

### 17.3 Venue arrival + service start

`confirmAtVenue()`, `confirmSetupStarted()`, `confirmServiceStarted()` — each writes a `driver_confirmation` row and notifies kitchen. Each is a milestone for the client tracking view.

### 17.4 Delivery completion + equipment return

Two modes:

- **immediate return** — driver loads dirty equipment after service, drives back, confirms "equipment collected", drops at cleaning staging area
- **scheduled collection** — equipment stays at venue overnight; a separate crew collects next day

Mode is set per order (`equipment_return_method`). Status flow stays clean either way.

### 17.5 Driver pay

Three components: hourly (clocked shifts × rate), distance (km × rate), callout (fixed per delivery).

GPS data feeds distance. `driverPayService.getPaySummary()` produces the summary. The driver's earnings page (`/team-portal/driver/earnings`) renders the same numbers the admin will use at settlement — builds trust + reduces disputes.

Settlement: `draft → reviewed → paid`. Once `paid`, immutable.

### 17.6 Driver gotchas

1. **Handover gate is non-negotiable in prod.** Don't ship code that bypasses it.
2. **GPS pings only when active assignments exist.** No active job = no battery drain.
3. **Driver pay is a snapshot at settlement.** Rate changes mid-period split the hours proportionally.
4. **Vehicle is per-order, not per-driver.** Secondary vehicle fallback supported.
5. **WhatsApp notifications are async.** If they fail, driver's status still updates (no rollback).
6. **Pay calc is timezone-aware.** UTC in DB; pay rates split at local midnight, not UTC midnight.
7. **Driver earnings page must mirror admin settlement.** If they diverge, drivers lose trust.
8. **GPS staleness on app crash.** No automatic backfill; driver must re-open.
9. **ETA is rough** (50 km/h average). No live traffic.
10. **GPS share link** in tracking has no TTL — anyone with the link sees driver location. Consider shortening for privacy.

---

## 18. Cleaning Staff

**Mental model:** "Equipment came back from yesterday's event. What needs washing, what's damaged, what's missing, what goes back into stock so it's ready for tomorrow's event?"

### 18.1 Cleaning dashboard

**File:** `/team-portal/cleaning/dashboard.tsx` (~831 lines)

Equipment status overview (Available / In use / Cleaning / Damaged). Three tabs:

- **Equipment Verification** — SOP checklist + damage flagging
- **Damages & Losses** — breakage log + cost analytics
- **Team Status** — cleaner roster + clock-in/out

**CleaningEventBoard** (Wave 70.24) groups by event: Expected / In progress / Done today. **CleaningJobsQueue** is the flat power-user view.

Hash navigation: `#returns` → board, `#washing` → queue. Sidebar deep-links use it.

### 18.2 SOP checklist (CLN-B)

5-item checklist per inspection:
1. Visible debris removed
2. Sanitised with approved cleaner
3. Fully dried (no standing water)
4. Stored in correct location
5. No damage spotted

Plus optional notes + photo + "Damage found" checkbox.

**Clean path:** all ticks + "No damage" → `equipment.condition='good'`, `available_quantity` restored, `last_cleaned_at` + `last_cleaned_by` stamped.

**Damage path:** "Damage found" hides SOP, `reportDamage()` inserts a `damage_report` row + `equipment.condition='damaged'`. Admin damages tab aggregates with cost estimates.

### 18.3 Cleaning event handovers

`cleaning_event_handovers` row per event. Status: `expected → in_progress → complete → cancelled`. Expected items count = sum of `equipment_bookings.quantity` where `requires_cleaning=true AND NOT (is_hire_in AND supplier_cleans)`.

Cleaning jobs (`cleaning_jobs`) spawn per item. Status: `queued → in_progress → complete`. Jobs track method (wash / dishwasher / hand-clean), quantity, notes.

Sign-off on the detail page (`/team-portal/cleaning/handovers/[id]`) flips handover to `complete`, broadcasts "equipment back in stock" notification to kitchen, equipment becomes available for next event.

### 18.4 Available-quantity math

```
true_available = equipment.available_quantity - unitsInActiveCleaning(equipment_id)
```

`unitsInActiveCleaning()` queries `cleaning_jobs WHERE status NOT IN ('complete','cancelled') GROUP BY equipment_id`. Without this subtraction, dispatchers overbook equipment.

### 18.5 Cleaning gotchas

1. **`equipment.available_quantity` is stale on its own** — always subtract `unitsInActiveCleaning`.
2. **Hire-in equipment where supplier cleans is excluded** from `cleanable_items` count. Test the `supplier_cleans` flag carefully.
3. **Damage flagged mid-service isn't broadcast** to kitchen lead in realtime currently. Upgrade candidate.
4. **Late-return scenarios** (collection scheduled next morning): handover sits `expected` overnight. No 24h timeout alert yet.
5. **Driver settlement can close before cleaning sign-off** — if equipment goes missing during cleaning, the missing-cost adjustment hits next period.
6. **CleaningNav** is a shared component across 8 cleaning pages — don't duplicate.
7. **Portal-service-mode** toggle: 30s auto-refresh in portal mode for shared tablets.
8. **Cleaning is multi-person live.** Realtime subscriptions on `cleaning_jobs` + `equipment` are non-optional.
9. **Damage reports flow into one source of truth** (`damage_reports`) — admin's damages tab is the canonical view.
10. **Quantity confusion (`quantity` vs `available_quantity`) is the most common bug** — bad allocations + overbookings.

---

## 19. Client (end customer)

**Mental model:** "I'm planning my wedding for 80 people. I got a quote in email, I want to read it on my phone, accept, pay a deposit, then check in nearer the date to make sure everything's confirmed."

### 19.1 The 12 client flows

**1. Embed-form lead capture** — `/api/public/embed/[token]/submit`. Tenant pastes a `<script>` snippet on their website (built via `/admin/embed/SnippetDialog`). Client fills name/email/event date/guests/notes. Inserts `leads` row + `embed_form_submissions` audit. Soft-fail CAPTCHA in dev, hard-fail in prod. Always returns 200 for privacy (no bot enumeration).

**2. Quote reception** — `/q/{token}`. White-label branded, no login, magic-link token in URL. Shows event details, menu, equipment, totals, expiry chip (green >3d, amber 1-3d, red <1d), download-as-PDF button, "Request a change", "Decline this quote".

**3. Accept quote** — POST `/api/client-tokens/accept-quote` → flips `status='accepted'` → `convert_quote_to_order` RPC creates `orders` row + `order_items` + `equipment_bookings` + deposit invoice. Client is redirected to the order page with a fresh per-order token.

**4. Decline quote** — `CancellationWizard mode='quote'`. 2-step wizard. No financial impact (no money paid yet). Records reason in `cancellation_requests`. Sends notification to operator.

**5. Request changes** — inline form on `/q/{token}`. New guest count, new event date, menu notes, free-text. Posts to `/api/client-tokens/request-change`. Operator sees notification + may revise quote.

**6. Order view + tracking** — `/c/order/{id}?t={token}`. Magic link, cookies set 24h on first validate. Status timeline (`pending → confirmed → preparing → ready → in_transit → delivered → completed` mapped to client-friendly stages via `toClientTimeline` RPC). Venue details, menu + equipment breakdown, payment summary (deposit paid/due, balance paid/due). Live tracking card if `in_transit`. Download invoice button.

**7. Amend guest count** — inline expansion on order page. Same as quote-change but routed to amendment_requests path.

**8. Postpone** — `request_type='postpone'` to `/api/client-tokens/cancel-order`. `computeCancellationTerms` RPC computes `can_postpone` (true if event >X days out and prep not started). Operator must confirm new date availability.

**9. Cancel order** — `CancellationWizard mode='order'`. 3-step wizard. Step 2 shows refund/credit options + committed-cost note. Step 3 lets client pick refund or credit. Inserts `payments` (type=refund, status=pending) or `client_credits` row + flips `orders.status='cancelled'`.

**10. Pay invoice** — `/pay/i/{token}`. Branded. Shows amount due + payment method (card via PayFast / EFT bank details / store credit). Store credit toggle if `creditAvailable > 0`. Payment gateway redirect → ITN webhook confirms → invoice flipped to `paid`.

**11. Live tracking** — `/client-portal/tracking?t=...` (requires sign-in token). Google Map + driver marker + ETA. Polls every 60s.

**12. Magic-link recovery** — if token expires (24h cookie, 60d-min server token), ExpiredLinkCard surfaces: enter email → `/api/client-tokens/request` mints fresh token + emails it. Always returns 200 (privacy).

### 19.2 Multi-tenant slug on every client page

Branded based on `companies` row read at request time. CSS vars (`--brand-primary`, `--brand-secondary`, `--brand-accent`) for theming. Logo fallback to `ChefHat` icon.

### 19.3 The 24-hour security model (TIGHTEN I.123)

- Bridge tokens from `/q/{token}` → `/c/order/{id}` have **24h TTL**.
- Status-update emails carry tokens with **60d TTL** (long enough that a client reading the email a week later can still click).
- Once client lands, cookie set at `Path=/{slug}/c` AND `Path=/c` (TIGHTEN I.122) so refresh works on both URL shapes.
- The URL keeps `?t=` after validation (TIGHTEN I.126 — earlier strip caused the recovery card to fire one minute after send).

Recovery card copy explains the 24h rule: "Got the email with your quote or order? Just click the link in that email again — it'll open this booking with a fresh secure session, no extra steps."

### 19.4 Client gotchas

1. **Token-bearer auth, NOT session auth.** No passwords. Tokens are unguessable UUIDs.
2. **Branding is per-tenant.** Never hardcode CateringMS branding on client pages.
3. **Quote is frozen post-acceptance.** Operator edits sync to the order, NOT back to the quote.
4. **Cancellation rules are per-tenant.** Always call `computeCancellationTerms` RPC. Never hardcode.
5. **Store credit is client opt-in on invoices.** Check `creditAvailable` before rendering "Pay now".
6. **Multi-currency.** Read `companies.currency` (ZAR / USD / GBP / etc.). Use `Intl.NumberFormat`.
7. **VAT rendering depends on `pricing_includes_vat`.** True → VAT hidden in subtotal. False → separate line.
8. **Timeline stages need projection.** Operator terms vs client terms differ. Use `toClientTimeline`.
9. **ExpiredLinkCard must offer self-serve recovery.** Email-only form. Never force operator contact.
10. **Account scope (`/c/account?t=...`) filters by lower-cased email** — case sensitivity bugs leak data.

---

## 20. Super Admin + Integrations

### 20.1 Super-admin pages

`/src/pages/admin/platform/*` — 17 pages that bypass tenant RLS for cross-tenant ops.

- `company-database.tsx` — all tenants
- `trial-management.tsx` — extend trials
- `subscription-management.tsx` — billing state
- `pricing-management.tsx` — plan tiers
- `user-management.tsx` — platform users (super_admin, platform_support, billing_admin)
- `audit-logs.tsx` — cross-tenant audit trail
- `running-todo.tsx` — internal-platform todo
- `smoke-test.tsx` — `run-end-to-end.ts` harness

### 20.2 Tenant signup → trial → paid

1. `/admin/onboarding/*` — signup flow inserts `companies` row, seeds defaults, sends `OwnerWelcomeEmail` via Resend
2. Trial period (default 14d). `subscriptions.status='trial'`
3. PayFast / Stripe webhook on first payment confirms → `subscriptions.status='active'`
4. Feature gates in tenant code check `trial_end > now()` + plan limits

### 20.3 Plan limits enforcement

`active_clients_limit`, `orders_limit_quarterly`, `api_rate_limit_per_hour` per plan tier. Enforced at query time (not insert time). Add DB indexes on `(company_id, deleted_at)` for the active-client count.

### 20.4 Account deletion (POPIA / GDPR)

- `/api/admin/export-company-data` — exports JSON archive of all tenant data
- `/api/admin/request-account-deletion` — inserts `account_deletion_requests` row with 30-day grace period
- Cron daily checks expired requests → hard-delete companies row (cascades to all children)
- Tenant can cancel within 30 days

### 20.5 Integrations dashboard

`/admin/integrations.tsx` (1088 lines) — central hub:

- API key generation (raw key shown once, then hashed)
- Webhook subscriptions (in/out) — HMAC-signed payloads, retry with exponential backoff
- Zapier recipes gallery
- OAuth flows for Xero / QuickBooks / Sage (PKCE)

### 20.6 OAuth + accounting sync

`/api/accounting/{provider}/authorize.ts` + `callback.ts` for each of xero / quickbooks / sage. Tokens stored in `accounting_integrations` table, encrypted with `ENCRYPTION_KEY` (AES-256-GCM).

Token refresh cron runs every 15min — finds tokens expiring within 1h and refreshes.

Invoice sync: `/api/accounting/{provider}/sync-invoice.ts`. Idempotent (checks `external_reference_{provider}` on order before re-syncing).

### 20.7 REST API for inbound data

`/api/integrations/leads.ts`, `quotes.ts`, `invoice-paid.ts`. Bearer-token auth via API key. Rate-limited per-key. Idempotency keys supported.

### 20.8 Subscription webhooks

- PayFast ITN: MD5 signature + IP allowlist + `pf_payment_id` idempotency
- Stripe: HMAC-SHA256 + timestamp replay protection (5min) + `event.id` idempotency

Both write `payments` row + update `subscriptions.status` + audit log.

### 20.9 Super admin gotchas

1. **RLS is the security boundary, not app code.** Bad policy → tenant data leaks.
2. **API keys are hashed; raw key shown once.** Lost = regenerate.
3. **Webhook signatures aren't replay-proof.** Always check `external_transaction_id`.
4. **OAuth tokens must refresh before expiry, not after.** Cron 1h ahead.
5. **Trial → paid conversion is critical path.** Test thoroughly.
6. **Plan limits enforce at query time.** Add indexes; filter `deleted_at IS NULL`.
7. **Audit logs are append-only, plan for queries.** 7-year retention = TB scale.
8. **White-label branding uses CSS variables.** Custom event re-renders.
9. **Stripe vs PayFast signatures are different algorithms.** Easy to mix up.
10. **Rate limiting is per-API-key, not per-IP.** Compromised key = quota exhaustion.

---

# CROSS-CUTTING ARCHITECTURE

## 21. End-to-end lifecycle (Lead → Quote → Order → Production → Delivery → Closure)

```
┌──────────┐   embed form    ┌───────┐  build  ┌───────┐  send  ┌────────┐
│ Website  ├────────────────▶│ Lead  ├────────▶│ Quote ├───────▶│ Quote  │
│ visitor  │                 │       │         │ draft │        │ sent   │
└──────────┘                 └───────┘         └───────┘        └────┬───┘
                                                                    │
                                                            client clicks
                                                                    │
                                                                    ▼
                              ┌───────┐  accept  ┌────────┐    ┌──────────┐
                              │ Order ◀──RPC─────┤ Quote  │◀───┤ /q/{tok} │
                              │pending│          │accepted│    │   view   │
                              └───┬───┘          └────────┘    └──────────┘
                          deposit paid
                                  │
                                  ▼
┌─────────┐   ┌──────────┐   ┌─────────┐   ┌──────┐   ┌──────────┐   ┌───────────┐
│ Order   │   │ Order    │   │ Order   │   │Order │   │ Order    │   │ Order     │
│confirmed├──▶│preparing ├──▶│ ready   ├──▶│ in_  ├──▶│delivered ├──▶│completed  │
│         │   │          │   │         │   │transit│   │          │   │           │
└─────────┘   └──────────┘   └─────────┘   └──────┘   └──────────┘   └───────────┘
     │             │              │           │            │              │
     ▼             ▼              ▼           ▼            ▼              ▼
deposit pay   prep tasks    pack equip   driver GPS   cleaning      invoice paid
invoice gen   inventory     handover     WhatsApp     handover      review email
kitchen prep  shopping      gate          ETA          stock back   completion
equipment     allergen      kitchen      tracking      cleaning     close-out
bookings      gate          sign-off                   sign-off
driver assign
shopping list
audit log
```

The state machine is in `src/services/order/orderWorkflow.ts > ALLOWED_ORDER_TRANSITIONS` (lines 45-55). Every transition writes:

- `order_status_history` row
- `audit_logs` row
- email queue stamps re-dated if event_date moved
- Status email to client via `sendStatusNotifications`

## 22. The money pipeline

```
QUOTE total = SUM(menu_lines) + SUM(equipment_lines) + delivery_fee
             - discounts ± surge × VAT (or inc-VAT depending on flag)

ORDER CONFIRMED:
  ├── deposit_invoice = total × deposit_percentage
  │     status='pending', due_date = event_date - 14d (or company-specific)
  │     emailed to client immediately
  └── balance_invoice = total - deposit
        status='pending', due_date = event_date - 3d (or per-tenant config)
        emailed N days before event

CLIENT PAYS via PayFast:
  └── /api/webhooks/payment-confirmation (PayFast ITN)
       ├── verifies signature (MD5) + IP allowlist
       ├── record_invoice_payment RPC
       │     ├── inserts payments row
       │     ├── updates invoice.status='paid' or 'partially_paid'
       │     └── stamps orders.deposit_paid + deposit_amount + deposit_paid_at
       └── deposit-paid-sweeper cron auto-confirms order if all conditions met

CANCELLATION:
  └── get_refund_for_order(order_id) RPC
       ├── reads companies.cancellation_policy.deposit_refund_tiers
       ├── computes days_to_event
       ├── walks tiers desc by min_days_before_event, picks first match
       ├── fallback: companies.cancellation_fee_percent
       └── returns { refund_amount, tier_label, policy_snapshot }

OPERATOR CHOOSES PAYOUT:
  ├── refund → payments row (type='refund', status='pending')
  │            refundService.processRefund() — auto for PayFast, manual EFT otherwise
  └── credit → client_credits row (+10pp bonus pct default, 1yr TTL)

ACCOUNTING SYNC:
  /api/accounting/xero/sync-invoice.ts (and similar for QuickBooks / Sage)
  Idempotent via external_reference_{provider} on order
  Async fire-and-forget on order events
```

## 23. The communication pipeline

```
caller (e.g. orderWorkflow.sendStatusNotifications)
        │
        ▼
  emailService.sendEmailDetailed({ companyId, to, subject, template, variables, attachments })
        │
        ▼
  resolveEmailTemplate(companyId, template_type, variables, fallback)
        │
        ├── 1. tenant override   (email_templates WHERE company_id = X AND template_type = Y)
        ├── 2. global default    (email_templates WHERE company_id IS NULL AND template_type = Y)
        └── 3. caller fallback   (the embedded subject + bodyHtml)
        │
        ▼
  Mustache substitution of {{variables}}
        │
        ▼
  brandedEmailShell wrap (TIGHTEN I.124) — auto-fires unless skipBrandedShell
        ├── pulls companies.primary_color / accent_color / contact info
        ├── shell: header (small uppercase company name in brand colour)
        ├──        body
        ├──        CTA below body in brand accent (TIGHTEN I.126)
        └──        footer (contact + unsubscribe)
        │
        ▼
  Compliance gates
        ├── blocked_contacts (hard block)
        ├── comms_paused_until on leads / clients (import quarantine)
        └── bypassQuarantine=true → bypass quarantine ONLY (cancellation, refund, postponement)
        │
        ▼
  Append List-Unsubscribe header + footer (CAN-SPAM)
        │
        ▼
  Route to provider (Resend or SMTP via email_provider_settings)
        │
        ▼
  Log to outgoing_email_queue + outgoing_email_log
        │
        ▼
  Resend webhook for bounces / complaints → updates email_status + adds to blocked_contacts
```

## 24. The realtime + refresh pipeline

```
DB change on orders / quotes
        │
        ▼
  supabase_realtime publication (TIGHTEN I.117 added quotes + orders)
        │
        ▼
  postgres_changes event broadcast (~1s latency)
        │
        ▼
  useOrderRefreshSignal(companyId)   ← TIGHTEN I.119 — central hook used by 31 pages
        │
        ├── subscribes postgres_changes on orders + quotes (company-scoped)
        ├── listens window 'focus' event (catches websocket drops)
        └── listens document 'visibilitychange' → visible
        │
        ▼
  ticks internal counter
        │
        ▼
  every page using the hook re-runs its useEffect (dep: [companyId, refreshSignal])
        │
        ▼
  data refetches, UI updates within ~1s
```

Realtime falls through RLS. Client-portal subs receive only their own client_id's orders. Safe to subscribe with `companyId=null` on public pages — RLS narrows the result.

## 25. Audit + forensics trail

### Tables

| Table | Captures |
| --- | --- |
| `audit_logs` | generic: action, entity_type, entity_id, metadata jsonb, ip, user_agent |
| `order_status_history` | every status transition with user, reason_code, timestamp |
| `cancellation_requests` | client / operator cancel requests + policy_snapshot at the moment |
| `order_amendment_requests` | post-confirmation edit requests + proposed_changes |
| `client_access_log` | every magic-link click (token_id, action, ip, ua, viewed_at) |
| `outgoing_email_queue` + `outgoing_email_log` | every email sent |
| `embed_form_submissions` | public lead form payloads + audit |
| `damage_reports` | breakages flagged by cleaning |
| `shopping_list_activities` | every shopping-list mutation |
| `inventory_transactions` | every stock deduction / reversal |

### Generic action vocabulary

`order_purged`, `cancellation_email_suppressed`, `cancellation_credit_issued`, `quote_resynced_to_order`, `subscription_payment_confirmed`, `subscription_cancelled`, `api_key_generated`, `api_key_used`, `webhook_fired`, `webhook_failed`, `pii_access`, `account_deletion_requested`, `account_hard_deleted`, `xero_oauth_authorized`, `invoice_synced_to_xero`, etc.

### Retention

7 years (compliance). Oldest entry visible on `/admin/platform/audit-logs.tsx`.

POPIA Section 11 requires audit logs to show who accessed PII. Filter by `action='pii_access'`.

## 26. Cron + scheduled work

`/src/pages/api/cron/*.ts` — every job:
- called by Vercel cron with `Authorization: Bearer ${CRON_SECRET}`
- idempotent, at-least-once
- service-role queries (no auth/RLS)
- audit_logs entries on completion

Active jobs:

| Job | Cadence | Purpose |
| --- | --- | --- |
| `deposit-paid-sweeper` | 5 min | flip `pending → confirmed` when deposit lands |
| `expire-stale-quotes` | daily | mark quotes >30d as expired |
| `recurring-invoices` | daily | create new invoices on subscription rollover |
| `balance-reminder` | 3d before event | email client balance-due |
| `late-event-check` | 1d before event | alert operator if order still pending |
| `outsource-pre-event-reminder` | 1d before | SMS to outsourced staff |
| `outsource-post-event-thanks` | next day | thank-you + payment schedule |
| `process-email-queue` | 2 min | drain `outgoing_email_queue` and send |
| `update-overdue-invoices` | daily | mark past-due invoices |
| `archive-old-email-rows` | weekly | move >90d rows to archive |

All jobs share `CRON_SECRET`. Set in Vercel env vars.

## 27. The TIGHTEN tag convention

Every notable behaviour change ships with `TIGHTEN I.NNN (YYYY-MM-DD): rationale` comments + matching PR title. Grep by tag to find rationale + all usages.

Recent tags (I.111 → I.128) are particularly dense — they're the wave that came right before this handover. Examples:

- **I.111-I.116** — quote send flow + tenant slug routing + service-role RLS fix
- **I.117** — enabled realtime publication on `quotes` + `orders`
- **I.118** — added DB CHECK preventing `status='draft'` on converted quotes
- **I.119** — `useOrderRefreshSignal` adopted by 14 pages
- **I.120** — converted-quote save unifies status preservation + propagation
- **I.121** — `RemoveOrderDialog` (cancel-or-purge two-step)
- **I.122-I.123** — client link recovery + 24h bridge tokens + recovery copy
- **I.124-I.126** — branded email shell, mobile optimisation, no-strip URL
- **I.127** — server-side `/api/quotes/[id]/resync-order` defensive belt-and-braces
- **I.128** — email body includes live guest count + total

Use the tag as your atlas.

## 28. Repo guardrails (CI gates)

Three scripts run in GitHub Actions on every PR:

### `npm run check:status-filters`

Catches `.eq("status", "expired")` / `.in("status", ["pending", "stale"])` where the literal has drifted out of the DB enum. Eight production bugs in May 2026 traced back to this. Baseline allow-list (`BASELINE_PHANTOM_TABLES`) suppresses known grandfathered issues — do NOT extend it.

### `npm run check:migration-rls`

Catches `CREATE TABLE public.foo` without `ALTER TABLE foo ENABLE ROW LEVEL SECURITY` in the same migration file. Opt-out with `-- RLS_OPT_OUT: <reason>` comment.

### `npm run check:realtime-channels`

Catches global channel names like `.channel("admin-dashboard-orders")` instead of tenant-scoped `.channel(`admin-dashboard-${companyId}`)`. Cross-tenant amplification mitigation. Opt-out with `// CHANNEL_OPT_OUT: <reason>`.

## 29. Critical-path files (read line-by-line before touching anything)

| Component | Location | Why critical |
| --- | --- | --- |
| **Order state machine** | `src/services/order/orderWorkflow.ts` (lines 45-90) | Every order mutation goes through `updateOrderStatus()`. Wrong transition breaks invoices, inventory, emails. |
| **Quote → order propagation** | `src/services/quote/propagateQuoteEdit.ts` (lines 28-74) | 22 quote fields mirror to order. Without it, kitchen sees stale event_date, driver misses collection window, invoice is on wrong date. |
| **Defensive server resync** | `src/pages/api/quotes/[id]/resync-order.ts` | Service-role belt-and-braces that fires after the browser propagator. Stamps audit log per call. |
| **Refund engine** | `supabase/migrations/20260514130000_get_refund_for_order_checkin.sql` | `companies.cancellation_policy.deposit_refund_tiers` walk. All cancellation UX branches on this. |
| **Email template resolver** | `src/services/email/templateResolver.ts` (lines 28-95) | Tenant override → global default → fallback ladder. Never throws. |
| **Central email send** | `src/services/emailService.ts` (lines 1-150) | Every client-facing email funnels here. Quarantine gates + branded shell + logging. |
| **Branded email shell** | `src/services/email/brandedEmailShell.ts` | Auto-wraps every plain-text body in tenant-branded HTML. Mobile-optimised. |
| **Realtime refresh signal** | `src/hooks/useOrderRefreshSignal.ts` | 31 pages use this. Without it, stale data persists. |
| **Multi-tenant helper** | `get_user_company_id(uid)` (search `supabase/migrations/20260421210000_complete_schema_migration.sql`) | Every RLS policy depends on this. Wrong resolution = data leak. |
| **Cancellation cascade** | `src/services/order/releaseResources.ts` | Releases equipment, kitchen prep, drivers, hire-in POs, shopping list, linked quote. Per-resource receipt. |
| **Remove-order dialog** | `src/components/admin/orders/RemoveOrderDialog.tsx` | Cancel vs purge two-step. Notify-client toggle. Type-the-order-number confirmation. |
| **Token mint RPC** | `mint_client_order_token(p_company_id, p_order_id, p_label, p_ttl_hours)` | 24h for bridge, 60d for emailed status links. |

---

## 30. Open work + known sharp edges

**Live test orders to clean up**

ORD-003830 (Eugene de Beer) and ORD-003831 (Casey Norton) still sit in `/admin/orders` for `spit-braai-delivery`. Use the new `/admin/orders` → row → "Cancel or remove" → **Purge** path to wipe them. The flow shipped in PR #495 (TIGHTEN I.121).

**Owner-side dashboard separate from /admin/dashboard** — deferred. Owner == company_admin for now.

**PDF cache** is keyed on `quoteUpdatedAt` + `companyUpdatedAt` and lives in process memory (`src/services/pdf/pdfCache.ts`). Survives one warm Vercel instance, dies on cold start.

**Magic-link tokens for `/c/order/{id}?t=...`** — 24h TTL (TIGHTEN I.123). Status-change emails sent via `customerLinksServer.ts` mint 60-day tokens. If a client reports an expired link, they should click the original email link again (re-mints automatically).

**Realtime publication** must include any new table that needs live cross-tab updates. Use `npm run check:realtime-channels` to spot subscriptions pointing at tables NOT in the publication.

**Cook-time scaling is linear** — large orders (>100 guests) need manual review.

**Cross-kitchen load balancing** — multi-kitchen tenants assign manually.

**Damage flagged mid-service** isn't broadcast to kitchen lead in realtime — upgrade candidate.

**Late equipment return** (collection scheduled next morning) — handover sits `expected` overnight with no 24h timeout alert.

**Driver settlement can close before cleaning sign-off** — missing-cost adjustments hit the next period.

**Shopping receipt capture isn't enforced** — list can close without it.

**Mixed-tenant tax rates** — one VAT rate per tenant only.

**Outsource provider fallback** — if default declines, no auto-fallback. Manual reassignment.

---

## 31. Glossary of catering terms

| Term | Plain-language meaning |
| --- | --- |
| **Allergen gate** | The mandatory checkbox kitchen lead ticks before food can leave. Liability shield. |
| **Balance** | The remaining payment after deposit. Due before / on event day. |
| **Balance-due reminder** | Cron email N days before event reminding client to pay the balance. |
| **Booking** | The catering event itself — date, venue, guests, food. Often used synonymously with "order". |
| **Cleaning handover** | Driver → cleaning team handoff of returned equipment. Logged in `cleaning_event_handovers`. |
| **Collection** | Driver picking up dirty equipment from the venue after service. |
| **Committed cost** | Money the caterer has already spent (e.g., bought lamb, paid driver standby) that's non-refundable on cancellation. |
| **Confirmed** | Order state where deposit has landed and event is locked in. |
| **Deposit** | Initial payment (typically 30-50%) confirming the booking. |
| **Dispatch** | The act of sending the driver out from the kitchen. Past dispatch = order is in flight. |
| **Equipment booking** | A reservation of equipment for an event (date window + qty). |
| **Equipment handover** | Signed-off list of what kitchen handed to driver, OR what driver handed to cleaning. |
| **Event date** | When the catering happens. Drives every downstream date (prep, equipment booking, balance due). |
| **From hire / hire-in** | Equipment the tenant doesn't own — borrowed from a hire company for the event. |
| **From stock** | Equipment the tenant owns — washed in-house, returned to inventory. |
| **Guest count** | Number of people to cater for. Drives per-guest pricing + recipe scaling + equipment qty. |
| **Hire-in PO** | Purchase order to a hire company for borrowed equipment. |
| **Inventory deduction** | Reducing stock when the event happens. Triggered at delivery (not at confirmation). |
| **Kitchen prep lead** | Tenant config (default 12h) — how far ahead of the event the kitchen needs to start. |
| **Lead** | A prospect — someone who's expressed interest but doesn't yet have a quote. |
| **Magic link** | A tokenised URL the client clicks to access their quote / order / invoice without logging in. |
| **Outsource** | Hiring an external catering partner to fulfil part of the order (e.g., a cocktail bar). |
| **Per-guest pricing** | Menu lines that scale 1:1 with guest count. |
| **Per-portion pricing** | Menu lines with a fixed portion count (e.g., 50 portions of dessert). |
| **Postponement** | Moving an event to a later date. No money exchanged — deposit moves to the new date. |
| **Prep task** | A kitchen activity derived from menu lines (e.g., "marinate lamb"). Per-order. |
| **Production** | The window between confirmation and delivery — kitchen prepping, shopping, equipment readiness. |
| **Public token** | UUID embedded in a quote / order / invoice URL. Acts as the auth secret. |
| **Quote** | The proposal sent to a client. Pricing + scope + valid-until date. |
| **Recipe multiplier** | `guest_count / recipe.base_servings`. Scales ingredient quantities. |
| **Region** | A sub-tenancy within a company (e.g., a specific kitchen / depot). |
| **Resync** | Forcing the order to mirror the latest quote state. Endpoint at `/api/quotes/[id]/resync-order`. |
| **Setup time** | When the driver arrives at the venue to lay out food before guests arrive (typically 1-2h before event start). |
| **Shopping list** | Auto-generated buy list from inventory shortfall. Worked by the shopper. |
| **Source of truth** | The quote (pre-acceptance) or the order (post-acceptance). Edit the quote → everything downstream syncs. |
| **Surge** | A pricing uplift on the whole quote (e.g., weekend / public-holiday premium). |
| **Tenant** | One catering company on the platform. Identified by `companies.slug`. |
| **TIGHTEN I.NNN** | The audit tag convention — grep finds the rationale + every usage. |
| **Unsubscribe footer** | HMAC-signed one-click opt-out link (CAN-SPAM compliance). |
| **VAT registered** | SA tax status. Drives whether quote shows "Tax Invoice" vs "Invoice" + whether VAT is shown as a line. |
| **White-label** | Tenant-branded portal — logo, colours, contact details — without code duplication. |

---

## 32. Per-persona "top 10s" consolidated

Each persona's top 10 lives in its detail section. Print this page and pin it above your desk for the first month:

**Owner / Company Admin** — §13.8. Most important: `deposit_paid_at` is the canonical confirm trigger; `pricing_includes_vat` flag rules everything; orders lock at confirmation.

**Kitchen Staff** — §15.7. Most important: inventory deducts at delivery (not confirm); recipe scaling is linear (cook time isn't); allergen gate must be ticked before `ready`.

**Shopping Staff** — §16.4. Most important: demand outlook can be 10s stale; receipt capture isn't enforced; orphan shopping lists pile up.

**Driver** — §17.6. Most important: handover gate is non-negotiable in prod; pay snapshot at settlement is immutable; GPS only when active.

**Cleaning Staff** — §18.5. Most important: `available_quantity` needs subtraction of `unitsInActiveCleaning`; quantity confusion is the most common bug; cleaning is multi-person live (realtime is non-optional).

**Client (end customer)** — §19.4. Most important: token-bearer auth (no passwords); branding is per-tenant (never hardcode); cancellation rules are per-tenant (always RPC).

**Super Admin** — §20.9. Most important: RLS is the security boundary; OAuth tokens refresh before expiry; audit logs are append-only at TB scale.

**Sales Admin** — read §13 (subset of owner).

---

### Final note from Bobby

I built this codebase under intense iteration with a TIGHTEN-tagged audit loop. Trust the tags. Trust the audit_logs. Trust the realtime subscriptions but verify them with `check:realtime-channels`. Trust the RLS but verify it with `check:migration-rls`. Trust the status enums but verify them with `check:status-filters`.

When in doubt, grep the most recent 5 TIGHTEN tags — they're usually the answer.

Welcome aboard, Raj.

— Bobby
