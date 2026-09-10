/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CreditCard, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, PageWorkbench, StatTile } from "@/components/portal/ui";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListSkeleton } from "@/components/ui/loading-skeleton";
import { NoIndexMeta } from "@/components/NoIndexMeta";

interface CompanyRow {
  id: string;
  slug: string | null;
  company_name: string | null;
  onboarding_completed_at: string | null;
}

interface PaymentIssue {
  company: CompanyRow;
}

function PaymentIssuesPage() {
  const { user, loading: authLoading } = useAuth() as any;
  const [issues, setIssues] = useState<PaymentIssue[]>([]);
  const [onboardedCount, setOnboardedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: companies, error: companyError } = await supabase
        .from("companies")
        .select("id, slug, company_name, onboarding_completed_at")
        .is("deleted_at", null)
        .order("company_name", { ascending: true });
      if (companyError) throw companyError;

      const companyRows = (companies || []) as CompanyRow[];
      const onboarded = companyRows.filter((company) => Boolean(company.onboarding_completed_at));
      setOnboardedCount(onboarded.length);

      const companyIds = onboarded.map((company) => company.id);
      const { data: gateways, error: gatewayError } = companyIds.length
        ? await supabase
            .from("payment_gateways")
            .select("company_id, is_active")
            .in("company_id", companyIds)
            .is("deleted_at", null)
        : { data: [], error: null };
      if (gatewayError) throw gatewayError;

      const connected = new Set(
        ((gateways || []) as Array<{ company_id: string; is_active: boolean | null }>)
          .filter((gateway) => gateway.is_active)
          .map((gateway) => gateway.company_id),
      );
      setIssues(onboarded.filter((company) => !connected.has(company.id)).map((company) => ({ company })));
    } catch (error: any) {
      console.error("[payment-issues] load failed:", error);
      setIssues([]);
      setOnboardedCount(0);
      setLoadError(error?.message || "Could not load payment setup information. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    void load();
  }, [authLoading, user, load]);

  const healthyCount = useMemo(() => Math.max(0, onboardedCount - issues.length), [onboardedCount, issues.length]);

  return (
    <>
      <Head><title>Payment issues - CateringMS</title></Head>
      <NoIndexMeta />
      <div className="admin-page-shell">
        <PlatformNav />
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Payment issues"
            subtitle="Review companies whose payment setup needs attention."
            icon={CreditCard}
            meta={!loading ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                <span className={`h-1.5 w-1.5 rounded-full ${issues.length ? "bg-amber-400" : "bg-emerald-400"}`} />
                {issues.length} {issues.length === 1 ? "company needs" : "companies need"} attention
              </span>
            ) : undefined}
          />
          <PageWorkbench />

          {loadError && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription className="flex flex-wrap items-center gap-3">
                <span>{loadError}</span>
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try again
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
            <StatTile icon={AlertTriangle} label="Payment setup issues" value={loading ? "-" : issues.length} hint="Onboarded companies without an active payment connection." />
            <StatTile icon={CheckCircle2} label="Payment setup ready" value={loading ? "-" : healthyCount} hint="Onboarded companies with an active payment connection." />
            <StatTile icon={CreditCard} label="Onboarded companies" value={loading ? "-" : onboardedCount} hint="Companies included in this payment setup check." />
          </div>

          <PortalCard id="payment-issues" data-chat-section="platform.payment-issues" padded={false}>
            <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
              <div>
                <PortalCardHeader className="mb-0" title="Companies needing payment setup" />
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{loading ? "Checking current company records..." : `${issues.length} ${issues.length === 1 ? "company" : "companies"} currently need attention`}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>

            {loading ? (
              <div className="px-5 pb-5"><ListSkeleton rows={4} withHeader={false} /></div>
            ) : issues.length === 0 ? (
              <EmptyState
                inCard
                icon={CheckCircle2}
                title="No payment setup issues"
                description="Every onboarded company currently has an active payment connection recorded."
              />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {issues.map(({ company }) => (
                  <li key={company.id} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <div className="min-w-0">
                      <Link href={`/admin/platform/company-database?company=${encodeURIComponent(company.id)}`} className="block truncate font-medium text-slate-900 hover:underline dark:text-white">
                        {company.company_name || company.slug || company.id.slice(0, 8)}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">No active payment connection is recorded.</p>
                    </div>
                    <Link href={`/admin/platform/company-database?company=${encodeURIComponent(company.id)}`} className="shrink-0 text-sm font-medium text-brand-primary hover:underline">
                      View company
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </PortalCard>
        </PortalShell>
      </div>
    </>
  );
}

export default function ProtectedPaymentIssues() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <PaymentIssuesPage />
    </ProtectedRoute>
  );
}
