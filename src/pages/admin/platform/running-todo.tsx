import { useState } from "react";
import Head from "next/head";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { PortalShell, PortalHeader, PortalCard, StatTile,
  PageWorkbench,
} from "@/components/portal/ui";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import {
  ShieldAlert,
  Database,
  Banknote,
  Layout,
  GitBranch,
  Type,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ListChecks,
  Server,
  Users,
  Mail,
  Sparkles,
  Plug,
  TestTube,
  Rocket,
  Target,
  AlertCircle,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  FileText,
  Globe,
  Award,
  Flag,
  MessageSquare,
  ScanLine,
  Package,
  Lightbulb,
  Headphones,
  Layers,
  Shield,
  BookOpen,
} from "lucide-react";

type Status = "shipped" | "in_progress" | "todo" | "blocked";

const statusTone: Record<Status, string> = {
  shipped:     "bg-brand-primary/15 text-brand-primary border-brand-primary/20",
  in_progress: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  todo:        "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  blocked:     "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
};

const statusLabel: Record<Status, string> = {
  shipped: "Shipped", in_progress: "In progress", todo: "Todo", blocked: "Blocked",
};

const statusIcon: Record<Status, React.ComponentType<{ className?: string }>> = {
  shipped: CheckCircle2, in_progress: AlertTriangle, todo: Circle, blocked: AlertCircle,
};

interface Item { title: string; detail?: string; status: Status; ref?: string; }

interface SprintCard {
  id: string;
  title: string;
  why: string;
  estimate?: string;
  risk?: "Low" | "Medium" | "High";
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  defaultOpen?: boolean;
  items: Item[];
}

interface Group {
  id: string;
  title: string;
  description: string;
  cards: SprintCard[];
}

// =====================================================================
// GROUP 1 - FOUNDATION: WHAT'S BUILT
// =====================================================================
const builtFeatures: SprintCard[] = [
  {
    id: "core-platform",
    title: "Core platform infrastructure",
    why: "Multi-tenant SaaS architecture, Next.js 15.2 + Supabase + TypeScript, mobile responsive.",
    icon: Server,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Multi-tenant B2B SaaS architecture", status: "shipped" },
      { title: "Custom company URLs (cateringms.com/{slug})", status: "shipped" },
      { title: "Next.js 15.2 frontend (Page Router)", status: "shipped" },
      { title: "TypeScript throughout (note: 14 money services carry @ts-nocheck, see Phase 2F)", status: "shipped" },
      { title: "Supabase Postgres backend (138 tables, 4 views, 15 enums)", status: "shipped" },
      { title: "Row-level security (note: 3 tables ship USING(true) policies, see Phase 2B)", status: "shipped" },
      { title: "Auto-generated TypeScript types (database.types.ts)", status: "shipped" },
      { title: "Mobile responsive across all portals", status: "shipped" },
      { title: "Dark mode support", status: "shipped" },
    ],
  },
  {
    id: "auth-roles",
    title: "Authentication and roles",
    why: "Supabase Auth with 8-role RBAC, protected routes, tenant isolation at DB level.",
    icon: Users,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Supabase Auth (email + OAuth: Google, Facebook)", status: "shipped" },
      { title: "8-role system: super_admin, company_admin, admin, owner, kitchen_staff, shopping_staff, driver, cleaning_staff, client", status: "shipped" },
      { title: "Protected routes via middleware + ProtectedRoute component", status: "shipped" },
      { title: "Tenant slug routing (/[company_slug]/admin/...)", status: "shipped" },
      { title: "Tokenised client access (one-shot magic links, no signup)", status: "shipped" },
      { title: "Password reset, magic-link sign-in", status: "shipped" },
    ],
  },
  {
    id: "portals",
    title: "8 portals (super admin, admin, kitchen, shopping, driver, cleaning, client, tokenised client)",
    why: "Each role has a tailored dashboard and workflow surface.",
    icon: Layout,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Super Admin: company DB, subscriptions, trial expiry, platform analytics, blog/CMS, currency monitor", status: "shipped" },
      { title: "Company Admin: dashboard, leads, quotes, orders, calendar, inventory, equipment, drivers, financial reporting, route planning", status: "shipped" },
      { title: "Kitchen Portal: tasks, prep lists, on-duty board, time clock, dishwasher cycles", status: "shipped" },
      { title: "Driver Portal: routes, GPS tracking, earnings, departure calculator, replacement requests", status: "shipped" },
      { title: "Cleaning Portal: equipment verification, broken reporting, cleaning workflow tracker, floor safety", status: "shipped" },
      { title: "Shopping Portal: lists, suppliers, smart shopping, current stock (built today), receipt scanner", status: "shipped" },
      { title: "Client Portal: order history, payment schedules, GPS tracking, invoices, billing", status: "shipped" },
      { title: "Tokenised client view (/c/order/[id]?t=ord_xxx)", status: "shipped" },
    ],
  },
  {
    id: "email-payments",
    title: "Email automation + payments",
    why: "1,144-line email service, PayFast + Stripe integration, 12-month after-sales automation.",
    icon: Mail,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Staff invitation + welcome emails", status: "shipped" },
      { title: "Quote request auto-reply", status: "shipped" },
      { title: "Custom quote with pricing", status: "shipped" },
      { title: "Order confirmation + delivery tracking emails", status: "shipped" },
      { title: "Balance reminders (14 / 7 / 3 / 1 days)", status: "shipped" },
      { title: "12-month after-sales automation (6 emails)", status: "shipped" },
      { title: "Per-company template management", status: "shipped" },
      { title: "PayFast integration (ZAR)", status: "shipped" },
      { title: "Stripe integration (US / UK)", status: "shipped" },
      { title: "Deposit + balance payment schedules", status: "shipped" },
      { title: "Payment link generation", status: "shipped" },
      { title: "Webhook handling + receipt generation (note: idempotency gap, see Phase 2C)", status: "shipped" },
      { title: "Refund processing logic", status: "shipped" },
    ],
  },
  {
    id: "advanced",
    title: "Advanced features",
    why: "GPS tracking, AI services, gamification, multi-region, integrations.",
    icon: Sparkles,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Real-time GPS driver tracking", status: "shipped" },
      { title: "Route optimisation", status: "shipped" },
      { title: "Geofencing arrival detection", status: "shipped" },
      { title: "AI financial insights", status: "shipped" },
      { title: "AI recipe scaling", status: "shipped" },
      { title: "Staff gamification (points + achievements)", status: "shipped" },
      { title: "Multi-region (ZA, US, UK) with currency switching", status: "shipped" },
      { title: "Xero accounting integration (note: token-refresh gap, see Phase 2E)", status: "shipped" },
      { title: "WhatsApp Business API framework (note: needs templates approved)", status: "shipped" },
      { title: "Receipt scanner (OCR-ready)", status: "shipped" },
      { title: "Time clock system", status: "shipped" },
      { title: "ChatBot assistant", status: "shipped" },
      { title: "Zapier integration (outbound webhooks + inbound API + recipe gallery)", status: "shipped" },
      { title: "Mega menus + branded admin nav + mobile menu rebuild", status: "shipped" },
      { title: "Smart Shopping at /admin/shopping (procurement brain)", status: "shipped" },
    ],
  },
  {
    id: "infra",
    title: "Hosting + observability",
    why: "Vercel auto-deploy from GitHub, Supabase managed, custom domain.",
    icon: Server,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "GitHub repo wired to Vercel auto-deploy on push to main", status: "shipped" },
      { title: "Custom domain cateringms.com", status: "shipped" },
      { title: "Supabase project vsuyzovzqtrngorpqnhy", status: "shipped" },
      { title: "Environment variables for all integrations (some pending real keys)", status: "shipped" },
      { title: "Speed Insights + Analytics enabled on Vercel", status: "shipped" },
    ],
  },
];

// =====================================================================
// GROUP 2 - AUDIT FINDINGS: PHASE 1 (SHIPPED) + PHASE 2 (PLANNED)
// =====================================================================
const auditCards: SprintCard[] = [
  {
    id: "phase-1",
    title: "Phase 1, Pre-meeting safe set (shipped)",
    why: "Audit-derived fixes that ship without risking the live demo. No functional change to logins, navigation or role access.",
    estimate: "~2 hours, complete",
    risk: "Low",
    icon: CheckCircle2,
    accent: "from-brand-primary to-brand-secondary",
    defaultOpen: true,
    items: [
      { title: "Delete 11 fossil scripts at repo root", detail: "apply_migration.js, fix_*.js, force_deploy.js etc, zero refs", status: "shipped", ref: "c1fbecf" },
      { title: "Delete 3 dead components", detail: "AddressAutocomplete root dupe, JobProgressTracker (552 LOC), InvoiceGenerator", status: "shipped", ref: "c1fbecf" },
      { title: "Delete src/services/operations/ + operationsService.ts", detail: "Parallel order/inventory CRUD with zero external importers", status: "shipped", ref: "c1fbecf" },
      { title: "globals.css, xl:pl-72 collapse rule", detail: "Sidebar collapse now reclaims 208px on xl screens", status: "shipped", ref: "c1fbecf" },
      { title: "Create lib/statusTokens.ts", detail: "Single source of truth for status colour vocabulary, orphan helper", status: "shipped", ref: "c1fbecf" },
      { title: "userManagementService.searchUsers companyId param", detail: "Defensive .eq(company_id), no current callers, no behaviour change", status: "shipped", ref: "c1fbecf" },
      { title: "Build Current Stock page", detail: "Wires inventory_items table, click-to-edit with audit trail via inventory_transactions", status: "shipped", ref: "739a463" },
      { title: "Build /admin/running-todo (this page)", detail: "Phase 2 backlog visible from inside the tool", status: "shipped", ref: "739a463" },
      { title: "Add Running Todo to PlatformNav (SaaS owner sidebar)", status: "shipped", ref: "4799515" },
      { title: "Merge old roadmap into running-todo accordion structure", status: "shipped" },
    ],
  },
  {
    id: "2A",
    title: "Phase 2A, Security holes",
    why: "Real money + legal exposure. Anyone with the URL can become super_admin in any tenant today.",
    estimate: "1-2 days",
    risk: "Medium",
    icon: ShieldAlert,
    accent: "from-rose-500 to-rose-500",
    items: [
      { title: "Remove ?dev=true URL backdoor", detail: "Resolved. AuthContext.tsx gates the dev shortcut on process.env.NODE_ENV !== \"production\" before checking hostname or query string. Production builds never honour ?dev=true.", status: "shipped", ref: "src/contexts/AuthContext.tsx:74" },
      { title: "Lock down /api/admin/create-user", detail: "Resolved. Handler enforces CALLER_ROLES_ALLOWED (super_admin / company_admin / admin / owner) by looking up the caller's profile.active_role on the authenticated session. Role + company_id from the request body are ignored unless the caller is authorised.", status: "shipped", ref: "src/pages/api/admin/create-user.ts:79" },
      { title: "Lock down /api/test-email and /api/send-email", detail: "Resolved. Both endpoints require an authenticated session (ssr.auth.getUser) + profile.company_id + role check. No open relay path remains.", status: "shipped", ref: "src/pages/api/send-email.ts:56" },
      { title: "OAuth state validation (Xero, QuickBooks)", detail: "Resolved. Both /api/accounting/xero/callback and /api/accounting/quickbooks/callback validate the state query param against an HttpOnly oauth_state cookie issued at /authorize, then clear the cookie single-use. Mismatch returns 400 instead of completing the OAuth handshake.", status: "shipped", ref: "src/pages/api/accounting/xero/callback.ts:27" },
      { title: "Tighten middleware file-extension regex", detail: "Resolved. middleware.ts now matches a trailing-segment regex covering ico/png/jpg/jpeg/webp/svg/gif/avif/woff/woff2/css/js/map/txt/xml/json/pdf instead of the crude pathname.includes('.') check. Routes like /clients/john.doe stop bypassing the session check.", status: "shipped", ref: "src/middleware.ts:212" },
      { title: "Per-key rate limit on /api/integrations/{leads,quotes,invoice-paid}", detail: "Resolved. All three endpoints call consumeApiKeyRateLimitDb (60/min cap per key hash) with an in-memory fallback if the DB ledger is unreachable [P2F-2]. A leaked Zapier key gets capped at 60 requests/min instead of unlimited pollution.", status: "shipped", ref: "src/pages/api/integrations/leads.ts:53" },
      { title: "Tighten cookie scope on tokenised client view", detail: "Resolved. cms_client_token_<orderId> and cms_client_account_token now set with Path=/c so the cookie never ships on /api, /admin, or tenant pages. Clear-cookie paths send both Path=/c AND Path=/ to wipe legacy rows from the pre-narrowing window.", status: "shipped", ref: "src/pages/api/client-tokens/validate.ts:90" },
      { title: "Sign-out completeness", detail: "Resolved. signOutAndRedirect iterates every (domain, path) combination: bare host, apex (cateringms.com), .apex, plus paths / /c /q /pay /client-portal /admin. Followed by localStorage.clear + sessionStorage.clear. No Domain=.cateringms.com cookies survive.", status: "shipped", ref: "src/lib/signOut.ts:81" },
    ],
  },
  {
    id: "client-portal-isolation",
    title: "Client portal, data isolation + auth (in progress)",
    why: "Bobby's hard rule: client data CAN NOT leak across accounts, ever. The client-portal rebuild brought magic-link auth, real-data dashboard, ratings + rebook flow. Hardening now ensures each Spit Braai (or any tenant) client only ever sees their own orders.",
    estimate: "Mostly shipped. SMTP wiring still pending per tenant.",
    risk: "High",
    icon: ShieldAlert,
    accent: "from-rose-500 to-rose-500",
    defaultOpen: true,
    items: [
      // Shipped: data isolation
      { title: "RLS leak fix on orders / clients / gps_tracking / delivery_feedback", detail: "Old policies used `company_id = get_user_company_id(auth.uid())` which let any client of the company query every other client's orders. Migration `tighten_client_rls_no_cross_client_leak` splits the policy: staff (role <> 'client') see all in their company, clients see only rows where they're the data subject (client_id linked or client_email match for pre-signup orders).", status: "shipped" },
      { title: "Magic-link auth for /[slug]/login", detail: "Email-only sign-in for clients. Generates Supabase magic link via service role, dispatches via the catering company's existing emailService.sendEmail (per-tenant SMTP / Resend).", status: "shipped" },
      { title: "Auto-provision client profile on first sign-in", detail: "Server-side endpoint /api/auth/client-provision-profile creates the profiles row with role hard-coded to 'client'. Backfills clients.user_id link by email match so historical orders surface immediately.", status: "shipped" },
      { title: "Tenant-scoped /[slug]/client-portal/* URLs", detail: "Next.js rewrite maps the slug-prefixed URL onto the existing /client-portal/* page tree. Slug stays in the browser URL bar (white-label).", status: "shipped" },
      { title: "Client dashboard rebuild, branded hero + countdown + live tracking + past events + rebook", detail: "Phases 3 + 4 of the rebuild. Real-time orders subscription, embedded ClientTrackingMap when out_for_delivery, star ratings via delivery_feedback join, one-tap rebook submits a leads row to the catering company.", status: "shipped" },
      { title: "Email-config RLS bug fix", detail: "emailService.getEmailConfig used the browser anon supabase client which RLS-blocked unauthenticated magic-link callers from reading email_settings, so emails never sent. Now accepts an optional service-role client.", status: "shipped" },
      // Cross-tenant isolation audit (Bobby: data CANNOT leak across accounts, ever)
      { title: "AUDIT: companies + profiles USING(true) policies removed", detail: "Both tables had SELECT policies open to anon. companies leaked embed_token, billing/subscription state, tax_number, registration_number, owner_id, headquarters_lat/lng, contact info for every catering company. profiles leaked id_number, drivers_license_number/expiry, date_of_birth, hourly_rate, employee_number, home_postcode, vehicle_registration for every staff member, POPIA/GDPR concern. Migration tighten_companies_profiles_embed_rls drops both, adds tight role-scoped policies on profiles (own + same-company-staff + super_admin), and routes anon login lookups through new SECURITY DEFINER RPC `get_company_branding(slug)` which returns only branding fields.", status: "shipped" },
      { title: "AUDIT: embed_form_submissions + embed_rate_limits USING(true) ALL policies removed", detail: "Despite policy names like 'service_role_only_*' the actual USING(true) clause let any role read/write/delete. service_role bypasses RLS automatically, no policy needed. Tables now have RLS enabled with no permissive policies; only the public embed-form API endpoints (which use service-role) can touch them.", status: "shipped" },
      { title: "AUDIT: views with security_invoker=off fixed", detail: "inventory_demand_outlook + order_ingredient_demand were running as the view-creator (postgres) and bypassing RLS, exposing every tenant's orders / recipes / inventory to any authenticated user. Both now have security_invoker=on so the underlying tables' RLS applies to whoever queries them.", status: "shipped" },
      { title: "AUDIT: SECURITY DEFINER token-minters revoked from anon/authenticated", detail: "mint_client_account_token(company_id, email), callable by anon, minted a 180-day access token for ANY catering company's client view by ANY email. mint_client_order_token same for orders, 60 days. dispatch_webhook(company_id, event_type, payload), callable by anon, could fire arbitrary webhook events to any company's configured URLs. Zero callers in the codebase. EXECUTE revoked from anon + authenticated; service_role still bypasses these privileges anyway.", status: "shipped" },
      { title: "AUDIT verified: api_create_lead/quote/mark_invoice_paid + client_view_order/account properly tenant-scoped", detail: "All four api_* functions look up the API key by hash, derive company_id from the key's row, and write/read scoped to that company. client_view_* functions look up the token, derive company_id from the token's row, and filter results by company_id + client_email. No leak vector in any.", status: "shipped" },
      // Pending (still on the watchlist)
      { title: "Configure email_settings per tenant so magic-link emails actually deliver", detail: "Per-company SMTP or Resend credentials need to be saved on /admin/email-settings for each catering company. Until done, no magic-link email arrives in production. Each tenant owns their sender so the email feels white-label.", status: "todo" },
      { title: "Remove DEV_RETURN_MAGIC_LINK once SMTP is wired", detail: "Temporary server flag. When true, /api/auth/client-magic-link returns the magic link in the response body so the frontend redirects directly. NEVER safe in production, anyone could log in as anyone with one click. Currently set on Vercel for testing while emails aren't configured.", status: "in_progress" },
      { title: "Rotate the SUPABASE_SERVICE_ROLE_KEY", detail: "The key was pasted into a chat session during config. Roll it via Supabase Dashboard -> Project Settings -> API once magic-link delivery is verified.", status: "todo" },
      { title: "Re-audit tables added by future migrations against the same template", detail: "Every new table needs: RLS enabled, no USING(true), tenant-scoped SELECT (staff via company_id + role check, clients via narrow link). Every new SECURITY DEFINER function needs to enforce its own tenant scoping. Every new view needs security_invoker=on. Every new public API endpoint needs to derive company_id from a verified key/token, never from request body.", status: "todo" },
      { title: "Set ANTHROPIC_API_KEY env var on Vercel (Production scope)", detail: "Required for the AI Onboarding Importer (/admin/onboarding/import) to actually call Haiku for column mapping. Without it, the upload + preview + commit steps still work (everything's deterministic) but the mapping step 500s with a clear error. Optional companion: ANTHROPIC_IMPORT_MODEL (defaults to claude-haiku-4-5).", status: "todo" },
    ],
  },
  {
    id: "2B",
    title: "Phase 2B, Schema canonical + indexes + RLS",
    why: "Repo and live DB have drifted, no SQL file matches live. 67 tables have company_id with no index. Three tables ship USING(true) policies.",
    estimate: "1-2 days",
    risk: "Medium",
    icon: Database,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "pg_dump live -> single canonical migration", detail: "Commit as supabase/migrations/<ts>_capture_drift.sql", status: "todo" },
      { title: "Archive 5 of the 6 root-level SQL files", detail: "MASTER_SCHEMA_V2, CLEAN_SCHEMA, etc, all stale", status: "todo" },
      { title: "ENABLE RLS on app_config + add admin-only policy", detail: "Resolved. Migration 20260520060000 turns RLS on for app_config and adds policy app_config_super_admin_all gating SELECT / INSERT / UPDATE / DELETE on profiles.active_role = 'super_admin'. service_role bypass keeps server code reading via getServiceSupabase() unaffected.", status: "shipped", ref: "supabase/migrations/20260520060000_enable_rls_app_config.sql" },
      { title: "Replace USING(true) policies on companies + profiles", detail: "Resolved. Verified via pg_policy introspection: zero policies on public.companies or public.profiles match USING(true) any more. Tenant + email harvest by anon is closed.", status: "shipped", ref: "pg_policy on public.companies + public.profiles" },
      { title: "Add 67 missing company_id indexes", detail: "Shipped. Migration 20260520020000_add_company_id_indexes_high_traffic adds 47 idx_<table>_company_id indexes on every tenant-scoped operational table that didn't already have one. The two skipped names (driver_shifts, won_then_cancelled_quotes) are views and can't be indexed. The other two index entries (order_id child tables, user_id / driver_id) remain to be audited.", status: "shipped", ref: "supabase/migrations/20260520020000_add_company_id_indexes_high_traffic.sql" },
      { title: "Add 18 missing order_id indexes on child tables", detail: "Shipped. Migration 20260520050000 adds 10 idx_<table>_order_id indexes covering client_access_log, complaints, delivery_route_stops, equipment_bookings / damages / shortage_flags, gamification_points, kitchen_duty_shifts, order_status_history, payment_reminders.", status: "shipped", ref: "supabase/migrations/20260520050000_add_order_user_driver_id_indexes.sql" },
      { title: "Add 20 missing user_id / driver_id indexes", detail: "Shipped. Same migration 20260520050000 adds 21 user_id + 5 driver_id indexes covering audit_logs, complaints, equipment + bookings, payments, payment_reminders, shopping_lists / items, user_departments, deliveries, delivery_route_stops + routes, driver_rest_logs, vehicle_bookings (et al).", status: "shipped", ref: "supabase/migrations/20260520050000_add_order_user_driver_id_indexes.sql" },
      { title: "ALTER VIEW inventory_demand_outlook SET (security_invoker = on)", detail: "Resolved. Both inventory_demand_outlook and order_ingredient_demand have reloptions={security_invoker=on}. driver_shifts ditto. won_then_cancelled_quotes was the last lagging view; flipped on by 20260520030000.", status: "shipped", ref: "supabase/migrations/20260520030000_clients_unique_email_and_won_cancelled_view.sql" },
      { title: "Backfill + ALTER companies.slug SET NOT NULL", detail: "Resolved. companies.slug is_nullable=NO confirmed via information_schema.", status: "shipped" },
      { title: "ALTER staff_invitations company_id NOT NULL + role to enum", detail: "Resolved. Migration 20260520070000 ALTERs company_id SET NOT NULL and converts role from text to the user_role enum. Table was empty (0 rows) so no backfill was needed. Future typo'd role strings (kitchen vs kitchen_staff) now reject at the DB layer.", status: "shipped", ref: "supabase/migrations/20260520070000_staff_invitations_tighten_constraints.sql" },
      { title: "ALTER orders.status SET NOT NULL", detail: "Resolved. orders.status is_nullable=NO confirmed via information_schema.", status: "shipped" },
      { title: "Add (company_id, email) UNIQUE on clients", detail: "Resolved. Partial unique index uq_clients_company_lower_email on (company_id, lower(email)) WHERE email IS NOT NULL AND deleted_at IS NULL. Verified zero pre-existing duplicates before applying.", status: "shipped", ref: "supabase/migrations/20260520030000_clients_unique_email_and_won_cancelled_view.sql" },
      { title: "Tighten audit_logs and notifications INSERT policies", detail: "Resolved. audit_logs INSERT now requires service_role OR (user_id IS NULL OR user_id = auth.uid()) AND company_id matches caller's profile. notifications already had the tenant_or_self_create_notifications policy (recipient_id = self OR user_id = self OR company_id = caller's).", status: "shipped", ref: "supabase/migrations/20260520040000_tighten_audit_logs_insert_policy.sql" },
    ],
  },
  {
    id: "2C",
    title: "Phase 2C, Money safety",
    why: "PayFast webhook can be replayed for double credits. Invoice numbers will collide. FX rates rot daily. Order can flip from pending to delivered skipping payment.",
    estimate: "3-5 days",
    risk: "High",
    icon: Banknote,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "PayFast webhook idempotency", detail: "Resolved. isDuplicatePayFastPayment() at line 686 of payment-confirmation.ts checks gateway_transaction_id against payments before re-running the side-effect cascade. Webhook returns 200 'Already processed' on re-fires.", status: "shipped", ref: "src/pages/api/webhooks/payment-confirmation.ts:686" },
      { title: "PayFast webhook, raw body for signature", detail: "Resolved. bodyParser is disabled in handler config; readRawBody() reconstructs the form-encoded payload and signature is verified against it directly before any field is trusted.", status: "shipped", ref: "src/pages/api/webhooks/payment-confirmation.ts:209" },
      { title: "PayFast IP allowlist + 300s replay window", detail: "Partial: IP allowlist shipped via PAYFAST_ALLOWED_IPS env at isAllowedPayFastIp() (line 164). The 300s replay window is partially covered by the gateway_transaction_id idempotency guard; an explicit timestamp-based window would be defense-in-depth.", status: "todo", ref: "src/pages/api/webhooks/payment-confirmation.ts:164" },
      { title: "Atomic invoice numbering", detail: "Resolved. consume_next_document_number SECURITY DEFINER RPC uses SELECT FOR UPDATE on company_number_settings + atomic increment. Handles year resets, padding, prefix per doc type. Used by invoiceService + recurring-invoices cron.", status: "shipped", ref: "src/services/invoiceService.ts:373" },
      { title: "Atomic order numbering", detail: "Resolved. Same consume_next_document_number RPC handles p_document_type='order'. trg_orders_bump_number_after_insert trigger on the orders table assigns the formatted number from the same per-company counter.", status: "shipped", ref: "supabase migrations: consume_next_document_number + trg_orders_bump_number_after_insert" },
      { title: "Order state machine", detail: "Resolved. ALLOWED_ORDER_TRANSITIONS map in src/services/order/orderWorkflow.ts (line 34) is the source of truth. updateOrderStatus rejects any unlisted transition with a clean error message naming the allowed next steps.", status: "shipped", ref: "src/services/order/orderWorkflow.ts:34" },
      { title: "markDelivered idempotency guard", detail: "Resolved. updateOrderStatus short-circuits at line 116 when currentStatus === newStatus, returning success with _idempotent:true so retries / double-taps skip the notification + reviews + after-sales side-effects.", status: "shipped", ref: "src/services/order/orderWorkflow.ts:116" },
      { title: "Inventory deduction idempotency", detail: "Resolved. deductInventoryForOrder gates on orders.inventory_deducted_at IS NULL (line 440), stamps timestamp on success (line 614), and reverseInventoryDeduction NULLs the stamp so a clean re-run is possible.", status: "shipped", ref: "src/services/inventoryDeductionService.ts:440" },
      { title: "FX rates from exchange_rates table", detail: "Resolved. lib/currencyUtils.ts reads the latest rate from the exchange_rates table (line 43) instead of hardcoded constants. Falls back to a baseline if the lookup fails.", status: "shipped", ref: "src/lib/currencyUtils.ts:43" },
      { title: "Quote-time FX rate locking", detail: "Snapshot rate on quote, copy to order, never recompute", status: "todo" },
      { title: "Read company tax_rate, drop hardcoded 15% VAT", detail: "Resolved. orderFinancials.ts (line 325) selects companies.vat_rate + pricing_includes_vat and uses the tenant's stored rate. 0.15 only appears as a defensive fallback when the column is NULL. UK / EU / US tenants get their own configured rate.", status: "shipped", ref: "src/services/order/orderFinancials.ts:325" },
      { title: "Cancelled orders excluded from inventory_demand_outlook", detail: "Resolved. Verified via pg_get_viewdef: order_ingredient_demand filters o.status <> 'cancelled' AND o.deleted_at IS NULL at the source. inventory_demand_outlook further restricts to status IN ('confirmed','preparing','ready'). Ghost-event ingredients no longer appear in either view.", status: "shipped", ref: "pg_get_viewdef public.order_ingredient_demand + public.inventory_demand_outlook" },
    ],
  },
  {
    id: "2D",
    title: "Phase 2D, Structural cleanup (the 'messy' fix)",
    why: "Root cause of the 'messy' feeling: 60+ pages each paste the same broken offset recipe, six near-duplicate sidebar files, two parallel branding stores that don't sync.",
    estimate: "2-3 days",
    risk: "Low",
    icon: Layout,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Build <PortalShell> layout component", detail: "Owns sidebar + content offset; replaces lg:pl-64 + container mx-auto recipe in 60+ pages", status: "todo" },
      { title: "Delete BrandingContext, write white-label to companies table", detail: "Two parallel branding stores currently never sync, this is why branding doesn't flow through", status: "todo" },
      { title: "<PortalSidebar role accent />, 6 nav files into 1", detail: "AdminNav + 5 portal navs are 95% the same file, ~330 LOC each", status: "todo" },
      { title: "Wire statusTokens.ts into 12 callsites", detail: "5 divergent copies of the status colour map today", status: "todo" },
      { title: "<PageHeader> component", detail: "Standardise H1 styling, 30+ admin pages have different gradient/casing", status: "todo" },
      { title: "Replace hand-rolled forms with react-hook-form + zod", detail: "Start with leads/new, quotes/new, company-profile, email-settings, notification-settings", status: "todo" },
      { title: "Skeleton loading states on dashboard, orders, clients, invoices, calendar", detail: "Currently spinner + 'Loading...' text on every page", status: "todo" },
      { title: "Mobile card variants for tables on orders/clients/invoices/equipment", detail: "Currently truncate on <640px", status: "todo" },
      { title: "Collapse inventory.tsx + inventory-tracking.tsx + inventory-recipes.tsx into one tabbed page", status: "todo" },
      { title: "Fold client-search into clients page as filter mode", status: "todo" },
    ],
  },
  {
    id: "2E",
    title: "Phase 2E, Workflow gaps",
    why: "Lead-to-quote is manual data re-entry today. No driver double-booking check. Email queue not claim-locked. Returning clients have to phone.",
    estimate: "3-5 days",
    risk: "Medium",
    icon: GitBranch,
    accent: "from-brand-primary to-blue-500",
    items: [
      { title: "leadService.convertLeadToQuote actually creates a quote row", detail: "Currently only flips status; admin Convert button calls nothing useful", status: "todo" },
      { title: "Driver double-booking detection on assignDriver", detail: "Pre-check for overlapping deliveries on the same date", status: "todo" },
      { title: "Driver replacement audit trail", detail: "Currently overwrites assigned_driver_id silently", status: "todo" },
      { title: "Email queue claim-locking", detail: "UPDATE WHERE status='pending' RETURNING, no double-send across workers", status: "todo" },
      { title: "Xero token refresh + 401 retry", detail: "Sync silently fails after 30 min today", status: "todo" },
      { title: "Two-way Xero conflict handling", detail: "PUT to existing xero_invoice_id rather than POST creating duplicates", status: "todo" },
      { title: "Repeat-customer 'email me my orders' magic link", detail: "POST /api/client-tokens/request -> RPC issues fresh link", status: "todo" },
      { title: "Roles vs user_departments unification", detail: "Pick one model, authGuards reads role, departments is currently dead state", status: "todo" },
      { title: "GPS location history schema split", detail: "Current upsert on driver_id keeps only latest; split to driver_current_locations + log table", status: "todo" },
      { title: "Cancellation refund path", detail: "Pro-rata refund + Xero credit note for mid-cycle cancellations", status: "todo" },
      { title: "Replace .replace() with .replaceAll() in email template variables", status: "todo" },
      { title: "Fix generateInvoicePaymentLink dead branch", detail: "Configured + unconfigured branches both return same URL", status: "todo" },
      { title: "Multi-currency invoice formatting", detail: "Hardcoded 'R' symbol, replace with formatCurrency(amount, currency)", status: "todo" },
    ],
  },
  {
    id: "2F",
    title: "Phase 2F, Type safety + cleanup",
    why: "14 of 15 worst-offender services carry @ts-nocheck. The money layer is effectively untyped. Hundreds of unused imports.",
    estimate: "1-2 days",
    risk: "Low",
    icon: Type,
    accent: "from-slate-500 to-zinc-500",
    items: [
      { title: "Remove @ts-nocheck from 14 money/auth services", detail: "subscriptionService, paymentProcessing, xeroIntegration, invoiceGeneration, analytics, billingEmail, accountingIntegration, paymentLedger, invoiceService, etc.", status: "todo" },
      { title: "Replace 235 :any/as any/<any> with proper types", detail: "Most are catch(error: any), mechanical fix with helper", status: "todo" },
      { title: "Strip unused lucide-react imports", detail: "AdminNav alone has ~12 unused; build log flagged across 50+ files", status: "todo" },
      { title: "Memoise admin/orders.tsx filter pipeline", detail: "1190 LOC, three filter passes per render today", status: "todo" },
      { title: "Split admin/orders.tsx, admin/settings.tsx, account/settings.tsx, admin/platform/company-database.tsx, admin/inventory-tracking.tsx", detail: "Each 870-1190 LOC, extract modals + sub-components", status: "todo" },
      { title: "Skip AuthProvider on public pages in _app.tsx", detail: "Currently fetches profile + company on / and /pricing", status: "todo" },
      { title: "Single signed-cookie cache for middleware profile fetch", detail: "Currently 3 sequential round-trips per protected request", status: "todo" },
    ],
  },
];

