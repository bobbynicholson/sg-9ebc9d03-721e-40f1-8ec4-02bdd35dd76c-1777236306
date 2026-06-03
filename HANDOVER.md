# CateringMS — Developer Handover Brief

A multi-tenant SaaS for catering companies. Each tenant gets a white-labelled portal (admin / team / client / public) under their own slug at `cateringms.com/{slug}/...`. Production is live on Vercel + Supabase.

---

## 1. Codebase

| Item | Value |
| --- | --- |
| Language | TypeScript (strict off, null-checks off — pragmatic mode) |
| Framework | **Next.js 15.2.8** — Pages Router (NOT App Router), Turbopack dev |
| React | 18.3.1 |
| Node | 22 LTS (Vercel default) |
| Repo | https://github.com/bobbynicholson/sg-9ebc9d03-721e-40f1-8ec4-02bdd35dd76c-1777236306 |
| Branch | `main` (PRs squash-merge, branch protection on) |
| Style / UI | Tailwind 3.4 + tailwindcss-animate, shadcn/ui (Radix primitives), lucide-react icons |
| Forms | react-hook-form + zod |
| Charts | recharts |
| PDFs | @react-pdf/renderer (server-side), jspdf (client fallback) |
| Maps | react-leaflet + Leaflet (no Google Maps in app shell) |
| Animations | framer-motion |
| Tests | Jest + React Testing Library (`npm test` for watch, `npm run test:ci` for CI) |
| Lint | ESLint (`eslint-config-next`) |
| Typecheck | `npx tsc --noEmit` runs in GitHub Actions on every PR |

### Repo conventions

- `/src/pages/api/**` — Next API routes (REST endpoints)
- `/src/pages/{admin,team-portal,client-portal,c,q,pay}/**` — page surfaces
- `/src/services/**` — domain logic (orderWorkflow, emailService, refundService, etc.)
- `/src/lib/**` — pure helpers + integrations
- `/src/components/**` — UI components (shadcn under `/ui`, domain under `/admin`, `/billing`, etc.)
- `/supabase/migrations/**` — every DB change. Timestamped filename. Applied to live DB via Supabase MCP.
- `/scripts/**` — repo guardrails (`check:status-filters`, `check:migration-rls`, `check:realtime-channels`)
- House style: NO em dashes, NO `--` double-hyphens in code comments, SA English in user copy. See `CLAUDE.md` for the full rule set.

---

## 2. Hosting + Deploys

| Item | Value |
| --- | --- |
| Hosting | **Vercel** |
| Vercel team | `team_uXUuF5exdXVD2qQvpH3gBm3b` |
| Vercel project | `prj_SmtixfxdYs5ARJdMBt5gFiKcdZNK` (display name `sg-ebc6a518...`) |
| Production domain | `cateringms.com` (apex) |
| Deploy on | push to `main` (auto) + every PR gets a preview deploy |
| Edge config | `next.config.mjs` rewrites `/{slug}/admin/*`, `/{slug}/q/*`, `/{slug}/c/order/*`, `/{slug}/pay/i/*` to the bare paths with `?company_slug=`. See file for full list. |
| Headers / cache | `Cache-Control: no-store` on every HTML / JSON response, immutable cache on `/_next/static/*`. See `next.config.mjs > headers()`. |
| CI checks | GitHub Actions: `typecheck` + Vercel preview deploy + Vercel preview comments. All required to merge. |

---

## 3. Database + Auth

| Item | Value |
| --- | --- |
| DB / Auth | **Supabase** (managed Postgres + GoTrue auth) |
| Project ref | `vsuyzovzqtrngorpqnhy` (region `eu-north-1`) |
| Project name | `cateringms2` |
| Postgres | 17.6 |
| Realtime | enabled on `quotes`, `orders`, plus tenant tables that subscribe (publication: `supabase_realtime`) |
| RLS | enabled on every public table. Helpers: `get_user_company_id(uid)`, `user_can_access_region(region_id)`, plus tenant_isolation_* policies on each table |
| Auth flows | Supabase email/password for staff; magic-link tokens for clients (custom, see `client_access_tokens` table and `mint_client_*_token` RPCs) |
| Migrations | SQL files in `/supabase/migrations/` — applied to prod via Supabase MCP server. There is NO `supabase db push` workflow; the file is the spec, prod is the source of truth, every migration includes its TIGHTEN tag and rationale comment. |

### Key tables to know

