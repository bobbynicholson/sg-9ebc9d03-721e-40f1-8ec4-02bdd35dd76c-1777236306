# Megaprogramme Phase 0 -- paste this as the FIRST message in a fresh Claude Code session

You are the lead architect of an audit-and-implementation programme for CateringMS,
a multi-tenant catering SaaS at C:\Users\Itad Africa\Bobs-Claude-local\cateringms\
live-repo (Next.js 15 Pages Router on Vercel, Supabase Postgres + Auth, React-PDF,
Resend for email, PayFast / Yoco / Stripe for payments).

Skylight Digital (the platform owner) runs CateringMS. Catering companies sign up
as tenants. Each tenant has its own clients (end customers), staff (drivers,
kitchen, shopping, cleaning), and operations (leads, quotes, orders, invoices).
The platform is in active production with one live tenant (Spit Braai Delivery,
slug "spit-braai-delivery") plus Skylight as platform admin.

Your mission: audit every surface, journey, flow, and data path -- across all four
audiences (Skylight, tenant admin, tenant staff, tenant client) -- then implement
prioritised improvements. You have unbounded time. Quality beats speed. Ship in
incremental, verifiable phases.

================================================================================
THE FOUR AUDIENCES (and what each one needs to win)
================================================================================

A. SKYLIGHT (us, platform owner, super_admin role)
   - Sees /admin/platform/* pages: dashboard, company-database, subscription-
     management, pricing-management, trial-management, currency-monitoring,
     cms-blog, cms-pages, tax-rules, tech-costs.
   - Needs: clear unit economics, tenant health monitoring, support escalation
     paths, revenue / churn signals, system reliability dashboards.

B. CATERING COMPANY OWNER / ADMIN (tenant operator, e.g. Callum at SBD)
   - Roles: company_admin, owner, admin, sales_admin, region_admin.
   - Lives in /admin/* daily. Runs the business through this tool.
   - Needs: fast lead-to-cash flow, accurate operational visibility, low-friction
     team management, reliable comms with clients, clean financials, easy onboarding
     of new clients/menus/staff.

C. CATERING COMPANY STAFF (drivers, kitchen, shopping, cleaning)
   - Roles: driver, kitchen_staff, shopping_staff, cleaning_staff.
   - Live in /team-portal/* on mobile. Limited time, often on the move, hands
     full of equipment.
   - Needs: zero friction to see what's needed of them right now, quick state
     updates (picked up, delivered, prep done, bought, cleaned), clear allergen
     and special instruction surfacing, navigation/calling shortcuts.

D. CLIENTS (end customers, the catering company's customers)
   - Two paths: signed-up portal users (rare) and tokenised public-link users
     (most). Live in /client-portal/* (signed in) or /q/[token], /pay/i/[token],
     /c/order/[id] (public).
   - Needs: clean quote view + accept flow, easy payment, clear status updates,
     ability to request changes / cancel / postpone, professional brand
     experience that reflects the catering company, not CateringMS.

================================================================================
PROGRAMME STRUCTURE (5 phases, each gated on the previous one's report)
================================================================================

Phase 0: Reconnaissance (audit only -- do not write code)   <-- YOU ARE HERE
Phase 1: Critical fixes (P0 -- broken flows, data integrity, security)
Phase 2: Important improvements (P1 -- friction, missing affordances)
Phase 3: Polish (P2 -- visual consistency, micro-copy, accessibility)
Phase 4: Strategic upgrades (P3 -- new capabilities revealed by the audit)

Each phase must end with a written report and an explicit go/no-go from the
operator before the next phase starts. No phase 1 changes during phase 0.

================================================================================
PHASE 0: RECONNAISSANCE -- audit only, no code
================================================================================

Produce a single document at docs/audits/megaprogramme-2026-05.md covering every
section below. Be specific (file paths, line numbers, screenshot references where
DOM is involved). Imprecise reports cost the implementation phase a round trip.

Section 1: System inventory
  - List every page under src/pages/** with one-line role + audience tag.
  - List every Supabase table with row count for SBD and one-line purpose.
  - List every API route with method, auth requirement, primary purpose.
  - List every service in src/services/** with one-line responsibility.
  - List every cross-cutting concern (RLS, region scoping, slug routing,
    notification fan-out, email pipeline, PDF rendering, accounting integration,
    payment gateways, audit logs).

Section 2: Persona journey maps (one per audience)
  Walk each audience's most common journeys end-to-end, recording every step,
  every page, every API call. For each step record:
  - What the user wants
  - What the UI shows
  - What state changes
  - What can go wrong
  - Whether the failure mode is visible to the user

  Critical journeys to map:
    SKYLIGHT
      1. New tenant signed up -- can I see them, set their plan, monitor their
         first 30 days?
      2. Tenant in trouble -- where do I see warning signs (failed sends, low
         activity, billing issues)?
      3. Platform health -- where do I see system-wide errors / outages?
    TENANT ADMIN (Callum)
      1. New lead lands -> reply -> quote -> client accepts -> deposit -> order
         -> kitchen prepares -> driver delivers -> client pays balance -> review.
      2. Existing client books a repeat order via /c/account.
      3. Day-of-event chaos: a driver no-shows, a kitchen runs short of stock,
         a client requests last-minute change.
      4. Bulk import existing customer book + menu + suppliers.
      5. Set up email sending (verify domain, configure templates, send first).
      6. Configure team (invite drivers, kitchen, shopping; set rates / regions /
         shifts).
      7. End-of-month: see revenue, push to accounting, pay staff.
    TENANT STAFF
      1. Driver: morning -- see today's deliveries, navigate, mark picked up,
         capture proof on delivery, clock out.
      2. Kitchen: prep list per order, allergen check, mark done.
      3. Shopping: today's list, mark bought, scan slip, claim back from petty cash.
      4. Cleaning: today's locations, mark done.
    CLIENT
      1. Receive quote email -> open public link -> request changes -> accept
         -> pay deposit.
      2. Track order status / driver location.
      3. Receive invoice -> pay balance -> get receipt.
      4. Cancel or postpone -> see refund.
      5. Repeat-customer rebooking via account magic link.

  For each journey, score every step on:
  - Friction (1-5) -- how many clicks / how confusing
  - Reliability (1-5) -- does it work every time
  - Visibility on failure (1-5) -- if it breaks, do you know
  - Brand quality (1-5) -- does it feel professional

Section 3: Data integrity audit
  For each core entity (companies, profiles, clients, leads, quotes, orders,
  order_items, invoices, payments, refunds, notifications, kitchen_prep_tasks,
  email_provider_settings, ...):
  - Schema review -- types, nullable columns, defaults, constraints
  - RLS policies -- read / write / delete -- gaps and overly permissive cases
  - Foreign keys -- orphan-row risk, cascade behaviour
  - Soft-delete consistency -- which tables have deleted_at, are queries
    excluding them everywhere
  - Lifecycle integrity -- when a quote is accepted, does the order get every
    field it needs from the quote? When an order is amended, are downstream
    artefacts (invoice, kitchen prep, shopping list) updated?
  - Audit trails -- which mutations are logged, which aren't

Section 4: UI / UX consistency audit
  - Component reuse -- are buttons, modals, badges, tables visually consistent
    across pages, or are there 5 versions of "Save"?
  - Empty states -- does every list have a useful empty state with a clear next
    action, or just "No data"?
  - Loading states -- skeletons / spinners / shimmer -- consistent or random?
  - Error states -- toasts vs inline vs modal -- consistent? Specific copy or
    generic "Error"?
  - Form patterns -- validation feedback, required-field marking, save behaviour.
  - Mobile responsiveness -- every team-portal page on a phone, every admin
    page on a tablet.
  - Branded surfaces (client portal, public quote, emails) -- do they pick up
    the tenant's primary_color / logo correctly across every render?
  - Accessibility -- keyboard nav, focus rings, aria labels, contrast.

Section 5: Communication flows audit
  Trace every email and notification fired by the system, end to end:
  - Trigger (what event)
  - Template resolution (tenant override, global default, fallback)
  - Recipient resolution (which user, which company, which contact)
  - Delivery channel (Resend, in-app bell, SMS, WhatsApp)
  - Idempotency -- is double-fire prevented
  - Failure surfacing -- if it didn't go, does anyone find out
  - Brand quality -- subject line, body, footer, unsubscribe / sender identity

Section 6: Money flow audit
  Trace every monetary path:
  - Quote pricing (subtotal, discount, delivery, waiter, VAT, total)
  - Deposit calculation (% from company settings, override per quote)
  - Balance due tracking (paid, partial, overdue, refunded)
  - Refund flow (manual EFT, PayFast auto, retry)
  - Accounting export (Xero, manual CSV)
  - Reconciliation between payments table and orders.payment_status / amount_paid

Section 7: Onboarding gaps
  Walk a brand-new tenant through signup -> first invoice sent. Every screen.
  Every input. Every "skip" button. Every place a default got applied. Every
  place a tenant could get stuck.

Section 8: Findings ledger
  All findings categorised by:
  - Priority: P0 (broken / unsafe / blocks core flow), P1 (friction / missing),
    P2 (polish), P3 (strategic upgrade)
  - Audience: skylight / tenant_admin / tenant_staff / client / cross-cutting
  - Type: bug / data-integrity / ux / missing-feature / inconsistency /
    security / performance / a11y
  - Effort: S (under a day), M (1-3 days), L (week+), XL (multi-week)
  - File pointers where relevant

Output: docs/audits/megaprogramme-2026-05.md committed to a new branch
(audit/megaprogramme-2026-05) and pushed. No other code changes in this phase.
A pull request opens against main with the report visible in the diff.

================================================================================
STANDING RULES
================================================================================

Codebase conventions (NON-NEGOTIABLE):
- South African English in all copy: colour, centre, organise, recognise, fulfil.
- Never use em dashes. Use double-hyphen (--) or rewrite.
- No corporate filler ("leverage", "synergy", "moving forward").
- No AI cliches ("certainly", "absolutely", "of course", "great question").
- Service files use // @ts-nocheck with /* eslint-disable @typescript-eslint/
  ban-ts-comment, @typescript-eslint/no-explicit-any */ at the top. Match the
  convention of the file you're editing.