// =====================================================================
// GROUP 3 - PRE-LAUNCH: INTEGRATION SETUP
// =====================================================================
const integrationCards: SprintCard[] = [
  {
    id: "payfast",
    title: "PayFast configuration",
    why: "Code-complete. Needs merchant credentials + webhook URL configured in PayFast dashboard.",
    estimate: "4-6 hours",
    risk: "High",
    icon: Banknote,
    accent: "from-rose-500 to-rose-500",
    items: [
      { title: "Sign up at payfast.co.za, get merchant ID + key + passphrase", status: "todo" },
      { title: "Set env vars: PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, PAYFAST_PASSPHRASE", status: "todo" },
      { title: "Configure webhook URL in PayFast dashboard: https://cateringms.com/api/webhooks/payment-confirmation", status: "todo" },
      { title: "Test in sandbox: sandbox.payfast.co.za", status: "todo" },
      { title: "Verify monthly subscription payment succeeds", status: "todo" },
      { title: "Verify failed payment (card declined) handled cleanly", status: "todo" },
      { title: "Verify deposit payment (20-50% of order)", status: "todo" },
      { title: "Verify final balance payment", status: "todo" },
      { title: "Verify webhook processes confirmation + idempotency holds (depends on Phase 2C-1)", status: "blocked" },
      { title: "Verify refund processing", status: "todo" },
    ],
  },
  {
    id: "resend",
    title: "Resend email service",
    why: "Code-complete. Free tier 3,000 emails/month, $20/month for 50,000.",
    estimate: "3-4 hours",
    risk: "High",
    icon: Mail,
    accent: "from-rose-500 to-rose-500",
    items: [
      { title: "Sign up at resend.com, get API key", status: "todo" },
      { title: "Set env var: RESEND_API_KEY", status: "todo" },
      { title: "Verify sending domain (DNS records: SPF, DKIM, DMARC)", status: "todo" },
      { title: "Test send via /api/test-email (after Phase 2A-3 lockdown)", status: "blocked" },
      { title: "Verify company welcome + staff invitation emails", status: "todo" },
      { title: "Verify trial expiry warning", status: "todo" },
      { title: "Verify quote request auto-reply", status: "todo" },
      { title: "Verify custom quote + order confirmation emails", status: "todo" },
      { title: "Verify payment confirmation emails (deposit + final)", status: "todo" },
      { title: "Verify balance reminder cadence (14/7/3/1 days)", status: "todo" },
      { title: "Verify post-event follow-up email", status: "todo" },
    ],
  },
  {
    id: "google-maps",
    title: "Google Maps API",
    why: "Code-complete. Needs API key + APIs enabled in Google Cloud Console.",
    estimate: "1-2 hours",
    risk: "Medium",
    icon: Plug,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Enable in Google Cloud: Maps JavaScript, Places, Directions, Distance Matrix", status: "todo" },
      { title: "Set env var: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", status: "todo" },
      { title: "Restrict key to cateringms.com referrer", status: "todo" },
      { title: "Test address autocomplete on /admin/company-profile + /admin/leads/new", status: "todo" },
      { title: "Test live driver tracking on /{slug}/client/tracking", status: "todo" },
      { title: "Verify geofencing arrival detection fires", status: "todo" },
    ],
  },
  {
    id: "whatsapp",
    title: "WhatsApp Business API (optional)",
    why: "Optional, enhanced engagement, not launch-critical. Templates need Meta approval (24-48h).",
    estimate: "6-8 hours",
    risk: "Low",
    icon: Plug,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Pick provider (Twilio recommended, or 360Dialog / MessageBird / Meta direct)", status: "todo" },
      { title: "Get phone number + business verification", status: "todo" },
      { title: "Submit template: quote request confirmation", status: "todo" },
      { title: "Submit template: custom quote notification", status: "todo" },
      { title: "Submit template: payment confirmation", status: "todo" },
      { title: "Submit template: delivery tracking link", status: "todo" },
      { title: "Submit template: driver arrival notification", status: "todo" },
      { title: "Submit template: post-event follow-up", status: "todo" },
      { title: "Wire templates to whatsappIntegrationService", status: "todo" },
    ],
  },
];

// =====================================================================
// GROUP 4 - PRE-LAUNCH: TESTING + BETA
// =====================================================================
const testingCards: SprintCard[] = [
  {
    id: "journey-super-admin",
    title: "Journey 1, Super Admin (4 hours)",
    why: "Platform management, company DB, subscriptions, analytics.",
    estimate: "4 hours",
    risk: "Low",
    icon: TestTube,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Platform dashboard login as super_admin", status: "todo" },
      { title: "View all registered companies", status: "todo" },
      { title: "Monitor trial expirations", status: "todo" },
      { title: "Track subscription payments", status: "todo" },
      { title: "Manage pricing plans", status: "todo" },
      { title: "View platform analytics + currency monitor", status: "todo" },
      { title: "Switch to tenant view, switch back", status: "todo" },
      { title: "Edit CMS pages + blog posts", status: "todo" },
    ],
  },
  {
    id: "journey-company-admin",
    title: "Journey 2, Company Admin (8 hours)",
    why: "Full business workflow from signup to processed order.",
    estimate: "8 hours",
    risk: "Low",
    icon: TestTube,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Company signup + welcome email received", status: "todo" },
      { title: "Onboarding wizard completes cleanly", status: "todo" },
      { title: "Add client, create quote, send to client", status: "todo" },
      { title: "Convert quote to order", status: "todo" },
      { title: "Assign kitchen + driver staff", status: "todo" },
      { title: "Track order through all status transitions", status: "todo" },
      { title: "Generate + send invoice", status: "todo" },
      { title: "Process payment via PayFast sandbox", status: "todo" },
      { title: "View financial dashboard with real data", status: "todo" },
      { title: "Edit company profile + branding (verify white-label flows through after Phase 2D-2)", status: "blocked" },
    ],
  },
  {
    id: "journey-staff",
    title: "Journey 3, Staff: 4 roles (12 hours)",
    why: "Kitchen, driver, cleaning, shopping portals end-to-end.",
    estimate: "12 hours",
    risk: "Medium",
    icon: TestTube,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Invitation + signup flow for each of the 4 roles", status: "todo" },
      { title: "Kitchen: clock in, view tasks, prep list, dishwasher cycle, clock out", status: "todo" },
      { title: "Driver: accept route, start GPS tracking, mark stops, complete delivery, view earnings", status: "todo" },
      { title: "Cleaning: equipment verify, broken-equipment report, floor safety, end of shift", status: "todo" },
      { title: "Shopping: view list, mark items purchased, upload receipt, update inventory", status: "todo" },
      { title: "Verify role-specific guards block cross-portal access", status: "todo" },
    ],
  },
  {
    id: "journey-client",
    title: "Journey 4, Client (6 hours)",
    why: "Full customer experience from quote request to feedback.",
    estimate: "6 hours",
    risk: "Medium",
    icon: TestTube,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Submit quote request via public form, receive auto-reply", status: "todo" },
      { title: "Receive custom quote email with pricing", status: "todo" },
      { title: "Click tokenised link, view order without signup", status: "todo" },
      { title: "Pay deposit via PayFast", status: "todo" },
      { title: "Track order progress in client portal", status: "todo" },
      { title: "View live driver GPS tracking on event day", status: "todo" },
      { title: "Pay final balance", status: "todo" },
      { title: "Receive post-event follow-up email", status: "todo" },
      { title: "Submit feedback / rating", status: "todo" },
    ],
  },
  {
    id: "beta",
    title: "Beta with 3 real catering companies (week 4)",
    why: "Real-world payment + GPS validation, plus 15-25 expected bugs surfacing.",
    estimate: "Week 4",
    risk: "High",
    icon: Users,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Recruit 3 beta companies (different sizes, regions)", status: "todo" },
      { title: "$500 credit per beta company", status: "todo" },
      { title: "Onboard beta company 1 (week 3)", status: "todo" },
      { title: "Import beta company 1 historical data", status: "todo" },
      { title: "Beta company 1 processes 3-5 live orders", status: "todo" },
      { title: "Onboard beta companies 2-3 (week 4)", status: "todo" },
      { title: "Test concurrent usage across 3 tenants", status: "todo" },
      { title: "Collect structured feedback (NPS + 10 specific questions)", status: "todo" },
      { title: "Consolidated beta report", status: "todo" },
    ],
  },
];

