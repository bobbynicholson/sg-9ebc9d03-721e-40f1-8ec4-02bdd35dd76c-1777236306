import Head from "next/head";
import Link from "next/link";
import { AlertCircle, AlertTriangle, ArrowRight, Bell, CheckCircle2, ClipboardList, FileText, Loader2, RefreshCw, Users, Wallet } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalHeader, PortalShell, PageWorkbench, PortalCard } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { useAdminLiveCounts } from "@/hooks/useAdminLiveCounts";
import { useTenantHref } from "@/lib/tenantUrl";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";

type AttentionItem = {
  title: string;
  count: string;
  description: string;
  href: string;
  icon: typeof AlertTriangle;
  tone: "critical" | "warning" | "info";
  isCurrency?: boolean;
};

function toneClasses(tone: AttentionItem["tone"]): string {
  if (tone === "critical") return "border-rose-200 bg-rose-50 text-rose-900";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-blue-200 bg-blue-50 text-blue-900";
}

function ExceptionCenterPageInner() {
  const { user, profile } = useAuth() as any;
  const companyId = profile?.company_id || user?.company_id || null;
  const { withSlug } = useTenantHref();
  const currency = useTenantCurrency(companyId);
  const live = useAdminLiveCounts();
  const initialLoading = live.loading && live.refreshedAt === null;
  const initialLoadFailed = Boolean(live.error && live.refreshedAt === null);

  const items: AttentionItem[] = [
    {
      title: "Dispatch gaps",
      count: String(live.dispatchGaps),
      description: "Confirmed events in the next 7 days without a driver assignment.",
      href: "/admin/order-assignments",
      icon: ClipboardList,
      tone: live.dispatchGaps > 0 ? "critical" : "info",
    },
    {
      title: "Quotes awaiting response",
      count: String(live.quotesOverdue),
      description: "Sent quotes older than 48 hours without a client response.",
      href: "/admin/quotes",
      icon: FileText,
      tone: live.quotesOverdue > 0 ? "warning" : "info",
    },
    {
      title: "System alerts",
      count: String(live.alertsTotal),
      description: "Pending refunds and failed emails that may need staff action.",
      href: "/admin/notifications",
      icon: Bell,
      tone: live.alertsTotal > 0 ? "critical" : "info",
    },
    {
      title: "Outstanding invoices",
      count: live.canSeeFinance ? currency.format(live.unpaidValue) : "Restricted",
      description: live.canSeeFinance ? "Open invoice balances across this company." : "Finance access is required to view invoice balances.",
      href: "/admin/invoices",
      icon: Wallet,
      tone: live.canSeeFinance && live.unpaidValue > 0 ? "warning" : "info",
      isCurrency: true,
    },
    {
      title: "New leads today",
      count: String(live.newLeadsToday),
      description: "New enquiries that should be contacted or converted into quotes.",
      href: "/admin/leads",
      icon: Users,
      tone: live.newLeadsToday > 0 ? "info" : "info",
    },
  ];

  const activeItems = items.filter((item) => {
    if (item.title === "Outstanding invoices") return live.canSeeFinance && live.unpaidValue > 0;
    return Number(item.count) > 0;
  });

  return (
    <>
      <Head><title>Attention center - CateringMS</title></Head>
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell>
          <PortalHeader
            variant="hero"
            title="Attention center"
            subtitle="Review unresolved issues and open the work that needs your attention."
            icon={AlertTriangle}
            meta={live.refreshedAt ? <span className="text-xs text-white/75">Updated {new Date(live.refreshedAt).toLocaleTimeString()}</span> : null}
          />
          <PageWorkbench />

          {live.error && (
            <PortalCard className="mb-5 min-w-0 border-rose-200 bg-rose-50 p-3 sm:p-4">
              <div className="flex min-w-0 flex-wrap items-start gap-2.5 text-rose-900 sm:gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold sm:text-sm">Some live signals could not be refreshed</p>
                  <p className="mt-1 break-words text-[11px] sm:text-sm">{live.error}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 w-9 shrink-0 px-0 text-rose-900 sm:h-8 sm:w-auto sm:px-3"
                  onClick={live.refresh}
                  disabled={live.loading}
                  aria-label="Retry refreshing live signals"
                  title="Retry"
                >
                  {live.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  <span className="sr-only sm:not-sr-only sm:ml-2">Retry</span>
                </Button>
              </div>
            </PortalCard>
          )}

          <p className="mb-3 flex items-start gap-1.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400 sm:mb-4 sm:text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-brand-primary" />
            Resolve red and amber items first. Each card opens the screen where it can be fixed.
          </p>

          {(activeItems.length > 0 || initialLoading) && (
            <section className="mb-5 min-w-0 sm:mb-6" aria-labelledby="active-attention-heading">
              <h2 id="active-attention-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:mb-3 sm:text-sm">Needs attention now</h2>
              {initialLoading ? (
                <div role="status" className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-500 shadow-sm sm:text-sm">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-primary" />
                  <span>Checking current alerts…</span>
                </div>
              ) : (
              <div className="grid min-w-0 gap-2.5 md:grid-cols-2 sm:gap-4">
                {activeItems.map((item) => {
                  const Icon = item.icon;
                  return <Link key={item.title} href={withSlug(item.href)} className={`group min-w-0 rounded-xl border p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${toneClasses(item.tone)}`}>
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,6rem)] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3">
                      <div className="flex min-w-0 items-start gap-2 sm:gap-3">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
                        <div className="min-w-0">
                          <h3 className="break-words text-xs font-semibold leading-4 sm:text-sm">{item.title}</h3>
                          <p className="mt-1 break-words text-[11px] leading-4 opacity-80 sm:text-sm">{item.description}</p>
                        </div>
                      </div>
                      <span className={`w-full min-w-0 break-words text-right font-bold tabular-nums leading-tight ${item.isCurrency ? "text-sm sm:whitespace-nowrap sm:text-lg" : "text-base sm:text-xl"}`}>{item.count}</span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-1 text-[10px] font-semibold sm:mt-4 sm:text-xs">Open and resolve <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></div>
                  </Link>;
                })}
              </div>
              )}
            </section>
          )}

          <section aria-labelledby="live-signals-heading" aria-busy={initialLoading}>
            <h2 id="live-signals-heading" className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:mb-3 sm:text-sm">
              Live signals
              {live.loading && live.refreshedAt && <Loader2 aria-label="Refreshing live signals" className="h-3.5 w-3.5 animate-spin text-brand-primary" />}
            </h2>
            {/* The admin rail consumes 18–20rem on desktop, so five cards
                at the page-level lg breakpoint were being squeezed into a
                much narrower *remaining* workspace. Step the grid up more
                gradually so each metric stays readable beside the sidebar. */}
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {initialLoading && <span className="sr-only" role="status">Loading live signals</span>}
              {items.map((item) => <Link key={item.title} href={withSlug(item.href)} className="min-w-0 max-w-full rounded-xl border border-slate-200 bg-white p-2.5 transition hover:border-brand-primary/40 hover:shadow-sm sm:p-4 dark:border-slate-800 dark:bg-slate-900"><p className="break-words text-[10px] leading-4 text-slate-500 sm:text-xs">{item.title}</p>{initialLoading ? <div aria-hidden="true" className="mt-2 h-4 w-16 max-w-full animate-pulse rounded bg-slate-200 dark:bg-slate-700" /> : <p className={`mt-1 max-w-full break-words font-bold leading-tight tabular-nums text-slate-900 dark:text-white ${item.isCurrency ? "text-xs sm:text-lg" : "text-sm sm:text-lg"}`}>{initialLoadFailed && item.count !== "Restricted" ? "Unavailable" : item.count}</p>}</Link>)}
            </div>
          </section>
        </PortalShell>
      </div>
    </>
  );
}

export default function ExceptionCenterPage() {
  return <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}><ExceptionCenterPageInner /></ProtectedRoute>;
}
