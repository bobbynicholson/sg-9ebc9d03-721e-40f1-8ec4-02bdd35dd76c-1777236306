import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import Head from "next/head";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Receipt, Search, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { PortalShell, PortalHeader, PortalCard, StatTile,
  PageWorkbench,
} from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

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

export default function ShoppingInvoicesPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [hasReceiptOnly, setHasReceiptOnly] = useState(false);

  useEffect(() => {
    if (!user?.company_id) return;
    load();
  }, [user?.company_id]);

  const load = async () => {
    if (!user?.company_id) return;
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
    } catch (e) {
      toast({ title: "Could not load receipts", variant: "destructive" });
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
    const variance = items.reduce((s, l) => s + (Number(l.actual_total || 0) - Number(l.estimated_total || 0)), 0);
    return { totalSpend, completedCount, withReceipt, variance };
  }, [items]);

  return (
    <>
      <Head><title>Shopping spend - CateringMS</title></Head>
      <NoIndexMeta />
      <ShoppingNav />
      {/* Offset for the fixed shopping nav (top bar on mobile, side rail on
          desktop). The neutral ground + responsive container come from
          PortalShell so every staff page lines up identically. */}
      <div className="lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell>
          {/* Amber is reserved for the header glyph and the primary
              action; everything else stays neutral slate. */}
          <PortalHeader
            icon={Receipt}
            title="Spend"
            subtitle="Completed shopping runs, uploaded supplier slips, actual spend, and estimate variance."
          />
          <PageWorkbench />

          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatTile
              label={<span className="flex items-center gap-1">Completed runs <InfoTooltip content="Shopping lists where the buyer has finished the run." /></span>}
              value={stats.completedCount}
            />
            <StatTile
              label={<span className="flex items-center gap-1">Total spend <InfoTooltip content="Total actual spend across every completed shopping run." /></span>}
              value={`R ${stats.totalSpend.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`}
            />
            <StatTile
              label={<span className="flex items-center gap-1">Receipts on file <InfoTooltip content="Runs that have a receipt uploaded against them.\n\nIf the receipt rule is on in settings, you can't close a run without one." /></span>}
              value={stats.withReceipt}
            />
            {/* Variance semantics carried by a subtle tint on the figure:
                over budget = rose, under / on budget = emerald. */}
            <StatTile
              label={<span className="flex items-center gap-1">Estimate variance <InfoTooltip content="What you actually spent against what you estimated, across every run.\n\nA positive number means you went over budget." /></span>}
              value={
                <span className={stats.variance > 0 ? "text-rose-600 dark:text-rose-400" : "text-brand-primary dark:text-brand-primary"}>
                  {stats.variance >= 0 ? "+" : ""}R {stats.variance.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                </span>
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
            {loading ? (
              // Skeleton rows in the list shape so the layout holds
              // steady when data arrives (no spinner-in-the-middle).
              <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-busy="true" aria-label="Loading purchase runs">
                {[0, 1, 2, 3, 4].map((i) => (
                  <li key={i} className="flex items-center gap-3 p-5">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-40 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                      <div className="h-3 w-56 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    </div>
                    <div className="h-4 w-24 shrink-0 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                  </li>
                ))}
              </ul>
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
                            <span className="text-slate-500 dark:text-slate-400">Estimate: <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">R {Number(l.estimated_total).toFixed(2)}</span></span>
                          )}
                          {l.actual_total != null && (
                            <span className="text-slate-500 dark:text-slate-400">Actual: <span className="font-semibold tabular-nums text-slate-900 dark:text-white">R {Number(l.actual_total).toFixed(2)}</span></span>
                          )}
                          {l.estimated_total != null && l.actual_total != null && (
                            // Variance: over budget = rose, under/on = emerald.
                            <span className={`font-medium tabular-nums ${variance > 0 ? "text-rose-600 dark:text-rose-400" : "text-brand-primary dark:text-brand-primary"}`}>
                              {variance >= 0 ? "+" : ""}R {variance.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {l.receipt_url ? (
                          <a href={l.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 transition-colors duration-150 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300">
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
        </PortalShell>
      </div>
    </>
  );
}