// =====================================================================
// GROUP 5 - PRE-LAUNCH: PERF + SECURITY + LAUNCH
// =====================================================================
const launchCards: SprintCard[] = [
  {
    id: "perf",
    title: "Performance optimisation (week 6)",
    why: "Targets before public launch.",
    estimate: "1 week",
    risk: "Medium",
    icon: Sparkles,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Page load < 2s (95th percentile)", status: "todo" },
      { title: "Time to interactive < 3s", status: "todo" },
      { title: "GPS update latency < 2s", status: "todo" },
      { title: "API response < 500ms (95th)", status: "todo" },
      { title: "Database optimisation (indexes from Phase 2B)", status: "blocked" },
      { title: "Frontend bundle review + lazy loading", status: "todo" },
      { title: "API caching + rate limiting", status: "todo" },
      { title: "Load test: 100 concurrent companies", status: "todo" },
      { title: "Load test: 1000 concurrent users", status: "todo" },
      { title: "Load test: 50 simultaneous GPS sessions", status: "todo" },
    ],
  },
  {
    id: "security-audit",
    title: "Security audit + pen testing (week 7)",
    why: "External validation of Phase 2A + 2B fixes.",
    estimate: "24 hours",
    risk: "High",
    icon: ShieldAlert,
    accent: "from-rose-500 to-rose-500",
    items: [
      { title: "RLS policies cover all tables (after Phase 2B)", status: "blocked" },
      { title: "No SQL injection vulnerabilities", status: "todo" },
      { title: "No XSS vulnerabilities", status: "todo" },
      { title: "CSRF protection on all state-changing endpoints", status: "todo" },
      { title: "Rate limiting on login attempts", status: "todo" },
      { title: "Payment data not stored (PCI compliance)", status: "todo" },
      { title: "GDPR + POPIA personal data handling", status: "todo" },
      { title: "API keys not exposed in client bundle", status: "todo" },
      { title: "HTTPS enforced everywhere", status: "todo" },
      { title: "Security headers configured (CSP, HSTS, X-Frame-Options)", status: "todo" },
      { title: "CORS properly configured", status: "todo" },
      { title: "Webhook signatures verified (after Phase 2C-2)", status: "blocked" },
      { title: "Google Maps API key restricted to domain", status: "todo" },
      { title: "File upload validation (size + type)", status: "todo" },
      { title: "No exposed admin endpoints (after Phase 2A)", status: "blocked" },
      { title: "Environment variables secured", status: "todo" },
    ],
  },
  {
    id: "monitoring",
    title: "Monitoring + alerting (week 7)",
    why: "Catch issues before customers report them.",
    estimate: "8 hours",
    risk: "Low",
    icon: Server,
    accent: "from-brand-primary to-blue-500",
    items: [
      { title: "Sentry error monitoring wired up", status: "todo" },
      { title: "LogRocket session replay (optional)", status: "todo" },
      { title: "Vercel Analytics + Speed Insights reviewed", status: "todo" },
      { title: "Uptime monitoring (UptimeRobot or similar)", status: "todo" },
      { title: "Alerts to Slack / email on errors", status: "todo" },
      { title: "Database query monitoring (Supabase observability)", status: "todo" },
    ],
  },
  {
    id: "launch",
    title: "Soft + public launch (week 8)",
    why: "Soft: 10 companies manual onboarding. Public: open signup + marketing.",
    estimate: "1 week",
    risk: "High",
    icon: Rocket,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Soft launch: first 10 companies manually onboarded", status: "todo" },
      { title: "Daily check-ins with soft-launch tenants", status: "todo" },
      { title: "Soft-launch metrics: 8/10 onboarded, 5/10 process orders, payment success > 95%, NPS > 50", status: "todo" },
      { title: "Remove beta flags", status: "todo" },
      { title: "Open public signup", status: "todo" },
      { title: "Send launch email campaign", status: "todo" },
      { title: "Post on social media (LinkedIn, Twitter)", status: "todo" },
      { title: "Submit to Product Hunt + SaaS directories", status: "todo" },
      { title: "Team on standby for launch week", status: "todo" },
      { title: "Legal: terms + privacy + DPA finalised", status: "todo" },
    ],
  },
];

// =====================================================================
// GROUP 6 - REFERENCE: METRICS, RISKS
// =====================================================================
const referenceCards: SprintCard[] = [
  {
    id: "metrics",
    title: "Success metrics by milestone",
    why: "Concrete numbers to hit at each phase.",
    icon: Target,
    accent: "from-slate-500 to-zinc-500",
    items: [
      { title: "Week 4 (beta end): 3 beta companies onboarded", status: "todo" },
      { title: "Week 4: 10+ real orders processed", status: "todo" },
      { title: "Week 4: 15+ staff using portals", status: "todo" },
      { title: "Week 4: payment success rate > 90%", status: "todo" },
      { title: "Week 4: GPS tracking reliable", status: "todo" },
      { title: "Week 4: < 5 critical bugs remaining", status: "todo" },
      { title: "Week 8 (launch): 10+ paying companies", status: "todo" },
      { title: "Week 8: 50+ active users", status: "todo" },
      { title: "Week 8: 100+ orders processed", status: "todo" },
      { title: "Week 8: 99% uptime, < 1% error rate, NPS > 50", status: "todo" },
      { title: "Month 3: 50+ paying companies, 300+ users, $5,000+ MRR", status: "todo" },
      { title: "Month 3: 70%+ trial-to-paid conversion, 30%+ MoM growth, NPS > 60", status: "todo" },
    ],
  },
  {
    id: "risks",
    title: "Risk register",
    why: "Known risks + mitigations + contingencies.",
    icon: AlertCircle,
    accent: "from-slate-500 to-zinc-500",
    items: [
      { title: "Payment gateway integration fails (Low prob / Critical impact)", detail: "Mitigation: thorough sandbox testing + Stripe as backup. Contingency: manual payment tracking short-term.", status: "todo" },
      { title: "Email deliverability issues (Medium / High)", detail: "Mitigation: reputable provider (Resend), DNS verification. Contingency: multiple provider accounts on standby.", status: "todo" },
      { title: "GPS tracking unreliable (Medium / Medium)", detail: "Mitigation: extensive real-device testing. Contingency: manual location updates, SMS fallback.", status: "todo" },
      { title: "High churn during trial (Medium / High)", detail: "Mitigation: excellent onboarding + fast support. Contingency: extend trial, add value.", status: "todo" },
      { title: "Schema drift between env, Phase 2B addresses", detail: "Currently no SQL file matches live; new environments cannot reproduce schema.", status: "todo" },
      { title: "Audit found 16 P0 security/money bugs, Phase 2A + 2C address", detail: "Until closed, scaling beyond Spit Braai introduces real exposure.", status: "todo" },
    ],
  },
  {
    id: "team-budget",
    title: "Team plan + budget",
    why: "Recommended hires and approximate cost to launch.",
    icon: Users,
    accent: "from-slate-500 to-zinc-500",
    items: [
      { title: "Technical Lead (internal), weeks 1-8, 40 hrs/wk", status: "shipped" },
      { title: "QA Engineer, weeks 3-6, 30 hrs/wk, ~$3,000", status: "todo" },
      { title: "Security Specialist, week 7, 24 hours, $1,200-2,000", status: "todo" },
      { title: "DevOps Engineer, weeks 6-7, 40 hours, $2,000-3,500", status: "todo" },
      { title: "UX Designer (optional), week 5, 20 hours, $1,000-1,500", status: "todo" },
      { title: "Marketing Specialist (optional), weeks 7-8, 40 hours, $1,500-2,500", status: "todo" },
      { title: "Beta company credits (3 x $500) + tester stipends (6 x $100), $2,100", status: "todo" },
      { title: "Annual services: Resend $240, Google Maps $600, Twilio $360, Sentry $312, LogRocket $1,188, Vercel Pro $240, Supabase Pro $300 = $3,240/yr", status: "todo" },
      { title: "Total launch budget: $12,540 minimum / $16,940 recommended", status: "todo" },
    ],
  },
];

// =====================================================================
// GROUP 7 - MARKET EXPANSION: features to win SA / UK / US
// Sourced from 60-company multi-region competitive audit (28 Apr 2026):
// 20 SA + 20 UK + 20 US catering company websites analysed.
// =====================================================================
const universalCards: SprintCard[] = [
  {
    id: "U-universal",
    title: "U1-U8, Universal builds (one investment, three regions)",
    why: "Eight features that close gaps in SA, UK and US simultaneously. Highest leverage in the market intel because each build serves all three regions.",
    estimate: "8 weeks (3 universals per sprint)",
    risk: "Medium",
    icon: Globe,
    accent: "from-brand-primary to-blue-500",
    items: [
      { title: "U1, Recipe-level allergen + dietary tag engine", detail: "14 UK + 9 US (incl. sesame post-FASTER Act) + SA tags. Auto-roll up to menu items, auto-flag conflicts on guest dietary submissions, printable allergen sheet per order. One build satisfies UK Natasha's Law + US FDA top-9 + SA wedding RSVP imports.", status: "todo" },
      { title: "U2, Per-tenant certificate vault with auto-attach", detail: "Expiry tracking + auto-attach to quote PDF + public verified badge widget. SA: halaal (SANHA/MJC/NIHT), Beth Din kosher, BBBEE, COIDA, liquor licence. UK: KLBD/HMC, FSA hygiene rating, SFBB, Premises Licence. US: OU/Star-K, IFANCA/HMA, ServSafe, ST-119/state exempt certs.", status: "todo" },
      { title: "U3, Instant quote calculator (public, embeddable)", detail: "Pax + date + menu tier + region/zip ->binding quote with deposit link. The market-disrupting feature, fewer than 5 of 60 surveyed sites show live pricing in any region.", status: "todo" },
      { title: "U4, Multi-jurisdiction tax/VAT engine (Avalara or TaxJar)", detail: "Quote + invoice both auto-rate by venue postal code. US 50-state sales tax + local. UK VAT split (cold zero-rated / hot 20% / B2B ex-VAT vs B2C inc-VAT toggle). SA VAT registration threshold + zero-rated.", status: "todo" },
      { title: "U5, B2B accounts with PO numbers + cost centres + Net-30/60 + ACH/Bacs/EFT", detail: "US corporate AP (Bill.com / Ramp / Coupa). UK GoCardless + Bacs. SA government RFQ + Standard Bank EFT. Same pattern, three integrations.", status: "todo" },
      { title: "U6, AI menu auto-balancing from dietary roster (the moat)", detail: "Ingest CSV/RSVP/employee list with dietary tags ->existing AI recipe scaler composes menu mix that satisfies kosher + halal + vegan + gluten-free + top-9 allergen exclusions automatically. Forkable does individual meals; nobody does group-menu balancing in any region.", status: "todo" },
      { title: "U7, Carbon-per-portion menu badges (Foundation Earth or My Emissions)", detail: "Ingredient-level emissions factors ->A-E carbon grade per dish on public menu and quote PDF. UK competitors talk sustainability but ship no per-dish numbers. US ESG procurement now demands. SA corporates tendering. 18-month moat.", status: "todo" },
      { title: "U8, Surplus-food auto-routing post-event", detail: "Weighs leftover, dispatches nearest charity via API (FareShare UK, City Harvest US, SA Harvest), generates donation receipt PDF for client. PR + tax angle in UK, CSR/ESG narrative in US.", status: "todo" },
      { title: "U9, Per-tenant timezone + DST handling (UK BST, US DST)", detail: "Today the platform assumes Africa/Johannesburg implicitly because SA has no DST. The UK shifts BST/GMT twice yearly, US states straddle DST, and any cross-border tenant (e.g. UK caterer with a Spain branch) needs proper tz support. Build: tenants table grows tz column (default Africa/Johannesburg); shift / clock-in / event_time / cron schedules render in tenant tz; date-only filters get a tenant-tz formatter (the toLocalISO sweep currently uses browser tz, which is right for the operator but wrong for cron jobs that need to fire at the tenant's 09:00). Critical before UK / US tenant launch - wages calculated against the wrong day during DST week is a legal mess. Also audit kitchenPrepService cron firing times: today they assume server UTC, will need tenant-tz aware schedule.", status: "todo" },
    ],
  },
];

const saExpansionCards: SprintCard[] = [
  {
    id: "SA-essentials",
    title: "SA-specific essentials",
    why: "Five features from the SA market intel that win the local market. Source: 20 SA caterers analysed (spit-braai, wedding, corporate, halaal, kosher, Joburg/Cape Town/Durban regional, township).",
    estimate: "2-3 weeks",
    risk: "Medium",
    icon: Flag,
    accent: "from-brand-primary to-yellow-500",
    items: [
      { title: "EskomSePush integration ->load-shedding-aware delivery autopilot", detail: "Pull schedule per delivery address, flag affected slots on kitchen + driver portals, suggest generator hire as billable line, auto-WhatsApp client on swap. Number-one SA operational risk turned into a service guarantee.", status: "todo" },
      { title: "WhatsApp-first quote bot", detail: "Extend existing WhatsApp framework into structured chat that drops into the lead pipeline + returns PayFast deposit link in-thread. Township + spit-braai + mass-event segments live in WhatsApp.", status: "todo" },
      { title: "Cash-on-delivery + SnapScan + Yoco + Zapper alongside PayFast", detail: "Township and informal-event buyers don't card. Driver portal reconciles cash workflow with photo-of-handover audit trail.", status: "todo" },
      { title: "BBBEE level + Black Ownership % auto-render on every quote PDF + /bbbee public page", detail: "Required on every corporate / mining / government tender. EME / QSE / Generic via sworn affidavit or full cert.", status: "todo" },
      { title: "Township-tier R99/month 'lite' tenant", detail: "WhatsApp-first interface, no client portal, same multi-tenant DB, upgrade path. Owns the segment Facebook/WhatsApp-only operators (Family Touch, Only1Cuisine) currently can't afford to enter.", status: "todo" },
    ],
  },
];

const ukExpansionCards: SprintCard[] = [
  {
    id: "UK-essentials",
    title: "UK-specific essentials",
    why: "Five features from the UK market intel. Source: 20 UK caterers analysed (premium wedding, corporate marketplace, halal HMC, kosher KLBD, vegan, festival, Cotswolds marquee, NHS industrial).",
    estimate: "2-3 weeks",
    risk: "Medium",
    icon: Flag,
    accent: "from-blue-500 to-rose-500",
    items: [
      { title: "Natasha's Law PPDS label generator (the lead-magnet)", detail: "Recipe ->PDF/Zebra label with full ingredient list + 14 allergens emphasised, batch-print per production run. Replaces a £200/month bolt-on (Erudus / Nutritics). Could be the single biggest UK launch hook.", status: "todo" },
      { title: "FSA Food Hygiene Rating widget", detail: "Nightly pull from ratings.food.gov.uk, embed on tenant site + quote PDF, alert on rating change. Wales mandates display by law; Scotland uses FHIS variant.", status: "todo" },
      { title: "Calorie labelling for 250+ staff client orders (April 2022 law)", detail: "kcal stored at recipe level, auto-display on menus + quote PDFs above configurable client-size threshold.", status: "todo" },
      { title: "Postcode-zone delivery + bike-courier API integration", detail: "Stuart, Pedal Me, Gophr APIs. London corporate caterers price per zone (Z1/Z2/Z3/M25), bike couriers handle sub-30-min office drops.", status: "todo" },
      { title: "TEN (Temporary Event Notice) auto-prefill + reminder", detail: "Any caterer serving alcohol at an unlicensed venue must file TEN at least 10 working days ahead. Pre-fill from event details, surface reminder on quote acceptance.", status: "todo" },
    ],
  },
];

const usExpansionCards: SprintCard[] = [
  {
    id: "US-essentials",
    title: "US-specific essentials",
    why: "Six features from the US market intel. Source: 20 US caterers analysed (corporate marketplace, BBQ, kosher OU, halal, soul food, vegan, Tex-Mex, stadium, school, private chef).",
    estimate: "3-4 weeks",
    risk: "High",
    icon: Flag,
    accent: "from-blue-600 to-rose-600",
    items: [
      { title: "ezCater + Relish marketplace connector (P0, without this, invisible to US corporate)", detail: "Bidirectional menu / inventory / order sync via ezCater partner API + Relish for recurring corporate. Even mid-market caterers like The Halal Guys route through ezCater.", status: "todo" },
      { title: "Slack / Teams / Google Workspace bots + SAML SSO", detail: "Slack slash commands, Teams app, Okta / Rippling / Entra SAML. Forkable wins enterprise on this exact feature set.", status: "todo" },
      { title: "IRS Rev Rul 2012-18 service-charge vs gratuity separation", detail: "Auto-grat for groups of 8+ = wages (W-2). Voluntary tip = tip income. Distinct invoice line types, payroll export tags service charges as wages. Most caterers commingle and get audited.", status: "todo" },
      { title: "Tax-exempt customer flow with certificate vault", detail: "501(c)(3), federal/state government cert vault with expiry. NY ST-119, TX 01-339, CA Form 590. Auto-strip sales tax on qualifying invoice + attach cert PDF.", status: "todo" },
      { title: "Stadium / venue credentialing module", detail: "Driver background checks (NCS4, MLB/NFL clearance), loading-dock time-windows, security badges attached to driver profile. Dispatch only credentialed drivers to credentialed venues.", status: "todo" },
      { title: "Per-employee dietary preference profiles for recurring corporate", detail: "Tokenised employee links inside corporate accounts capture allergens, dietary identity, strong-dislikes. Quote auto-suggests menu mix to satisfy roster. The Forkable / Sharebite playbook.", status: "todo" },
    ],
  },
];

const wowFactorCards: SprintCard[] = [
  {
    id: "wow-factors",
    title: "Wow-factor moats (zero competitors have these in any region)",
    why: "Three defensible features from the synthesis that no major competitor has shipped. Each one alone is a marketing line; together they make CateringMS the trust layer for the global catering industry.",
    estimate: "2-3 weeks each",
    risk: "Medium",
    icon: Award,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "AI roster-driven menu auto-balancing (extends U6)", detail: "Take 47 employees' dietary profiles ->existing AI recipe engine composes Tuesday's menu mix that hits kosher + halal + vegan + gluten-free + top-9 allergen exclusions automatically, zero manual planner input. Forkable does individual meals, group-menu balancing is a global gap.", status: "todo" },
      { title: "Real-time HACCP cold-chain dashboard for buyers", detail: "Pipe existing GPS + temp probes (hot-bag / cold-bag) into a public link the corporate facilities manager / venue operator watches live: '200-pax lunch is 12 mins out, hot-hold 64C, cold-hold 3C, allergen sheet attached'. Stadium, school, hospital, NHS buyers will pay extra. Zero competitors surface this to the buyer.", status: "todo" },
      { title: "Verified-Caterer marketplace directory at /za/find, /uk/find, /us/find", detail: "Public-facing tenant directory surfacing tenants with valid certs in the vault (U2). Filter by region / dietary / pax / date availability. CateringMS becomes the trust layer for the whole market, demand-gen for the SaaS, network effect, competitor-free space.", status: "todo" },
    ],
  },
];

