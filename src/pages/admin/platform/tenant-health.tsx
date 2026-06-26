/**
 * /admin/platform/tenant-health
 *
 * Skylight super-admin dashboard surfacing tenants that need attention:
 * stuck-in-onboarding, dormant (no orders in 30 days), payment gateway
 * unset, recently signed up.
 *
 * P1-32 from the 2026-05 audit.
 *
 * Read-only. The actions belong on the per-tenant pages this links
 * out to (company-database, trial-management, etc.).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile,
  PageWorkbench,
} from "@/components/portal/ui";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  AlertTriangle,
  Clock,
  CreditCard,
  Sparkles,
  Building2,
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { EmptyState } from "@/components/ui/empty-state";

interface CompanyRow {
  id: string;
  slug: string | null;
  company_name: string | null;
  created_at: string | null;
  onboarding_completed_at: string | null;
}

interface OrderCountRow {
  company_id: string;
  count: number;
  last_event_date: string | null;
}

interface PaymentGatewayRow {
  company_id: string;
  is_active: boolean | null;
}

interface HealthRow {
  company: CompanyRow;
  ordersAllTime: number;
  lastOrderEventDate: string | null;
  paymentGatewayConnected: boolean;
}

const DAYS_STUCK_ONBOARDING = 7;
const DAYS_DORMANT = 30;

const daysSince = (iso: string | null): number | null => {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86_400_000);
};

const fmtDate = (iso: string | null): string => {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

function TenantHealthDashboard() {
  const { user, loading: authLoading } = useAuth() as any;
  const router = useRouter();
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/auth/login");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const load = async () => {
    setLoading(true);
    try {
      const { data: companies, error: cErr } = await supabase
        .from("companies")
        .select("id, slug, company_name, created_at, onboarding_completed_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (cErr) throw cErr;

      const companyIds = (companies || []).map((c: any) => c.id);

      // Orders-per-company aggregate. Pull ids + event_date in one
      // query and bucket client-side - saves a per-company round
      // trip and the dataset is small (sub-1000 tenants).
      const { data: orderRows } = companyIds.length
        ? await supabase
            .from("orders")
            .select("company_id, event_date")
            .in("company_id", companyIds)
            .is("deleted_at", null)
        : { data: [] as any[] };

      const ordersByCompany = new Map<string, OrderCountRow>();
      for (const r of (orderRows || []) as Array<{ company_id: string; event_date: string | null }>) {
        const cur = ordersByCompany.get(r.company_id) ?? {
          company_id: r.company_id,
          count: 0,
          last_event_date: null,
        };
        cur.count += 1;
        if (r.event_date && (!cur.last_event_date || r.event_date > cur.last_event_date)) {
          cur.last_event_date = r.event_date;
        }
        ordersByCompany.set(r.company_id, cur);
      }

      const { data: gateways } = companyIds.length
        ? await supabase
            .from("payment_gateways")
            .select("company_id, is_active")
            .in("company_id", companyIds)
            .is("deleted_at", null)
        : { data: [] as any[] };

      const gatewayConnected = new Set<string>();
      for (const g of (gateways || []) as PaymentGatewayRow[]) {
        if (g.is_active) gatewayConnected.add(g.company_id);
      }

      const merged: HealthRow[] = ((companies || []) as CompanyRow[]).map((c) => {
        const o = ordersByCompany.get(c.id);
        return {
          company: c,
          ordersAllTime: o?.count ?? 0,
          lastOrderEventDate: o?.last_event_date ?? null,
          paymentGatewayConnected: gatewayConnected.has(c.id),
        };
      });
      setRows(merged);
    } catch (e) {
      console.error("[tenant-health] load failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const stuckOnboarding = useMemo(
    () =>
      rows.filter((r) => {
        if (r.company.onboarding_completed_at) return false;
        const age = daysSince(r.company.created_at);
        return age !== null && age >= DAYS_STUCK_ONBOARDING;
      }),
    [rows],
  );

  const dormant = useMemo(
    () =>
      rows.filter((r) => {
        if (!r.company.onboarding_completed_at) return false;
        if (r.ordersAllTime === 0) return false;
        const last = r.lastOrderEventDate;
        if (!last) return true;
        const age = daysSince(last);
        return age !== null && age >= DAYS_DORMANT;
      }),
    [rows],
  );

  const noPaymentGateway = useMemo(
    () => rows.filter((r) => r.company.onboarding_completed_at && !r.paymentGatewayConnected),
    [rows],
  );

  const newSignups = useMemo(
    () =>
      rows.filter((r) => {
        const age = daysSince(r.company.created_at);
        return age !== null && age <= 7;
      }),
    [rows],
  );

  const renderTable = (label: string, list: HealthRow[], emptyText: string, accentDateLabel: string, accent: (r: HealthRow) => string) => (
    <PortalCard padded={false}>
      <div className="px-5 pt-5 pb-3">
        <PortalCardHeader className="mb-0" title={label} />
        <p className="text-sm text-slate-500 dark:text-slate-400">{list.length} tenant{list.length === 1 ? "" : "s"}</p>
      </div>
        {list.length === 0 ? (
          <EmptyState inCard icon={Sparkles} title={emptyText} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {list.map((r) => (
              <li key={r.company.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div className="min-w-0">
                  <Link
                    href={`/admin/platform/company-database?company=${r.company.id}`}
                    className="font-medium text-slate-900 hover:underline truncate block"
                  >
                    {r.company.company_name || r.company.slug || r.company.id.slice(0, 8)}
                  </Link>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {r.company.slug ? <span className="font-mono">{r.company.slug}</span> : null}
                    {r.company.slug && r.ordersAllTime > 0 ? " · " : null}
                    {r.ordersAllTime > 0 ? `${r.ordersAllTime} orders all-time` : null}
                  </p>
                </div>
                <div className="text-right text-xs flex-shrink-0">
                  <p className="text-slate-700 dark:text-slate-200 font-medium">{accent(r)}</p>
                  <p className="text-slate-500 dark:text-slate-400">{accentDateLabel}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
    </PortalCard>
  );

  return (
    <>
      <Head>
        <title>Tenant health - CateringMS</title>
      </Head>
      <NoIndexMeta />
      <div className="admin-page-shell">
        <PlatformNav />
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Tenant Health"
            subtitle="Spot tenants that need a nudge before they churn quietly."
            icon={Activity}
          />
          <PageWorkbench />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatTile
              icon={Clock}
              label="Stuck onboarding"
              value={loading ? "-" : stuckOnboarding.length}
              hint={`Tenants signed up >${DAYS_STUCK_ONBOARDING} days ago without onboarding_completed_at.`}
            />
            <StatTile
              icon={AlertTriangle}
              label="Dormant"
              value={loading ? "-" : dormant.length}
              hint={`Onboarded tenants whose last order event was >${DAYS_DORMANT} days ago.`}
            />
            <StatTile
              icon={CreditCard}
              label="No payment gateway"
              value={loading ? "-" : noPaymentGateway.length}
              hint="Onboarded tenants with no active payment_gateways row. Can't take online payments."
            />
            <StatTile
              icon={Building2}
              label="New signups (7d)"
              value={loading ? "-" : newSignups.length}
              hint="Companies created in the last 7 days. Watch for ones that haven't started onboarding."
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {renderTable(
              "Stuck in onboarding",
              stuckOnboarding,
              "Nobody stuck in onboarding right now.",
              "since signup",
              (r) => `${daysSince(r.company.created_at)}d`,
            )}
            {renderTable(
              "Dormant tenants",
              dormant,
              "Everyone onboarded is shipping orders.",
              "since last event",
              (r) => `${daysSince(r.lastOrderEventDate)}d`,
            )}
            {renderTable(
              "No payment gateway",
              noPaymentGateway,
              "Every onboarded tenant has a gateway.",
              "signup",
              (r) => fmtDate(r.company.created_at),
            )}
            {renderTable(
              "New signups (last 7 days)",
              newSignups,
              "No new signups this week.",
              "signup",
              (r) => fmtDate(r.company.created_at),
            )}
          </div>
        </PortalShell>
      </div>
    </>
  );
}

export default function ProtectedTenantHealth() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <TenantHealthDashboard />
    </ProtectedRoute>
  );
}
