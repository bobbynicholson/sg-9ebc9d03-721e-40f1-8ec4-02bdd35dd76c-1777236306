import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminNav } from "@/components/admin/AdminNav";
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
} from "lucide-react";

type Status = "shipped" | "in_progress" | "todo";

const statusTone: Record<Status, string> = {
  shipped: "bg-emerald-100 text-emerald-800 border-emerald-200",
  in_progress: "bg-amber-100 text-amber-800 border-amber-200",
  todo: "bg-slate-100 text-slate-700 border-slate-200",
};
const statusLabel: Record<Status, string> = {
  shipped: "Shipped",
  in_progress: "In progress",
  todo: "Todo",
};
const statusIcon: Record<Status, React.ComponentType<{ className?: string }>> = {
  shipped: CheckCircle2,
  in_progress: AlertTriangle,
  todo: Circle,
};

interface Item {
  title: string;
  detail?: string;
  status: Status;
  ref?: string;
}

interface Sprint {
  id: string;
  title: string;
  why: string;
  estimate: string;
  risk: "Low" | "Medium" | "High";
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  items: Item[];
}

const sprints: Sprint[] = [
  {
    id: "phase-1",
    title: "Phase 1 -- Low-risk pre-meeting fixes",
    why: "Audit findings that could ship without risking the live demo. No functional change to logins, navigation or role access.",
    estimate: "~1 hour, complete",
    risk: "Low",
    icon: CheckCircle2,
    accent: "from-emerald-500 to-green-500",
    items: [
      { title: "Delete 11 fossil scripts at repo root", detail: "apply_migration.js, fix_*.js, force_deploy.js etc -- zero refs", status: "shipped", ref: "c1fbecf" },
      { title: "Delete 3 dead components", detail: "AddressAutocomplete root dupe, JobProgressTracker (552 LOC), InvoiceGenerator", status: "shipped", ref: "c1fbecf" },
      { title: "Delete src/services/operations/ + operationsService.ts", detail: "Parallel order/inventory CRUD with zero external importers", status: "shipped", ref: "c1fbecf" },
      { title: "globals.css -- xl:pl-72 collapse rule", detail: "Sidebar collapse now reclaims 208px on xl screens", status: "shipped", ref: "c1fbecf" },
      { title: "Create lib/statusTokens.ts", detail: "Single source of truth for status colour vocabulary, orphan helper", status: "shipped", ref: "c1fbecf" },
      { title: "userManagementService.searchUsers companyId param", detail: "Defensive .eq(company_id) -- no current callers, no behaviour change", status: "shipped", ref: "c1fbecf" },
      { title: "Build Current Stock page", detail: "Wires inventory_items table, click-to-edit with audit trail via inventory_transactions", status: "shipped" },
      { title: "Build /admin/running-todo (this page)", detail: "Phase 2 backlog visible from inside the tool", status: "shipped" },
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
      { title: "Lock down /api/test-email and /api/send-email", detail: "Open SMTP relay through your platform -- no auth, any companyId from body", status: "todo" },
      { title: "OAuth state validation (Xero, QuickBooks)", detail: "TODO comments confirm CSRF risk on callback endpoints", status: "todo" },
      { title: "Tighten middleware file-extension regex", detail: "Current pathname.includes('.') matches /api/foo.bar style paths", status: "todo" },
      { title: "Per-key rate limit on /api/integrations/{leads,quotes,invoice-paid}", detail: "Leaked Zapier key currently = unlimited pollution", status: "todo" },
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

function AdminRunningTodoPage() {
  return (
    <>
      <Head>
        <title>Running Todo - CateringMS</title>
      </Head>
      <NoIndexMeta />
      <AdminNav />
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 lg:pl-64 xl:pl-72 pt-16 lg:pt-0">
        <div className="container mx-auto px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-screen-2xl">
          <div className="mb-8">
            <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-3">
              <ListChecks className="h-7 w-7 text-purple-600" />
              Running Todo
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Audit-derived backlog. 5 specialist auditors flagged ~150 actionable findings; this is the prioritised execution plan.
            </p>
          </div>

          <Card className="mb-6 border-emerald-200 bg-emerald-50">
            <CardContent className="p-4 flex items-center gap-3 text-sm">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <div>
                <span className="font-semibold text-slate-900">Phase 1 shipped (commit c1fbecf).</span>{" "}
                <span className="text-slate-600">No functional changes -- demo-safe. Phase 2 sprints below execute post-meeting in order of minimum-blast-radius.</span>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {sprints.map((sprint) => {
              const Icon = sprint.icon;
              const total = sprint.items.length;
              const done = sprint.items.filter((i) => i.status === "shipped").length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <Card key={sprint.id} className="border-0 shadow-md overflow-hidden">
                  <CardHeader className={`bg-gradient-to-r ${sprint.accent} text-white`}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-lg sm:text-xl">{sprint.title}</CardTitle>
                          <p className="text-xs sm:text-sm text-white/85 mt-1">{sprint.why}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className="bg-white/15 text-white border-white/30">
                          {sprint.estimate}
                        </Badge>
                        <Badge variant="outline" className="bg-white/15 text-white border-white/30">
                          Risk: {sprint.risk}
                        </Badge>
                        <Badge variant="outline" className="bg-white/15 text-white border-white/30">
                          {done}/{total} -- {pct}%
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ul className="divide-y divide-slate-100">
                      {sprint.items.map((item, idx) => {
                        const StatusIcon = statusIcon[item.status];
                        return (
                          <li key={idx} className="p-4 flex items-start gap-3 hover:bg-slate-50">
                            <StatusIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                              item.status === "shipped" ? "text-emerald-600"
                              : item.status === "in_progress" ? "text-amber-600"
                              : "text-slate-400"
                            }`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`font-medium ${item.status === "shipped" ? "text-slate-500 line-through" : "text-slate-900"}`}>
                                  {item.title}
                                </span>
                                <Badge variant="outline" className={`${statusTone[item.status]} text-xs`}>
                                  {statusLabel[item.status]}
                                </Badge>
                                {item.ref && (
                                  <span className="text-xs text-slate-400 font-mono">{item.ref}</span>
                                )}
                              </div>
                              {item.detail && (
                                <p className="text-xs text-slate-600 mt-1">{item.detail}</p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="mt-6 border-slate-200">
            <CardContent className="p-4 text-xs text-slate-500">
              Updated as items ship. Source-of-truth for engineering follow-up after the 215-IQ multi-specialist audit run on 2026-04-28.
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

export default function ProtectedAdminRunningTodo() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <AdminRunningTodoPage />
    </ProtectedRoute>
  );
}