// =====================================================================
// GROUP 8 - PRODUCT NOTES: BOBBY'S ROADMAP IDEAS
// =====================================================================
const productNotesCards: SprintCard[] = [
  {
    id: "ai-onboarding",
    title: "AI-assisted client onboarding",
    why: "New catering companies signing up on a 30-day trial need to see value fast. Manual data entry kills trials before they convert. AI-assisted setup (upload existing customers, seed inventory, pre-fill menus) gets a new tenant to 'live' in hours instead of days.",
    estimate: "3-4 weeks",
    risk: "Medium",
    icon: Sparkles,
    accent: "from-sky-500 to-blue-600",
    defaultOpen: true,
    items: [
      { title: "CSV / vCard bulk customer import with AI field mapping", detail: "Upload a spreadsheet with any column headers, AI maps them to the correct profile fields. Preview + confirm step with manual override. Covers the most common blocker: 'I already have 200 customers in Excel'.", status: "todo" },
      { title: "Guided onboarding wizard (6 steps, 10 minutes to live)", detail: "Step 1: company profile + logo. Step 2: menu/service packages. Step 3: import customers. Step 4: configure payment gateway (PayFast/Stripe). Step 5: invite first staff member. Step 6: send first quote. Progress bar persists across sessions.", status: "todo" },
      { title: "Seed data library, pre-built menu templates by cuisine type", detail: "SA braai, SA wedding, corporate buffet, cocktail function, kosher, halal. One-click load into the tenant's menu. Removes blank-canvas paralysis on trial day 1.", status: "todo" },
      { title: "30-day trial progress tracker on admin dashboard", detail: "Show the tenant: 'You have used 6 of 7 core features. 3 steps left to fully activate. Your trial ends in 18 days.' Drives activation before the paywall hits.", status: "todo" },
      { title: "AI 'completion score' that nudges the tenant owner via email", detail: "Day 3 / Day 7 / Day 14 emails if onboarding steps are incomplete. Personalised to what is actually missing for that tenant. Not generic drip, specific: 'You haven't added a menu yet. Start here.'", status: "todo" },
    ],
  },
  {
    id: "cashflow-forecast-card",
    title: "Cashflow Forecast Card on /admin/financial-dashboard",
    why: "Tenant owners need to see, at any given moment, whether the next 30-60 days of upcoming events + already-scheduled costs leave them solvent. Today /admin/financial-dashboard surfaces revenue and pending payments, but there is no card that combines (live cash on hand) + (income still to come) - (costs still to come). Adding this turns the financial dashboard from a backwards-looking report into a forward-looking cashflow forecast - the single most-asked question an owner has on a Monday morning. Pairs with the existing 30-Day Projection + Pending Payments tiles - this is the missing 'so can I actually pay this week's wages' answer.",
    estimate: "1-2 weeks",
    risk: "Medium",
    icon: Banknote,
    accent: "from-brand-primary to-brand-secondary",
    defaultOpen: true,
    items: [
      { title: "Owner-editable 'cash on hand' field on /admin/financial-dashboard", detail: "Phase 1 (2026-05-18, PR #75) shipped. Migration 20260518760000 adds companies.cash_on_hand_cents + cash_on_hand_updated_at + cash_on_hand_updated_by. CashflowForecastCard renders above the existing 4-metric grid for owner / company_admin / admin / super_admin roles only. Inline-edit pencil opens an input; save writes the row + an audit_logs row with old/new cents. Stale-data badge fires if cash_on_hand_updated_at is older than 24h.", status: "shipped" },
      { title: "Forecast number: cash on hand + income still to come - costs still to come", detail: "Phase 1 (2026-05-18, PR #75) shipped. Forecast = cash_on_hand + projected revenue for selected horizon - staff wages owed. Colour-coded: green when positive, amber when positive but below the wages-owed total (tight), red when negative. Phase 2 will fold in supplier payables, predicted shopping (kitchenPrepService aggregated demand), hired equipment, and recurring fixed costs from a new fixed_costs table.", status: "shipped" },
      { title: "Forecast window picker (7 / 14 / 30 / 60 / 90 days)", detail: "Phase 1 (2026-05-18, PR #75) shipped. Default 30 days. Picker is a Select dropdown on the card; income side scales linearly between the 30d and 90d projection numbers we already compute (crude but fit-for-purpose at this phase). Phase 2 swaps for a per-day projection so the window picker is exact.", status: "shipped" },
      { title: "Interactive cashflow chart below the card (Recharts area + line)", detail: "Phase 2 (2026-05-18, PR #76) shipped the area chart. Recharts AreaChart with a dashed zero reference line so the owner can eyeball the cross-over day. Hover any point for the tooltip: date, balance for that day, income in, plus the top 4 contributing orders (client name + amount) with a '+N more' overflow. When the balance dips below R0 anywhere in the window, an amber 'balance dips at +Xd' callout appears under the forecast number. The 30d->90d linear interpolation is gone; the chart walks each order's event_date for a real per-day projection. Phase 3 will add the click-through detail drawer for full-list inspection + the 'what if I push this payment' simulator.", status: "shipped" },
      { title: "Cost categories the forecast counts: staff wages, supplier payables, recurring fixed costs, predicted shopping, hired equipment", detail: "Phase 4 (2026-05-18, PR #81) shipped equipment hire + shopping. equipment_hire_orders.total_cost lands on expected_pickup_date; shopping_lists.estimated_total lands on list_date (filtering completed/cancelled). Both bucket into the day-by-day chart, surface their subtotal in the right-column breakdown, and appear in the detail drawer with category badges. Staff wages already in since phase 1 (day-0 cash-out). Supplier payables + recurring fixed costs still TODO - the live schema has no payables ledger (suppliers carries payment_terms but not outstanding balances) and no fixed_costs table; both need a small migration before they can be wired.", status: "in_progress" },
      { title: "Income categories the forecast counts: deposits expected, balances due, repeat-client recurring orders", detail: "Deposits expected = orders.deposit_amount where deposit not yet paid AND event_date <= horizon. Balances due = orders.balance_amount where balance not yet paid AND event_date <= horizon + balance_due_days from settings. Repeat-client recurring = optional, opt-in per client (e.g. a corporate that orders every fortnight) - phase 2.", status: "todo" },
      { title: "'Probable spend' override input per category", detail: "Phase 3 (2026-05-18, PR #79) shipped the single-bucket version. Owner-typed Contingency input in the right column subtracts from the projected balance. Persisted per-company to localStorage so it survives reload without needing a new DB column (it's a personal scratchpad, not a shared team figure). Per-category split (shopping vs supplier vs equipment) deferred to phase 4 alongside the cost-category breakdown.", status: "shipped" },
      { title: "Already-scheduled costs roll into the same card", detail: "Phase 4 (2026-05-18, PR #81) shipped equipment_hire_orders + shopping_lists as the first two scheduled-cost feeds. Both bucket into the day they're due (expected_pickup_date / list_date). Staff wages already counted from phase 1. Supplier-invoice ledger + recurring-fixed-costs feed pending a schema migration.", status: "in_progress" },
      { title: "Visibility gate: director / owner role only", detail: "Phase 1 (2026-05-18, PR #75) shipped. financial-dashboard.tsx computes a canSeeFinanceForecast boolean against useAuth().active_role/role; the card mount is gated by that flag. Owner / company_admin / admin / super_admin see it; kitchen / driver / shopping / cleaning / client do not.", status: "shipped" },
      { title: "Audit trail: log every cash_on_hand edit + every forecast snapshot to audit_logs", detail: "Phase 1 (2026-05-18, PR #75) shipped the edit-side audit. Every Save writes an audit_logs row with action='financial.cash_on_hand.update', entity_type='company', entity_id=companyId, details={ old_cents, new_cents, currency }. Phase 4 (PR #81) added the bookkeeper-facing CSV export of the daily forecast snapshot (date, day_offset, balance, income, costs_hire, costs_shopping; no PII; UTF-8 BOM so Excel on Windows opens it cleanly).", status: "shipped" },
      { title: "Future: hook into Xero / QuickBooks balance feed for auto-update", detail: "Still deferred per Phase 2E in megaprogramme audit - the Xero token-refresh gap needs closing before nightly bank-feed sync is reliable. Plan: cron walks every tenant with a healthy Xero / QuickBooks connection, pulls the latest bank-feed balance, updates companies.cash_on_hand_cents + writes the audit_logs row exactly as the manual edit path does. Owner can still override manually. Removes the last daily-entry step but the integration plumbing must be rock-solid first.", status: "todo" },
    ],
  },
  {
    id: "whatsapp-facebook",
    title: "WhatsApp + Facebook automated response integration",
    why: "SA catering enquiries land overwhelmingly in WhatsApp and Facebook Messenger first. Caterers either miss them or spend hours copy-pasting. An AI responder that actions tasks directly from a message thread (create quote, send email, update order) is the single highest-leverage distribution channel in the SA market.",
    estimate: "4-6 weeks",
    risk: "High",
    icon: MessageSquare,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "WhatsApp Business API inbound message handler", detail: "Connect tenant's WhatsApp Business number via Meta's Cloud API or a BSP (Vonage, 360dialog). All inbound messages land in the CateringMS lead inbox with full thread history.", status: "todo" },
      { title: "Facebook Messenger lead inbox connector", detail: "Same pattern as WhatsApp, Meta Messenger webhook drops enquiries into the lead pipeline. One unified inbox for both channels.", status: "todo" },
      { title: "AI intent classification + auto-response drafting", detail: "Classify inbound: quote request / availability check / complaint / existing-order query. Draft a context-aware reply using tenant's menu + calendar. Staff approves with one tap or it auto-sends after 60 seconds (configurable).", status: "todo" },
      { title: "In-thread quote creation, 'Create quote for this lead' from WhatsApp", detail: "Staff taps one button in the CateringMS inbox UI, quote is created, PDF generated, and the PayFast deposit link is dropped back into the WhatsApp thread. Zero context-switching.", status: "todo" },
      { title: "In-thread email dispatch to catering company clients from the app", detail: "Compose and send a branded email to the client directly from within the WhatsApp/Facebook thread view. Full audit trail. Replies route back to the same inbox.", status: "todo" },
      { title: "Eskom load-shedding alert auto-message to affected clients (SA)", detail: "When EskomSePush flags a schedule change that hits a delivery window, auto-WhatsApp the affected client: 'Your event on Fri 2pm is in Stage 4, here is our contingency plan'. Removes the number-one SA client panic trigger.", status: "todo" },
    ],
  },
  {
    id: "events-equipment",
    title: "Events equipment module (hire + own inventory)",
    why: "Many catering companies are also event suppliers, they hire out or own tables, chairs, cutlery, crockery, ice buckets, chafing dishes, linen. This is tracked nowhere today. It is a high-margin revenue line that competitors don't support end-to-end.",
    estimate: "3-4 weeks",
    risk: "Medium",
    icon: Package,
    accent: "from-orange-500 to-amber-600",
    items: [
      { title: "Equipment catalogue with 'own vs hired-in' flag per item", detail: "Two types: items the company owns outright (depreciation tracked) and items they hire in from a third-party supplier (hire cost per use). Both appear on quotes and invoices as distinct line types.", status: "todo" },
      { title: "Event equipment package builder (table of X + linens + cutlery for X pax)", detail: "Define reusable packages, 'Cocktail for 100': 10 x high tables, 20 x cocktail chairs, 100 x champagne flutes, 100 x side plates. One-click attach to an order. Auto-deducts from available stock.", status: "todo" },
      { title: "Equipment categories: cutlery, crockery, glassware, tables, chairs, linens, ice buckets, chafing dishes, decor", detail: "Pre-seeded category list matching the cleaning portal's verification flow. Shared equipment registry so the cleaning team's post-event count feeds directly back into stock availability.", status: "todo" },
      { title: "Availability calendar for owned equipment", detail: "Show which items are committed to which events on which dates. Prevent double-booking. Alert if a quote is accepted but required equipment is already out.", status: "todo" },
      { title: "Hired-in cost tracking + auto-add to order cost sheet", detail: "When hired equipment is used, the hire cost is auto-added to the order's internal cost breakdown (visible to admin/owner, not client). Feeds the profit-margin report.", status: "todo" },
      { title: "Post-event equipment return reconciliation linked to cleaning portal", detail: "After an event, the cleaning team's verification count (existing equipment.tsx page) updates available_quantity in real time. Damage reports auto-flag for client billing.", status: "todo" },
    ],
  },
  {
    id: "onboarding-support",
    title: "Support during onboarding, who handles the calls",
    why: "When a trial client hits a wall, they churn. The support model during onboarding needs to be defined and built into the product before launch. An unclear support path at sign-up is a conversion killer.",
    estimate: "1 week",
    risk: "Low",
    icon: Headphones,
    accent: "from-sky-500 to-blue-600",
    items: [
      { title: "Define the support tier model: self-serve vs concierge vs assisted onboarding", detail: "Decision needed: free tier = help docs + chat bot. Paid = email SLA. Premium = WhatsApp direct with a human. This decision gates the build, do not build the wrong tier first.", status: "todo" },
      { title: "In-app help widget (Intercom / Crisp / custom)", detail: "Contextual help bubble on every page. Triggered by inactivity or error state. Routes to docs first, human second. Reduces inbound support load 60-70%.", status: "todo" },
      { title: "Onboarding call booking flow (for premium / high-value signups)", detail: "Calendly or native booking widget surfaced after payment. 30-minute setup call with Bobby / designated onboarding person. The human touch that converts hesitant buyers.", status: "todo" },
      { title: "Searchable knowledge base (Mintlify / Notion public / custom)", detail: "How-to articles for every major workflow. Linked from every help icon in the UI. Reduces the same 5 questions that every new tenant asks.", status: "todo" },
      { title: "Support inbox routing, define who owns what", detail: "Document internally: billing questions go to X. Technical bugs go to Y. Onboarding help goes to Z. This is a people + process spec, not just a code spec. Must be decided before launch.", status: "todo" },
    ],
  },
  {
    id: "ai-receipt-scanning",
    title: "AI receipt + slip scanning ->inventory",
    why: "Shopping staff come back from a run with a pile of slips. Manual entry is slow, error-prone, and doesn't happen. AI scanning (like Adobe Scan) pulls line items, quantities, and prices directly into inventory with a manual override step. Eliminates the biggest data-entry bottleneck in the shopping workflow.",
    estimate: "2-3 weeks",
    risk: "Medium",
    icon: ScanLine,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Mobile camera capture or PDF/image upload in the shopping portal", detail: "Staff can take a photo of a till slip on their phone or upload a scanned PDF. Works from the existing shopping portal, no new app required.", status: "todo" },
      { title: "AI OCR + line-item extraction (Google Vision / AWS Textract / OpenAI Vision)", detail: "Extract: store name, date, line items (description, qty, unit price, total), grand total. Map extracted items against the existing inventory catalogue by name similarity + unit type.", status: "todo" },
      { title: "Confidence score + manual override UI", detail: "Each matched item shows a confidence score. Low-confidence items are flagged for manual review. Staff can correct the match before confirming. Prevents silent bad data.", status: "todo" },
      { title: "Auto-update inventory quantities + actual cost on shopping list", detail: "On confirm: inventory.available_quantity incremented, inventory_transactions row written, shopping_list.actual_total updated. Same audit trail as manual entry.", status: "todo" },
      { title: "Receipt image stored on Supabase Storage + linked to shopping list", detail: "Original slip image retained for audit / accountant review. Linked to the shopping list record so it appears in the shopping history with a 'View receipt' button.", status: "todo" },
      { title: "Multi-slip batch processing (one run = multiple stores, multiple slips)", detail: "A typical shopping run hits 3-4 stores. Staff uploads all slips at once, reviews each extracted list sequentially, confirms. One action covers the whole run.", status: "todo" },
    ],
  },
  {
    id: "inventory-admin",
    title: "Inventory + costs management admin page",
    why: "Admins and owners need to see and edit stock levels for seeded inventory items without touching the database. Today there is no UI for this, stock levels can only be changed via the kitchen/shopping portals indirectly. A dedicated admin inventory page with inline editing, category filtering, and cost tracking closes this gap.",
    estimate: "1-2 weeks",
    risk: "Low",
    icon: Lightbulb,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Admin inventory list page at /admin/inventory", detail: "Full inventory catalogue with search, category filter, and status filter. Shows: name, category, current stock, unit, unit cost, par level (minimum stock trigger), last updated.", status: "shipped" },
      { title: "Add / edit / archive items via dialog with reason-coded stock movements", detail: "ItemForm shared by Add + Edit. Move stock dialog supports received / adjustment / waste / transfer / return reasons, writes inventory_transactions for audit.", status: "shipped" },
      { title: "Par level alert indicator, items below par flagged in amber/red", detail: "At-a-glance: which items are below the minimum stock threshold and need reordering. Sortable by urgency. Feeds into the shopping portal's 'low stock' alert list.", status: "shipped" },
      { title: "Preferred supplier picker on item dialog (Phase 6C)", detail: "Dropdown populated from the suppliers table. Sets inventory_items.preferred_supplier_id. Empty option for items without a regular supplier. Helper line points operators to Shopping > Suppliers when the list is empty.", status: "shipped" },
      { title: "Bulk CSV import / export for seeded inventory", detail: "Export the full inventory as CSV for offline editing. Re-import updates quantities and costs in bulk. Critical for initial setup and periodic stock-takes.", status: "todo" },
      { title: "Inventory cost summary, total stock value by category", detail: "Dashboard card at the top: total stock value (qty x unit_cost), broken down by category. Helps the owner see where their money is tied up in stock.", status: "todo" },
      { title: "Add to PlatformNav (super_admin) and AdminNav (company_admin + owner)", detail: "Linked from AdminNav under Menu & Inventory section. Super_admin cross-tenant view still pending.", status: "in_progress" },
    ],
  },
  {
    id: "menu-recipe-foundation",
    title: "Menu builder + recipe foundation (Phase 6)",
    why: "Owner needs full CRUD on menu items with recipes attached so the kitchen flywheel (prep tasks, demand projection, shortfall detection) actually works for every dish, not just the ~160 hardcoded in inventoryDeductionService. Phase 6 wired the missing chain end-to-end: menu item -> recipe -> recipe ingredient -> inventory item -> preferred supplier, all editable from the UI, with cross-role visibility honest about which surface sees costs.",
    estimate: "2 weeks (Phase 6 shipped); next-phase library = 4-6 weeks",
    risk: "Low",
    icon: BookOpen,
    accent: "from-brand-primary to-brand-secondary",
    defaultOpen: true,
    items: [
      { title: "Schema hardening, recipes UNIQUE on menu_item_id (Phase 6A)", detail: "1:1 was de facto in data and assumed by code. Locked it in so the upcoming recipe builder can't create dups. Dropped duplicate touch_updated_at triggers. Types file marks the FK isOneToOne for correct supabase-js embed shape.", status: "shipped" },
      { title: "Owner /admin/menu CRUD page with embedded recipe builder (Phase 6B)", detail: "List by category with thumbnail and recipe x N badge. Add / Edit dialog covers name, category, description, base price, image URL, dietary tags, allergen codes, advance notice. Recipe block collapsed by default, open it for base servings, prep mins, cook mins, cooking notes, and an ingredient grid with autocomplete from the company's inventory pool. Exact-match picks link the row via inventory_item_id; free-text rows save but show a 'won't auto-deduct' hint. Save flow: upsert item -> upsert recipe -> wipe-and-reinsert ingredients.", status: "shipped" },
      { title: "Inventory item supplier picker (Phase 6C)", detail: "Wired preferred_supplier_id into the inventory item dialog so the recipe-ingredient -> inventory-item -> supplier chain is fully editable. Loaded once on mount, surfaces empty-state copy when no suppliers exist yet.", status: "shipped" },
      { title: "Cross-role visibility, cost-stripped kitchen stock + 'in recipes' filter (Phase 6D)", detail: "Kitchen stock page now uses inventoryService.getInventoryPublic which omits cost_per_unit at the SQL level (visibility seal matches the listStaffPublic pattern from Phase 5). New 'In recipes' toggle narrows to inventory items at least one recipe ingredient links to; per-row badge marks flywheel-wired vs warehouse-only items.", status: "shipped" },
      { title: "Shopping kitchen-demand bridge (Phase 6E)", detail: "New /team-portal/shopping/kitchen-demand page exposing kitchenPrepService.getAggregatedDemand to the shopping role. Horizon picker (7/14/30 days), shortfall-only toggle, per-ingredient row showing the events feeding the demand, one-click 'Create shopping list' that writes a real shopping_lists row tagged source: kitchen_shortfall.", status: "shipped" },
      // The expansion items below are the next phase Bobby wants tracked.
      { title: "Owner-built recipe library, bulk import + templates", detail: "Today the owner builds recipes one at a time. Next phase: paste a recipe URL or upload a recipe doc, AI extracts ingredients + quantities + units and pre-fills the recipe builder. Plus a 'recipe templates' catalogue (SA spit braai, corporate buffet, kosher Shabbat), one-click load into the tenant's menu so day-one tenants aren't building from a blank canvas.", status: "todo" },
      { title: "Recipe versioning, track changes over time", detail: "When a chef tweaks a recipe (more lamb, less garlic) we want a history. Audit trail of who changed what when, plus a 'compare to previous version' diff. Means yield variance reports (Phase 4) become trustworthy because they reference the version that was actually cooked.", status: "todo" },
      { title: "Photo upload per ingredient + recipe step (Supabase Storage)", detail: "Owner adds a photo of the finished dish at the top, plus a photo per prep step ('crush garlic like this', 'lamb should look like this when ready'). Kitchen sees the photos inline on the production page during cook. Reuses the avatars bucket pattern from the profile fix.", status: "todo" },
      { title: "Recipe cost rollup, automatic per-serving cost", detail: "Sum (ingredient quantity x inventory cost_per_unit) across all linked ingredients. Show the cost per serving and per dish on /admin/menu. Margin = base_price minus cost_per_serving. Owner-only, never leaks to kitchen or shopping. Drives a real 'profitable dishes' report.", status: "todo" },
      { title: "Auto-suggest recipes from menu item name (AI)", detail: "Owner types 'Malva Pudding' -> AI proposes a starter recipe with typical SA ingredients and quantities. Owner edits or accepts. Same idea as the menu builder's inventory autocomplete but for the whole recipe in one tap. Shortens the time-to-first-recipe by 90%.", status: "todo" },
      { title: "Recipe sharing across tenants (network effect, opt-in)", detail: "Tenants can publish a recipe to a shared library. Other tenants see and clone. Anonymised by default (no tenant name). Builds the moat, CateringMS becomes the place where SA caterers share menu IP. Pairs with the Verified-Caterer marketplace from the wow-factors group.", status: "todo" },
      { title: "Image upload bucket for menu items (Supabase Storage)", detail: "Today /admin/menu uses a paste-a-URL field for image_url. Add a real upload bucket like the avatars one with a 5MB cap and JPG/PNG/WebP, plus an 'upload from camera' option on mobile so phone shots go straight in.", status: "todo" },
    ],
  },
  {
    id: "post-launch-haccp-and-kitchen-intelligence",
    title: "Post-launch, food-safety + kitchen-as-learning-system (3 may 2026, deferred until after launch)",
    why: "Three orphan tables surfaced during the schema audit map onto features Bobby wants but that are too hectic to ship pre-launch. Added here so they don't fall off the radar. Sequence: (1) cold-chain first because it's the audit-and-insurance landmine, (2) staff cert expiry next because one expired food-handler cert can fail a kitchen inspection, (3) substitutions + waste paired because they feed each other and turn the kitchen into a learning system rather than re-using the same wrong yield numbers forever.",
    estimate: "Defer to post-launch",
    risk: "Medium",
    icon: ShieldAlert,
    accent: "from-rose-500 to-orange-500",
    items: [
      { title: "Cold-chain compliance (temperature_logs)", detail: "Cold-chain is the audit-and-insurance landmine for catering. Right now there's no cold-store temperature record, if a batch goes off and a guest gets ill there's no defensible log. Smallest viable build: a daily check-in form on the kitchen tablet (one entry per fridge / freezer per shift), an alert if a reading falls outside a per-asset min / max band, and an exportable PDF of the last 90 days for inspectors. This is the one to do first post-launch.", status: "todo" },
      { title: "Staff food-handler certificate expiry alerts (health_certificates)", detail: "Per-staff food handler certs with expiry alerts. Today nothing prompts when someone's cert is about to lapse, a single expired cert can fail a kitchen inspection. Build: a column on the user / staff record + 30 / 14 / 7-day reminder emails to the owner. Low effort, high ass-saving value.", status: "todo" },
      { title: "Substitution rules + waste logging, paired (ingredient_substitutions + waste_logs)", detail: "Pair these, they feed each other. Substitutions: 'if no full-cream milk, use 2x low-fat' rules so the shopping list and recipe scaler can suggest swaps when stock is short. Waste logs: what got binned per event (over-prep, plate waste, spoilage), which over time tells you the real yield-per-guest vs the theoretical recipe yield. The combo turns the kitchen into a learning system rather than re-using the same wrong numbers forever.", status: "todo" },
    ],
  },
  {
    id: "post-launch-equipment-ops-deepening",
    title: "Post-launch, equipment ops deepening (3 may 2026, deferred)",
    why: "Schema audit on 3 May surfaced four orphan tables that map to genuine operational features once the core launch is bedded in. Sequence: kits first because it's the highest leverage (caterers reuse the same bundles every weekend, saves 70-80% of quote-builder clicks); preventive maintenance second because today equipment_damages is only the reactive log, no preventive log; per-crate handoff third for big spit-braai jobs; warehouse storage location last because it only earns its keep once a tenant has multiple rooms / racks. Six other orphan tables in the same audit (utensil_tracking, linen_inventory, glassware_catalog, cleaning_supplies, ice_tracking, dishwasher_cycles) were dropped outright since they fold cleanly into equipment or inventory_items.",
    estimate: "Defer to post-launch",
    risk: "Low",
    icon: Package,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Equipment kits, bookable as one unit (equipment_kits + equipment_kit_items)", detail: "Owner defines kits once, e.g. '50-guest spit-braai kit = 50 plates + 50 cutlery sets + 2 chafing dishes + 1 carving station'. On the quote builder, owner adds the kit as a single line. On quote acceptance, the kit explodes into individual equipment_bookings rows. New 'Kits' tab in /admin/equipment lets owners create / edit kits. Saves 70-80% of click-clicking when building the same wedding / funeral / corporate combo every weekend. Slots cleanly into the existing equipment_hire_orders + equipment_bookings cascade.", status: "todo" },
      { title: "Preventive maintenance log per asset (equipment_maintenance)", detail: "Today equipment_damages is the reactive log (someone broke it). This is the preventive log: gas bottle re-test due in 60 days, generator service every 200hrs, chafing dish lid hinge service every 12 months. New panel on /admin/equipment/[id] shows service history + next-service-due date. Nightly cron flags overdue items. Pairs with pat_testing (UK) and equipment_damages (live) to complete the asset-lifecycle story.", status: "todo" },
      { title: "Per-crate pack/unpack tracking for big jobs (delivery_crates)", detail: "Today kitchen_handoffs covers the per-order kitchen-to-driver handoff. delivery_crates is a finer-grained per-crate version: kitchen packs Crate 1 (starters), Crate 2 (mains), Crate 3 (dessert + drinks), each scanned by driver at pickup and again at venue. Driver knows nothing's missing before driving off. Real operational value for spit-braai jobs (4-6 crates typical) but per-order acknowledgement is enough for launch.", status: "todo" },
      { title: "Warehouse storage locations + racks (storage_locations + storage_racks)", detail: "Adds a location_id column to equipment and inventory_items so the kitchen-prep tablet can tell staff exactly where to grab item X ('Bay 3, Rack B'). Load-bearing only when a tenant has more than one storage room or rack. For small caterers ('the storeroom') it adds friction with no payoff. Build once a paying tenant asks.", status: "todo" },
    ],
  },
  {
    id: "post-launch-quote-actions-polish",
    title: "Post-launch, quote-card action polish (3 may 2026, deferred)",
    why: "Surfaced during the /admin/quotes button audit. Both items have working fallbacks today (print dialog for PDF, clipboard payload for accounting push) so they aren't blockers, but they need finishing before a tenant with strong accounting integration habits will love the product.",
    estimate: "Defer to post-launch",
    risk: "Low",
    icon: FileText,
    accent: "from-slate-500 to-slate-700",
    items: [
      { title: "Server-side PDF for quotes", detail: "Today the PDF button on /admin/quotes opens the public quote URL with ?print=1 and relies on the browser's Ctrl+P dialog. Works but indirect. Build /api/quotes/[id]/pdf that returns a real PDF attachment (probably puppeteer or react-pdf), with the company's branded letterhead, totals tidy at the bottom, and the policy / T&C block on a second page. Same pattern can later cover invoices + cancellation refund receipts.", status: "todo" },
      { title: "Sync-quote endpoints for Xero / QuickBooks / Sage", detail: "/admin/quotes Push-to-accounting calls /api/integrations/{provider}/sync-quote which doesn't exist yet - it falls back to copying the prepared payload to the clipboard, which the operator pastes manually. To make it a real one-click sync we need to clone /api/accounting/{xero,quickbooks}/sync-invoice.ts into sync-quote.ts per provider (~300 lines each), point accountingExportService at the new path, and make sure the OAuth + token refresh chain stays healthy. Sage adapter is the third provider (no existing scaffold, would be a bigger build). Build once a paying tenant has actually connected their accounting integration.", status: "todo" },
    ],
  },
  {
    id: "post-launch-onboarding-walkthrough",
    title: "First-run onboarding walkthrough (4 may 2026)",
    why: "Bobby flagged after Stage 0-3 multi-branch testing: 'first step once signed up, onboarding should take users to each page showing them where they can add leads, create quotes and walk them through each step'. Today a new tenant lands on /admin/dashboard cold - there's an Onboarding page in the nav but it's a checklist, not a walkthrough. The drop-off risk is the highest in the first 5 minutes after signup; without a guided tour the operator pokes around, doesn't see how lead -> quote -> order chains together, and bounces. A real product tour anchored to actual nav items + create buttons closes that gap.",
    estimate: "1 sprint (3-5 days)",
    risk: "Medium",
    icon: Sparkles,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Tour engine + step model", detail: "Pick driver.js or react-joyride. Build a TourProvider that reads a per-tenant flag (companies.onboarding_tour_state - 'pending' | 'in_progress' | 'completed' | 'skipped') and only auto-fires when 'pending'. Each step takes a CSS selector (or ref), copy, optional CTA, and an 'onAdvance' hook so the tour can wait for an actual click instead of just a Next button. Persist progress per step so a refresh doesn't restart from zero.", status: "todo" },
      { title: "Define the 'first booking' tour script", detail: "8-10 step happy path: 1) Welcome on /admin/dashboard, 2) Click Leads in nav -> 'this is where every enquiry lands', 3) Click + New lead -> walk through the form, save a real lead, 4) Click Quotes -> 'now turn that lead into a quote', 5) Open the quote builder pre-filled with the lead, 6) Send -> 'this generates the public quote URL', 7) Show the Orders page -> 'when the client accepts, an order appears here', 8) Show Invoices -> 'when the order is delivered, the invoice generates automatically', 9) Show Calendar / Dispatch as the day-of-event view, 10) Wrap with 'you can replay this tour anytime from /admin/onboarding'.", status: "todo" },
      { title: "Skip + replay controls", detail: "A persistent 'Skip tour' button at every step (writes onboarding_tour_state='skipped'). On /admin/onboarding add a 'Run the welcome tour again' button that resets the flag and restarts from step 1. Important: the tour must NEVER fire for region_admin / sales_admin invitees - only the company owner sees it on first login. Their team gets per-role mini-tours later (separate scope).", status: "todo" },
      { title: "Per-role mini-tours (Phase 2)", detail: "Once the owner tour is shipped, add 3-step mini-tours for kitchen / driver / shopping staff on their first portal load. Kitchen: 'this is your prep list, this is how you mark a task done, this is how you flag a shortage'. Driver: 'this is the route, this is how you start a delivery, this is how you confirm handover'. Shopping: 'this is the demand list, this is how you turn shortfalls into a shopping order'. Each mini-tour is 30 seconds max - staff tolerate way less than owners do.", status: "todo" },
    ],
  },
  {
    id: "multi-branch-e2e-qa",
    title: "Multi-branch end-to-end QA test (4 may 2026, ready to run)",
    why: "Stages 0-3 of the multi-branch architecture rebuild + the 7-agent audit fix wave have all shipped. Production deploy is green and the post-deploy DB smoke check passed 8/8. Static audit cannot prove the actual user journeys work - need a manual run on Spit Braai (currently single-branch) to validate that adding a JHB branch surfaces the right UI, locks RLS correctly, propagates region_id through every artifact, and resolves per-branch overrides on real money flows. Test plan is fully drafted in docs/qa/multi-branch-e2e.md with Pass/Fail tables, copy-paste SQL verification, screenshot capture list, and a cleanup script.",
    estimate: "30-45 min focused session",
    risk: "Low",
    icon: Sparkles,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Run section 0 - clean baseline check", detail: "Paste the baseline SQL into Supabase SQL editor for project vsuyzovzqtrngorpqnhy. Expect zero rows on every count except jhb_active_regions. If anything is non-zero, run section 6 cleanup before starting.", status: "todo" },
      { title: "Run sections 1-2 - add JHB branch + invite manager", detail: "Add Johannesburg region with delivery_cost_per_km=12, min_delivery_fee=100, all manager-notification toggles on. Invite branch-manager-jhb@example.com as region_admin scoped to JHB only. Confirm DB rows match expected via the verification SELECTs.", status: "todo" },
      { title: "Run section 3a - region_admin acceptance map (13 checks)", detail: "Sign in to incognito as JHB region_admin. Walk every row in the table: landing page, region filter scope, sidebar nav, lead create with JHB badge, quote builder showing 'From Johannesburg' + R12/km + R100 floor, save draft + phone persistence on refresh, send quote with all DB column assertions.", status: "todo" },
      { title: "Run section 3b - company_admin cross-branch checks (7 checks)", detail: "Fresh incognito as Bobby. Confirm region dropdown now shows All / Cape Town / Johannesburg, switching narrows lists, financial-dashboard Branches tab appears with both branches, regions KPI strip shows Active=2, inventory item form shows Branch picker.", status: "todo" },
      { title: "Run section 4 - negative tests (5 checks)", detail: "As region_admin: financial-dashboard locked, platform/dashboard locked, RLS blocks CPT order URL hack. As company_admin: middleware self-test (flip role to region_admin, confirm /admin/* still admits, revert).", status: "todo" },
      { title: "Run section 5 - money flow check", detail: "Public-quote acceptance roundtrip. Open the JHB quote's public URL in a private window, accept it, confirm order auto-creates with JHB region_id and the auto-invoice carries the same VAT amount through quote -> order -> invoice. Run the verification SELECT to prove the chain.", status: "todo" },
      { title: "Capture the 9 screenshots in section 7", detail: "Save to a shared audit-log location: JHB region card with KPI strip, region filter dropdown showing both branches, branch picker on new-lead form, 'From Johannesburg' delivery panel with R12/km, financial-dashboard Branches tab, JHB region badge on a list row, sidebar without Branding & Settings (region_admin), and the two negative-test access-denied screens.", status: "todo" },
      { title: "Run section 6 - cleanup", detail: "After a successful pass (or to reset between attempts), execute the cleanup SQL: void invoices, cancel orders, archive quotes + leads, deactivate JHB region, delete the manager profile row. Note: auth.users row must be removed from the Supabase auth dashboard manually.", status: "todo" },
    ],
  },
];

