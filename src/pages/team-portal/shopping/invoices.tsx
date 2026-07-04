import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Receipt, Search, FileText, ExternalLink, Wallet, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShoppingPageShell, SHOPPING_HERO_CHIP } from "@/components/shopping/ShoppingPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalCard, StatTile } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { UserRole } from "@/types/app";

interface ShoppingList {
  id: string;
  list_date: string | null;
  status: string | null;
  shopper_id: string | null;
  receipt_url: string | null;
  notes: string | null;
  estimated_total: number | null;
  actual_total: number | null;
  created_at: string | null;
}

const statusTone: Record<string, string> = {
  completed:    "bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/15 dark:text-brand-primary dark:border-brand-primary/30",
  draft:        "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  pending:      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  in_progress:  "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  shopping:     "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  cancelled:    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
};

function ShoppingInvoicesPageInner() {
  const { user } = useAuth();
  const tenantCurrency = useTenantCurrency(user?.company_id ?? null);

  const [items, setItems] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [hasReceiptOnly, setHasReceiptOnly] = useState(false);

  useEffect(() => {
    if (!user?.company_id) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  // Realtime: spend history is the set of shopping_lists for this company.
  // A run completed on another device (actual_total + receipt) should show
  // up here live rather than only on a manual Refresh. Random channel
  // suffix per the repo channel-reuse rule.
  useEffect(() => {
    const companyId = user?.company_id;
    if (!companyId) return;
    const channel = supabase
      .channel(`shopping-spend-${companyId}-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "shopping_lists", filter: `company_id=eq.${companyId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.company_id) return;
    // Skeleton only before the first successful load; a retry keeps the
    // last-good list on screen instead of blanking it.
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("shopping_lists")
        .select("*")
        .eq("company_id", user.company_id)
        .order("list_date", { ascending: false })
        .limit(200)
        .returns<ShoppingList[]>();
      if (error) throw error;
      setItems(data || []);
      setLoadError(null);
      setLoaded(true);
    } catch (e: any) {
      // Recovery card owns this state; never dress a failed load up as
      // an empty spend history.
      setLoadError(e?.message || "We couldn't reach the server. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  const preFiltered = useMemo(() => {
    return hasReceiptOnly ? items.filter((l) => !!l.receipt_url) : items;
  }, [items, hasReceiptOnly]);

  const filtered = useFuzzyItems(
    preFiltered,
    search,
    [
      { key: "list_date" as any, weight: 2 },
      { key: "notes" as any, weight: 2 },
    ],
    { limit: 0 },
  );

  const stats = useMemo(() => {
    const completed = items.filter((l) => l.status === "completed");
    const totalSpend = completed.reduce((s, l) => s + Number(l.actual_total || 0), 0);
    const completedCount = completed.length;
    const withReceipt = items.filter((l) => l.receipt_url).length;
    // Only completed lists have both an actual_total and an estimated_total.
    // Reducing over all items let drafts (estimated set, actual 0) drag the
    // variance falsely negative. Restrict to completed to match totalSpend.
    const variance = completed.reduce((s, l) => s + (Number(l.actual_total || 0) - Number(l.estimated_total || 0)), 0);
    return { totalSpend, completedCount, withReceipt, variance };
  }, [items]);

  const showSkeleton = loading && !loaded;
  const chipsReady = loaded && !loadError;

  return (
    <ShoppingPageShell
      pageTitle="Shopping spend - CateringMS"
      heading="Spend"
      subheading={
        chipsReady
          ? stats.completedCount > 0
            ? `${stats.completedCount} completed run${stats.completedCount === 1 ? "" : "s"} totalling ${tenantCurrency.format(stats.totalSpend, 0)}.`
            : "No completed runs yet, your spend history starts with the first finished shop."
          : "Completed shopping runs, uploaded supplier slips, actual spend, and estimate variance."
      }
      icon={Wallet}
      headerAction={
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin motion-reduce:animate-none")} />
          Refresh
        </Button>
      }
      meta={
        chipsReady ? (
          <>
            <span className={SHOPPING_HERO_CHIP}>
              <CheckCircle2 className="h-3 w-3" />
              {stats.completedCount} completed
            </span>
            <span className={SHOPPING_HERO_CHIP}>
              <FileText className="h-3 w-3" />
              {stats.withReceipt} receipt{stats.withReceipt === 1 ? "" : "s"} on file
            </span>
            <span className={SHOPPING_HERO_CHIP}>
              <span className={cn("h-1.5 w-1.5 rounded-full", stats.variance > 0 ? "bg-rose-400" : "bg-emerald-400")} />
              {stats.variance > 0 ? `${tenantCurrency.format(stats.variance, 0)} over estimate` : "On or under estimate"}
            </span>
          </>
        ) : undefined
      }
    >
      {/* Recovery card: the load failed. Keep any last-good list below,
          but never show an empty state for a failed load. */}
      {loadError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40">
          <h2 className="mb-1 text-base font-bold text-rose-900 dark:text-rose-200">Couldn&apos;t load your spend history</h2>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">{loadError}</p>
          <Button
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="bg-brand-primary hover:opacity-90 text-white"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin motion-reduce:animate-none")} />
            Retry
          </Button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label={<span className="flex items-center gap-1">Completed runs <InfoTooltip content="Shopping lists where the buyer has finished the run." /></span>}
          value={chipsReady ? stats.completedCount : "--"}
        />
        <StatTile
          label={<span className="flex items-center gap-1">Total spend <InfoTooltip content="Total actual spend across every completed shopping run." /></span>}
          value={chipsReady ? tenantCurrency.format(stats.totalSpend, 0) : "--"}
        />
        <StatTile
          label={<span className="flex items-center gap-1">Receipts on file <InfoTooltip content="Runs that have a receipt uploaded against them.\n\nIf the receipt rule is on in settings, you can't close a run without one." /></span>}
          value={chipsReady ? stats.withReceipt : "--"}
        />
        {/* Variance semantics carried by a subtle tint on the figure:
            over budget = rose, under / on budget = brand accent. */}
        <StatTile
          label={<span className="flex items-center gap-1">Estimate variance <InfoTooltip content="What you actually spent against what you estimated, across every run.\n\nA positive number means you went over budget." /></span>}
          value={
            chipsReady ? (
              <span className={stats.variance > 0 ? "text-rose-600 dark:text-rose-400" : "text-brand-primary dark:text-brand-primary"}>
                {stats.variance >= 0 ? "+" : ""}{tenantCurrency.format(stats.variance, 0)}
              </span>
            ) : "--"
          }
        />
      </div>

      <PortalCard className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
          <Input className="pl-9" placeholder="Search by date or notes..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {/* Amber fills the toggle only when the filter is active -
            accent signals state, not chrome. Off state is a quiet
            bordered button. */}
        <Button
          type="button"
          variant={hasReceiptOnly ? "default" : "outline"}
          aria-pressed={hasReceiptOnly}
          onClick={() => setHasReceiptOnly((v) => !v)}
          className={hasReceiptOnly ? "bg-brand-primary hover:bg-brand-primary/90 text-white rounded-lg gap-2" : "rounded-lg gap-2"}
        >
          <FileText className="h-4 w-4" />Receipt attached only
        </Button>
      </PortalCard>

      <PortalCard padded={false}>
        {showSkeleton ? (
          // Skeleton rows in the list shape so the layout holds
          // steady when data arrives (no spinner-in-the-middle).
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-busy="true" aria-label="Loading purchase runs">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="flex items-center gap-3 p-5">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-40 rounded bg-slate-100 dark:bg-slate-800 animate-pulse motion-reduce:animate-none" />
                  <div className="h-3 w-56 rounded bg-slate-100 dark:bg-slate-800 animate-pulse motion-reduce:animate-none" />
                </div>
                <div className="h-4 w-24 shrink-0 rounded bg-slate-100 dark:bg-slate-800 animate-pulse motion-reduce:animate-none" />
              </li>
            ))}
          </ul>
        ) : loadError && items.length === 0 ? (
          // The recovery card above owns this state; keep the card body quiet.
          <div className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Your purchase runs are unavailable right now. Use Retry above to reload them.
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              <Receipt className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            </div>
            <h2 className="mb-1.5 text-lg font-semibold text-slate-900 dark:text-white">
              {search || hasReceiptOnly ? "No matching runs" : "No purchase runs yet"}
            </h2>
            <p className="mx-auto max-w-md text-sm text-slate-600 dark:text-slate-300">
              {search || hasReceiptOnly
                ? "Try a different date or note, or clear the receipt filter to see every run."
                : "Once you complete a shopping run, it lands here with its estimate, actual spend and receipt. Snap a slip on the Receipts page to attach one."}
            </p>
            {(search || hasReceiptOnly) && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setSearch(""); setHasReceiptOnly(false); }}
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((l) => {
              const variance = Number(l.actual_total || 0) - Number(l.estimated_total || 0);
              return (
                <li key={l.id} className="flex items-center gap-3 p-5 transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums text-slate-900 dark:text-white">{l.list_date ?? "Undated"}</span>
                      {l.status && (
                        <Badge variant="outline" className={`${statusTone[l.status] ?? statusTone.draft} text-xs capitalize`}>
                          {l.status.replace("_", " ")}
                        </Badge>
                      )}
                      {l.created_at && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}</span>
                      )}
                    </div>
                    {l.notes && <p className="mb-1 text-xs text-slate-600 dark:text-slate-300">{l.notes}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {l.estimated_total != null && (
                        <span className="text-slate-500 dark:text-slate-400">Estimate: <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{tenantCurrency.format(Number(l.estimated_total))}</span></span>
                      )}
                      {l.actual_total != null && (
                        <span className="text-slate-500 dark:text-slate-400">Actual: <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{tenantCurrency.format(Number(l.actual_total))}</span></span>
                      )}
                      {l.estimated_total != null && l.actual_total != null && (
                        // Variance: over budget = rose, under/on = brand accent.
                        <span className={`font-medium tabular-nums ${variance > 0 ? "text-rose-600 dark:text-rose-400" : "text-brand-primary dark:text-brand-primary"}`}>
                          {variance >= 0 ? "+" : ""}{tenantCurrency.format(variance)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {l.receipt_url ? (
                      <a href={l.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary transition-colors duration-150 hover:text-brand-primary/80 dark:text-brand-primary dark:hover:text-brand-primary/80">
                        <ExternalLink className="h-3.5 w-3.5" />View receipt
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">No receipt</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PortalCard>
    </ShoppingPageShell>
  );
}

export default function ShoppingInvoicesPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SHOPPING_STAFF, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.REGION_ADMIN, UserRole.ADMIN]}>
      <ShoppingInvoicesPageInner />
    </ProtectedRoute>
  );
}
