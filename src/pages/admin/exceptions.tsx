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
      <div className="min-h-screen pt-16 lg:pl-72 lg:pt-0 xl:pl-80">
        <PortalShell>
          <PortalHeader
            variant="hero"
            title="Attention center"
            subtitle="One place for the operational items that need a decision or follow-up."
            icon={AlertTriangle}
            actions={(
              <Button onClick={live.refresh} disabled={live.loading} variant="outline" className="gap-2 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                {live.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>
            )}
            meta={live.refreshedAt ? <span className="text-xs text-white/75">Updated {new Date(live.refreshedAt).toLocaleTimeString()}</span> : null}
          />
          <PageWorkbench />

          {live.error && (
            <PortalCard className="mb-5 border-rose-200 bg-rose-50">
              <div className="flex items-start gap-3 text-rose-900"><AlertCircle className="mt-0.5 h-5 w-5" /><div><p className="font-semibold">Some live signals could not be refreshed</p><p className="mt-1 text-sm">{live.error}</p></div></div>
            </PortalCard>
          )}

          <PortalCard className="mb-5 border-brand-primary/20 bg-brand-primary/5">
            <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 text-brand-primary" /><div><p className="font-semibold text-slate-900 dark:text-white">Resolve the red and amber items first</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Each card opens the existing screen where your team can fix the issue. A zero count means the live signal is clear.</p></div></div>
          </PortalCard>

          {activeItems.length > 0 && (
            <section className="mb-6" aria-labelledby="active-attention-heading">
              <h2 id="active-attention-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Needs attention now</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {activeItems.map((item) => {
                  const Icon = item.icon;
                  return <Link key={item.title} href={withSlug(item.href)} className={`group rounded-xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${toneClasses(item.tone)}`}>
                    <div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><Icon className="mt-0.5 h-5 w-5" /><div><h3 className="font-semibold">{item.title}</h3><p className="mt-1 text-sm opacity-80">{item.description}</p></div></div><span className="text-xl font-bold tabular-nums">{item.count}</span></div>
                    <div className="mt-4 flex items-center gap-1 text-xs font-semibold">Open and resolve <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></div>
                  </Link>;
                })}
              </div>
            </section>
          )}

          <section aria-labelledby="live-signals-heading">
            <h2 id="live-signals-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Live signals</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {items.map((item) => <Link key={item.title} href={withSlug(item.href)} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-primary/40 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500">{item.title}</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{item.count}</p></Link>)}
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