// =====================================================================
// GROUP 9 - TOOLTIP AUDIT FINDINGS (28 Apr 2026)
// =====================================================================
// 5-agent rollout added ~255 hover tooltips across 71 pages and surfaced
// the data flow issues below. P0 fix already shipped. Everything else
// is sequenced for Phase 2 work post-launch meeting.
const tooltipAuditCards: SprintCard[] = [
  {
    id: "audit-broken-ux",
    title: "High-priority misleading or broken UX (audit-surfaced)",
    why: "Each of these is a card or button that lies to the user, shows a number that's wrong, claims to save when it doesn't, or filters on stale state. Found while adding info tooltips so every metric explains its data source.",
    estimate: "3-4 days",
    risk: "High",
    icon: AlertTriangle,
    accent: "from-rose-500 to-rose-600",
    defaultOpen: true,
    items: [
      { title: "Multi-tenancy data leak on /admin/driver-management", detail: "userManagementService.getAllUsers() called without company_id meant a company admin saw drivers from every tenant on the platform. P0. Fix shipped 28 Apr 2026 in commit 596ef67, now scoped to user.company_id with early return when unauthenticated.", status: "shipped", ref: "src/pages/admin/driver-management.tsx:63-83" },
      { title: "Pricing Management save button is fake", detail: "/admin/platform/pricing-management.tsx, saveHandler calls setPricing(editedPricing) only. No Supabase write, no API call. Toast says 'saved' but rates and tier prices are hardcoded constants in the component. Director-level action that does nothing.", status: "todo", ref: "src/pages/admin/platform/pricing-management.tsx:31-44" },
      { title: "Invoices 'Total Revenue' KPI sums all invoices including drafts + outstanding", detail: "Should filter to status='paid' or relabel to 'Total Invoiced'. Today the number lies to the owner about what they've actually collected.", status: "todo", ref: "src/pages/admin/invoices.tsx:386-388" },
      { title: "Invoices loadOrders closure bug, orders show as uninvoiced on first load", detail: "loadOrders filters using stale invoices state from the previous render. On first load invoices is [] so every order appears uninvoiced even when invoices exist.", status: "todo", ref: "src/pages/admin/invoices.tsx:122-126" },
      { title: "Inventory 'Expiring Soon' KPI is always 0", detail: "expiryDate: undefined is hardcoded in the row mapping, so getExpiringItems() always returns nothing regardless of real data.", status: "todo", ref: "src/pages/admin/inventory.tsx:90" },
      { title: "Inventory supplier column shows literal 'Supplier set' string", detail: "supplier: row.preferred_supplier_id ? 'Supplier set' : '--' returns a literal placeholder instead of the actual supplier name. Should join to suppliers table.", status: "todo", ref: "src/pages/admin/inventory.tsx:88" },
      { title: "Calendar 'Upcoming events' KPI capped at 5", detail: "upcoming.length is read from an array sliced earlier for the next-five list view. Use a separate uncapped count.", status: "todo", ref: "src/pages/admin/calendar.tsx:407" },
      { title: "Currency 90-day trend assumes chronological order", detail: "Reads first vs last entries of historicalRates. If the array isn't strictly sorted the trend calculation is wrong.", status: "todo", ref: "src/pages/admin/platform/currency-monitoring.tsx:90-101" },
      { title: "Driver schedule shows full orders.total_amount to drivers", detail: "Decision needed, should drivers see invoice value, or only their own delivery fee? Current behaviour exposes the catering company's revenue to every driver.", status: "todo", ref: "src/pages/team-portal/driver/schedule.tsx" },
    ],
  },
  {
    id: "audit-mock-localstorage",
    title: "Mock data + localStorage flows that need real Supabase wiring",
    why: "Several feature-rich admin and platform pages ship pure mock arrays or persist only to localStorage. They look complete in screenshots but are demo-only. Each needs a Supabase table + RLS + service layer before launch.",
    estimate: "2-3 weeks (sequenced one feature at a time)",
    risk: "High",
    icon: Database,
    accent: "from-amber-500 to-orange-600",
    items: [
      { title: "Platform Health stats are hardcoded literals", detail: "98% / 1.2s avg response / 3 open tickets / 99.9% uptime are not sourced from any monitoring service. Only active companies count is real. Either wire to Better Stack / Sentry / etc. or remove the panel.", status: "todo", ref: "src/pages/admin/platform/dashboard.tsx:354-362" },
      { title: "MRR computed from hardcoded plan-rate map", detail: "Starter R499 / Growth R1499 / Scale R3999 / Enterprise R9999 hardcoded in the component. No real billing/plans table consulted. Trial accounts default to amount=0. Connect to a subscriptions or billing_invoices table.", status: "todo", ref: "src/pages/admin/platform/subscription-management.tsx:91-101" },
      { title: "CMS blog AI generation is a setTimeout mock", detail: "generateContent / generateSampleContent / generateFAQs / generateSchema return sample boilerplate after a 2-second delay. Not wired to OpenAI/Claude. Either implement against Anthropic API or remove the AI generation buttons.", status: "todo", ref: "src/pages/admin/platform/cms-blog.tsx:118-119" },
      { title: "Recipes are hardcoded RECIPE_MAPPINGS constant", detail: "/admin/inventory-recipes is driven by a constant in inventoryDeductionService.ts, not a database table. Editing a recipe requires a code change + redeploy. Move to a recipes table with recipe_ingredients join.", status: "todo", ref: "src/services/inventoryDeductionService.ts" },
      { title: "Notification settings save to localStorage only", detail: "All toggles (SMS, push, daily summary, etc.) write to localStorage. Page text says 'changes take effect immediately' but no consumer reads them and no server stores them. Move to companies.notification_settings JSONB or a notification_preferences table.", status: "todo", ref: "src/pages/admin/notification-settings.tsx:64-77" },
      { title: "Payment gateway config localStorage only", detail: "Entire gateway config persists to localStorage('payment_gateway_config'). No Supabase table. PayFast / SnapScan / Yoco credentials need a server-side encrypted store.", status: "todo", ref: "src/pages/admin/payment-gateways.tsx:88-92,131-132" },
      { title: "Email templates localStorage only", detail: "Template CRUD writes to localStorage('email_templates'). Move to email_templates table with company_id RLS so all staff see the same templates.", status: "todo", ref: "src/pages/admin/email-templates.tsx:322-330" },
      { title: "SMTP config + automation rules localStorage only", detail: "emailConfig and automationRules saved to localStorage. Not wired to a real send engine, /admin/email-automation-dashboard reads the same localStorage queues from lib/afterSalesAutomation. Wire to a real ESP (Resend / Postmark) and persist rules in DB.", status: "todo", ref: "src/pages/admin/email-automation-settings.tsx:162,177 + src/pages/admin/email-automation-dashboard.tsx" },
      { title: "Route planning is pure MOCK_ORDERS / MOCK_DRIVERS", detail: "Entire orders + drivers list is hardcoded. UI is a demo until wired to Supabase. Pull orders from orders.event_date in window + drivers from profiles.role='driver' scoped by company_id.", status: "todo", ref: "src/pages/admin/route-planning.tsx:32-145,167" },
      { title: "Order assignments are mockOrders + localStorage", detail: "Orders come from mockOrders constant; assignments persist to localStorage('order_assignments' + 'staff_assignments'). Move to order_assignments + staff_assignments tables with company_id RLS.", status: "todo", ref: "src/pages/admin/order-assignments.tsx:66,86-99" },
      { title: "Onboarding step completion flags hardcoded", detail: "Every step's 'completed' flag is hardcoded in the page; doesn't reflect real account state. Compute from companies.onboarding_status JSONB or derive from the existence of menus / clients / first quote.", status: "todo", ref: "src/pages/admin/onboarding.tsx:28-77" },
      { title: "Driver earnings hardcoded jobs * R250", detail: "Today's Potential Earnings + Potential Earnings panels multiply job count by R250. Replace with a real per-delivery rate from driver_pay_rates or staff_work_sessions.", status: "todo", ref: "src/pages/team-portal/driver/dashboard.tsx:354 + src/pages/team-portal/driver/routes.tsx:237,432,606" },
      { title: "team-portal/general/job-progress.tsx is mockJobs", detail: "Entire job list is a mockJobs constant. Should pull from kitchen_assignments.status + driver_assignments.status. Tooltips already reference the future tables.", status: "todo", ref: "src/pages/team-portal/general/job-progress.tsx:42-70" },
      { title: "Shopping dashboard purchased state in localStorage", detail: "Persisted to localStorage('shopping_items_purchased'). Acceptable as a temporary cache but the source of truth should be shopping_list_items.is_purchased once POs are wired through.", status: "todo", ref: "src/pages/team-portal/shopping/dashboard.tsx:115-129" },
      { title: "White-label / branding stored in BrandingContext, not DB", detail: "BrandingContext is browser-stored; not synced to the companies row. Tenant logo + colours don't survive a different browser or device.", status: "todo", ref: "src/pages/admin/white-label.tsx + BrandingContext" },
    ],
  },
  {
    id: "audit-structural",
    title: "Structural patterns to consolidate",
    why: "Patterns that emerged across multiple files during the audit. Each one is a small refactor but unblocks a class of future work.",
    estimate: "1 week",
    risk: "Low",
    icon: Layers,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Triple-duplicate branding/identity surfaces", detail: "/admin/settings 'Company' tab, /admin/company-profile, and /admin/white-label each capture overlapping branding/identity. Editing one doesn't sync to the others. Consolidate to companies table with one canonical UI before launch.", status: "todo" },
      { title: "Migrate hand-rolled KPI tiles to MetricCard", detail: "Most admin pages re-implement the same KPI card pattern instead of using the shared MetricCard. Migrating makes the tooltip prop free everywhere and gives one place to update card visuals.", status: "todo" },
      { title: "companies.role_settings JSONB for cleaning/shopping/kitchen/driver settings", detail: "All role-specific settings pages currently save to localStorage. One JSONB column on companies (or a role_settings table keyed by company_id + role) consolidates them and survives device changes.", status: "todo" },
      { title: "Decide canonical source for subscription state", detail: "Several files compute subscription state client-side from companies.subscription_status. Worth deciding before billing goes live: is companies.subscription_status canonical, or do we need a dedicated subscriptions table that the column derives from?", status: "todo" },
      { title: "Consolidate MiniStat / StatCard duplicates in driver portal", detail: "deliveries.tsx has MiniStat, earnings.tsx has StatCard, both duplicate MetricCard. Merge into MetricCard so future stat tiles inherit the tooltip pattern automatically.", status: "todo" },
      { title: "PortalPagePlaceholder optional infoTooltip prop", detail: "Pages still using PortalPagePlaceholder (kitchen/settings, driver/notifications stubs) could take an optional infoTooltip explaining what the page will eventually do. Useful documentation while shells exist before features ship.", status: "todo" },
    ],
  },
];