- Page files often use /* eslint-disable @typescript-eslint/no-explicit-any */.
- Use the existing UI primitives (shadcn/ui under src/components/ui/), tailwind,
  lucide-react icons. Do not introduce new component libraries.
- Tenant URLs are slug-prefixed: /spit-braai-delivery/admin/X. Use the
  useTenantHref / withSlug helpers, not raw paths.
- All admin nav uses the shared src/lib/navActiveMatcher.ts helper.
- Notification creation: every notification must deep-link to a specific entity
  page (the destination must read its query param), include
  related_entity_type + related_entity_id, fire through createNotification or
  broadcastNotification. See src/services/notifications/notificationDestinations.md
  for the source of truth.
- Order creation: every path that creates an order must call
  postOrderCreationCascade afterwards (auto-invoice + email + kitchen prep).
  Never insert into orders directly without calling the cascade.

Safety rules:
- Never disable RLS or weaken a policy without an explicit migration that
  documents the trade-off.
- Never log or surface PII (email, phone, full names of clients) in console
  output that ships to production.
- Never bypass the email comms-paused / blocked-contacts gates.
- Never skip the pre-push TypeScript hook.
- Database migrations go in supabase/migrations/ with a timestamped filename
  and a comment header explaining the why. Apply via the Supabase MCP
  apply_migration tool. Always test against the SBD live data before assuming
  the migration is safe.
- Never store encrypted credentials in plaintext.

================================================================================
START
================================================================================

Begin Phase 0 by reading:
- CLAUDE.md (in repo root)
- docs/ (every file)
- supabase/migrations/ (skim the most recent 30)
- src/pages/admin/platform/running-todo.tsx (operator's running list of
  shipped + pending items)

Then produce the Phase 0 audit document at docs/audits/megaprogramme-2026-05.md.
No code changes until that document is approved.

When in doubt, ask. When confident, ship and document. When something is
ambiguous, write the assumption down in the report.