- `companies` — one row per tenant. `slug`, `primary_color`, `accent_color`, `cancellation_policy` (jsonb), `email_settings`, etc.
- `quotes` → `orders` (1:1 via `orders.quote_id` + `quotes.converted_to_order_id`). `quotes.menu_items` and `quotes.equipment_items` are jsonb arrays; `orders` has separate `order_items` and `equipment_bookings` tables.
- `payments`, `invoices`, `cancellation_requests` — money trail. `payments.payment_type` includes `deposit`, `balance`, `refund`, `credit_issue`.
- `client_access_tokens` — 24h tokens for `/c/order/{id}?t=...` magic links. Minted by `mint_client_order_token(p_company_id, p_order_id, p_label, p_ttl_hours)` RPC.
- `audit_logs` — generic forensics row (action, entity_type, entity_id, metadata jsonb). Stamped from cancel / purge / resync / cancellation flows.
- `email_provider_settings` — per-tenant Resend / SMTP config. `email_templates` — per-tenant overrides + global defaults.

---

## 4. Email

| Item | Value |
| --- | --- |
| Primary provider | **Resend** (org-level account). Tenants can override with their own Resend domain via `email_provider_settings`. |
| SMTP fallback | nodemailer (any tenant can paste in host / user / pass) |
| Templating | tenant override -> global default -> hardcoded fallback ladder via `resolveEmailTemplate` in `src/services/email/templateResolver.ts` |
| Branded shell | `src/services/email/brandedEmailShell.ts` wraps every send in a tenant-branded HTML email (colour, name, contact footer). Auto-fires from `emailService.sendEmailDetailed`. |
| Compliance | List-Unsubscribe header + one-click unsubscribe `/u/[token]` (HMAC-signed via `EMAIL_UNSUBSCRIBE_SECRET`) |
| Critical paths | `/api/send-email` (generic), `quoteService._fireQuoteSentEmail`, `cancellationEmails.ts`, `orderWorkflow.ts > sendStatusNotifications` |

---

## 5. Payments

| Item | Value |
| --- | --- |
| Client deposit / balance | **PayFast** (SA gateway). Live + sandbox toggled by `NEXT_PUBLIC_PAYFAST_TEST_MODE`. |
| Subscription billing (platform) | **Stripe** + PayFast (subscription tier — tenants pay CateringMS) |
| Refund path | `src/services/refundService.ts > processRefund()` — auto-fires for PayFast, manual EFT otherwise. Status lives in `payments.payment_status`. |
| Webhooks | `/api/webhooks/payment-confirmation` (PayFast ITN), `/api/webhooks/subscriptions/stripe`, `/api/webhooks/subscriptions/payfast`, `/api/webhooks/yoco-confirmation` (Yoco is a different SA gateway, lightly used) |

---

## 6. Accounting integrations

| Item | Value |
| --- | --- |
| Xero | OAuth flow, sync invoice + credit-note + void. Endpoints under `/api/accounting/xero/*`. |
| QuickBooks | OAuth, sync invoice. Endpoints under `/api/accounting/quickbooks/*`. |
| Sage | OAuth, sync invoice + payment. Endpoints under `/api/accounting/sage/*`. |
| Token storage | `accounting_integrations` table, encrypted with `ENCRYPTION_KEY` env var (32-byte hex, AES-256-GCM). |

---

## 7. Observability + ops

| Item | Value |
| --- | --- |
| Errors | **Sentry** — `SENTRY_DSN` server, `NEXT_PUBLIC_SENTRY_DSN` client. Wrapper in `src/lib/observability.ts > captureException()`. Use this for every catch in money-touching flows. |
| Cron jobs | Vercel cron + `CRON_SECRET` header. Job files in `/src/pages/api/cron/*`. |
| Audit | `audit_logs` table + `order_status_history` + `cancellation_requests` rows. |
| Repo guardrails | `npm run check:status-filters`, `check:migration-rls`, `check:realtime-channels` — run in CI. |

---

## 8. Third-party APIs in code