// =====================================================================
// GROUP 10 - JOURNEY AUDIT FINDINGS (28 Apr 2026)
// =====================================================================
// Six parallel auditors traced the customer journeys end-to-end using the
// rewritten tooltips as contracts. Verdict: only the kitchen prep view
// and the equipment-shortage resolution paths are usable end-to-end. Sales
// funnel, billing, dispatch, and SaaS subscription auto-activation all
// require manual SQL or super_admin intervention. Seven commits shipped
// during the audit (multi-tenancy + auth fixes); the remaining items below.
const journeyAuditCards: SprintCard[] = [
  {
    id: "journey-blockers",
    title: "P0, Customer journey blockers",
    why: "Each item below means a real user cannot complete a core action without a developer or super_admin manually intervening. These are the items that make the difference between 'demoable' and 'launchable'.",
    estimate: "3-4 weeks",
    risk: "High",
    icon: AlertTriangle,
    accent: "from-rose-600 to-rose-700",
    defaultOpen: true,
    items: [
      // Sales funnel
      { title: "Quote builder writes only to localStorage", detail: "/admin/quotes/new persists the entire quote (line items, pricing, notes) to localStorage. Never calls quoteService.createQuote. Quotes never exist in the database. Tooltip says 'Demo data shown until live wiring lands' but the page is the primary quote-creation surface for staff.", status: "todo", ref: "src/pages/admin/quotes/new.tsx:196-227" },
      { title: "No public lead capture form on the marketing site", detail: "Homepage / pricing / demo pages have no form wired to leadService.createLead. The only inbound path is /api/integrations/leads (Zapier / Facebook only). Anonymous visitors cannot submit an enquiry that lands in the leads table.", status: "todo" },
      { title: "No client-side quote acceptance route", detail: "Resolved. Public quote acceptance lives at src/pages/q/[token].tsx with a name-capture Accept dialog that calls recordAccept (stamps accepted_at + flips status to 'accepted'). recordView + submitChangeRequest are wired alongside, so the full client journey - view → request change → accept - is in place.", status: "shipped", ref: "src/pages/q/[token].tsx" },
      { title: "Quote detail page has zero action buttons", detail: "Resolved. Detail page now ships Save Draft + Save & Send via QuoteSendDialog with the full preflight (describeQuoteEditImpact) flow. Status transitions + Convert-to-Order are accessible from the same surface. See src/pages/admin/quotes/[id].tsx around line 489.", status: "shipped", ref: "src/pages/admin/quotes/[id].tsx:489" },
      { title: "Payment webhook never sends confirmation emails", detail: "Resolved. emailService is now wired into payment-confirmation.ts: line 398 (invoice path), 655 (deposit), 794 (balance). Each fires on the corresponding record_invoice_payment / record_deposit_payment RPC. No TODO marker remains in the file.", status: "shipped", ref: "src/pages/api/webhooks/payment-confirmation.ts:398" },
      { title: "Math.random() delivery distance on quote builder", detail: "Resolved. Distance now computed via the haversine great-circle formula off the selected kitchen's lat/lng and the venue's lat/lng (set by AddressAutocomplete). See src/pages/admin/quotes/new.tsx around line 746. Operator can still type a manual override on the same form input.", status: "shipped", ref: "src/pages/admin/quotes/new.tsx:746" },
      // Fulfilment
      { title: "Inventory deduction is hardcoded for one tenant", detail: "inventoryDeductionService uses a RECIPE_MAPPINGS constant tuned to Spit Braai's menu names. Any other tenant deducts zero ingredients because their menu names won't match. Inventory deduction is effectively single-tenant. Migrate to recipes + recipe_ingredients tables joined by company_id.", status: "todo", ref: "src/services/inventoryDeductionService.ts:24" },
      { title: "Order assignments page is mockOrders + localStorage", detail: "/admin/order-assignments reads mockOrders and persists assignments to localStorage. Real assignments never reach the DB. Tooltip self-flags this. Wire to a real order_assignments + staff_assignments table.", status: "todo", ref: "src/pages/admin/order-assignments.tsx:47-99" },
      { title: "Kitchen-duty-tracking page is a placeholder div", detail: "Page renders the literal text 'Kitchen Duty Tracking Content' in a placeholder div. Linked from AdminNav. Either build the admin duty roster overview or remove the nav entry.", status: "todo", ref: "src/pages/admin/kitchen-duty-tracking.tsx:26" },
      // Dispatch
      { title: "Route planning dispatch UI is mock data", detail: "/admin/route-planning is hardcoded MOCK_DRIVERS and MOCK_ORDERS. applyRoute short-circuits for mock IDs. Wire driverService.getAllDrivers(companyId) and routeOptimizationService.getUnassignedOrders(companyId) so dispatched routes hit the DB and surface in the driver portal.", status: "todo", ref: "src/pages/admin/route-planning.tsx:32-146" },
      { title: "GPS upsert on event-log table is structurally wrong", detail: "gpsTracking.updateDriverLocation does upsert onConflict 'driver_id' on gps_tracking, an event-log table where driver_id is not unique. Either change to insert (history) or add a driver_locations 'current state' table with driver_id unique. Today the constraint will fight every second update.", status: "todo", ref: "src/services/driver/gpsTracking.ts:26" },
      // Billing closure
      { title: "Client portal invoices and admin invoices are different data models", detail: "/client-portal/billing.tsx synthesises invoices from payment_schedules client-side and never reads the invoices table. Final invoices generated in /admin/invoices are completely invisible to the client portal. Two parallel invoice models that don't talk.", status: "todo", ref: "src/pages/client-portal/billing.tsx:74-169" },
      { title: "Damage auto-bill is cosmetic theatre", detail: "/team-portal/cleaning/equipment.tsx shows 'Auto-bill: R...' in the verification dialog. saveVerification writes the equipment_damages row but invoiceGenerationService never reads equipment_damages. The promised damage bill never reaches an invoice.", status: "todo", ref: "src/pages/team-portal/cleaning/equipment.tsx:272 + src/services/invoiceGenerationService.ts" },
      { title: "Invoice email handler logs only, no real provider", detail: "/api/send-invoice-email returns 200 after a console.log. No actual send. Wire to Resend or SES via emailService and only return success when the provider acknowledges.", status: "todo", ref: "src/pages/api/send-invoice-email.ts:31" },
      // SaaS lifecycle
      { title: "No subscription activation webhook, trial-to-active is manual", detail: "/api/webhooks/payment-confirmation handles orders + invoices only. There is no path that converts a successful subscription payment into companies.subscription_status='active'. Every paying customer today requires super_admin to manually click Activate in trial-management. Add a payment_type='subscription' branch + create subscription_invoices.", status: "todo", ref: "src/pages/api/webhooks/payment-confirmation.ts" },
      { title: "/subscription/checkout is a dead-end UX", detail: "The page posts to PayFast with userId: temp_${Date.now()}. Nothing in the database is updated when the user completes checkout. The whole /pricing -> /subscription/checkout flow is decorative. Persist the company_id pre-redirect and reconcile it in the webhook.", status: "todo", ref: "src/pages/subscription/checkout.tsx:91" },
      { title: "After-sales email automation is an in-memory mock", detail: "lib/afterSalesAutomation.ts is `let mockEmailQueues: AfterSalesEmailQueue[] = []`. Wipes on every server restart. Never persisted, never sent. Marketed as a feature on the admin email-automation pages. Do NOT enable for any pilot tenant. Replace with email_queues table + cron-driven processor.", status: "todo", ref: "src/lib/afterSalesAutomation.ts:209" },
    ],
  },
  {
    id: "journey-tenancy",
    title: "Multi-tenancy + auth findings (cross-cutting)",
    why: "Three security holes were found and patched in flight (commits 596ef67, 4f3bc10, f0b4e6f). The remaining items are RLS-dependent paths that can leak across tenants if RLS isn't enabled on the underlying tables, plus signature-level footguns where the wrong call burns a tenant boundary silently.",
    estimate: "1-2 weeks (RLS verification first, code follows)",
    risk: "High",
    icon: ShieldAlert,
    accent: "from-amber-500 to-orange-600",
    items: [
      { title: "Run pg_tables.rowsecurity audit on every multi-tenant table", detail: "Single-record getters across leadService, quoteService, orderCRUD, inventoryService trust RLS for tenant isolation (e.g. getQuote, updateOrder, deleteLead, adjustStock all skip company_id filter). If RLS isn't enabled on every multi-tenant table, every single-record path is a cross-tenant leak. Check: `select tablename, rowsecurity from pg_tables where schemaname='public'` and confirm = true on companies, profiles, orders, leads, quotes, invoices, inventory_items, equipment, kitchen_*, cleaning_*, shopping_*, driver_*, payment_records, gps_tracking, notifications.", status: "todo" },
      { title: "userManagementService.getAllUsers / searchUsers companyId is optional", detail: "Both methods accept companyId as optional. Two callers were just patched (driver-management, users.tsx) but the signature itself remains a footgun. Make companyId required (or add a separate getAllUsersAcrossPlatform for super_admin) so a future caller can't omit it.", status: "todo", ref: "src/services/userManagementService.ts:259,486" },
      { title: "profileService methods completely unscoped by company_id", detail: "getProfiles({role}), getUsersByRole, searchClients, getClientsByRegion all return profiles across every tenant unless RLS catches every one. Add company_id parameter and filter at the query level.", status: "todo", ref: "src/services/profileService.ts:84,117,132,164" },
      { title: "notificationService.markAsRead + deleteNotification have no ownership check", detail: "Both methods accept a notificationId and update / delete without checking the caller is the recipient. RLS-dependent. Add a verify-ownership step or a Postgres function that scopes by auth.uid().", status: "todo", ref: "src/services/notificationService.ts:128,197" },
      { title: "EquipmentVerificationPanel + BrokenEquipmentDashboard scoped by user_id", detail: "Both components filter equipment data by user_id rather than company_id. Inside a single tenant, staff member A won't see staff member B's verifications. Should be company_id throughout.", status: "todo", ref: "src/components/cleaning/EquipmentVerificationPanel.tsx:64 + src/components/cleaning/BrokenEquipmentDashboard.tsx:41" },
      { title: "gps_tracking table has no company_id column", detail: "RLS on gps_tracking can only key off the joined driver_id -> profiles.company_id. Add a denormalised company_id column or wrap reads in a company-aware view.", status: "todo", ref: "src/services/driver/gpsTracking.ts (table schema)" },
      { title: "?dev=true middleware backdoor", detail: "Triple-gated (NODE_ENV != production AND localhost AND ?dev) so on Vercel production it is neutralised at compile time. Low risk but worth removing to reduce surface area and support a clean security audit narrative.", status: "todo", ref: "src/middleware.ts:118-130" },
      { title: "notificationService.broadcastNotification footgun", detail: "Renamed params.userId -> params.companyId; the function body now correctly stamps company_id on every broadcast row.", status: "shipped", ref: "src/services/notificationService.ts" },
      { title: "lib/companyIsolation.ts helper exists but has zero callers", detail: "getCompanyContext, validateCompanyAccess, withCompanyFilter, validateCompanyMutation all defined but unused. Either retire the helper or migrate the services to use it (would close several of the items above for free).", status: "todo" },
    ],
  },
  {
    id: "journey-comms-billing",
    title: "Comms + billing logic that lies to the user",
    why: "Four items where the UI says 'sent' or 'saved' or 'collected' but the underlying behaviour is silently wrong. Each one erodes trust the moment a tenant double-checks.",
    estimate: "1 week",
    risk: "High",
    icon: AlertCircle,
    accent: "from-orange-500 to-amber-500",
    items: [
      { title: "emailService silently no-ops when no provider configured", detail: "When a tenant has no Resend / SMTP row in email_settings, emailService.sendEmail falls through to console.log and returns status: 'sent'. Tenants believe email is going out. Either return status: 'simulated' or surface a 'no provider configured' banner on the admin email pages.", status: "todo", ref: "src/services/emailService.ts:161" },
      { title: "Invoices 'Total Revenue' KPI sums all invoices including drafts + outstanding", detail: "Should filter to status='paid' or relabel to 'Total Invoiced'. Today the number lies to the owner about what they have actually collected. (Confirmed by closure auditor; was already in Group 9.)", status: "todo", ref: "src/pages/admin/invoices.tsx:386-388" },
      { title: "Invoices loadOrders closure bug, orders show as uninvoiced on first load", detail: "loadOrders filters using stale invoices state from the previous render. On first load invoices is [] so every order appears uninvoiced. (Confirmed by closure auditor; was already in Group 9.)", status: "todo", ref: "src/pages/admin/invoices.tsx:122-126" },
      { title: "Driver schedule + deliveries expose customer total_amount to drivers", detail: "Both pages render the full orders.total_amount column. Drivers see what the catering company is charging the client. Decision needed: hide it or replace with a driver-fee column. Today this leaks revenue data to every driver on every shift.", status: "todo", ref: "src/pages/team-portal/driver/schedule.tsx:154 + src/pages/team-portal/driver/deliveries.tsx:188" },
      { title: "VAT defaults to 15% silently if company has no tax_rate", detail: "invoiceGenerationService applies 15% VAT regardless of tenant region if the companies row has no tax_rate set. UK / US tenants get the wrong rate without warning. Block invoice generation until tax_rate is configured.", status: "todo", ref: "src/services/invoiceGenerationService.ts:135" },
      { title: "Onboarding completion in localStorage", detail: "onboardingService.getOnboardingProgress reads / writes localStorage[onboarding_${userId}]. Not synced to companies.onboarding_completed. super_admin can never see real onboarding progress; switching browser loses progress. Move to a server-side state derived from real signals (first menu created, first lead added, first quote sent).", status: "todo", ref: "src/services/onboardingService.ts" },
      { title: "Two trial enum values in use ('trial' vs 'trialing')", detail: "Resolved in A.13 #3 drift sweep. companyService.createCompany now writes 'trial' (the canonical value every reader expects). Migration 20260518740000 drops 'trialing' from the subscription_status enum so the DB enforces the convergence. subscription-management.tsx still normalises defensively but the workaround is no longer load-bearing.", status: "shipped" },
      { title: "Hardcoded R150/hour in timeClockService", detail: "Pay rate is a literal in code. Should come from companies.default_hourly_rate or per-profile hourly_rate. Critical before drivers / kitchen staff start logging real hours.", status: "todo", ref: "src/services/timeClockService.ts:91" },
      { title: "Hardcoded R250/delivery in driver dashboard + routes", detail: "Today's Potential Earnings + Potential Earnings panels multiply job count by R250. Already in Group 9; re-confirmed by driver auditor. Replace with driver_pay_rates or company-default rate.", status: "todo", ref: "src/pages/team-portal/driver/dashboard.tsx:354 + src/pages/team-portal/driver/routes.tsx:238,445,619" },
    ],
  },
  {
    id: "journey-dead-ui",
    title: "Dead UI + orphaned components",
    why: "Buttons that don't fire, components that never get rendered, status enums that drift between files. None of these are launch-blockers individually but together they make the app feel half-finished and create confusion when a real user clicks something that does nothing.",
    estimate: "3-4 days",
    risk: "Medium",
    icon: ListChecks,
    accent: "from-slate-500 to-slate-600",
    items: [
      { title: "/admin/inventory has dead Add / Edit / Delete / Sync / Filters / Export buttons", detail: "All five top-bar actions lack onClick handlers. Working CRUD lives at /admin/inventory-tracking instead. Either consolidate the two pages or wire the buttons. (Group 9 also flagged the supplier label + expiryDate hardcoding on this page.)", status: "todo", ref: "src/pages/admin/inventory.tsx" },
      { title: "Convert to Quote button doesn't actually convert in the DB", detail: "/admin/leads/index.tsx:241 routes to /admin/quotes/new?leadId=... but quotes/new reads the lead from localStorage. The conversion never happens at the leadService level. Lead status stays 'new'.", status: "todo", ref: "src/pages/admin/leads/index.tsx:241" },
      { title: "DriverConfirmationPanel is orphaned", detail: "Four-stage delivery checklist component exists at components/driver/DriverConfirmationPanel.tsx but is not surfaced from any audited driver page (dashboard, routes, deliveries, tracking, schedule). Either wire it into the delivery flow or delete it.", status: "todo", ref: "src/components/driver/DriverConfirmationPanel.tsx" },
      { title: "order_number generated as ORD-${quote.id.substring(0,8)}, collision risk", detail: "convertQuoteToOrder generates an order_number from the first 8 chars of the quote UUID. Running the conversion twice (e.g. retry after a failure) collides on the unique constraint. Use a real sequence per company_id or add a random suffix.", status: "todo", ref: "src/services/quoteService.ts:130" },
      { title: "Status drift, 'out_for_delivery' vs 'in_transit'", detail: "orderWorkflow.startDelivery writes status='out_for_delivery' but every UI surface (orders kanban, c/order/[id] timeline) reads 'in_transit'. The status label disappears on the dashboard the moment the driver clocks in. Pick one and migrate.", status: "todo", ref: "src/services/order/orderWorkflow.ts:114" },
      { title: "Calendar 'Upcoming' KPI capped at 5", detail: "upcoming.length is read from an array sliced earlier for the next-five list view. Use a separate uncapped count for the KPI. (Group 9 confirmed by sales-funnel auditor.)", status: "todo", ref: "src/pages/admin/calendar.tsx:407" },
      { title: "Currency 90-day trend assumes chronological order", detail: "Reads first vs last entries of historicalRates without sorting. If the array isn't strictly sorted the trend calculation is wrong. (Group 9 confirmed.)", status: "todo", ref: "src/pages/admin/platform/currency-monitoring.tsx:90-101" },
      { title: "/client/subscription-invoices is gated behind UserRole.CLIENT", detail: "This page is SaaS subscription billing (CateringMS billing the catering company) but its role guard is UserRole.CLIENT. End clients of catering companies are seeing CateringMS's billing screen. Should be UserRole.COMPANY_ADMIN / OWNER.", status: "todo", ref: "src/pages/client/subscription-invoices.tsx" },
      { title: "/api/integrations/invoice-paid updates orders not invoices", detail: "Zapier inbound webhook flips order.payment_status only. Doesn't touch invoices.status. Two paths can drift over time. Should update both transactionally.", status: "todo", ref: "src/pages/api/integrations/invoice-paid.ts" },
      { title: "estimatedFuelCost in routeOptimizationService uses USD-style 1.5/L", detail: "Currency-blind hardcoded value. Make currency-aware via companies.currency or a regional config.", status: "todo", ref: "src/services/routeOptimizationService.ts:391" },
    ],
  },
  {
    id: "journey-fixes-shipped",
    title: "Audit fixes already shipped (28 Apr 2026 audit trail)",
    why: "Reference list of every fix the six audit agents shipped in flight on 28 April 2026 while the audit ran. Recorded for traceability. Items below are SHIPPED, not todo.",
    estimate: "Done",
    risk: "Low",
    icon: CheckCircle2,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Multi-tenancy fix on /admin/driver-management", detail: "userManagementService.getAllUsers() called without company_id meant company admins saw drivers across every tenant. Now scoped to user.company_id with early return.", status: "shipped", ref: "596ef67" },
      { title: "/api/admin/create-user authentication", detail: "Endpoint was unauthenticated, any anonymous POST could create users with arbitrary role + company_id. Now requires authenticated caller; super_admin can mint anywhere, company-level roles only inside their own tenant and never as super_admin.", status: "shipped", ref: "4f3bc10" },
      { title: "/api/send-email caller-company lock", detail: "Endpoint was wide open and accepted companyId from the request body unauthenticated. Now derives company_id from the authenticated caller.", status: "shipped", ref: "f0b4e6f" },
      { title: "Multi-tenancy fix on kitchen notifications + duty service", detail: "kitchen/notifications.tsx query and kitchenDutyService.getActiveDutyShifts both lacked company_id filtering. Both fixed.", status: "shipped", ref: "318c758" },
      { title: "Multi-tenancy fix on cleaning/dashboard equipment_bookings", detail: "Query lacked company_id filter and ChatBot read user.user_metadata.company_id. Both fixed.", status: "shipped", ref: "14c7b3a" },
      { title: "Multi-tenancy fix on AdminTrackingMap", detail: "Live driver location subscription + 30s poll had no company filter; admin saw drivers across every tenant. AdminTrackingMap now accepts companyId.", status: "shipped", ref: "71bb93e" },
      { title: "TimeClockWidget displayed NaN duration", detail: "Read currentSession.clock_in_time, no such column. Now reads clock_in correctly.", status: "shipped", ref: "71bb93e" },
      { title: "Driver startJob / completeJob were silent no-ops", detail: "Passed empty string as driverId. Now resolves driverId from auth session before calling deliveryOps.updateDeliveryStatus.", status: "shipped", ref: "71bb93e" },
      { title: "Route optimiser missed orders dispatched via assigned_driver_id", detail: "routeOptimizationService.getUnassignedOrders + getDriverPendingOrders only matched legacy driver_id. Now ORs across both columns and writes both on saveOptimizedRoute.", status: "shipped", ref: "71bb93e" },
      { title: "Client tracking never showed driver pin", detail: "/client-portal/tracking never set driver_id so the GPS row was never fetched. Now hydrates driver_id from the joined assigned driver.", status: "shipped", ref: "71bb93e" },
      { title: "send-invoice-email content-type bug", detail: "Handler used formidable but the body was JSON; every invoice email send returned 500. Now reads JSON body. (Underlying 'no real provider' issue still open as a P0.)", status: "shipped", ref: "14c7b3a" },
      { title: "Webhook flips order.status='completed' on paid invoice", detail: "Payment confirmation webhook didn't propagate to order status. Now does.", status: "shipped", ref: "14c7b3a" },
      { title: "Trial period normalised to 30 days", detail: "companyService.createCompany was 14 days; createCompanyAndOwner was 30. Both now 30 days to match the UI.", status: "shipped", ref: "4f3bc10" },
      { title: "TrialExpiryBanner now reads from companies", detail: "Banner queried an empty subscriptions table via subscriptionService and never showed. Now reads companies.subscription_status via AuthContext.", status: "shipped", ref: "4f3bc10" },
      { title: "Sales funnel: dead Send button on /admin/quotes wired", detail: "Send button had no onClick handler. Now triggers quoteService.sendQuote.", status: "shipped", ref: "73811cd" },
      { title: "Sales funnel: empty event_date crashed manual lead creation", detail: "leadService.createLead would error on empty string event_date. Now guarded.", status: "shipped", ref: "a68c5f3" },
    ],
  },
];

