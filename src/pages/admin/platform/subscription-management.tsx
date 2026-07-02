import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile,
  PageWorkbench,
} from "@/components/portal/ui";
import Head from "next/head";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, RefreshCw, Eye, Ban, CheckCircle, AlertTriangle, TrendingUp, DollarSign, Users, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
import { SortHeader } from "@/components/ui/sort-header";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";

// We treat every company row as a subscription record. This works whether the
// company is on a free trial, an active paid plan, or cancelled - the source
// of truth is companies.subscription_status / subscription_plan, not a
// separate subscriptions table (which is optional and currently empty).
type CompanySubscription = {
  id: string;
  company_id: string;
  company_name: string;
  owner_full_name: string | null;
  owner_email: string | null;
  status: string;
  plan_name: string;
  billing_cycle: string;
  amount: number;
  currency: string;
  next_billing_date: string | null;
  trial_ends_at: string | null;
};

// Wave 24: super_admin gate. Surfaces every tenant's subscription
// row + can suspend / re-enable accounts. Tenant admins MUST NOT
// reach this view.
export default function ProtectedPlatformSubscriptionManagement() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <PlatformSubscriptionManagement />
    </ProtectedRoute>
  );
}

function PlatformSubscriptionManagement() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [subscriptions, setSubscriptions] = useState<CompanySubscription[]>([]);
  const { toast } = useToast();
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    trial: 0,
    cancelled: 0,
    pastDue: 0,
    totalMRR: 0
  });

  useEffect(() => {
    if (user) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [user]);

  // Fallback rates only for when the pricing-plans API is unreachable.
  // Live rates come from platform_pricing_plans (the same table the
  // pricing-management page edits) so MRR follows real price changes.
  const FALLBACK_PLAN_RATES: Record<string, { name: string; amount: number }> = {
    starter: { name: "Starter", amount: 499 },
    growth: { name: "Growth", amount: 1499 },
    scale: { name: "Scale", amount: 3999 },
    enterprise: { name: "Enterprise", amount: 9999 },
  };

  const fetchPlanRates = async (): Promise<Record<string, { name: string; amount: number }>> => {
    try {
      const r = await fetch("/api/platform/pricing-plans");
      if (!r.ok) return FALLBACK_PLAN_RATES;
      const body = await r.json();
      const map: Record<string, { name: string; amount: number }> = {};
      for (const p of body?.plans || []) {
        if (p?.slug) map[String(p.slug).toLowerCase()] = { name: p.name || p.slug, amount: Number(p.zar_price) || 0 };
      }
      return Object.keys(map).length > 0 ? map : FALLBACK_PLAN_RATES;
    } catch {
      return FALLBACK_PLAN_RATES;
    }
  };

  const resolvePlanPricing = (
    plan: string | null | undefined,
    rates: Record<string, { name: string; amount: number }>,
  ) => {
    if (!plan) return { name: "Free trial", amount: 0 };
    const key = plan.toLowerCase();
    return rates[key] || { name: plan, amount: 0 };
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const planRates = await fetchPlanRates();

      // 1. Pull every company. Each one is a subscription in our world.
      const { data: companies, error: companiesErr } = await supabase
        .from("companies")
        .select(
          "id, company_name, slug, owner_id, subscription_status, subscription_plan, trial_ends_at, subscription_starts_at, subscription_ends_at, currency, billing_currency, created_at, is_active",
        )
        .order("created_at", { ascending: false });
      if (companiesErr) throw companiesErr;

      // 2. Pull owner profiles in one round trip and index them.
      const ownerIds = (companies || []).map((c: any) => c.owner_id).filter(Boolean);
      const ownersById = new Map<string, { full_name: string | null; email: string | null }>();
      if (ownerIds.length > 0) {
        const { data: owners } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ownerIds);
        (owners || []).forEach((o: any) =>
          ownersById.set(o.id, { full_name: o.full_name, email: o.email }),
        );
      }

      // 3. Build the synthetic subscription rows.
      const rows: CompanySubscription[] = (companies || []).map((c: any) => {
        const owner = c.owner_id ? ownersById.get(c.owner_id) : null;
        const plan = resolvePlanPricing(c.subscription_plan, planRates);
        // A.13 #3 sweep: was a defensive 'trialing' -> 'trial'
        // normalisation. Migration 20260518740000 dropped 'trialing'
        // from the subscription_status enum so this branch can no
        // longer fire; coalesce to 'trial' for null-rows only.
        const status = c.subscription_status || "trial";
        return {
          id: c.id,
          company_id: c.id,
          company_name: c.company_name || "Unknown company",
          owner_full_name: owner?.full_name || null,
          owner_email: owner?.email || null,
          status,
          plan_name: plan.name,
          billing_cycle: status === "trial" ? "trial" : "monthly",
          amount: status === "active" ? plan.amount : 0,
          currency: c.billing_currency || c.currency || "ZAR",
          next_billing_date:
            status === "trial" ? c.trial_ends_at : c.subscription_ends_at || null,
          trial_ends_at: c.trial_ends_at,
        };
      });

      setSubscriptions(rows);
      calculateStats(rows);
    } catch (err) {
      console.error("Error loading subscriptions:", err);
      setError(dbErrorMessage(err, { entity: "subscription", fallback: "Failed to load subscriptions" }));
      setSubscriptions([]);
      calculateStats([]);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (subs: CompanySubscription[]) => {
    const newStats = {
      total: subs.length,
      active: subs.filter((s) => s.status === "active").length,
      trial: subs.filter((s) => s.status === "trial").length,
      cancelled: subs.filter((s) => s.status === "cancelled").length,
      pastDue: subs.filter((s) => s.status === "past_due").length,
      totalMRR: subs
        .filter((s) => s.status === "active" && s.billing_cycle === "monthly")
        .reduce((sum, s) => sum + Number(s.amount), 0),
    };
    setStats(newStats);
  };

  const handleActivate = async (companyId: string) => {
    const { error: updateErr } = await supabase
      .from("companies")
      .update({
        subscription_status: "active",
        trial_ends_at: null,
        subscription_starts_at: new Date().toISOString(),
      })
      .eq("id", companyId);
    if (updateErr) {
      toast({ title: "Failed to activate", description: dbErrorMessage(updateErr, { entity: "subscription" }), variant: "destructive" });
      return;
    }
    toast({ title: "Subscription activated" });
    void loadData();
  };

  const handleCancel = async (companyId: string) => {
    if (!confirm("Cancel this subscription? The company stays in the database but is marked cancelled.")) return;
    const { error: updateErr } = await supabase
      .from("companies")
      .update({ subscription_status: "cancelled", subscription_ends_at: new Date().toISOString() })
      .eq("id", companyId);
    if (updateErr) {
      toast({ title: "Failed to cancel", description: dbErrorMessage(updateErr, { entity: "subscription" }), variant: "destructive" });
      return;
    }
    toast({ title: "Subscription cancelled" });
    void loadData();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const statusFilteredSubs = useMemo(() => {
    return statusFilter === "all"
      ? subscriptions
      : subscriptions.filter((sub: any) => sub.status === statusFilter);
  }, [subscriptions, statusFilter]);

  const fuzzyFiltered = useFuzzyItems(
    statusFilteredSubs,
    searchTerm,
    [
      { key: "company_name" as any, weight: 3 },
      { key: "owner_full_name" as any, weight: 2 },
      { key: "owner_email" as any, weight: 2 },
      { key: "plan_name" as any, weight: 2 },
    ],
    { limit: 0 },
  );

  // Layered sort on top of search + status filter so the table can be
  // ranked by any column the team finds useful.
  const subSortColumns: ColumnDef<any>[] = useMemo(() => [
    { key: "company",  accessor: (s) => s.company_name,                         type: "string" },
    { key: "plan",     accessor: (s) => s.plan_name,                            type: "string" },
    { key: "status",   accessor: (s) => s.status,                               type: "string" },
    { key: "amount",   accessor: (s) => Number(s.amount || 0),                  type: "number" },
    { key: "billing",  accessor: (s) => s.billing_cycle,                        type: "string" },
    { key: "next",     accessor: (s) => s.next_billing_date,                    type: "date"   },
  ], []);
  const sortedSubs = useSortable<any>(fuzzyFiltered, subSortColumns, { defaultKey: "company", defaultDir: "asc" });
  const filteredSubscriptions = sortedSubs.rows;

  const formatCurrency = (amount: number, currency: string = "ZAR") => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: currency
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-ZA", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; className: string }> = {
      active: { label: "Active", className: "bg-brand-primary" },
      trial: { label: "Trial", className: "bg-blue-500" },
      past_due: { label: "Past Due", className: "bg-yellow-500" },
      cancelled: { label: "Cancelled", className: "bg-rose-500" },
      expired: { label: "Expired", className: "bg-slate-500" }
    };

    const { label, className } = config[status] || { label: status, className: "bg-slate-500" };
    return <Badge className={className}>{label}</Badge>;
  };

  if (loading) {
    return (
      <div className="admin-page-shell">
        <PlatformNav />
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalCard className="flex items-center justify-center py-16">
            <div className="text-center text-slate-500 dark:text-slate-400">
              <RefreshCw className="mx-auto mb-4 h-8 w-8 animate-spin" />
              <p>Loading subscription management...</p>
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">This should only take a few seconds</p>
            </div>
          </PortalCard>
        </PortalShell>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="admin-page-shell">
        <PlatformNav />
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalCard className="mx-auto max-w-md p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Authentication Required</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">Please sign in to access subscription management.</p>
            <Button onClick={() => router.push("/auth/login")}>Sign In</Button>
          </PortalCard>
        </PortalShell>
      </div>
    );
  }

  return (
    <div className="admin-page-shell">
      <Head>
        <title>Subscription management - CateringMS</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <PlatformNav />

      <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
        <PortalHeader
          variant="hero"
          title="Subscription Management"
          subtitle="Monitor and manage customer subscriptions across every tenant on the platform."
          icon={CreditCard}
          meta={
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {stats.active} active
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                {stats.trial} on trial
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                {formatCurrency(stats.totalMRR)} MRR
              </span>
            </>
          }
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          }
        />
        <PageWorkbench />

        {error && (
          <Alert className="mb-6 border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30">
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            <AlertDescription className="text-rose-800 dark:text-rose-200">
              <strong>Error loading subscriptions:</strong> {error}
              <Button
                variant="link"
                size="sm"
                onClick={handleRefresh}
                className="ml-2 text-rose-700 underline dark:text-rose-300"
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <StatTile
            label={
              <span className="flex items-center gap-1.5">
                Total Subscriptions
                <InfoTooltip content="Every tenant on the platform counted as one subscription each.\n\nIncludes active, trial and cancelled accounts together." />
              </span>
            }
            value={stats.total}
            hint="All customers"
            icon={Users}
          />
          <StatTile
            label={
              <span className="flex items-center gap-1.5">
                Active
                <InfoTooltip content="Companies on a paid plan right now.\n\nThese are the customers actually generating recurring revenue." />
              </span>
            }
            value={<span className="text-brand-primary dark:text-brand-primary">{stats.active}</span>}
            hint="Paying customers"
            icon={CheckCircle}
          />
          <StatTile
            label={
              <span className="flex items-center gap-1.5">
                In Trial
                <InfoTooltip content="Companies still inside their free trial period.\n\nThey don't add to MRR yet, conversion to paid is what matters here." />
              </span>
            }
            value={<span className="text-blue-600 dark:text-blue-500">{stats.trial}</span>}
            hint="Free trial period"
            icon={TrendingUp}
          />
          <StatTile
            label={
              <span className="flex items-center gap-1.5">
                Monthly MRR
                <InfoTooltip content="Recurring monthly revenue from every active subscription added together.\n\nPlan rates come from the live pricing plans (the same ones edited on Pricing Management), so a price change there updates this figure on the next load." />
              </span>
            }
            value={<span className="text-brand-primary dark:text-brand-primary">{formatCurrency(stats.totalMRR)}</span>}
            hint="Recurring revenue"
            icon={DollarSign}
          />
        </div>

        {/* Toolbar: search + status filter grouped in one place. */}
        <PortalCard className="mb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <Input
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[160px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="past_due">Past Due</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </PortalCard>

        <PortalCard className="mb-6">
          <PortalCardHeader
            title={
              <span className="flex items-center gap-2">
                Customer Subscriptions ({filteredSubscriptions.length})
                <InfoTooltip content="Every tenant shown as a subscription row, with plan, status, amount and next billing date.\n\nFor trials the next billing date is the trial end. For paid customers it's the renewal date." />
              </span>
            }
          />
            {filteredSubscriptions.length === 0 ? (
              <div className="text-center py-12">
                <AlertTriangle className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500 dark:text-slate-400">
                  {subscriptions.length === 0
                    ? "No subscriptions found in the system"
                    : "No subscriptions found matching your criteria"}
                </p>
                {error && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRefresh}
                    className="mt-4"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry Loading
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <SortHeader sortKey="company" activeKey={sortedSubs.sortKey} activeDir={sortedSubs.sortDir} onToggle={sortedSubs.toggle}>Customer</SortHeader>
                      </TableHead>
                      <TableHead>
                        <SortHeader sortKey="plan" activeKey={sortedSubs.sortKey} activeDir={sortedSubs.sortDir} onToggle={sortedSubs.toggle}>Plan</SortHeader>
                      </TableHead>
                      <TableHead>
                        <SortHeader sortKey="status" activeKey={sortedSubs.sortKey} activeDir={sortedSubs.sortDir} onToggle={sortedSubs.toggle}>Status</SortHeader>
                      </TableHead>
                      <TableHead>
                        <SortHeader sortKey="amount" activeKey={sortedSubs.sortKey} activeDir={sortedSubs.sortDir} onToggle={sortedSubs.toggle}>Amount</SortHeader>
                      </TableHead>
                      <TableHead>
                        <SortHeader sortKey="billing" activeKey={sortedSubs.sortKey} activeDir={sortedSubs.sortDir} onToggle={sortedSubs.toggle}>Billing Cycle</SortHeader>
                      </TableHead>
                      <TableHead>
                        <SortHeader sortKey="next" activeKey={sortedSubs.sortKey} activeDir={sortedSubs.sortDir} onToggle={sortedSubs.toggle}>Next Billing</SortHeader>
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubscriptions.map((sub) => (
                      <TableRow key={sub.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">{sub.company_name}</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {sub.owner_full_name || sub.owner_email || "No owner"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-slate-900 dark:text-white">{sub.plan_name}</p>
                        </TableCell>
                        <TableCell>{getStatusBadge(sub.status)}</TableCell>
                        <TableCell>
                          <p className="font-medium text-slate-900 dark:text-white">
                            {sub.amount > 0 ? formatCurrency(Number(sub.amount), sub.currency) : <span className="font-normal text-slate-400 dark:text-slate-500">Free</span>}
                          </p>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm capitalize text-slate-600 dark:text-slate-400">{sub.billing_cycle}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-slate-600 dark:text-slate-400">{formatDate(sub.next_billing_date)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {sub.status === "trial" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleActivate(sub.company_id)}
                                title="Convert trial to active subscription"
                              >
                                Activate
                              </Button>
                            )}
                            {sub.status === "active" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCancel(sub.company_id)}
                                className="text-rose-600 hover:text-rose-700"
                                title="Cancel subscription"
                              >
                                <Ban className="h-3.5 w-3.5 mr-1" />
                                Cancel
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/admin/platform/company-database?company=${sub.company_id}`)}
                              title="View company"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
        </PortalCard>

        <div className="grid gap-6 md:grid-cols-2 mb-6">
          <PortalCard className="border-yellow-200 bg-yellow-50 dark:border-yellow-900/40 dark:bg-yellow-950/20">
            <PortalCardHeader
              title={
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  At Risk ({stats.pastDue})
                  <InfoTooltip content="Companies with a failed or overdue payment that need a personal nudge.\n\nReach out promptly, this is the window where churn usually happens." />
                </span>
              }
            />
            <p className="-mt-2 mb-3 text-sm text-slate-600 dark:text-slate-400">Subscriptions requiring attention</p>
              {subscriptions.filter(s => s.status === "past_due").length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-400 text-center py-4">No at-risk subscriptions</p>
              ) : (
                <div className="space-y-3">
                  {subscriptions.filter(s => s.status === "past_due").map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between p-3 bg-white rounded-lg border dark:bg-slate-900 dark:border-slate-700">
                      <div>
                        <p className="font-medium text-sm">{sub.company_name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{sub.plan_name}</p>
                      </div>
                      {sub.owner_email ? (
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={`mailto:${sub.owner_email}?subject=${encodeURIComponent(`Your CateringMS subscription for ${sub.company_name}`)}`}
                            title={`Email ${sub.owner_email}`}
                          >
                            Contact
                          </a>
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled
                          title="No owner email on record for this company"
                        >
                          Contact
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
          </PortalCard>

          <PortalCard className="border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/20">
            <PortalCardHeader
              title={
                <span className="flex items-center gap-2">
                  <Ban className="h-5 w-5 text-rose-600" />
                  Cancelled ({stats.cancelled})
                  <InfoTooltip content="Companies that have ended their subscription, with the most recent cancellations first.\n\nA good list to mine for win-back outreach." />
                </span>
              }
            />
            <p className="-mt-2 mb-3 text-sm text-slate-600 dark:text-slate-400">Recently cancelled subscriptions</p>
              {subscriptions.filter(s => s.status === "cancelled").length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-400 text-center py-4">No cancelled subscriptions</p>
              ) : (
                <div className="space-y-3">
                  {subscriptions.filter(s => s.status === "cancelled").slice(0, 3).map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between p-3 bg-white rounded-lg border dark:bg-slate-900 dark:border-slate-700">
                      <div>
                        <p className="font-medium text-sm">{sub.company_name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Ended {formatDate(sub.next_billing_date)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/admin/platform/company-database?company=${sub.company_id}`)}
                        title="Open this company in the company database"
                      >
                        Review
                      </Button>
                    </div>
                  ))}
                </div>
              )}
          </PortalCard>
        </div>
      </PortalShell>
    </div>
  );
}
