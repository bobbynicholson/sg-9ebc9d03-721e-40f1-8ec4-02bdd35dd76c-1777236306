import { useState } from "react";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlatformNav } from "@/components/admin/PlatformNav";
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
} from "lucide-react";

type Status = "shipped" | "in_progress" | "todo" | "blocked";

const statusTone: Record<Status, string> = {
  shipped:     "bg-emerald-100 text-emerald-800 border-emerald-200",
  in_progress: "bg-amber-100 text-amber-800 border-amber-200",
  todo:        "bg-slate-100 text-slate-700 border-slate-200",
  blocked:     "bg-rose-100 text-rose-700 border-rose-200",
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
// GROUP 1 -- FOUNDATION: WHAT'S BUILT
// =====================================================================
const builtFeatures: SprintCard[] = [
  {
    id: "core-platform",
    title: "Core platform infrastructure",
    why: "Multi-tenant SaaS architecture, Next.js 15.2 + Supabase + TypeScript, mobile responsive.",
    icon: Server,
    accent: "from-emerald-500 to-green-500",
    items: [
      { title: "Multi-tenant B2B SaaS architecture", status: "shipped" },
      { title: "Custom company URLs (cateringms.com/{slug})", status: "shipped" },
      { title: "Next.js 15.2 frontend (Page Router)", status: "shipped" },
      { title: "TypeScript throughout (note: 14 money services carry @ts-nocheck -- see Phase 2F)", status: "shipped" },
      { title: "Supabase Postgres backend (138 tables, 4 views, 15 enums)", status: "shipped" },
      { title: "Row-level security (note: 3 tables ship USING(true) policies -- see Phase 2B)", status: "shipped" },
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
    accent: "from-emerald-500 to-green-500",
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
    accent: "from-emerald-500 to-green-500",
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
    accent: "from-emerald-500 to-green-500",
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
      { title: "Webhook handling + receipt generation (note: idempotency gap -- see Phase 2C)", status: "shipped" },
      { title: "Refund processing logic", status: "shipped" },
    ],
  },
  {
    id: "advanced",
    title: "Advanced features",
    why: "GPS tracking, AI services, gamification, multi-region, integrations.",
    icon: Sparkles,
    accent: "from-emerald-500 to-green-500",
    items: [
      { title: "Real-time GPS driver tracking", status: "shipped" },
      { title: "Route optimisation", status: "shipped" },
      { title: "Geofencing arrival detection", status: "shipped" },
      { title: "AI financial insights", status: "shipped" },
      { title: "AI recipe scaling", status: "shipped" },
      { title: "Staff gamification (points + achievements)", status: "shipped" },
      { title: "Multi-region (ZA, US, UK) with currency switching", status: "shipped" },
      { title: "Xero accounting integration (note: token-refresh gap -- see Phase 2E)", status: "shipped" },
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
    accent: "from-emerald-500 to-green-500",
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
// GROUP 2 -- AUDIT FINDINGS: PHASE 1 (SHIPPED) + PHASE 2 (PLANNED)
// =====================================================================
const auditCards: SprintCard[] = [
  {
    id: "phase-1",
    title: "Phase 1 -- Pre-meeting safe set (shipped)",
    why: "Audit-derived fixes that ship without risking the live demo. No functional change to logins, navigation or role access.",
    estimate: "~2 hours, complete",
    risk: "Low",
    icon: CheckCircle2,
    accent: "from-emerald-500 to-green-500",
    defaultOpen: true,
    items: [
      { title: "Delete 11 fossil scripts at repo root", detail: "apply_migration.js, fix_*.js, force_deploy.js etc -- zero refs", status: "shipped", ref: "c1fbecf" },
      { title: "Delete 3 dead components", detail: "AddressAutocomplete root dupe, JobProgressTracker (552 LOC), InvoiceGenerator", status: "shipped", ref: "c1fbecf" },
      { title: "Delete src/services/operations/ + operationsService.ts", detail: "Parallel order/inventory CRUD with zero external importers", status: "shipped", ref: "c1fbecf" },
      { title: "globals.css -- xl:pl-72 collapse rule", detail: "Sidebar collapse now reclaims 208px on xl screens", status: "shipped", ref: "c1fbecf" },
      { title: "Create lib/statusTokens.ts", detail: "Single source of truth for status colour vocabulary, orphan helper", status: "shipped", ref: "c1fbecf" },
      { title: "userManagementService.searchUsers companyId param", detail: "Defensive .eq(company_id) -- no current callers, no behaviour change", status: "shipped", ref: "c1fbecf" },
      { title: "Build Current Stock page", detail: "Wires inventory_items table, click-to-edit with audit trail via inventory_transactions", status: "shipped", ref: "739a463" },
      { title: "Build /admin/running-todo (this page)", detail: "Phase 2 backlog visible from inside the tool", status: "shipped", ref: "739a463" },
      { title: "Add Running Todo to PlatformNav (SaaS owner sidebar)", status: "shipped", ref: "4799515" },
      { title: "Merge old roadmap into running-todo accordion structure", status: "shipped" },
    ],
  },
  {
    id: "2A",
    title: "Phase 2A -- Security holes",
    why: "Real money + legal exposure. Anyone with the URL can become super_admin in any tenant today.",
    estimate: "1-2 days",
    risk: "Medium",
    icon: ShieldAlert,
    accent: "from-rose-500 to-red-500",
    items: [
      { title: "Remove ?dev=true URL backdoor", detail: "AuthContext.tsx grants client-side super_admin on any URL with dev=true. No NODE_ENV gate.", status: "todo" },
      { title: "Lock down /api/admin/create-user", detail: "Currently no auth -- accepts role + company_id from request body", status: "todo" },
      { title: "Lock down /api/test-email and /api/send-email", detail: "Open SMTP relay through the platform -- no auth, any companyId from body", status: "todo" },
      { title: "OAuth state validation (Xero, QuickBooks)", detail: "TODO comments confirm CSRF risk on callback endpoints", status: "todo" },
      { title: "Tighten middleware file-extension regex", detail: "Current pathname.includes('.') matches /api/foo.bar style paths", status: "todo" },
      { title: "Per-key rate limit on /api/integrations/{leads,quotes,invoice-paid}", detail: "Leaked Zapier key currently = unlimited pollution", status: "todo" },
      { title: "Tighten cookie scope on tokenised client view", detail: "Path=/ + SameSite=Lax wider than /c/ requires", status: "todo" },
      { title: "Sign-out completeness", detail: "signOut.ts only nukes Path=/ cookies, leaves Domain=.cateringms.com behind", status: "todo" },
    ],
  },
  {
    id: "2B",
    title: "Phase 2B -- Schema canonical + indexes + RLS",
    why: "Repo and live DB have drifted -- no SQL file matches live. 67 tables have company_id with no index. Three tables ship USING(true) policies.",
    estimate: "1-2 days",
    risk: "Medium",
    icon: Database,
    accent: "from-blue-500 to-indigo-500",
    items: [
      { title: "pg_dump live -> single canonical migration", detail: "Commit as supabase/migrations/<ts>_capture_drift.sql", status: "todo" },
      { title: "Archive 5 of the 6 root-level SQL files", detail: "MASTER_SCHEMA_V2, CLEAN_SCHEMA, etc -- all stale", status: "todo" },
      { title: "ENABLE RLS on app_config + add admin-only policy", detail: "Currently table is fully public", status: "todo" },
      { title: "Replace USING(true) policies on companies + profiles", detail: "Tenant + email harvest by anon -- replace with SECURITY DEFINER RPCs", status: "todo" },
      { title: "Add 67 missing company_id indexes", detail: "CREATE INDEX CONCURRENTLY -- non-blocking", status: "todo" },
      { title: "Add 18 missing order_id indexes on child tables", status: "todo" },
      { title: "Add 20 missing user_id / driver_id indexes", status: "todo" },
      { title: "ALTER VIEW inventory_demand_outlook SET (security_invoker = on)", detail: "Same for order_ingredient_demand -- views currently exposing all tenants", status: "todo" },
      { title: "Backfill + ALTER companies.slug SET NOT NULL", status: "todo" },
      { title: "ALTER staff_invitations company_id NOT NULL + role to enum", status: "todo" },
      { title: "ALTER orders.status SET NOT NULL", status: "todo" },
      { title: "Add (company_id, email) UNIQUE on clients", status: "todo" },
      { title: "Tighten audit_logs and notifications INSERT policies", detail: "WITH CHECK (user_id = auth.uid() OR service_role)", status: "todo" },
    ],
  },
  {
    id: "2C",
    title: "Phase 2C -- Money safety",
    why: "PayFast webhook can be replayed for double credits. Invoice numbers will collide. FX rates rot daily. Order can flip from pending to delivered skipping payment.",
    estimate: "3-5 days",
    risk: "High",
    icon: Banknote,
    accent: "from-amber-500 to-orange-500",
    items: [
      { title: "PayFast webhook idempotency", detail: "Reject if gateway_transaction_id already exists for company", status: "todo" },
      { title: "PayFast webhook -- raw body for signature", detail: "Currently parses JSON before signing -- bodyParser:false + reconstruct", status: "todo" },
      { title: "PayFast IP allowlist + 300s replay window", status: "todo" },
      { title: "Atomic invoice numbering", detail: "Replace Math.random() with per-company invoice_counters table FOR UPDATE", status: "todo" },
      { title: "Atomic order numbering", detail: "Replace quote.id.substring(0,8) with sequence", status: "todo" },
      { title: "Order state machine", detail: "Reject invalid transitions -- pending can't jump to delivered", status: "todo" },
      { title: "markDelivered idempotency guard", detail: "eq(order_status, 'out_for_delivery') -- 0 rows = already done, skip side effects", status: "todo" },
      { title: "Inventory deduction idempotency", detail: "Atomic decrement gated on orders.inventory_deducted_at IS NULL", status: "todo" },
      { title: "FX rates from exchange_rates table", detail: "Replace hardcoded constants in lib/currencyUtils.ts", status: "todo" },
      { title: "Quote-time FX rate locking", detail: "Snapshot rate on quote, copy to order, never recompute", status: "todo" },
      { title: "Read company tax_rate, drop hardcoded 15% VAT", detail: "Multi-region app currently calculates ZA VAT for everyone", status: "todo" },
      { title: "Cancelled orders excluded from inventory_demand_outlook", detail: "Audit view definition -- shopping team buying for ghost events", status: "todo" },
    ],
  },
  {
    id: "2D",
    title: "Phase 2D -- Structural cleanup (the 'messy' fix)",
    why: "Root cause of the 'messy' feeling: 60+ pages each paste the same broken offset recipe, six near-duplicate sidebar files, two parallel branding stores that don't sync.",
    estimate: "2-3 days",
    risk: "Low",
    icon: Layout,
    accent: "from-purple-500 to-pink-500",
    items: [
      { title: "Build <PortalShell> layout component", detail: "Owns sidebar + content offset; replaces lg:pl-64 + container mx-auto recipe in 60+ pages", status: "todo" },
      { title: "Delete BrandingContext, write white-label to companies table", detail: "Two parallel branding stores currently never sync -- this is why branding doesn't flow through", status: "todo" },
      { title: "<PortalSidebar role accent /> -- 6 nav files into 1", detail: "AdminNav + 5 portal navs are 95% the same file, ~330 LOC each", status: "todo" },
      { title: "Wire statusTokens.ts into 12 callsites", detail: "5 divergent copies of the status colour map today", status: "todo" },
      { title: "<PageHeader> component", detail: "Standardise H1 styling -- 30+ admin pages have different gradient/casing", status: "todo" },
      { title: "Replace hand-rolled forms with react-hook-form + zod", detail: "Start with leads/new, quotes/new, company-profile, email-settings, notification-settings", status: "todo" },
      { title: "Skeleton loading states on dashboard, orders, clients, invoices, calendar", detail: "Currently spinner + 'Loading...' text on every page", status: "todo" },
      { title: "Mobile card variants for tables on orders/clients/invoices/equipment", detail: "Currently truncate on <640px", status: "todo" },
      { title: "Collapse inventory.tsx + inventory-tracking.tsx + inventory-recipes.tsx into one tabbed page", status: "todo" },
      { title: "Fold client-search into clients page as filter mode", status: "todo" },
    ],
  },
  {
    id: "2E",
    title: "Phase 2E -- Workflow gaps",
    why: "Lead-to-quote is manual data re-entry today. No driver double-booking check. Email queue not claim-locked. Returning clients have to phone.",
    estimate: "3-5 days",
    risk: "Medium",
    icon: GitBranch,
    accent: "from-cyan-500 to-blue-500",
    items: [
      { title: "leadService.convertLeadToQuote actually creates a quote row", detail: "Currently only flips status; admin Convert button calls nothing useful", status: "todo" },
      { title: "Driver double-booking detection on assignDriver", detail: "Pre-check for overlapping deliveries on the same date", status: "todo" },
      { title: "Driver replacement audit trail", detail: "Currently overwrites assigned_driver_id silently", status: "todo" },
      { title: "Email queue claim-locking", detail: "UPDATE WHERE status='pending' RETURNING -- no double-send across workers", status: "todo" },
      { title: "Xero token refresh + 401 retry", detail: "Sync silently fails after 30 min today", status: "todo" },
      { title: "Two-way Xero conflict handling", detail: "PUT to existing xero_invoice_id rather than POST creating duplicates", status: "todo" },
      { title: "Repeat-customer 'email me my orders' magic link", detail: "POST /api/client-tokens/request -> RPC issues fresh link", status: "todo" },
      { title: "Roles vs user_departments unification", detail: "Pick one model -- authGuards reads role, departments is currently dead state", status: "todo" },
      { title: "GPS location history schema split", detail: "Current upsert on driver_id keeps only latest; split to driver_current_locations + log table", status: "todo" },
      { title: "Cancellation refund path", detail: "Pro-rata refund + Xero credit note for mid-cycle cancellations", status: "todo" },
      { title: "Replace .replace() with .replaceAll() in email template variables", status: "todo" },
      { title: "Fix generateInvoicePaymentLink dead branch", detail: "Configured + unconfigured branches both return same URL", status: "todo" },
      { title: "Multi-currency invoice formatting", detail: "Hardcoded 'R' symbol -- replace with formatCurrency(amount, currency)", status: "todo" },
    ],
  },
  {
    id: "2F",
    title: "Phase 2F -- Type safety + cleanup",
    why: "14 of 15 worst-offender services carry @ts-nocheck. The money layer is effectively untyped. Hundreds of unused imports.",
    estimate: "1-2 days",
    risk: "Low",
    icon: Type,
    accent: "from-slate-500 to-zinc-500",
    items: [
      { title: "Remove @ts-nocheck from 14 money/auth services", detail: "subscriptionService, paymentProcessing, xeroIntegration, invoiceGeneration, analytics, billingEmail, accountingIntegration, paymentLedger, invoiceService, etc.", status: "todo" },
      { title: "Replace 235 :any/as any/<any> with proper types", detail: "Most are catch(error: any) -- mechanical fix with helper", status: "todo" },
      { title: "Strip unused lucide-react imports", detail: "AdminNav alone has ~12 unused; build log flagged across 50+ files", status: "todo" },
      { title: "Memoise admin/orders.tsx filter pipeline", detail: "1190 LOC, three filter passes per render today", status: "todo" },
      { title: "Split admin/orders.tsx, admin/settings.tsx, account/settings.tsx, admin/platform/company-database.tsx, admin/inventory-tracking.tsx", detail: "Each 870-1190 LOC -- extract modals + sub-components", status: "todo" },
      { title: "Skip AuthProvider on public pages in _app.tsx", detail: "Currently fetches profile + company on / and /pricing", status: "todo" },
      { title: "Single signed-cookie cache for middleware profile fetch", detail: "Currently 3 sequential round-trips per protected request", status: "todo" },
    ],
  },
];

// =====================================================================
// GROUP 3 -- PRE-LAUNCH: INTEGRATION SETUP
// =====================================================================
const integrationCards: SprintCard[] = [
  {
    id: "payfast",
    title: "PayFast configuration",
    why: "Code-complete. Needs merchant credentials + webhook URL configured in PayFast dashboard.",
    estimate: "4-6 hours",
    risk: "High",
    icon: Banknote,
    accent: "from-rose-500 to-red-500",
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
    accent: "from-rose-500 to-red-500",
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
    accent: "from-amber-500 to-orange-500",
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
    why: "Optional -- enhanced engagement, not launch-critical. Templates need Meta approval (24-48h).",
    estimate: "6-8 hours",
    risk: "Low",
    icon: Plug,
    accent: "from-emerald-500 to-green-500",
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
// GROUP 4 -- PRE-LAUNCH: TESTING + BETA
// =====================================================================
const testingCards: SprintCard[] = [
  {
    id: "journey-super-admin",
    title: "Journey 1 -- Super Admin (4 hours)",
    why: "Platform management, company DB, subscriptions, analytics.",
    estimate: "4 hours",
    risk: "Low",
    icon: TestTube,
    accent: "from-blue-500 to-indigo-500",
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
    title: "Journey 2 -- Company Admin (8 hours)",
    why: "Full business workflow from signup to processed order.",
    estimate: "8 hours",
    risk: "Low",
    icon: TestTube,
    accent: "from-blue-500 to-indigo-500",
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
    title: "Journey 3 -- Staff: 4 roles (12 hours)",
    why: "Kitchen, driver, cleaning, shopping portals end-to-end.",
    estimate: "12 hours",
    risk: "Medium",
    icon: TestTube,
    accent: "from-blue-500 to-indigo-500",
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
    title: "Journey 4 -- Client (6 hours)",
    why: "Full customer experience from quote request to feedback.",
    estimate: "6 hours",
    risk: "Medium",
    icon: TestTube,
    accent: "from-blue-500 to-indigo-500",
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
    accent: "from-amber-500 to-orange-500",
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
// GROUP 5 -- PRE-LAUNCH: PERF + SECURITY + LAUNCH
// =====================================================================
const launchCards: SprintCard[] = [
  {
    id: "perf",
    title: "Performance optimisation (week 6)",
    why: "Targets before public launch.",
    estimate: "1 week",
    risk: "Medium",
    icon: Sparkles,
    accent: "from-purple-500 to-pink-500",
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
    accent: "from-rose-500 to-red-500",
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
    accent: "from-cyan-500 to-blue-500",
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
    accent: "from-emerald-500 to-teal-500",
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
// GROUP 6 -- REFERENCE: METRICS, RISKS
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
      { title: "Schema drift between env -- Phase 2B addresses", detail: "Currently no SQL file matches live; new environments cannot reproduce schema.", status: "todo" },
      { title: "Audit found 16 P0 security/money bugs -- Phase 2A + 2C address", detail: "Until closed, scaling beyond Spit Braai introduces real exposure.", status: "todo" },
    ],
  },
  {
    id: "team-budget",
    title: "Team plan + budget",
    why: "Recommended hires and approximate cost to launch.",
    icon: Users,
    accent: "from-slate-500 to-zinc-500",
    items: [
      { title: "Technical Lead (internal) -- weeks 1-8 -- 40 hrs/wk", status: "shipped" },
      { title: "QA Engineer -- weeks 3-6 -- 30 hrs/wk -- ~$3,000", status: "todo" },
      { title: "Security Specialist -- week 7 -- 24 hours -- $1,200-2,000", status: "todo" },
      { title: "DevOps Engineer -- weeks 6-7 -- 40 hours -- $2,000-3,500", status: "todo" },
      { title: "UX Designer (optional) -- week 5 -- 20 hours -- $1,000-1,500", status: "todo" },
      { title: "Marketing Specialist (optional) -- weeks 7-8 -- 40 hours -- $1,500-2,500", status: "todo" },
      { title: "Beta company credits (3 x $500) + tester stipends (6 x $100) -- $2,100", status: "todo" },
      { title: "Annual services: Resend $240, Google Maps $600, Twilio $360, Sentry $312, LogRocket $1,188, Vercel Pro $240, Supabase Pro $300 = $3,240/yr", status: "todo" },
      { title: "Total launch budget: $12,540 minimum / $16,940 recommended", status: "todo" },
    ],
  },
];

// =====================================================================
// GROUP 7 -- MARKET EXPANSION: features to win SA / UK / US
// Sourced from 60-company multi-region competitive audit (28 Apr 2026):
// 20 SA + 20 UK + 20 US catering company websites analysed.
// =====================================================================
const universalCards: SprintCard[] = [
  {
    id: "U-universal",
    title: "U1-U8 -- Universal builds (one investment, three regions)",
    why: "Eight features that close gaps in SA, UK and US simultaneously. Highest leverage in the market intel because each build serves all three regions.",
    estimate: "8 weeks (3 universals per sprint)",
    risk: "Medium",
    icon: Globe,
    accent: "from-cyan-500 to-blue-500",
    items: [
      { title: "U1 -- Recipe-level allergen + dietary tag engine", detail: "14 UK + 9 US (incl. sesame post-FASTER Act) + SA tags. Auto-roll up to menu items, auto-flag conflicts on guest dietary submissions, printable allergen sheet per order. One build satisfies UK Natasha's Law + US FDA top-9 + SA wedding RSVP imports.", status: "todo" },
      { title: "U2 -- Per-tenant certificate vault with auto-attach", detail: "Expiry tracking + auto-attach to quote PDF + public verified badge widget. SA: halaal (SANHA/MJC/NIHT), Beth Din kosher, BBBEE, COIDA, liquor licence. UK: KLBD/HMC, FSA hygiene rating, SFBB, Premises Licence. US: OU/Star-K, IFANCA/HMA, ServSafe, ST-119/state exempt certs.", status: "todo" },
      { title: "U3 -- Instant quote calculator (public, embeddable)", detail: "Pax + date + menu tier + region/zip --> binding quote with deposit link. The market-disrupting feature -- fewer than 5 of 60 surveyed sites show live pricing in any region.", status: "todo" },
      { title: "U4 -- Multi-jurisdiction tax/VAT engine (Avalara or TaxJar)", detail: "Quote + invoice both auto-rate by venue postal code. US 50-state sales tax + local. UK VAT split (cold zero-rated / hot 20% / B2B ex-VAT vs B2C inc-VAT toggle). SA VAT registration threshold + zero-rated.", status: "todo" },
      { title: "U5 -- B2B accounts with PO numbers + cost centres + Net-30/60 + ACH/Bacs/EFT", detail: "US corporate AP (Bill.com / Ramp / Coupa). UK GoCardless + Bacs. SA government RFQ + Standard Bank EFT. Same pattern, three integrations.", status: "todo" },
      { title: "U6 -- AI menu auto-balancing from dietary roster (the moat)", detail: "Ingest CSV/RSVP/employee list with dietary tags --> existing AI recipe scaler composes menu mix that satisfies kosher + halal + vegan + gluten-free + top-9 allergen exclusions automatically. Forkable does individual meals; nobody does group-menu balancing in any region.", status: "todo" },
      { title: "U7 -- Carbon-per-portion menu badges (Foundation Earth or My Emissions)", detail: "Ingredient-level emissions factors --> A-E carbon grade per dish on public menu and quote PDF. UK competitors talk sustainability but ship no per-dish numbers. US ESG procurement now demands. SA corporates tendering. 18-month moat.", status: "todo" },
      { title: "U8 -- Surplus-food auto-routing post-event", detail: "Weighs leftover, dispatches nearest charity via API (FareShare UK, City Harvest US, SA Harvest), generates donation receipt PDF for client. PR + tax angle in UK, CSR/ESG narrative in US.", status: "todo" },
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
    accent: "from-emerald-500 to-yellow-500",
    items: [
      { title: "EskomSePush integration --> load-shedding-aware delivery autopilot", detail: "Pull schedule per delivery address, flag affected slots on kitchen + driver portals, suggest generator hire as billable line, auto-WhatsApp client on swap. Number-one SA operational risk turned into a service guarantee.", status: "todo" },
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
    accent: "from-blue-500 to-red-500",
    items: [
      { title: "Natasha's Law PPDS label generator (the lead-magnet)", detail: "Recipe --> PDF/Zebra label with full ingredient list + 14 allergens emphasised, batch-print per production run. Replaces a £200/month bolt-on (Erudus / Nutritics). Could be the single biggest UK launch hook.", status: "todo" },
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
    accent: "from-blue-600 to-red-600",
    items: [
      { title: "ezCater + Relish marketplace connector (P0 -- without this, invisible to US corporate)", detail: "Bidirectional menu / inventory / order sync via ezCater partner API + Relish for recurring corporate. Even mid-market caterers like The Halal Guys route through ezCater.", status: "todo" },
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
    accent: "from-purple-500 to-pink-500",
    items: [
      { title: "AI roster-driven menu auto-balancing (extends U6)", detail: "Take 47 employees' dietary profiles --> existing AI recipe engine composes Tuesday's menu mix that hits kosher + halal + vegan + gluten-free + top-9 allergen exclusions automatically, zero manual planner input. Forkable does individual meals -- group-menu balancing is a global gap.", status: "todo" },
      { title: "Real-time HACCP cold-chain dashboard for buyers", detail: "Pipe existing GPS + temp probes (hot-bag / cold-bag) into a public link the corporate facilities manager / venue operator watches live: '200-pax lunch is 12 mins out, hot-hold 64C, cold-hold 3C, allergen sheet attached'. Stadium, school, hospital, NHS buyers will pay extra. Zero competitors surface this to the buyer.", status: "todo" },
      { title: "Verified-Caterer marketplace directory at /za/find, /uk/find, /us/find", detail: "Public-facing tenant directory surfacing tenants with valid certs in the vault (U2). Filter by region / dietary / pax / date availability. CateringMS becomes the trust layer for the whole market -- demand-gen for the SaaS, network effect, competitor-free space.", status: "todo" },
    ],
  },
];

// =====================================================================
// GROUP 8 -- PRODUCT NOTES: BOBBY'S ROADMAP IDEAS
// =====================================================================
const productNotesCards: SprintCard[] = [
  {
    id: "ai-onboarding",
    title: "AI-assisted client onboarding",
    why: "New catering companies signing up on a 30-day trial need to see value fast. Manual data entry kills trials before they convert. AI-assisted setup (upload existing customers, seed inventory, pre-fill menus) gets a new tenant to 'live' in hours instead of days.",
    estimate: "3-4 weeks",
    risk: "Medium",
    icon: Sparkles,
    accent: "from-violet-500 to-purple-600",
    defaultOpen: true,
    items: [
      { title: "CSV / vCard bulk customer import with AI field mapping", detail: "Upload a spreadsheet with any column headers -- AI maps them to the correct profile fields. Preview + confirm step with manual override. Covers the most common blocker: 'I already have 200 customers in Excel'.", status: "todo" },
      { title: "Guided onboarding wizard (6 steps, 10 minutes to live)", detail: "Step 1: company profile + logo. Step 2: menu/service packages. Step 3: import customers. Step 4: configure payment gateway (PayFast/Stripe). Step 5: invite first staff member. Step 6: send first quote. Progress bar persists across sessions.", status: "todo" },
      { title: "Seed data library -- pre-built menu templates by cuisine type", detail: "SA braai, SA wedding, corporate buffet, cocktail function, kosher, halal. One-click load into the tenant's menu. Removes blank-canvas paralysis on trial day 1.", status: "todo" },
      { title: "30-day trial progress tracker on admin dashboard", detail: "Show the tenant: 'You have used 6 of 7 core features. 3 steps left to fully activate. Your trial ends in 18 days.' Drives activation before the paywall hits.", status: "todo" },
      { title: "AI 'completion score' that nudges the tenant owner via email", detail: "Day 3 / Day 7 / Day 14 emails if onboarding steps are incomplete. Personalised to what is actually missing for that tenant. Not generic drip -- specific: 'You haven't added a menu yet. Start here.'", status: "todo" },
    ],
  },
  {
    id: "whatsapp-facebook",
    title: "WhatsApp + Facebook automated response integration",
    why: "SA catering enquiries land overwhelmingly in WhatsApp and Facebook Messenger first. Caterers either miss them or spend hours copy-pasting. An AI responder that actions tasks directly from a message thread (create quote, send email, update order) is the single highest-leverage distribution channel in the SA market.",
    estimate: "4-6 weeks",
    risk: "High",
    icon: MessageSquare,
    accent: "from-green-500 to-emerald-600",
    items: [
      { title: "WhatsApp Business API inbound message handler", detail: "Connect tenant's WhatsApp Business number via Meta's Cloud API or a BSP (Vonage, 360dialog). All inbound messages land in the CateringMS lead inbox with full thread history.", status: "todo" },
      { title: "Facebook Messenger lead inbox connector", detail: "Same pattern as WhatsApp -- Meta Messenger webhook drops enquiries into the lead pipeline. One unified inbox for both channels.", status: "todo" },
      { title: "AI intent classification + auto-response drafting", detail: "Classify inbound: quote request / availability check / complaint / existing-order query. Draft a context-aware reply using tenant's menu + calendar. Staff approves with one tap or it auto-sends after 60 seconds (configurable).", status: "todo" },
      { title: "In-thread quote creation -- 'Create quote for this lead' from WhatsApp", detail: "Staff taps one button in the CateringMS inbox UI -- quote is created, PDF generated, and the PayFast deposit link is dropped back into the WhatsApp thread. Zero context-switching.", status: "todo" },
      { title: "In-thread email dispatch to catering company clients from the app", detail: "Compose and send a branded email to the client directly from within the WhatsApp/Facebook thread view. Full audit trail. Replies route back to the same inbox.", status: "todo" },
      { title: "Eskom load-shedding alert auto-message to affected clients (SA)", detail: "When EskomSePush flags a schedule change that hits a delivery window, auto-WhatsApp the affected client: 'Your event on Fri 2pm is in Stage 4 -- here is our contingency plan'. Removes the number-one SA client panic trigger.", status: "todo" },
    ],
  },
  {
    id: "events-equipment",
    title: "Events equipment module (hire + own inventory)",
    why: "Many catering companies are also event suppliers -- they hire out or own tables, chairs, cutlery, crockery, ice buckets, chafing dishes, linen. This is tracked nowhere today. It is a high-margin revenue line that competitors don't support end-to-end.",
    estimate: "3-4 weeks",
    risk: "Medium",
    icon: Package,
    accent: "from-orange-500 to-amber-600",
    items: [
      { title: "Equipment catalogue with 'own vs hired-in' flag per item", detail: "Two types: items the company owns outright (depreciation tracked) and items they hire in from a third-party supplier (hire cost per use). Both appear on quotes and invoices as distinct line types.", status: "todo" },
      { title: "Event equipment package builder (table of X + linens + cutlery for X pax)", detail: "Define reusable packages -- 'Cocktail for 100': 10 x high tables, 20 x cocktail chairs, 100 x champagne flutes, 100 x side plates. One-click attach to an order. Auto-deducts from available stock.", status: "todo" },
      { title: "Equipment categories: cutlery, crockery, glassware, tables, chairs, linens, ice buckets, chafing dishes, decor", detail: "Pre-seeded category list matching the cleaning portal's verification flow. Shared equipment registry so the cleaning team's post-event count feeds directly back into stock availability.", status: "todo" },
      { title: "Availability calendar for owned equipment", detail: "Show which items are committed to which events on which dates. Prevent double-booking. Alert if a quote is accepted but required equipment is already out.", status: "todo" },
      { title: "Hired-in cost tracking + auto-add to order cost sheet", detail: "When hired equipment is used, the hire cost is auto-added to the order's internal cost breakdown (visible to admin/owner, not client). Feeds the profit-margin report.", status: "todo" },
      { title: "Post-event equipment return reconciliation linked to cleaning portal", detail: "After an event, the cleaning team's verification count (existing equipment.tsx page) updates available_quantity in real time. Damage reports auto-flag for client billing.", status: "todo" },
    ],
  },
  {
    id: "onboarding-support",
    title: "Support during onboarding -- who handles the calls",
    why: "When a trial client hits a wall, they churn. The support model during onboarding needs to be defined and built into the product before launch. An unclear support path at sign-up is a conversion killer.",
    estimate: "1 week",
    risk: "Low",
    icon: Headphones,
    accent: "from-sky-500 to-blue-600",
    items: [
      { title: "Define the support tier model: self-serve vs concierge vs assisted onboarding", detail: "Decision needed: free tier = help docs + chat bot. Paid = email SLA. Premium = WhatsApp direct with a human. This decision gates the build -- do not build the wrong tier first.", status: "todo" },
      { title: "In-app help widget (Intercom / Crisp / custom)", detail: "Contextual help bubble on every page. Triggered by inactivity or error state. Routes to docs first, human second. Reduces inbound support load 60-70%.", status: "todo" },
      { title: "Onboarding call booking flow (for premium / high-value signups)", detail: "Calendly or native booking widget surfaced after payment. 30-minute setup call with Bobby / designated onboarding person. The human touch that converts hesitant buyers.", status: "todo" },
      { title: "Searchable knowledge base (Mintlify / Notion public / custom)", detail: "How-to articles for every major workflow. Linked from every help icon in the UI. Reduces the same 5 questions that every new tenant asks.", status: "todo" },
      { title: "Support inbox routing -- define who owns what", detail: "Document internally: billing questions go to X. Technical bugs go to Y. Onboarding help goes to Z. This is a people + process spec, not just a code spec. Must be decided before launch.", status: "todo" },
    ],
  },
  {
    id: "ai-receipt-scanning",
    title: "AI receipt + slip scanning --> inventory",
    why: "Shopping staff come back from a run with a pile of slips. Manual entry is slow, error-prone, and doesn't happen. AI scanning (like Adobe Scan) pulls line items, quantities, and prices directly into inventory with a manual override step. Eliminates the biggest data-entry bottleneck in the shopping workflow.",
    estimate: "2-3 weeks",
    risk: "Medium",
    icon: ScanLine,
    accent: "from-teal-500 to-cyan-600",
    items: [
      { title: "Mobile camera capture or PDF/image upload in the shopping portal", detail: "Staff can take a photo of a till slip on their phone or upload a scanned PDF. Works from the existing shopping portal -- no new app required.", status: "todo" },
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
    why: "Admins and owners need to see and edit stock levels for seeded inventory items without touching the database. Today there is no UI for this -- stock levels can only be changed via the kitchen/shopping portals indirectly. A dedicated admin inventory page with inline editing, category filtering, and cost tracking closes this gap.",
    estimate: "1-2 weeks",
    risk: "Low",
    icon: Lightbulb,
    accent: "from-yellow-500 to-orange-500",
    items: [
      { title: "Admin inventory list page at /admin/inventory", detail: "Full inventory catalogue with search, category filter, and status filter. Shows: name, category, current stock, unit, unit cost, par level (minimum stock trigger), last updated. Paginated for large catalogues.", status: "todo" },
      { title: "Inline quantity + cost editing with save confirmation", detail: "Click a row to edit available_quantity, unit_cost, and par_level inline. Save triggers an inventory_transaction record for audit trail. No modal needed -- inline is faster.", status: "todo" },
      { title: "Par level alert indicator -- items below par flagged in amber/red", detail: "At-a-glance: which items are below the minimum stock threshold and need reordering. Sortable by urgency. Feeds into the shopping portal's 'low stock' alert list.", status: "todo" },
      { title: "Bulk CSV import / export for seeded inventory", detail: "Export the full inventory as CSV for offline editing. Re-import updates quantities and costs in bulk. Critical for initial setup and periodic stock-takes.", status: "todo" },
      { title: "Inventory cost summary -- total stock value by category", detail: "Dashboard card at the top: total stock value (qty x unit_cost), broken down by category. Helps the owner see where their money is tied up in stock.", status: "todo" },
      { title: "Add to PlatformNav (super_admin) and AdminNav (company_admin + owner)", detail: "Link from the admin sidebar under 'Operations'. Super_admin sees all tenants' inventories (with company_id filter). Company admin / owner sees their own.", status: "todo" },
    ],
  },
];

const groups: Group[] = [
  { id: "built", title: "1. Foundation -- What's already built", description: "Production-ready features. ~89,000 lines of code, 138 tables, 8 portals. Items in this group are functional but may have audit-flagged caveats noted inline.", cards: builtFeatures },
  { id: "audit", title: "2. Audit findings -- Phase 1 shipped, Phase 2 planned", description: "215-IQ multi-specialist audit (architecture, DB, security, business logic, UI/UX) flagged ~150 actionable findings. Phase 1 is done; Phase 2A-F sequenced by minimum-blast-radius.", cards: auditCards },
  { id: "integration", title: "3. Pre-launch -- Integration setup", description: "Each integration is code-complete. What is needed is credentials and a short configuration step.", cards: integrationCards },
  { id: "testing", title: "4. Pre-launch -- Testing + beta", description: "4 user-journey tests + beta with 3 real catering companies. Expected: 20-35 bugs surfacing, 10-15 UX improvements.", cards: testingCards },
  { id: "launch", title: "5. Pre-launch -- Performance, security audit, launch", description: "Performance targets, external security audit, monitoring setup, soft launch (10 companies) then public launch.", cards: launchCards },
  { id: "expansion", title: "6. Market expansion -- features to win SA / UK / US", description: "Sourced from a 60-company competitive audit (20 per region) on 28 April 2026. Universal builds (U1-U8) unlock all three markets in one investment; region-specific items address local compliance + buyer expectations; wow-factor moats are global firsts no competitor has shipped.", cards: [...universalCards, ...saExpansionCards, ...ukExpansionCards, ...usExpansionCards, ...wowFactorCards] },
  { id: "reference", title: "7. Reference -- Metrics, risks, team plan", description: "Concrete success metrics, known risks with mitigations, team plan and budget.", cards: referenceCards },
  { id: "product-notes", title: "8. Product notes -- Bobby's roadmap ideas", description: "Feature ideas captured 27 April 2026. AI onboarding, WhatsApp/Facebook automation, events equipment, support model, AI receipt scanning, inventory admin page. All todo -- sequencing TBD.", cards: productNotesCards },
];

// =====================================================================
// COMPONENTS
// =====================================================================

function ItemRow({ item }: { item: Item }) {
  const StatusIcon = statusIcon[item.status];
  return (
    <li className="p-3 sm:p-4 flex items-start gap-3 hover:bg-slate-50">
      <StatusIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
        item.status === "shipped" ? "text-emerald-600"
        : item.status === "in_progress" ? "text-amber-600"
        : item.status === "blocked" ? "text-rose-500"
        : "text-slate-400"
      }`} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-medium ${item.status === "shipped" ? "text-slate-500 line-through" : "text-slate-900"}`}>
            {item.title}
          </span>
          <Badge variant="outline" className={`${statusTone[item.status]} text-xs`}>
            {statusLabel[item.status]}
          </Badge>
          {item.ref && <span className="text-xs text-slate-400 font-mono">{item.ref}</span>}
        </div>
        {item.detail && <p className="text-xs text-slate-600 mt-1">{item.detail}</p>}
      </div>
    </li>
  );
}

function CardAccordion({ card }: { card: SprintCard }) {
  const [open, setOpen] = useState(card.defaultOpen ?? false);
  const Icon = card.icon;
  const total = card.items.length;
  const done = card.items.filter((i) => i.status === "shipped").length;
  const blocked = card.items.filter((i) => i.status === "blocked").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 sm:py-4 text-left bg-gradient-to-r ${card.accent} text-white hover:brightness-95 transition`}
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-md bg-white/20 flex items-center justify-center flex-shrink-0">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm sm:text-base">{card.title}</div>
            <div className="text-xs text-white/85 mt-0.5 line-clamp-2">{card.why}</div>
          </div>
        </div>
        <div className="hidden sm:flex flex-wrap items-center gap-1.5 flex-shrink-0">
          {card.estimate && (
            <Badge variant="outline" className="bg-white/15 text-white border-white/30 text-xs">{card.estimate}</Badge>
          )}
          {card.risk && (
            <Badge variant="outline" className="bg-white/15 text-white border-white/30 text-xs">Risk: {card.risk}</Badge>
          )}
          <Badge variant="outline" className="bg-white/15 text-white border-white/30 text-xs">
            {done}/{total}{blocked > 0 ? ` (${blocked} blocked)` : ""}
          </Badge>
          <Badge variant="outline" className="bg-white/15 text-white border-white/30 text-xs tabular-nums">{pct}%</Badge>
        </div>
        {open ? <ChevronDown className="h-5 w-5 flex-shrink-0" /> : <ChevronRightIcon className="h-5 w-5 flex-shrink-0" />}
      </button>
      {open && (
        <ul className="divide-y divide-slate-100">
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
      <div className="border-l-4 border-slate-300 pl-4 mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900">{group.title}</h2>
        <p className="text-sm text-slate-600 mt-1">{group.description}</p>
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
        <title>Running Todo - CateringMS</title>
      </Head>
      <NoIndexMeta />
      <PlatformNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-purple-50 lg:pl-64 xl:pl-72 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-screen-2xl">
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-3">
              <ListChecks className="h-7 w-7 text-purple-600" />
              Running Todo
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Single source of truth -- everything built, everything outstanding. Combines the original 8-week launch roadmap with findings from the 215-IQ multi-specialist audit.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-600">Total items</p>
                <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-600">Shipped</p>
                <p className="text-2xl font-bold tabular-nums text-emerald-600">{stats.shipped}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-600">Todo</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{stats.todo}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-600">Blocked</p>
                <p className="text-2xl font-bold tabular-nums text-rose-600">{stats.blocked}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-600">Overall</p>
                <p className="text-2xl font-bold tabular-nums">{overallPct}%</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6 border-purple-200 bg-purple-50">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-900">Audit fixes: {auditStats.shipped}/{auditStats.total} shipped ({auditPct}%).</span>{" "}
                  <span className="text-slate-700">Phase 1 done -- demo-safe. Phase 2A-F executes post-meeting in order of minimum-blast-radius.</span>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button size="sm" variant="outline" onClick={() => setExpandAll((n) => n + 1)}>Expand all</Button>
                <Button size="sm" variant="outline" onClick={() => setCollapseAll((n) => n + 1)}>Collapse all</Button>
              </div>
            </CardContent>
          </Card>

          <nav className="mb-8 flex flex-wrap gap-2">
            {groups.map((g) => (
              <a key={g.id} href={`#${g.id}`} className="text-xs px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700">
                {g.title}
              </a>
            ))}
          </nav>

          <div className="space-y-10">
            {groups.map((group) => (
              <GroupSection key={group.id} group={group} expandAll={expandAll} collapseAll={collapseAll} />
            ))}
          </div>

          <Card className="mt-10 border-slate-200">
            <CardContent className="p-4 text-xs text-slate-500">
              Source-of-truth merging the 25 April 2026 product roadmap (v1.0) with the 28 April 2026 multi-specialist audit. Updated as items ship.
            </CardContent>
          </Card>
        </div>
      </main>
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