// =====================================================================
// GROUP 11 - TRACKING + ROUTE PLANNING CANONICAL SPLIT (29 Apr 2026)
// =====================================================================
// /admin/tracking and /admin/route-planning had drifted into looking like
// the same page. Bobby remembered there was a deliberate split but couldn't
// recall the intent. Archaeology of the git log + service shape made the
// canonical split obvious:
//
//   - /admin/tracking      = LIVE ops view (today's jobs, GPS pings,
//                            status changes ticking through). Audience:
//                            owner / admin during a shift.
//   - /admin/route-planning = PRE-FLIGHT dispatch view (tomorrow's
//                            confirmed orders, optimiser, driver lock-in).
//                            Audience: dispatcher the night before.
//
// Both pages share the underlying tables but render different slices.
const trackingRouteSplitCards: SprintCard[] = [
  {
    id: "tracking-canonical",
    title: "Canonical purpose split + thesis",
    why: "Two pages had become confusing duplicates. Recovered the intent from the commit history (2dad5e5 'real-time map tracking', 042d31e 'automated route planning'), service shape (routeOptimizationService.optimizeAllDriverRoutes vs gpsTracking.getDriverLocation), and tooltip language. Documented so the next dev doesn't re-merge them.",
    estimate: "Done",
    risk: "Low",
    icon: GitBranch,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Tracking = LIVE ops view (today's jobs in flight)", detail: "Filters orders to event_date >= today AND status in (confirmed, preparing, ready, in_transit / out_for_delivery, delivered). Auto-refresh actually re-fetches every 30s. Selected order stays in sync across refreshes.", status: "shipped" },
      { title: "Route Planning = PRE-FLIGHT dispatch view (tomorrow's confirmed orders)", detail: "Pulls unassigned orders + active drivers from the DB, runs the optimiser, persists routes via saveOptimizedRoute. After Apply, the order disappears from the queue and the driver gets a notification.", status: "shipped" },
      { title: "Both pages now have distinct headers + descriptions reflecting audience", detail: "Tracking: 'Live operational view, today's jobs in flight, with driver pins ticking through.' Route Planning: 'Pre-flight dispatch: assign drivers to confirmed orders, run the optimiser, lock in routes.'", status: "shipped" },
    ],
  },
  {
    id: "tracking-data-wiring",
    title: "Real-data wiring on both surfaces",
    why: "Route planning shipped with MOCK_ORDERS / MOCK_DRIVERS hardcoded since 1668521. Tracking partially wired but reading stale driver_id. Both now query Supabase scoped by company_id.",
    estimate: "Done",
    risk: "Low",
    icon: Database,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Route planning: replaced MOCK_DRIVERS / MOCK_ORDERS with live queries", detail: "routeOptimizationService.getUnassignedOrders(companyId) + driverService.getAllDrivers(companyId). Active drivers only (is_active defaulting to true for legacy rows).", status: "shipped" },
      { title: "Optimise All Routes now persists to DB", detail: "Calls routeOptimizationService.optimizeAllDriverRoutes which writes to orders.driver_id + assigned_driver_id and fires the driver notification. Removed the mock short-circuit in applyRoute.", status: "shipped" },
      { title: "Tracking: reads assigned_driver_id first, falls back to legacy driver_id", detail: "Brings the page in line with the audit fix in 71bb93e where the optimiser writes both columns.", status: "shipped" },
      { title: "Tracking: auto-refresh actually re-fetches", detail: "Previous build had the toggle state but no setInterval. Now 30s polling when ON, cleared when OFF or unmounted.", status: "shipped" },
    ],
  },
  {
    id: "tracking-rich-pane",
    title: "Rich Order Details right-pane",
    why: "Old pane showed status / client / address / time. New pane is a deep-link dashboard with eight blocks so an owner can find the answer to 'where is order X' in one click instead of five.",
    estimate: "Done",
    risk: "Low",
    icon: Layout,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Header with Today / Tomorrow / Overdue badge", detail: "Order number, event name + date + time, status pill, time-relative badge derived from event_date.", status: "shipped" },
      { title: "Client block with mailto + tel + WhatsApp + Compose drawer", detail: "Compose mirrors the QuoteComposeDrawer pattern from 46ec141: status-aware template, four send channels (Gmail, Outlook, mailto, clipboard).", status: "shipped" },
      { title: "Venue block with Open in Google Maps", detail: "https://www.google.com/maps/search/?api=1&query=..., works without an API key.", status: "shipped" },
      { title: "Live progress timeline", detail: "Pending -> confirmed -> preparing -> ready -> out_for_delivery -> delivered with current step highlighted. Reads order_status_history when populated; falls back gracefully when the table is empty.", status: "shipped" },
      { title: "Quick actions chips", detail: "Full order, Invoice, Kitchen prep, Call driver, Client view link (when active client_access_token exists). Each is a deep link, not an inline action.", status: "shipped" },
      { title: "Payment block with paid-of-total summary + balance invoice link", detail: "'R45,000 paid of R60,000 total' line, deposit / balance breakdown, link to /admin/invoices?orderId=...&action=balance when outstanding.", status: "shipped" },
      { title: "Kitchen prep block: X/Y prep tasks done with progress bar", detail: "Counts kitchen_task_completions for the order_id, both total and status='completed'.", status: "shipped" },
      { title: "Equipment block with shortage link", detail: "Counts order.equipment_items, links to /admin/equipment-shortages when any item is flagged.", status: "shipped" },
      { title: "Driver block (only when assigned)", detail: "Driver name, phone tel: link, last GPS ping time, reassign link to /admin/route-planning. Block hidden entirely when no driver to avoid empty rows.", status: "shipped" },
    ],
  },
  {
    id: "tracking-still-todo",
    title: "Known gaps + flagged for follow-up",
    why: "What this work didn't fix. Each item is a real issue surfaced during the wiring but out of scope for the canonical-split commit. Add to the audit backlog.",
    estimate: "1-2 weeks",
    risk: "Medium",
    icon: AlertTriangle,
    accent: "from-amber-500 to-orange-600",
    items: [
      { title: "venue_lat / venue_lng never populated on order create", detail: "routeOptimizationService.getUnassignedOrders filters by .not('venue_lat', 'is', null) so any order without geocoded coordinates is silently excluded from dispatch. Wire googleMapsService.geocodeAddress into the order create flow + a backfill script for existing rows.", status: "todo" },
      { title: "gps_tracking.upsert onConflict 'driver_id' is structurally wrong", detail: "Already flagged in Group 10 (journey-blockers) but worth re-flagging here: the LIVE map relies on this table, and the upsert on a non-unique column will eventually fight with itself. Either change to insert (history) or add a driver_locations table with driver_id unique.", status: "todo" },
      { title: "Map uses Leaflet / OpenStreetMap, not Google Maps, no API key needed", detail: "Documented for clarity. The 'Open in Google Maps' link in the venue block uses the public maps URL scheme which doesn't require a key. If we ever switch the embed to Google we'll need a key + billing.", status: "todo" },
      { title: "kitchen_task_completions schema may not have order_id column on every tenant", detail: "If the count returns null we hide the block silently. Confirm the column exists across all tenants; either backfill or add a defensive check on the kitchen-duty-tracking creation path.", status: "todo" },
      { title: "order_status_history may not be populated on all orders", detail: "orderWorkflow.updateOrderStatus inserts into order_status_history, but legacy orders pre-dating that code path won't have entries. Timeline still renders from current status, but the 'X status changes recorded' line will read 0 for older orders. Backfill on next migration sweep.", status: "todo" },
      { title: "Route planning fuel cost still uses USD-style 1.5/L", detail: "Already flagged in Group 10 (journey-dead-ui). Display now reads R rather than $ but the underlying constant in routeOptimizationService.calculateRouteStats is currency-blind. Fix at service level.", status: "todo" },
      { title: "Reassign Driver link routes to /admin/route-planning instead of opening an inline picker", detail: "Inline driver-pick on the right pane would be nicer but adds scope. For now the link works, dispatcher can re-run the optimiser with the order back in the queue.", status: "todo" },
    ],
  },
];

// =====================================================================
// GROUP 12 - SMART SEARCH ROLLOUT (29 Apr 2026)
// =====================================================================
// Bobby flagged that every search bar across the SaaS was "dumb": basic
// case-insensitive substring match against one or two fields. Built a
// pure-TS scored fuzzy matcher (useFuzzySearch) and rolled it into every
// page-local search bar, plus upgraded the global Cmd+K palette to search
// live company-scoped data (orders, clients, leads, quotes, inventory)
// rather than just navigation entries.
const smartSearchCards: SprintCard[] = [
  {
    id: "smart-search-shipped",
    title: "Smart search rollout, shipped",
    why: "Audit found 30+ search bars across the app, all using `.toLowerCase().includes(...)` against one or two fields. Replaced every one with a single reusable fuzzy hook, debounced, with weighted multi-field scoring. Cmd+K palette upgraded from a navigation menu into a true search-anywhere surface. All searches company-scoped (multi-tenancy verified, not trusted).",
    estimate: "Done",
    risk: "Low",
    icon: Sparkles,
    accent: "from-brand-primary to-brand-secondary",
    defaultOpen: true,
    items: [
      { title: "useFuzzySearch hook, pure-TS, zero deps", detail: "Five-tier scorer (exact > prefix > substring > token-prefix > subsequence), per-field weights, 200ms debounce, returns highlight ranges. ~100 lines of real logic so we don't pull Fuse.js.", status: "shipped", ref: "src/hooks/useFuzzySearch.ts" },
      { title: "CommandPalette upgraded to search live data", detail: "Cmd+K (and Ctrl+K) now searches across orders (number, client, venue), clients (name, email, phone), leads (name, company, email), quotes (number, client, event), inventory (name, sku, category). Lazy-loads tenant data on first open, caches for the session, all queries scoped via the user's company_id. Recent searches persisted to localStorage (last 5). shouldFilter forwarded on the cmdk wrapper so cmdk doesn't re-filter our already-scored list.", status: "shipped", ref: "src/components/CommandPalette.tsx" },
      { title: "Page-local search upgraded on 22 pages", detail: "/admin/orders, /admin/clients, /admin/leads, /admin/quotes (added a search where there was none), /admin/inventory, /admin/inventory-tracking, /admin/tracking, /admin/users, /admin/driver-management, /admin/notifications, /admin/order-assignments, /admin/equipment-shortages, /admin/invoices, /admin/inventory-recipes, /admin/client-search, /admin/platform/company-database, /admin/platform/user-management, /admin/platform/subscription-management, /support, /client-portal/billing, /team-portal/cleaning/equipment, /team-portal/cleaning/damage, /team-portal/cleaning/supplies, /team-portal/cleaning/workflows, /team-portal/kitchen/menu, /team-portal/kitchen/stock, /team-portal/shopping/inventory, /team-portal/shopping/invoices, /team-portal/shopping/suppliers, /team-portal/driver/deliveries (added a search where there was none), components/cleaning/EquipmentVerificationPanel.", status: "shipped" },
      { title: "Visual UX preserved", detail: "Same input, same Search icon, same surrounding layout. Only the match logic changed underneath. Placeholders updated where the old one was misleading (e.g. /admin/orders went from 'Search by client, order ID, or venue...' to '...venue or event' to reflect the new fields).", status: "shipped" },
      { title: "Multi-tenancy verified on every touched page", detail: "Each page that loaded data already filtered by user.company_id at the service layer (orderService.getAllOrders(companyId), leadService.getLeads(companyId), inventoryService.getInventory(companyId), etc). Cmd+K palette pulls through the same services so tenant isolation is enforced at the data-fetch level, not trusted to a client-side filter.", status: "shipped" },
    ],
  },
  {
    id: "smart-search-flagged",
    title: "Smart search rollout, flagged for follow-up",
    why: "Two surfaces were intentionally NOT migrated. Both are dumb-search today and noted here so a future pass picks them up.",
    estimate: "1-2h",
    risk: "Low",
    icon: AlertTriangle,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "/blog has a 'Search articles...' input that is wired to nothing", detail: "Input has no value/onChange. Was decorative when the blog page was added. Either wire it to an article fuzzy search (cms-blog content is already loaded client-side) or remove the input. Skipped from this rollout because it's a dead UI not a dumb UI.", status: "todo", ref: "src/pages/blog/index.tsx:127" },
      { title: "/admin/route-planning search not touched", detail: "Page is being rebuilt by a parallel agent. Hands-off until that lands so we don't conflict on the surrounding layout.", status: "todo", ref: "src/pages/admin/route-planning.tsx" },
    ],
  },
];

// =====================================================================
// GROUP 12 - EMBEDDABLE LEAD-CAPTURE FORMS (29 Apr 2026)
// =====================================================================
// Four-agent parallel build: schema + types, public API + admin CRUD,
// 10 vanilla-HTML templates + loader, admin gallery + customiser. 10
// commits shipped in one wave (4e9551b through fa992d5 + 6dfdd5a, 798b2e9,
// 75847ce). The U3 feature from Group 6 is now live in code - needs DB
// migration applied + Turnstile keys configured before tenants can use it.
const embedFormsCards: SprintCard[] = [
  {
    id: "embed-shipped",
    title: "Shipped in this build",
    why: "Reference list of every commit and surface that landed in the four-agent parallel build on 29 April 2026.",
    estimate: "Done",
    risk: "Low",
    icon: CheckCircle2,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Schema migration: companies.embed_token + embed_pricing_tiers + 3 new tables", detail: "embed_form_configs (per-tenant form variants), embed_form_submissions (audit + lead linkage), embed_rate_limits (24h pruning TODO). RLS via existing user_has_role + get_user_company_id helpers. Triggers auto-bump submissions_count + last_submission_at. CHECK constraint locks template_id to the 10 known ids. Slug format CHECK on (company_id, slug) so each form has a stable URL-friendly id.", status: "shipped", ref: "supabase/migrations/20260428120000_embed_forms.sql + commit 6dfdd5a" },
      { title: "TypeScript types + per-template default field sets", detail: "EmbedField, EmbedFieldType, EmbedFieldConditional, EmbedTheme, EmbedPricingTier, EmbedFormConfig, EmbedFormSubmission, EmbedTemplateId union. getDefaultFieldsForTemplate(templateId) returns bespoke starter fields for each of the 10 templates with mapsTo hints set so the lead conversion is automatic.", status: "shipped", ref: "src/types/embedForms.ts + src/lib/embedTemplateDefaults.ts + commit 798b2e9" },
      { title: "Public API: GET config / POST submit / GET estimate", detail: "Token-authed (404 on unknown, never 401). 64KB body cap, 200-key payload cap, salted SHA-256 IP hashing, fail-open rate-limit, honeypot returns 200 ok:true so bots get no signal, Turnstile soft-fail in dev. Submit pipeline: honeypot -> Turnstile -> rate-limit -> validate -> mapsTo -> create lead (source='embed') -> audit row -> fire-and-forget admin notification + auto-reply email if enabled.", status: "shipped", ref: "src/pages/api/public/embed/[token]/{config,submit,estimate}.ts + commit 75847ce" },
      { title: "Helper module + service-role factory", detail: "Pure functions for validation, payload-to-lead mapping, IP hashing, Turnstile verify, rate-limit increment. Reusable for any other public endpoint that needs RLS bypass via service role.", status: "shipped", ref: "src/lib/embedFormApi.ts + src/lib/supabase/service.ts" },
      { title: "Admin CRUD endpoint with tenant ownership re-check", detail: "GET list / POST create / PATCH /:id / DELETE /:id. Auth pattern matches the hardened create-user.ts. Re-reads company_id from the row before every PATCH/DELETE so a leaked form id from another tenant cannot be mutated. Only super_admin can target other tenants.", status: "shipped", ref: "src/pages/api/admin/embed/forms.ts" },
      { title: "10 vanilla-HTML templates + loader + helpers + demo", detail: "Quick Card, Modern Inline, Luxe Vertical, Floating Widget, Detailed Multi-Step, Pricing Calculator (live estimate), Wedding Specialist, Corporate Catering, Event Estimator, Spit Braai Quick. ~33-36KB total bundle. Shadow DOM style isolation, CSS custom properties for white-label, conditional field engine, WCAG AA, mutation observer for SPA host sites, Turnstile mounted in light DOM (Cloudflare requirement).", status: "shipped", ref: "public/embed/loader.js + public/embed/helpers.js + public/embed/templates/*.js + public/embed/demo.html + commit 8d249cf" },
      { title: "Admin gallery at /admin/integrations/embed", detail: "Gradient header, four MetricCard tiles (forms / views / submissions / conversion), per-form cards with live preview iframe + status badge + dropdown actions, fuzzy search via useFuzzyItems, empty state with 'under 2 minutes' CTA.", status: "shipped", ref: "src/pages/admin/integrations/embed.tsx + commit d0ca83a" },
      { title: "Three-column customiser with auto-save", detail: "Field editor with up/down reorder, label/placeholder/type, required/visible toggles, options for select/radio, conditional logic, mapsTo lead-column hint. Sandboxed live-preview iframe receives postMessage on every change. Right sidebar: form settings, theme overrides, success behaviour, pricing tiers (only when template flag is set), analytics block.", status: "shipped", ref: "src/pages/admin/integrations/embed/[id].tsx + commit 5342cc4" },
      { title: "Snippet generator with developer hand-off", detail: "Dark code block with copy button, 'Preview live' link, three accordion install guides (WordPress / Wix / Custom). 'Send to my web developer' opens the QuoteComposeDrawer pattern with Gmail / Outlook / mailto / clipboard channels.", status: "shipped", ref: "src/components/admin/embed/SnippetDialog.tsx + commit c96a093" },
      { title: "Per-form analytics block + endpoint", detail: "30-day SVG sparkline of submissions, top-5 referrers, 30d vs prev-30d trend arrow, deep-link to /admin/leads filtered by source=embed and form_id.", status: "shipped", ref: "src/components/admin/embed/AnalyticsBlock.tsx + src/pages/api/admin/embed/analytics.ts + commit 240d9b8" },
      { title: "AdminNav entry under Communications", detail: "Lead Capture Forms with the Code2 icon. Defaults closed since it's a quarterly setup task, not daily-use.", status: "shipped", ref: "src/components/admin/AdminNav.tsx + commit fa992d5" },
    ],
  },
  {
    id: "embed-todo",
    title: "What Bobby still needs to do for tenants to actually use this",
    why: "Code is on origin/main but the feature does not work end-to-end until these manual steps are done. Order matters.",
    estimate: "1-2 hours",
    risk: "Low",
    icon: AlertCircle,
    accent: "from-brand-primary to-brand-secondary",
    defaultOpen: true,
    items: [
      { title: "Apply migration 20260428120000_embed_forms.sql", detail: "Open Supabase dashboard -> SQL Editor -> paste the migration -> run. Adds embed_token to companies (auto-fills via gen_random_uuid()), creates the three new tables, adds RLS policies, adds triggers.", status: "todo" },
      { title: "Apply migration 20260428130000_embed_forms_api.sql", detail: "Same path. Adds companies.auto_reply_to_embed_submissions and the increment_embed_form_views RPC.", status: "todo" },
      { title: "Set EMBED_IP_HASH_SALT env var on Vercel", detail: "Generate a 32+ char random string (e.g. `openssl rand -hex 32`) and add as a server-side env var. Without this the IP hashes still work but use a placeholder salt.", status: "todo" },
      { title: "Anti-spam: revisit if spam materialises (Bobby prefers NOT Cloudflare)", detail: "Honeypot is wired and working on every public form. Turnstile env vars (TURNSTILE_SECRET_KEY + NEXT_PUBLIC_TURNSTILE_SITE_KEY) are gated and silently disabled until set, so we can add ANY provider later without code changes - the verifyTurnstile call in lib/embedFormApi.ts is generic. If spam shows up, evaluate alternatives Bobby is OK with first: hCaptcha (closest drop-in replacement, same API shape), Friendly Captcha (privacy-first, EU), or simple proof-of-work like mCaptcha. Skip Cloudflare unless every alternative fails.", status: "todo" },
      { title: "Schedule a daily job to prune embed_rate_limits older than 24h", detail: "Either Supabase pg_cron or a Vercel cron job hitting an admin endpoint. Without this the table grows ~hundreds-of-thousands of rows per active tenant per year. Not urgent for soft-launch.", status: "todo" },
      { title: "Decide the public loader URL", detail: "Templates assume the loader lives at https://cateringms.com/embed/loader.js. If the production domain differs, update the snippet generator's defaultLoaderUrl. The script + templates are served as static assets from Vercel under /public/embed/ so no further config needed.", status: "todo" },
      { title: "Test end-to-end on a real tenant before announcing", detail: "Apply migrations -> log in as Spit Braai -> /admin/integrations/embed -> pick Spit Braai Quick template -> customise -> copy snippet -> paste into a test HTML page locally or on a staging marketing site -> submit a test enquiry -> verify lead lands in /admin/leads with source='embed' and the right form_id.", status: "todo" },
    ],
  },
  {
    id: "embed-followups",
    title: "Phase 2 enhancements (post-launch)",
    why: "Items the agents flagged as out of scope for this build but worth queuing for after tenants have used the feature for a few weeks.",
    estimate: "2-3 weeks",
    risk: "Low",
    icon: Sparkles,
    accent: "from-sky-500 to-blue-600",
    items: [
      { title: "A/B test framework for templates", detail: "Let a tenant publish two versions of the same form to different marketing pages, then surface conversion-rate comparison after N submissions. Builds on the existing analytics endpoint.", status: "todo" },
      { title: "Webhook on submission for Zapier / Make / n8n", detail: "Some tenants want the lead to also flow into their existing CRM / spreadsheet / Slack channel. Add a per-form webhook URL on embed_form_configs and POST the submission payload there. Reuse the existing /api/integrations/* bearer-key pattern.", status: "todo" },
      { title: "Calendar availability sync", detail: "Block out unavailable dates in the date picker based on existing orders.event_date. Today the form lets a client pick a date the tenant cannot deliver on, and the tenant has to email back to apologise. Wire to the orders table by event_date count vs companies.max_concurrent_events_per_day setting.", status: "todo" },
      { title: "Multi-language support per form", detail: "EU + multi-region tenants want the same form in EN/AF/FR. Add a translations jsonb on embed_form_configs keyed by language, and language picker in the form header.", status: "todo" },
      { title: "Custom CSS escape hatch", detail: "Power-user tenants will want raw CSS overrides. Add a custom_css text column on embed_form_configs and inject it inside the shadow root. Sandboxed by shadow DOM so it cannot leak to the host site.", status: "todo" },
      { title: "Form version history + restore", detail: "Save a snapshot of fields + theme on every PATCH so a tenant can roll back if a customisation breaks conversions. Soft-store in embed_form_revisions table.", status: "todo" },
      { title: "Prefill from URL params", detail: "Honour ?event_type=wedding&date=2026-06-15 in the embed URL so the tenant's marketing pages can prefill from their own copy. Already partly supported in the loader; needs explicit allow-list on the form config to avoid prefill hijacking.", status: "todo" },
      { title: "PDF auto-quote on submission for high-intent forms", detail: "When the Pricing Calculator template has guests + tier picked, auto-generate a non-binding PDF quote and attach to the auto-reply email. Big conversion lift (industry data: 2-3x).", status: "todo" },
    ],
  },
];

