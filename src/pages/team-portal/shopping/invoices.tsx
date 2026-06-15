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
  completed:    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
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
      <Head><title>Shopping receipts - CateringMS</title></Head>
      <NoIndexMeta />
      <ShoppingNav />
      <main className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          {/* Header: bordered icon tile + solid title, matching the
              shopping dashboard. Amber is reserved for the icon glyph
              and primary actions, not a decorative gradient. */}
          <div className="mb-6 sm:mb-8 flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center flex-shrink-0">
              <Receipt className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Purchase Receipts</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">All your purchase runs with their receipts and actual spend</p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">Completed runs <InfoTooltip content="Shopping lists where the buyer has finished the run." /></p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white mt-0.5">{stats.completedCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">Total spend <InfoTooltip content="Total actual spend across every completed shopping run." /></p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white mt-0.5">R {stats.totalSpend.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">Receipts on file <InfoTooltip content="Runs that have a receipt uploaded against them.\n\nIf the receipt rule is on in settings, you can't close a run without one." /></p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white mt-0.5">{stats.withReceipt}</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">Estimate variance <InfoTooltip content="What you actually spent against what you estimated, across every run.\n\nA positive number means you went over budget." /></p>
              {/* Variance semantics: over budget = rose, under/on budget = emerald. */}
              <p className={`text-2xl font-semibold tabular-nums mt-0.5 ${stats.variance > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {stats.variance >= 0 ? "+" : ""}R {stats.variance.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 mb-6 flex flex-col sm:flex-row gap-3">
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
              className={hasReceiptOnly ? "bg-amber-600 hover:bg-amber-700 text-white rounded-lg gap-2" : "rounded-lg gap-2"}
            >
              <FileText className="h-4 w-4" />Receipt attached only
            </Button>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            {loading ? (
              // Skeleton rows in the list shape so the layout holds
              // steady when data arrives (no spinner-in-the-middle).
              <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-busy="true" aria-label="Loading purchase runs">
                {[0, 1, 2, 3, 4].map((i) => (
                  <li key={i} className="p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="h-4 w-40 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                      <div className="h-3 w-56 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                    </div>
                    <div className="h-4 w-24 rounded bg-slate-100 dark:bg-slate-800 animate-pulse flex-shrink-0" />
                  </li>
                ))}
              </ul>
            ) : filtered.length === 0 ? (
              <div className="py-16 px-6 text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                  <Receipt className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1.5">
                  {search || hasReceiptOnly ? "No matching runs" : "No purchase runs yet"}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
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
                    <li key={l.id} className="p-4 flex items-center gap-3 transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-medium text-slate-900 dark:text-white tabular-nums">{l.list_date ?? "Undated"}</span>
                          {l.status && (
                            <Badge variant="outline" className={`${statusTone[l.status] ?? statusTone.draft} text-xs capitalize`}>
                              {l.status.replace("_", " ")}
                            </Badge>
                          )}
                          {l.created_at && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">{formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}</span>
                          )}
                        </div>
                        {l.notes && <p className="text-xs text-slate-600 dark:text-slate-300 mb-1">{l.notes}</p>}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          {l.estimated_total != null && (
                            <span className="text-slate-500 dark:text-slate-400">Estimate: <span className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">R {Number(l.estimated_total).toFixed(2)}</span></span>
                          )}
                          {l.actual_total != null && (
                            <span className="text-slate-500 dark:text-slate-400">Actual: <span className="font-semibold text-slate-900 dark:text-white tabular-nums">R {Number(l.actual_total).toFixed(2)}</span></span>
                          )}
                          {l.estimated_total != null && l.actual_total != null && (
                            // Variance: over budget = rose, under/on = emerald.
                            <span className={`tabular-nums font-medium ${variance > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                              {variance >= 0 ? "+" : ""}R {variance.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {l.receipt_url ? (
                          <a href={l.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors duration-150">
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
          </div>
        </div>
      </main>
    </>
  );
}
