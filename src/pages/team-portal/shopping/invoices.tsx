import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Receipt, Search, Loader2, FileText, Download, ExternalLink } from "lucide-react";
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
  completed:    "bg-emerald-100 text-emerald-800 border-emerald-200",
  draft:        "bg-slate-100 text-slate-700 border-slate-200",
  pending:      "bg-amber-100 text-amber-800 border-amber-200",
  in_progress:  "bg-purple-100 text-purple-800 border-purple-200",
  shopping:     "bg-purple-100 text-purple-800 border-purple-200",
  cancelled:    "bg-rose-100 text-rose-700 border-rose-200",
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
      <Head><title>Shopping Receipts - CateringMS</title></Head>
      <NoIndexMeta />
      <ShoppingNav />
      <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-6 sm:py-8 max-w-full">
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent flex items-center gap-3">
              <Receipt className="h-7 w-7 text-emerald-600" />
              Purchase Receipts
            </h1>
            <p className="text-sm text-slate-600 mt-1">All your purchase runs with their receipts and actual spend</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Completed runs <InfoTooltip content="Shopping lists where the buyer has finished the run." /></p><p className="text-2xl font-bold tabular-nums">{stats.completedCount}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Total spend <InfoTooltip content="Total actual spend across every completed shopping run." /></p><p className="text-2xl font-bold tabular-nums">R {stats.totalSpend.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-slate-600 flex items-center gap-1">Receipts on file <InfoTooltip content="Runs that have a receipt uploaded against them.\n\nIf the receipt rule is on in settings, you can't close a run without one." /></p><p className="text-2xl font-bold tabular-nums text-emerald-600">{stats.withReceipt}</p></CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-slate-600 flex items-center gap-1">Estimate variance <InfoTooltip content="What you actually spent against what you estimated, across every run.\n\nA positive number means you went over budget." /></p>
              <p className={`text-2xl font-bold tabular-nums ${stats.variance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {stats.variance >= 0 ? "+" : ""}R {stats.variance.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
              </p>
            </CardContent></Card>
          </div>

          <Card className="mb-6">
            <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input className="pl-9" placeholder="Search by date or notes..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button
                type="button"
                onClick={() => setHasReceiptOnly((v) => !v)}
                className={`px-4 py-2 rounded-md border text-sm flex items-center gap-2 ${hasReceiptOnly ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 hover:bg-slate-50"}`}
              >
                <FileText className="h-4 w-4" />Receipt attached only
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <Receipt className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                  <p className="font-medium">No purchase runs yet</p>
                  <p className="text-xs mt-1">Completed shopping lists with receipts will appear here</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filtered.map((l) => {
                    const variance = Number(l.actual_total || 0) - Number(l.estimated_total || 0);
                    return (
                      <li key={l.id} className="p-4 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-medium text-slate-900">{l.list_date ?? "Undated"}</span>
                            {l.status && (
                              <Badge variant="outline" className={`${statusTone[l.status] ?? "bg-slate-100 text-slate-700 border-slate-200"} text-xs capitalize`}>
                                {l.status.replace("_", " ")}
                              </Badge>
                            )}
                            {l.created_at && (
                              <span className="text-[11px] text-slate-500">{formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}</span>
                            )}
                          </div>
                          {l.notes && <p className="text-xs text-slate-600 mb-1">{l.notes}</p>}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                            {l.estimated_total != null && (
                              <span className="text-slate-500">Estimate: <span className="font-medium text-slate-700">R {Number(l.estimated_total).toFixed(2)}</span></span>
                            )}
                            {l.actual_total != null && (
                              <span className="text-slate-500">Actual: <span className="font-semibold text-slate-900">R {Number(l.actual_total).toFixed(2)}</span></span>
                            )}
                            {l.estimated_total != null && l.actual_total != null && (
                              <span className={variance > 0 ? "text-rose-600" : "text-emerald-600"}>
                                {variance >= 0 ? "+" : ""}R {variance.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {l.receipt_url ? (
                            <a href={l.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 hover:underline">
                              <ExternalLink className="h-3.5 w-3.5" />View receipt
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">No receipt</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
