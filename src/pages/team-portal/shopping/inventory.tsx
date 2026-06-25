import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import Head from "next/head";
import { toLocalISO } from "@/lib/localDate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Warehouse, Search, AlertTriangle, Pencil, Loader2, History, ArrowUp, ArrowDown, Download, Package, PackageX } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useToast } from "@/hooks/use-toast";
import { inventoryService, type Inventory } from "@/services/inventoryService";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile } from "@/components/portal/ui";
import { useTenantHref } from "@/lib/tenantUrl";

export default function ShoppingInventoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  // Phase 11 #9: tenant currency for the stock-value stat card +
  // every cost / cost-per-unit render below. Drops the hardcoded
  // R prefix so a UK / US tenant sees the right symbol.
  const tenantCurrency = useTenantCurrency((user as any)?.company_id ?? null);

  const [items, setItems] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [belowParOnly, setBelowParOnly] = useState(false);

  const [editing, setEditing] = useState<Inventory | null>(null);
  const [newStock, setNewStock] = useState<string>("");
  const [adjustNotes, setAdjustNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Phase 7 #8: per-item cycle count history. Opens a dialog
  // showing the last 30 inventory_transactions rows (already
  // written by adjustStock + supplier intake) so the warehouse
  // lead can spot patterns of waste, shrinkage or under-counts
  // without needing SQL access.
  const [historyItem, setHistoryItem] = useState<Inventory | null>(null);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const openHistory = async (item: Inventory) => {
    setHistoryItem(item);
    setHistoryLoading(true);
    setHistoryRows([]);
    try {
      const rows = await inventoryService.getMovementsForItem(item.id, 30);
      setHistoryRows(rows);
    } catch (e: any) {
      toast({ title: "Could not load history", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setHistoryLoading(false);
    }
  };
  const closeHistory = () => {
    setHistoryItem(null);
    setHistoryRows([]);
  };

  useEffect(() => {
    if (!user?.company_id) return;
    loadInventory();
  }, [user?.company_id]);

  const loadInventory = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const data = await inventoryService.getInventory(user.company_id);
      setItems(data);
    } catch (e) {
      console.error("Error loading inventory:", e);
      toast({ title: "Could not load inventory", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => { if (i.category) set.add(i.category); });
    return ["all", ...Array.from(set).sort()];
  }, [items]);

  // Apply non-search filters first, then fuzzy-rank.
  const preFilteredItems = useMemo(() => {
    return items.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (belowParOnly) {
        const stock = Number(i.current_stock || 0);
        const min = Number(i.minimum_stock || 0);
        if (stock > min) return false;
      }
      return true;
    });
  }, [items, category, belowParOnly]);

  const filtered = useFuzzyItems(
    preFilteredItems,
    search,
    [
      { key: "item_name" as any, weight: 3 },
      { key: "sku" as any, weight: 2 },
      { key: "category" as any, weight: 2 },
      { key: "storage_location" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  const stats = useMemo(() => {
    const total = items.length;
    const below = items.filter((i) => Number(i.current_stock || 0) <= Number(i.minimum_stock || 0)).length;
    const out = items.filter((i) => Number(i.current_stock || 0) <= 0).length;
    const valueR = items.reduce((sum, i) => sum + (Number(i.current_stock || 0) * Number(i.cost_per_unit || 0)), 0);
    return { total, below, out, valueR };
  }, [items]);

  const openEdit = (item: Inventory) => {
    setEditing(item);
    setNewStock(String(item.current_stock ?? 0));
    setAdjustNotes("");
  };

  const closeEdit = () => {
    setEditing(null);
    setNewStock("");
    setAdjustNotes("");
  };

  const saveAdjustment = async () => {
    if (!editing || !user?.id) return;
    const target = Number(newStock);
    if (Number.isNaN(target) || target < 0) {
      toast({ title: "Invalid stock value", description: "Enter a non-negative number.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await inventoryService.adjustStock(editing.id, target, user.id, adjustNotes || undefined);
      toast({ title: "Stock updated", description: `${editing.item_name} -> ${target} ${editing.unit_of_measure}` });
      closeEdit();
      loadInventory();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Semantic stock-level scale (kept intentionally): rose = out,
  // amber = below par, emerald = in stock. Dark variants added so the
  // signal survives dark mode without changing the meaning.
  const stockTone = (item: Inventory) => {
    const stock = Number(item.current_stock || 0);
    const min = Number(item.minimum_stock || 0);
    if (stock <= 0) return "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900";
    if (stock <= min) return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900";
    return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900";
  };

  const stockLabel = (item: Inventory) => {
    const stock = Number(item.current_stock || 0);
    const min = Number(item.minimum_stock || 0);
    if (stock <= 0) return "Out of stock";
    if (stock <= min) return "Below par";
    return "In stock";
  };

  return (
    <>
      <Head>
        <title>Inventory - CateringMS</title>
      </Head>
      <NoIndexMeta />
      <ShoppingNav />
      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          {/* Header matches the shared portal vocabulary: neutral icon
              tile with an amber glyph, solid heading. Amber is reserved
              for primary actions and selected state only. */}
          <PortalHeader
            title="Inventory"
            subtitle="Live inventory levels. Click any row to adjust stock with an audit entry."
            icon={Warehouse}
            actions={
              <>
            {/* Phase 13 #10: inventory CSV export. Pulls the
                currently filtered list (category + below-par +
                search all flow through filtered) so the export
                matches what the operator sees. */}
            <Button
              variant="outline"
              className="rounded-lg"
              onClick={() => {
                if (filtered.length === 0) {
                  toast({ title: "Nothing to export", description: "Adjust filters until at least one item is visible." });
                  return;
                }
                const headers = [
                  "Item", "SKU", "Category", "Unit", "On hand", "Min", "Reorder qty",
                  "Cost / unit", "Stock value", "Storage location",
                ];
                const esc = (v: any) => {
                  if (v == null) return "";
                  const s = String(v).replace(/"/g, '""');
                  return /[",\n]/.test(s) ? `"${s}"` : s;
                };
                const lines = [headers.join(",")];
                for (const i of filtered) {
                  const stockVal = Number(i.current_stock || 0) * Number(i.cost_per_unit || 0);
                  lines.push([
                    esc(i.item_name), esc(i.sku), esc(i.category),
                    esc(i.unit_of_measure),
                    esc(i.current_stock), esc(i.minimum_stock), esc((i as any).reorder_quantity),
                    esc(i.cost_per_unit), esc(stockVal.toFixed(2)),
                    esc(i.storage_location),
                  ].join(","));
                }
                const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const stamp = toLocalISO(new Date());
                a.download = `inventory_${stamp}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            {/* Phase 5 #5: one-click 'draft a reorder list' from
                every below-par inventory item. Lands a draft
                shopping_lists row the operator can edit before
                assigning. Hidden when there's nothing to reorder. */}
            {stats.below > 0 && (
              <Button
                variant="default"
                className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-lg self-start sm:self-auto"
                onClick={async () => {
                  try {
                    const res = await fetch("/api/admin/inventory/draft-reorder", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({}),
                    });
                    const j = await res.json().catch(() => ({}));
                    if (!res.ok || !j.ok) {
                      throw new Error(j?.error || "Could not draft reorder");
                    }
                    toast({
                      title: "Reorder draft created",
                      description: `${j.item_count} item${j.item_count === 1 ? "" : "s"} on the list. Review supplier + quantity before assigning.`,
                    });
                    if (j.list_id) {
                      window.location.href = withSlug(`/team-portal/shopping/orders?listId=${j.list_id}`);
                    }
                  } catch (e: any) {
                    toast({
                      title: "Could not draft reorder",
                      description: e?.message || "Try again",
                      variant: "destructive",
                    });
                  }
                }}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Draft reorder ({stats.below})
              </Button>
            )}
              </>
            }
          />

          {/* KPI tiles use the shared StatTile: neutral slate values, a
              slate glyph, soft shadow + hairline + rounded-2xl. The
              semantic stock-level colour lives where it's per-row
              actionable (the table status badges), not on the counts. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <StatTile
              label={<span className="flex items-center gap-1">Total items <InfoTooltip content="Number of active inventory lines on the books for your company." /></span>}
              value={stats.total}
              icon={Package}
            />
            <StatTile
              label={<span className="flex items-center gap-1">Below par <InfoTooltip content="Items at or below their minimum stock level.\n\nThese are the things to put on the next shopping run." /></span>}
              value={stats.below}
              icon={AlertTriangle}
            />
            <StatTile
              label={<span className="flex items-center gap-1">Out of stock <InfoTooltip content="Items that have run out completely.\n\nYou cannot fulfil orders that need these until they're restocked." /></span>}
              value={stats.out}
              icon={PackageX}
            />
            <StatTile
              label={<span className="flex items-center gap-1">Stock value <InfoTooltip content="Total value of every item currently sitting in stock, based on the last known cost per unit." /></span>}
              value={`${tenantCurrency.symbol} ${stats.valueR.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`}
            />
          </div>

          <PortalCard padded={false} className="mb-6 p-4 sm:p-5">
            <PortalCardHeader title="Filter" />
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                <Input
                  placeholder="Search by name, SKU, category, location..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c === "all" ? "All categories" : c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={belowParOnly ? "default" : "outline"}
                onClick={() => setBelowParOnly((v) => !v)}
                aria-pressed={belowParOnly}
                className={belowParOnly ? "bg-brand-primary hover:bg-brand-primary/90 text-white rounded-lg" : "rounded-lg"}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Below par only
              </Button>
            </div>
          </PortalCard>

          <PortalCard padded={false} className="overflow-hidden">
              {loading ? (
                /* Skeleton rows instead of a centred spinner: the layout
                   of the real table is previewed so the swap-in is calm
                   (product.md: skeletons for loading, not spinners). */
                <div className="divide-y divide-slate-100 dark:divide-slate-800" aria-busy="true" aria-live="polite">
                  <span className="sr-only">Loading inventory</span>
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div key={idx} className="flex items-center gap-4 px-4 py-3.5">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="h-3.5 w-40 max-w-[60%] rounded bg-slate-200 dark:bg-slate-800 motion-safe:animate-pulse" />
                        <div className="h-2.5 w-24 max-w-[35%] rounded bg-slate-100 dark:bg-slate-800/60 motion-safe:animate-pulse" />
                      </div>
                      <div className="hidden sm:block h-3 w-16 rounded bg-slate-100 dark:bg-slate-800/60 motion-safe:animate-pulse" />
                      <div className="h-3.5 w-14 rounded bg-slate-200 dark:bg-slate-800 motion-safe:animate-pulse" />
                      <div className="h-5 w-20 rounded-full bg-slate-100 dark:bg-slate-800/60 motion-safe:animate-pulse" />
                      <div className="hidden md:block h-3 w-16 rounded bg-slate-100 dark:bg-slate-800/60 motion-safe:animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                items.length === 0 ? (
                  /* True empty (no inventory at all): teach the next action. */
                  <div className="text-center py-16 px-6">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                      <Warehouse className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                    </div>
                    <p className="font-semibold text-slate-900 dark:text-white">No inventory yet</p>
                    <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-600 dark:text-slate-400">
                      Once items are added to your catalogue they show up here with live stock levels. Each adjustment you make is logged as an audit entry.
                    </p>
                  </div>
                ) : (
                  /* Filtered to nothing: guide back to results. */
                  <div className="text-center py-16 px-6">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                      <Search className="h-6 w-6 text-slate-500 dark:text-slate-400" />
                    </div>
                    <p className="font-semibold text-slate-900 dark:text-white">No items match the current filter</p>
                    <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">Try clearing the search or switching the category{belowParOnly ? ", or turn off “Below par only”" : ""}.</p>
                  </div>
                )
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="px-4 py-3 font-semibold"><span className="inline-flex items-center gap-1">Item <InfoTooltip content="The item's name and SKU code." /></span></th>
                          <th className="px-4 py-3 font-semibold"><span className="inline-flex items-center gap-1">Category <InfoTooltip content="Category used to group similar items together." /></span></th>
                          <th className="px-4 py-3 font-semibold text-right"><span className="inline-flex items-center justify-end gap-1">Stock <InfoTooltip content="How much of this item is sitting in stock right now." /></span></th>
                          <th className="px-4 py-3 font-semibold text-right"><span className="inline-flex items-center justify-end gap-1">Min <InfoTooltip content="The minimum level for this item.\n\nOnce stock dips below this, it's time to reorder." /></span></th>
                          <th className="px-4 py-3 font-semibold"><span className="inline-flex items-center gap-1">Status <InfoTooltip content="Quick read on the item: out of stock, below par, or in stock." /></span></th>
                          <th className="px-4 py-3 font-semibold text-right"><span className="inline-flex items-center justify-end gap-1">Cost / unit <InfoTooltip content="The last price you paid per unit.\n\nUsed to work out the total value of stock on hand." /></span></th>
                          <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filtered.map((i) => (
                          <tr
                            key={i.id}
                            onClick={() => openEdit(i)}
                            className="group cursor-pointer transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-slate-50 dark:hover:bg-slate-800/60"
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900 dark:text-white">{i.item_name}</div>
                              {i.sku && <div className="text-xs text-slate-500 dark:text-slate-400">SKU {i.sku}</div>}
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{i.category ?? "--"}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900 dark:text-white">
                              {Number(i.current_stock ?? 0)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{i.unit_of_measure}</span>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">{Number(i.minimum_stock ?? 0)}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={stockTone(i)}>{stockLabel(i)}</Badge>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                              {i.cost_per_unit ? `${tenantCurrency.symbol} ${Number(i.cost_per_unit).toFixed(2)}` : "--"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openHistory(i); }} title="View movement history" aria-label={`View movement history for ${i.item_name}`}>
                                  <History className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(i); }} aria-label={`Adjust stock for ${i.item_name}`}>
                                  <Pencil className="h-4 w-4 mr-1" /> Adjust
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile card list */}
                  <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                    {filtered.map((i) => (
                      <button
                        key={i.id}
                        onClick={() => openEdit(i)}
                        aria-label={`Adjust stock for ${i.item_name}`}
                        className="w-full text-left p-4 flex items-start justify-between gap-3 transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-slate-50 dark:hover:bg-slate-800/60 active:bg-slate-100 dark:active:bg-slate-800"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-900 dark:text-white truncate">{i.item_name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{i.category ?? "--"}{i.sku ? `, SKU ${i.sku}` : ""}</div>
                          <div className="mt-2 flex items-center gap-2">
                            <Badge variant="outline" className={stockTone(i)}>{stockLabel(i)}</Badge>
                            <span className="text-sm tabular-nums text-slate-900 dark:text-white">
                              <span className="font-semibold">{Number(i.current_stock ?? 0)}</span>
                              <span className="text-slate-500 dark:text-slate-400"> / {Number(i.minimum_stock ?? 0)} {i.unit_of_measure}</span>
                            </span>
                          </div>
                        </div>
                        <Pencil className="h-4 w-4 text-slate-400 dark:text-slate-500 mt-1 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </>
              )}
          </PortalCard>
        </PortalShell>
        <Footer />
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
            <DialogDescription>
              {editing && `${editing.item_name}, currently ${Number(editing.current_stock ?? 0)} ${editing.unit_of_measure}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="newStock">New stock level ({editing?.unit_of_measure})</Label>
              <Input
                id="newStock"
                type="number"
                min="0"
                step="any"
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="notes">Reason (optional)</Label>
              <Input
                id="notes"
                placeholder="e.g. spoilage, recount, supplier delivery"
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit} disabled={saving}>Cancel</Button>
            <Button onClick={saveAdjustment} disabled={saving} className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-lg">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving</> : "Save adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 7 #8: cycle count audit trail dialog. Reads the
          last 30 inventory_transactions rows for the selected
          item and lays them out as a timeline. Helps spot
          recurring shrinkage on a SKU before the wastage adds up. */}
      <Dialog open={!!historyItem} onOpenChange={(open) => !open && closeHistory()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Movement history</DialogTitle>
            <DialogDescription>
              {historyItem && `${historyItem.item_name} - last 30 movements`}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto -mx-6 px-6">
            {historyLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-600 dark:text-slate-300">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
              </div>
            ) : historyRows.length === 0 ? (
              <div className="text-center py-10 text-slate-600 dark:text-slate-300 text-sm">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-slate-400 dark:text-slate-500" />
                No movements logged yet for this item.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {historyRows.map((r) => {
                  const qty = Number(r.quantity || 0);
                  const positive = qty >= 0;
                  return (
                    <li key={r.id} className="py-2.5 flex items-start gap-3">
                      <div className={`mt-0.5 flex items-center justify-center w-7 h-7 rounded-full ${positive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"}`}>
                        {positive ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-medium capitalize text-slate-900 dark:text-white">
                            {String(r.transaction_type || "movement").replace(/_/g, " ")}
                          </span>
                          <span className={`text-sm tabular-nums font-semibold ${positive ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                            {positive ? "+" : ""}{qty} {historyItem?.unit_of_measure}
                          </span>
                        </div>
                        {r.notes && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{r.notes}</p>
                        )}
                        <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-0.5">
                          {r.created_at ? new Date(r.created_at).toLocaleString("en-ZA", {
                            day: "numeric", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          }) : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeHistory}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