| Service | Used for | Env var(s) |
| --- | --- | --- |
| Google Maps | venue address autocomplete | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` |
| Cloudflare Turnstile | public form CAPTCHA on `/api/public/embed/*/submit` and `/api/public/quotes/*/change-request` | `TURNSTILE_SECRET_KEY` |
| WhatsApp Cloud API | quote send via WhatsApp (optional per tenant) | `NEXT_PUBLIC_APP_ORIGIN` |

---

## 9. Environment variables

Live values are in **Vercel project settings → Environment Variables**. Below is the full list of what the code reads, grouped by what they unlock.

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
RESEND_WEBHOOK_SECRET         # bounces / complaints webhook
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

## 10. Access checklist for Raj

Hand over in this order so he can be productive within the first day.

### Tier 1 — code + deploys

- [ ] **GitHub** — invite to repo `bobbynicholson/sg-9ebc9d03-721e-40f1-8ec4-02bdd35dd76c-1777236306` (Admin or Write role)
- [ ] **Vercel** — invite to team `team_uXUuF5exdXVD2qQvpH3gBm3b`, project `sg-ebc6a518...` (Developer role is enough)
- [ ] **Supabase** — invite to project `cateringms2` (`vsuyzovzqtrngorpqnhy`) as Developer
- [ ] **Local env file** — share a copy of the Vercel env vars (use `vercel env pull` once invited)

### Tier 2 — money + comms

- [ ] **Resend** dashboard — invite to the org account so he can see domain status + delivery logs
- [ ] **PayFast merchant dashboard** — read-only first, full once he's reviewed the webhook flow
- [ ] **Stripe** — `read-only` role on the platform Stripe account
- [ ] **Xero / QuickBooks / Sage** developer dashboards — only when he starts touching accounting code

### Tier 3 — supporting

- [ ] **Sentry** — invite to the project so he sees errors as they fire
- [ ] **Cloudflare** account — DNS for `cateringms.com` (you might host DNS elsewhere — share whichever it is)
- [ ] **Google Cloud** console for the Maps API key
- [ ] **WhatsApp Business** API console — only if extending the WhatsApp quote-send

### Tier 4 — admin access inside the app

- [ ] Create a `super_admin` user for Raj in the app itself so he can see every tenant. This is separate from the GitHub / Vercel / Supabase invites — it's an app-level role. Create via `/admin/users` after he's signed in, or insert directly into `profiles` with `role='super_admin'`.

---

## 11. Quick orientation for Raj's first hour

```bash
git clone https://github.com/bobbynicholson/sg-9ebc9d03-721e-40f1-8ec4-02bdd35dd76c-1777236306.git
cd sg-9ebc9d03-721e-40f1-8ec4-02bdd35dd76c-1777236306
npm install
vercel link                  # pick the existing project
vercel env pull .env.local   # downloads all env vars to local
npm run dev                  # http://localhost:3000
```

Then read in this order:

1. `CLAUDE.md` — Bobby's working style + house rules (em dash ban, SA English, no Cloudflare suggestions, etc.)
2. `next.config.mjs` — every tenant rewrite + the redirect map
3. `src/middleware.ts` — auth gating + tenant slug enforcement
4. `src/services/emailService.ts` — central send pipeline
5. `src/services/order/orderWorkflow.ts` + `releaseResources.ts` — order lifecycle + cancellation cascade
6. `src/services/quote/propagateQuoteEdit.ts` + `src/pages/api/quotes/[id]/resync-order.ts` — quote → order mirror
7. `supabase/migrations/` — newest 10 files explain the most recent state

Latest TIGHTEN tag is **I.128**. The TIGHTEN counter is the audit-tracking convention — every notable behaviour change in the repo gets a `TIGHTEN I.NNN (date)` comment plus a matching PR title so the history is searchable.

---

## 12. Open work + known sharp edges

- **Test orders ORD-003830 + ORD-003831** are still sitting in /admin/orders for tenant `spit-braai-delivery`. Use the new `/admin/orders` → row → "Cancel or remove" → **Purge** path to wipe them. The flow ships in PR #495 (TIGHTEN I.121).
- **Owner-side dashboard** (separate from /admin/dashboard) — deferred. Owner == company_admin for now.
- **PDF cache** is keyed on `quoteUpdatedAt` + `companyUpdatedAt` and lives in process memory (`src/services/pdf/pdfCache.ts`). Survives one warm Vercel instance, dies on cold start.
- **Magic-link tokens** for `/c/order/{id}?t=...` are 24h TTL (TIGHTEN I.123). Status-change emails sent via `customerLinksServer.ts` mint 60-day tokens by default. If a client reports an expired link, they should click the original email link again — the `/q/{token}` quote token is permanent and re-bridges every click.
- **Realtime publication** must include any new table that needs live cross-tab updates. Use `npm run check:realtime-channels` to spot subscriptions that point at tables NOT in the publication.
