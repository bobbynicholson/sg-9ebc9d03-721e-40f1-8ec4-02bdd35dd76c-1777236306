import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
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
import { Warehouse, Search, AlertTriangle, Pencil, Loader2, History, ArrowUp, ArrowDown, Download, Package, PackageX, RefreshCw, ChevronDown, Wallet } from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ShoppingFilterBar } from "@/components/shopping/ShoppingFilterBar";
import { ShoppingPageShell, SHOPPING_HERO_CHIP } from "@/components/shopping/ShoppingPageShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { formatZAR } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { inventoryService, type Inventory } from "@/services/inventoryService";
import { supabase } from "@/integrations/supabase/client";
import { PortalCard, StatTile } from "@/components/portal/ui";
import { useTenantHref } from "@/lib/tenantUrl";
import { UserRole } from "@/types/app";
import { cn } from "@/lib/utils";

function ShoppingInventoryPageInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  // Phase 11 #9: tenant currency for the stock-value stat card +
  // every cost / cost-per-unit render below. Drops the hardcoded
  // R prefix so a UK / US tenant sees the right symbol.
  const tenantCurrencyBase = useTenantCurrency((user as any)?.company_id ?? null);
  // Grouped amounts ("R 24 493") via the shared formatter.
  const tenantCurrency = {
    ...tenantCurrencyBase,
    format: (n: number, decimals = 2) => formatZAR(n, { currency: tenantCurrencyBase.code, decimals }),
  };

  const [items, setItems] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  // Command-centre restructure: a failed primary read used to toast and
  // fall through to the "No inventory yet" empty state, which reads as a
  // healthy warehouse with nothing in it. Failures now land here and
  // render as a rose recovery card with a Retry.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [belowParOnly, setBelowParOnly] = useState(false);

  const [editing, setEditing] = useState<Inventory | null>(null);
  const [newStock, setNewStock] = useState<string>("");
  const [adjustNotes, setAdjustNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  // Draft-reorder call in flight (blocks a double click that would land
  // two draft shopping lists).
  const [drafting, setDrafting] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  // Realtime: the hero + subheading promise "Live stock levels", but the
  // page used to be mount-only, so a shopper ticking an item (which bumps
  // inventory_items) or an admin adjusting stock left this table stale
  // until a manual reload. Subscribe to inventory_items for this company
  // so every stock movement reflects here without a refresh. Also catch
  // the same-tab shopper-tick custom event (the inventory bump is async
  // and can land after our own realtime frame). Random channel suffix per
  // the repo channel-reuse rule.
  useEffect(() => {
    const companyId = user?.company_id;
    if (!companyId) return;
    const channel = supabase
      .channel(`shopping-inventory-${companyId}-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "inventory_items", filter: `company_id=eq.${companyId}` },
        () => { void loadInventory(); },
      )
      .subscribe();
    const onLocal = () => { void loadInventory(); };
    if (typeof window !== "undefined") window.addEventListener("cateringms:shopping-updated", onLocal);
    return () => {
      void supabase.removeChannel(channel);
      if (typeof window !== "undefined") window.removeEventListener("cateringms:shopping-updated", onLocal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  const loadInventory = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const data = await inventoryService.getInventory(user.company_id);
      setItems(data);
      setLoadError(null);
      setLoaded(true);
    } catch (e: any) {
      console.error("Error loading inventory:", e);
      setLoadError(e?.message || "We couldn't reach the server. Check your connection and retry.");
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
  const activeFilterCount = [Boolean(search.trim()), category !== "all", belowParOnly].filter(Boolean).length;

  const stats = useMemo(() => {
    const total = items.length;
    // "Below par" must match what Draft-reorder actually drafts (and
    // getLowStockItems): require a real par (min > 0), else 0/0 seed rows
    // inflate the count and the "Draft reorder (N)" button no-ops with
    // "0 items on the list". current <= min AND min > 0.
    const below = items.filter((i) => Number(i.minimum_stock || 0) > 0 && Number(i.current_stock || 0) <= Number(i.minimum_stock || 0)).length;
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

  // Phase 13 #10: inventory CSV export. Pulls the currently filtered
  // list (category + below-par + search all flow through filtered) so
  // the export matches what the operator sees.
  const exportCsv = () => {
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
  };

  // Phase 5 #5: one-click 'draft a reorder list' from every below-par
  // inventory item. Lands a draft shopping_lists row the operator can
  // edit before assigning. Hidden when there's nothing to reorder.
  const draftReorder = async () => {
    if (drafting) return;
    setDrafting(true);
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
        return; // keep the button disabled while the browser navigates
      }
    } catch (e: any) {
      toast({
        title: "Could not draft reorder",
        description: e?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setDrafting(false);
    }
  };

  // Semantic stock-level scale (kept intentionally): rose = out,
  // amber = below par, brand = in stock. Dark variants added so the
  // signal survives dark mode without changing the meaning.
  const stockTone = (item: Inventory) => {
    const stock = Number(item.current_stock || 0);
    const min = Number(item.minimum_stock || 0);
    if (stock <= 0) return "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900";
    if (stock <= min) return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900";
    return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900";
  };

  // Category groups for the table. A search or "below only" filter opens
  // every group; otherwise groups start folded and the header shows
  // how many items need restocking.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const needsAttention = (item: Inventory) => {
    const stock = Number(item.current_stock || 0);
    const min = Number(item.minimum_stock || 0);
    return stock <= 0 || (min > 0 && stock <= min);
  };
  const groupedItems = useMemo(() => {
    const map = new Map<string, Inventory[]>();
    for (const item of filtered) {
      const key = item.category || "Uncategorised";
      const list = map.get(key);
      if (list) list.push(item); else map.set(key, [item]);
    }
    return Array.from(map.entries())
      .map(([category, items]) => ({ category, items, attention: items.filter(needsAttention).length }))
      .sort((a, b) => (b.attention > 0 ? 1 : 0) - (a.attention > 0 ? 1 : 0) || a.category.localeCompare(b.category));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);
  const isGroupOpen = (category: string, attention: number) =>
    openGroups[category] ?? (Boolean(search.trim()) || belowParOnly || groupedItems.length <= 2);
  const toggleGroup = (category: string, attention: number) =>
    setOpenGroups((prev) => ({ ...prev, [category]: !isGroupOpen(category, attention) }));

  const stockLabel = (item: Inventory) => {
    const stock = Number(item.current_stock || 0);
    const min = Number(item.minimum_stock || 0);
    if (stock <= 0) return "Out of stock";
    if (stock <= min) return "At minimum";
    return "In stock";
  };

  const showSkeleton = loading && !loaded;
  const chipsReady = loaded && !loadError;

  return (
    <>
      <ShoppingPageShell
        pageTitle="Inventory - CateringMS"
        heading="Inventory"
        subheading={
          chipsReady
            ? stats.below > 0
              ? `${stats.total} stock line${stats.total === 1 ? "" : "s"} on the books, ${stats.below} at or below their minimum.`
              : `${stats.total} stock line${stats.total === 1 ? "" : "s"} on the books, everything above its minimum.`
            : "Live stock levels. Click any row to adjust stock with an audit entry."
        }
        icon={Warehouse}
        headerAction={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            {chipsReady && stats.below > 0 && (
              <Button variant="outline" size="sm" onClick={() => void draftReorder()} disabled={drafting}>
                {drafting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin motion-reduce:animate-none" />
                ) : (
                  <AlertTriangle className="h-4 w-4 mr-2" />
                )}
                {drafting ? "Drafting..." : `Draft reorder (${stats.below})`}
              </Button>
            )}
          </>
        }
        meta={
          chipsReady ? (
            <>
              <span className={SHOPPING_HERO_CHIP}>
                <span className={cn("h-1.5 w-1.5 rounded-full", stats.below > 0 ? "bg-amber-400" : "bg-emerald-400")} />
                {stats.below > 0 ? `${stats.below} at minimum` : "All above minimum"}
              </span>
              {stats.out > 0 && (
                <span className={SHOPPING_HERO_CHIP}>
                  <PackageX className="h-3 w-3" />
                  {stats.out} out of stock
                </span>
              )}
              <span className={SHOPPING_HERO_CHIP}>
                <Package className="h-3 w-3" />
                {tenantCurrency.format(stats.valueR, 0)} on hand
              </span>
            </>
          ) : undefined
        }
      >
        {/* Recovery card: the primary read failed. Never dress a failed
            load up as an empty warehouse. */}
        {loadError && (
          <div className="mb-6 rounded-lg border border-rose-200 bg-white p-5 shadow-sm dark:border-rose-900 dark:bg-slate-900">
            <h2 className="text-base font-bold text-rose-900 dark:text-rose-200 mb-1">Couldn&apos;t load your inventory</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{loadError}</p>
            <Button
              size="sm"
              onClick={() => void loadInventory()}
              disabled={loading}
              className="bg-brand-primary hover:opacity-90 text-white"
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin motion-reduce:animate-none")} />
              Retry
            </Button>
          </div>
        )}

        {/* KPI tiles use the shared StatTile: neutral slate values, a
            slate glyph, soft shadow + hairline + rounded-2xl. The
            semantic stock-level colour lives where it's per-row
            actionable (the table status badges), not on the counts. */}
        <div className="grid grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1 gap-3 mb-6 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          <StatTile
            label={<span className="flex items-center gap-1">Total items <InfoTooltip content="Number of active inventory lines on the books for your company." /></span>}
            hint="Active stock lines"
            value={stats.total}
            icon={Package}
          />
          <StatTile tone="warn"
            label={<span className="flex items-center gap-1">At minimum <InfoTooltip content="Items at or below their minimum stock level.\n\nThese are the things to put on the next shopping run." /></span>}
            hint="Put on the next run"
            value={stats.below}
            icon={AlertTriangle}
          />
          <StatTile tone="bad"
            label={<span className="flex items-center gap-1">Out of stock <InfoTooltip content="Items that have run out completely.\n\nYou cannot fulfil orders that need these until they're restocked." /></span>}
            hint="Restock before orders need them"
            value={stats.out}
            icon={PackageX}
          />
          <StatTile
            label={<span className="flex items-center gap-1">Stock value <InfoTooltip content="Total value of every item currently sitting in stock, based on the last known cost per unit." /></span>}
            icon={Wallet}
            hint="At last cost price"
            value={tenantCurrency.format(stats.valueR, 0)}
          />
        </div>

        {/* Same on-demand filter bar as kitchen Stock: the table stays the
            focus, and an active filter is always summarised while closed. */}
        <ShoppingFilterBar
          id="shopping-stock"
          chatSection="shopping.inventory.stock"
          chatSectionLabel="Procurement stock"
          title="Stock filters"
          idleHint="Search and narrow the stock list when you need to."
          activeCount={activeFilterCount}
          shownLabel={`${filtered.length} items shown`}
        >
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
              At minimum only
            </Button>
        </ShoppingFilterBar>

        <PortalCard padded={false} className="overflow-hidden">
            {showSkeleton ? (
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
            ) : loadError && items.length === 0 ? (
              /* The recovery card above owns this state; keep the card body quiet. */
              <div className="py-10 px-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Your inventory is unavailable right now. Use Retry above to reload it.
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
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">Try clearing the search or switching the category{belowParOnly ? ", or turn off “At minimum only”" : ""}.</p>
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
                        <th className="px-4 py-3 font-semibold text-right"><span className="inline-flex items-center justify-end gap-1">Stock <InfoTooltip content="How much of this item is sitting in stock right now." /></span></th>
                        <th className="px-4 py-3 font-semibold text-right"><span className="inline-flex items-center justify-end gap-1">Min <InfoTooltip content="The minimum level for this item.\n\nOnce stock dips below this, it's time to reorder." /></span></th>
                        <th className="px-4 py-3 font-semibold"><span className="inline-flex items-center gap-1">Status <InfoTooltip content="Quick read on the item: out of stock, at its minimum, or in stock." /></span></th>
                        <th className="px-4 py-3 font-semibold text-right"><span className="inline-flex items-center justify-end gap-1">Cost / unit <InfoTooltip content="The last price you paid per unit.\n\nUsed to work out the total value of stock on hand." /></span></th>
                        <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    {groupedItems.map(({ category, items, attention }) => {
                      const open = isGroupOpen(category, attention);
                      return (
                    <tbody key={category} className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                      <tr className="bg-slate-50/80 dark:bg-slate-800/40">
                        <td colSpan={6} className="p-0">
                          <button
                            type="button"
                            onClick={() => toggleGroup(category, attention)}
                            aria-expanded={open}
                            className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <ChevronDown aria-hidden="true" className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">{category}</span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">{items.length}</span>
                            {attention > 0 && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">{attention} to restock</span>
                            )}
                          </button>
                        </td>
                      </tr>
                      {open && items.map((i) => (
                        <tr
                          key={i.id}
                          onClick={() => openEdit(i)}
                          className="group cursor-pointer transition-colors duration-150 ease-standard hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900 dark:text-white">{i.item_name}</div>
                            {i.sku && <div className="text-xs text-slate-500 dark:text-slate-400">SKU {i.sku}</div>}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900 dark:text-white">
                            {Number(i.current_stock ?? 0)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{i.unit_of_measure}</span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">{Number(i.minimum_stock ?? 0)}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={stockTone(i)}>{stockLabel(i)}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                            {i.cost_per_unit ? tenantCurrency.format(Number(i.cost_per_unit)) : "--"}
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
                      );
                    })}
                  </table>
                </div>

                {/* Mobile: same folded categories as the desktop table
                    (categories that need restocking first). The old flat
                    A-Z list of every item ran to ~9600px on a phone. */}
                <div className="md:hidden">
                  {groupedItems.map(({ category, items, attention }) => {
                    const open = isGroupOpen(category, attention);
                    return (
                      <div key={category} className="border-t border-slate-200 first:border-t-0 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => toggleGroup(category, attention)}
                          aria-expanded={open}
                          className="flex min-h-[48px] w-full flex-wrap items-center gap-2 bg-slate-50/80 px-4 py-3 text-left active:bg-slate-100 dark:bg-slate-800/40 dark:active:bg-slate-800"
                        >
                          <ChevronDown aria-hidden="true" className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">{category}</span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">{items.length}</span>
                          {attention > 0 && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">{attention} to restock</span>
                          )}
                        </button>
                        {open && (
                          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                            {items.map((i) => (
                              <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                                <div className="min-w-0 flex-1">
                                  <div className="break-words font-medium text-slate-900 dark:text-white">{i.item_name}</div>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className={stockTone(i)}>{stockLabel(i)}</Badge>
                                    <span className="text-sm tabular-nums text-slate-900 dark:text-white">
                                      <span className="font-semibold">{Number(i.current_stock ?? 0)}</span>
                                      <span className="text-slate-500 dark:text-slate-400"> {i.unit_of_measure} · min {Number(i.minimum_stock ?? 0)}</span>
                                    </span>
                                  </div>
                                  {i.sku && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">SKU {i.sku}</div>}
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <Button size="sm" variant="ghost" className="h-10 w-10 p-0" onClick={() => openHistory(i)} aria-label={`View movement history for ${i.item_name}`}>
                                    <History className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-10" onClick={() => openEdit(i)} aria-label={`Adjust stock for ${i.item_name}`}>
                                    <Pencil className="mr-1 h-4 w-4" /> Adjust
                                  </Button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
        </PortalCard>
      </ShoppingPageShell>

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
                      <div className={`mt-0.5 flex items-center justify-center w-7 h-7 rounded-full ${positive ? "bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/15 dark:text-brand-primary" : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"}`}>
                        {positive ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-medium capitalize text-slate-900 dark:text-white">
                            {String(r.transaction_type || "movement").replace(/_/g, " ")}
                          </span>
                          <span className={`text-sm tabular-nums font-semibold ${positive ? "text-brand-primary dark:text-brand-primary" : "text-rose-700 dark:text-rose-400"}`}>
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

// Route guard was missing on this page pre-restructure (the nav hid it
// but the URL was open to any signed-in role). Same allow-list as the
// shopping dashboard.
export default function ShoppingInventoryPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SHOPPING_STAFF, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.REGION_ADMIN, UserRole.ADMIN]}>
      <ShoppingInventoryPageInner />
    </ProtectedRoute>
  );
}