// =====================================================================
// GROUP 13 - DEPLOYMENT + TESTING PLAYBOOK FOR THE DEV TEAM (29 Apr 2026)
// =====================================================================
// Bobby cannot run the dev steps himself - he doesn't have node / vercel /
// cloudflare keys at his fingertips. This group captures every manual
// action a developer needs to take to land the embed forms feature, plus
// the page-by-page acceptance test plan he will run on the live site once
// the build is green again.
const devOpsCards: SprintCard[] = [
  {
    id: "devops-shipped-ops",
    title: "Already done by Bobby's session (29 Apr 2026), audit trail",
    why: "Migrations + cron job + first round of build fixes were applied directly via the Supabase MCP and Bobby's git access. The dev team should NOT redo these. Listed for traceability.",
    estimate: "Done",
    risk: "Low",
    icon: CheckCircle2,
    accent: "from-brand-primary to-brand-secondary",
    items: [
      { title: "Migration 1 applied, companies.embed_token + 3 new tables + RLS + triggers", detail: "Originally 20260428120000_embed_forms.sql. Applied via Supabase MCP. Note: dropped the 'owner' role from RLS policies because user_role enum has no such value (only super_admin / company_admin / admin / kitchen_staff / driver / shopping_staff / cleaning_staff / client). All existing companies (2 of them) auto-got an embed_token.", status: "shipped" },
      { title: "Migration 2 applied, companies.auto_reply_to_embed_submissions + increment_embed_form_views RPC", detail: "Originally 20260428130000_embed_forms_api.sql. Applied via Supabase MCP. Service-role grant on the RPC.", status: "shipped" },
      { title: "Daily cron scheduled, prune_embed_rate_limits_daily", detail: "pg_cron job runs at 03:15 UTC daily, calling public.prune_embed_rate_limits() which deletes rows older than 24h. SECURITY DEFINER wrapper. Verified live via cron.job table.", status: "shipped" },
      { title: "Role-enum fix in API guards (commit 3cf8e4d)", detail: "src/pages/api/admin/embed/{forms,company,analytics}.ts had 'owner' in the role allow-list. Removed, valid admins were going to get 401s.", status: "shipped" },
      { title: "Build fixes (commit f25166f)", detail: "inventory-recipes.tsx:28 used non-existent RecipeIngredient.ingredient_name (correct field is inventory_item_name). tracking.tsx:146 selected companies.name (correct column is company_name). Both fixed; cascade was failing every embed-forms commit since 4e9551b.", status: "shipped" },
    ],
  },
  {
    id: "devops-vercel-env",
    title: "Vercel environment variables (5 minutes per dev)",
    why: "The embed forms public API hashes IPs with a server-side salt and verifies Cloudflare Turnstile if Turnstile is wired. Both are env vars the dev team needs to set on Vercel. Without EMBED_IP_HASH_SALT, IP hashing still works but uses a placeholder salt, functional but not production-grade.",
    estimate: "5 minutes",
    risk: "Low",
    icon: Shield,
    accent: "from-brand-primary to-brand-secondary",
    defaultOpen: true,
    items: [
      { title: "Set EMBED_IP_HASH_SALT on Vercel (Production + Preview + Development)", detail: "Generated value Bobby can paste: 17c4714759169984f28e618594bbb2222c41d835120fc3265817e3cfcfbc29cc. Vercel -> Project Settings -> Environment Variables -> Add New. Value persists; redeploy from Deployments tab to apply. Without it the rate-limit IP hashes still work but use a placeholder salt + emit a one-time warn on every cold start.", status: "todo" },
      { title: "Anti-spam captcha (deferred - Bobby prefers not Cloudflare)", detail: "Embed-form + change-request flows currently anti-spam via honeypot only. Code path supports any captcha provider with a Cloudflare-Turnstile-shaped API (verifyTurnstile in lib/embedFormApi.ts is provider-agnostic). When spam materialises, candidates: hCaptcha (drop-in, same API), Friendly Captcha (EU/privacy-first), mCaptcha (self-hostable proof-of-work). Cloudflare Turnstile only as last resort.", status: "todo" },
      { title: "Set RESEND_WEBHOOK_SECRET on Vercel", detail: "From Resend dashboard -> Webhooks -> create endpoint. Copy the whsec_ value. Paste into Vercel env. Without this set, /api/webhooks/resend logs a warning and accepts unsigned posts (fine for dev, dangerous in prod - anyone could fake bounce events).", status: "todo", ref: "src/pages/api/webhooks/resend.ts" },
      { title: "Add /api/webhooks/resend to Resend dashboard", detail: "Resend dashboard -> Webhooks -> Add Endpoint -> URL: https://<your-host>/api/webhooks/resend. Subscribe to: email.bounced, email.complained. Other event types are 200'd silently so no harm in subscribing more, but those two are the only ones we record.", status: "todo", ref: "src/pages/api/webhooks/resend.ts" },
      { title: "Decide the public loader URL", detail: "Snippet builder now defaults to window.location.origin (so dev / preview work). For production you may want a CDN-style stable host. If using a non-Vercel custom domain, pass loaderHost prop to SnippetDialog OR rely on the request origin. Static assets served from /public/embed/ automatically.", status: "todo" },
    ],
  },
  {
    id: "devops-page-by-page",
    title: "Page-by-page acceptance test plan (Bobby drives, dev tags along)",
    why: "Once builds are green and env vars are set, Bobby will walk the app page-by-page on the Spit Braai tenant. The dev team should pair on the embed-forms wave (the highest-risk piece) and stand by during waves 1-4 to fix anything that breaks.",
    estimate: "30-45 minutes wall-clock",
    risk: "Medium",
    icon: ListChecks,
    accent: "from-brand-primary to-brand-secondary",
    defaultOpen: true,
    items: [
      { title: "WAVE 1, nothing-broke smoke test (5 min)", detail: "/admin/dashboard loads; tooltip on Booked Revenue reads in plain English with paragraph break. /admin/clients Compose button works. /admin/quotes Compose button on non-draft quotes opens drawer. /admin/quotes/new address field shows Google Places suggestions. Sidebar accordion sections persist open/closed state on reload.", status: "todo" },
      { title: "WAVE 2, embed forms feature end-to-end (15 min, the big one)", detail: "/admin/integrations/embed loads with empty state. Browse templates -> 10 cards render with live previews. Pick Spit Braai Quick -> customiser opens. Tweak success message, save. Get snippet -> dialog shows snippet with data-token UUID. Open /embed/demo.html?template=spit-braai-quick&token={token}&slug={slug} in a new tab, form should render with company colours. Submit a fake enquiry -> check /admin/leads for new row with source='embed'.", status: "todo" },
      { title: "WAVE 3, tracking + route planning (10 min)", detail: "/admin/tracking shows 9-block Order Details panel on click. Compose button in the client block works. /admin/route-planning shows real unassigned orders + drivers (no MOCK_ORDERS).", status: "todo" },
      { title: "WAVE 4, global Cmd+K search (2 min)", detail: "Press Cmd+K (or Ctrl+K on Windows) anywhere. Palette opens. Type a client name, fuzzy results badged Order/Client/Lead/Quote. Enter on a result -> deep-link to right page.", status: "todo" },
    ],
  },
  {
    id: "devops-known-build-class",
    title: "Class of error: agent-introduced wrong column references",
    why: "Two of the embed-forms agents and the tracking-pane agent assumed schema column names without checking. Their fixes are already in but the same class of mistake will likely surface again as the dev team adds more features against this codebase. Write it up now so the next dev does not lose 30 minutes.",
    estimate: "Reference",
    risk: "Low",
    icon: AlertCircle,
    accent: "from-slate-500 to-slate-600",
    items: [
      { title: "Always check src/integrations/supabase/database.types.ts for the canonical column name", detail: "The agent guessed companies.name; the column is companies.company_name. Cost: every commit since 4e9551b failed in Vercel until commit f25166f. Five minutes of typing the column wrong = three hours of cascading red builds. Always grep database.types.ts first.", status: "todo" },
      { title: "user_role enum values are fixed, super_admin, company_admin, admin, kitchen_staff, driver, shopping_staff, cleaning_staff, client", detail: "There is no 'owner' role. Every place that checks roles must use only those eight values. The embed-forms agent slipped 'owner' into three API endpoints AND the SQL migration; one caused the migration to fail outright with 'invalid input value for enum user_role: owner', the other three would have given valid admins 401 responses. Already fixed.", status: "todo" },
      { title: "RecipeIngredient.inventory_item_name (NOT ingredient_name)", detail: "RecipeIngredient lives at src/services/inventoryDeductionService.ts:7-11 and exposes inventory_item_name + quantity_per_serving + unit. The actual recipes table uses recipe_ingredients with a different shape (ingredient_name lives there). When working with the in-memory RECIPE_MAPPINGS, use inventory_item_name. When working with the DB recipe_ingredients table, use ingredient_name.", status: "todo" },
      { title: "When in doubt, run `npx tsc --noEmit` BEFORE pushing", detail: "Vercel runs the full Next.js build incl type check on every push. A two-second local check catches every cascade-failure error this group has been bitten by. Add this to the team's PR checklist.", status: "todo" },
    ],
  },
];

const groups: Group[] = [
  { id: "built", title: "1. Foundation, What's already built", description: "Production-ready features. ~89,000 lines of code, 138 tables, 8 portals. Items in this group are functional but may have audit-flagged caveats noted inline.", cards: builtFeatures },
  { id: "audit", title: "2. Audit findings, Phase 1 shipped, Phase 2 planned", description: "215-IQ multi-specialist audit (architecture, DB, security, business logic, UI/UX) flagged ~150 actionable findings. Phase 1 is done; Phase 2A-F sequenced by minimum-blast-radius.", cards: auditCards },
  { id: "integration", title: "3. Pre-launch, Integration setup", description: "Each integration is code-complete. What is needed is credentials and a short configuration step.", cards: integrationCards },
  { id: "testing", title: "4. Pre-launch, Testing + beta", description: "4 user-journey tests + beta with 3 real catering companies. Expected: 20-35 bugs surfacing, 10-15 UX improvements.", cards: testingCards },
  { id: "launch", title: "5. Pre-launch, Performance, security audit, launch", description: "Performance targets, external security audit, monitoring setup, soft launch (10 companies) then public launch.", cards: launchCards },
  { id: "expansion", title: "6. Market expansion, features to win SA / UK / US", description: "Sourced from a 60-company competitive audit (20 per region) on 28 April 2026. Universal builds (U1-U8) unlock all three markets in one investment; region-specific items address local compliance + buyer expectations; wow-factor moats are global firsts no competitor has shipped.", cards: [...universalCards, ...saExpansionCards, ...ukExpansionCards, ...usExpansionCards, ...wowFactorCards] },
  { id: "reference", title: "7. Reference, Metrics, risks, team plan", description: "Concrete success metrics, known risks with mitigations, team plan and budget.", cards: referenceCards },
  { id: "product-notes", title: "8. Product notes, Bobby's roadmap ideas", description: "Feature ideas captured 27 April 2026. AI onboarding, WhatsApp/Facebook automation, events equipment, support model, AI receipt scanning, inventory admin page. All todo, sequencing TBD.", cards: productNotesCards },
  { id: "tooltip-audit", title: "9. Tooltip rollout audit findings (28 Apr 2026)", description: "Surfaced while rolling out info tooltips across 71 pages. P0 multi-tenancy leak already fixed (commit 596ef67). Remaining items split into broken UX, mock/localStorage flows that need real persistence, and structural patterns to consolidate.", cards: tooltipAuditCards },
  { id: "journey-audit", title: "10. Customer journey audit findings (28 Apr 2026)", description: "Six parallel auditors traced the journeys end-to-end using the rewritten tooltips as contracts: Lead->Quote->Order, Order->Kitchen, Driver->Delivery, Cleaning->Invoice->Payment, SaaS lifecycle, and cross-cutting auth+tenancy+comms. Sixteen wiring fixes shipped in flight. Remaining items split into customer-journey blockers, multi-tenancy + auth, billing/comms that lies, dead UI, and a record of the fixes already shipped.", cards: journeyAuditCards },
  { id: "tracking-route-split", title: "11. Tracking + Route Planning canonical split (29 Apr 2026)", description: "/admin/tracking and /admin/route-planning had drifted into looking like the same page. Recovered the canonical purpose split (LIVE ops vs PRE-FLIGHT dispatch), wired both surfaces to real Supabase data, and rebuilt the Order Details right-pane on tracking as a deep-link dashboard with eight blocks so an owner can answer 'where is order X' in one click.", cards: trackingRouteSplitCards },
  { id: "embed-forms", title: "12. Embeddable lead-capture forms (29 Apr 2026)", description: "Built the U3 market-disrupting feature from Group 6: a public embeddable quote-request form system. Catering tenants drop a script tag into their own marketing site (WordPress / Wix / Squarespace / Webflow / custom) and a token-authed form lands leads in the CRM. Ten templates (Quick Card, Modern Inline, Luxe Vertical, Floating Widget, Detailed Multi-Step, Pricing Calculator, Wedding Specialist, Corporate Catering, Event Estimator, Spit Braai Quick), each white-label colour-aware, conditional-field-aware, accessibility AA, ~33-36KB total bundle. Pricing Calculator + Event Estimator hit a live /estimate endpoint to show 'From R250-R450pp' as the user moves the guest slider, the conversion-killer feature fewer than 5 of 60 surveyed sites in SA/UK/US ship. Admin gallery at /admin/integrations/embed lets tenants pick, customise (drag-reorder fields, conditional logic, white-label theme overrides, success redirect), and copy a snippet. Ten commits shipped in one parallel build run by four agents.", cards: embedFormsCards },
  { id: "dev-team-handoff", title: "13. Dev team handoff, deployment + testing playbook (29 Apr 2026)", description: "Bobby is non-technical, the items in this group are the manual dev tasks the team needs to handle. Migrations + cron + first round of build fixes are already done by his Claude session. What remains: Vercel env vars, Cloudflare Turnstile signup, walking the page-by-page test plan with him, and a reference card on the class of TypeScript error that bit four commits in a row.", cards: devOpsCards },
];

// =====================================================================
// COMPONENTS
// =====================================================================

function ItemRow({ item }: { item: Item }) {
  const StatusIcon = statusIcon[item.status];
  return (
    <li className="p-3 sm:p-4 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <StatusIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
        item.status === "shipped" ? "text-brand-primary"
        : item.status === "in_progress" ? "text-amber-600 dark:text-amber-400"
        : item.status === "blocked" ? "text-rose-500 dark:text-rose-400"
        : "text-slate-400 dark:text-slate-500"
      }`} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-medium ${item.status === "shipped" ? "text-slate-500 dark:text-slate-400 line-through" : "text-slate-900 dark:text-white"}`}>
            {item.title}
          </span>
          <Badge variant="outline" className={`${statusTone[item.status]} text-xs`}>
            {statusLabel[item.status]}
          </Badge>
          {item.ref && <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">{item.ref}</span>}
        </div>
        {item.detail && <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{item.detail}</p>}
      </div>
    </li>
  );
}

/**
 * Map a card's legacy gradient accent string ("from-... to-...") to the
 * toned-down design language: a thin left accent bar plus a tinted icon
 * tile. Keyed off the from- colour so cards stay distinguishable without
 * full-width gradient banners. Everything dark-mode aware.
 */
function accentClasses(accent: string): { bar: string; tile: string; icon: string } {
  if (accent.startsWith("from-rose")) {
    return { bar: "bg-rose-500", tile: "bg-rose-100 dark:bg-rose-500/15", icon: "text-rose-600 dark:text-rose-400" };
  }
  if (accent.startsWith("from-amber") || accent.startsWith("from-orange")) {
    return { bar: "bg-amber-500", tile: "bg-amber-100 dark:bg-amber-500/15", icon: "text-amber-600 dark:text-amber-400" };
  }
  if (accent.startsWith("from-sky") || accent.startsWith("from-blue")) {
    return { bar: "bg-blue-500", tile: "bg-blue-100 dark:bg-blue-500/15", icon: "text-blue-600 dark:text-blue-400" };
  }
  if (accent.startsWith("from-slate") || accent.startsWith("from-zinc")) {
    return { bar: "bg-slate-400 dark:bg-slate-500", tile: "bg-slate-100 dark:bg-slate-800", icon: "text-slate-600 dark:text-slate-400" };
  }
  // Default: brand accent (covers all from-brand-primary variants).
  return { bar: "bg-brand-primary", tile: "bg-brand-primary/10 dark:bg-brand-primary/15", icon: "text-brand-primary" };
}

const HEADER_BADGE = "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 text-xs";

function CardAccordion({ card }: { card: SprintCard }) {
  const [open, setOpen] = useState(card.defaultOpen ?? false);
  const Icon = card.icon;
  const total = card.items.length;
  const done = card.items.filter((i) => i.status === "shipped").length;
  const blocked = card.items.filter((i) => i.status === "blocked").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const accent = accentClasses(card.accent);

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative w-full flex items-center justify-between gap-3 pl-5 pr-4 py-3 sm:py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${accent.bar}`} />
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`w-9 h-9 rounded-md ${accent.tile} flex items-center justify-center flex-shrink-0`}>
            <Icon className={`h-4 w-4 ${accent.icon}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm sm:text-base text-slate-900 dark:text-white">{card.title}</div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{card.why}</div>
          </div>
        </div>
        <div className="hidden sm:flex flex-wrap items-center gap-1.5 flex-shrink-0">
          {card.estimate && (
            <Badge variant="outline" className={HEADER_BADGE}>{card.estimate}</Badge>
          )}
          {card.risk && (
            <Badge variant="outline" className={HEADER_BADGE}>Risk: {card.risk}</Badge>
          )}
          <Badge variant="outline" className={HEADER_BADGE}>
            {done}/{total}{blocked > 0 ? ` (${blocked} blocked)` : ""}
          </Badge>
          <Badge variant="outline" className={`${HEADER_BADGE} tabular-nums`}>{pct}%</Badge>
        </div>
        {open
          ? <ChevronDown className="h-5 w-5 flex-shrink-0 text-slate-400 dark:text-slate-500" />
          : <ChevronRightIcon className="h-5 w-5 flex-shrink-0 text-slate-400 dark:text-slate-500" />}
      </button>
      {open && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
          {card.items.map((item, idx) => <ItemRow key={idx} item={item} />)}
        </ul>
      )}
    </div>
  );
}

function GroupSection({ group, expandAll, collapseAll }: { group: Group; expandAll: number; collapseAll: number }) {
  // Re-render trigger: expandAll/collapseAll count changes force CardAccordion re-mount via key
  return (
    <section id={group.id} className="space-y-3">
      <div className="border-l-4 border-slate-300 dark:border-slate-600 pl-4 mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{group.title}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{group.description}</p>
      </div>
      {group.cards.map((card) => (
        <CardAccordion key={`${card.id}-${expandAll}-${collapseAll}`} card={{ ...card, defaultOpen: expandAll > collapseAll ? true : (collapseAll > expandAll ? false : card.defaultOpen) }} />
      ))}
    </section>
  );
}

function flatStats(allCards: SprintCard[]) {
  let total = 0, shipped = 0, todo = 0, blocked = 0, inProgress = 0;
  allCards.forEach((c) => c.items.forEach((i) => {
    total += 1;
    if (i.status === "shipped") shipped += 1;
    else if (i.status === "blocked") blocked += 1;
    else if (i.status === "in_progress") inProgress += 1;
    else todo += 1;
  }));
  return { total, shipped, todo, blocked, inProgress };
}

function AdminRunningTodoPage() {
  const [expandAll, setExpandAll] = useState(0);
  const [collapseAll, setCollapseAll] = useState(0);

  const allCards = groups.flatMap((g) => g.cards);
  const stats = flatStats(allCards);
  const overallPct = stats.total > 0 ? Math.round((stats.shipped / stats.total) * 100) : 0;

  const auditStats = flatStats(auditCards);
  const auditPct = auditStats.total > 0 ? Math.round((auditStats.shipped / auditStats.total) * 100) : 0;

  return (
    <>
      <Head>
        <title>Running todo - CateringMS</title>
      </Head>
      <NoIndexMeta />
      <div className="admin-page-shell">
        <PlatformNav />
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Running Todo"
            subtitle="Single source of truth, everything built, everything outstanding. Combines the original 8-week launch roadmap with findings from the 215-IQ multi-specialist audit."
            icon={ListChecks}
            meta={
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {stats.shipped} shipped
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {stats.inProgress} in progress
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {stats.total} items total
                </span>
              </>
            }
          />
          <PageWorkbench />

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <StatTile label="Total items" value={stats.total} />
            <StatTile
              label="Shipped"
              value={<span className="text-brand-primary">{stats.shipped}</span>}
            />
            <StatTile
              label="Todo"
              value={<span className="text-slate-900 dark:text-white">{stats.todo}</span>}
            />
            <StatTile
              label="Blocked"
              value={<span className="text-rose-600">{stats.blocked}</span>}
            />
            <StatTile label="Overall" value={`${overallPct}%`} />
          </div>

          <PortalCard className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-slate-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white">Audit fixes: {auditStats.shipped}/{auditStats.total} shipped ({auditPct}%).</span>{" "}
                  <span className="text-slate-700 dark:text-slate-300">Phase 1 done, demo-safe. Phase 2A-F executes post-meeting in order of minimum-blast-radius.</span>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button size="sm" variant="outline" onClick={() => setExpandAll((n) => n + 1)}>Expand all</Button>
                <Button size="sm" variant="outline" onClick={() => setCollapseAll((n) => n + 1)}>Collapse all</Button>
              </div>
            </div>
          </PortalCard>

          <nav className="mb-8 flex flex-wrap gap-2">
            {groups.map((g) => (
              <a key={g.id} href={`#${g.id}`} className="text-xs px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-300">
                {g.title}
              </a>
            ))}
          </nav>

          <div className="space-y-10">
            {groups.map((group) => (
              <GroupSection key={group.id} group={group} expandAll={expandAll} collapseAll={collapseAll} />
            ))}
          </div>

          <PortalCard className="mt-10">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Source-of-truth merging the 25 April 2026 product roadmap (v1.0) with the 28 April 2026 multi-specialist audit. Updated as items ship.
            </div>
          </PortalCard>
        </PortalShell>
      </div>
    </>
  );
}

export default function ProtectedAdminRunningTodo() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <AdminRunningTodoPage />
    </ProtectedRoute>
  );
}
