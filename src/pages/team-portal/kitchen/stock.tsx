import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import Head from "next/head";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Package, Search, AlertTriangle, Loader2, ChefHat, RefreshCw, MapPin, ArrowUpDown, Plus, Minus, Trash2, ShoppingCart, CheckCircle2 } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PortalShell, PortalHeader, PortalCard, StatTile } from "@/components/portal/ui";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { inventoryService, type Inventory } from "@/services/inventoryService";
import { kitchenPrepService, type IngredientDemand } from "@/services/kitchenPrepService";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { toLocalISO } from "@/lib/localDate";

const ROUTE = "/team-portal/kitchen/stock";

// KS-A: action types the kitchen can log on a stock item. Drives the
// dialog's copy + math + transaction_type tag. Pre-audit the dialog
// only supported "used" - kitchen literally had no way to log when
// shopping dropped off a fresh delivery, or when something went off
// before service. Both are core kitchen-floor signals.
type StockAction = "used" | "received" | "wasted" | "count";

type SortKey = "name" | "status" | "location";

export default function KitchenStockPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [items, setItems] = useState<Inventory[]>([]);
  const [recipeLinkedIds, setRecipeLinkedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  // KS-A: URL persistence on the filter chips so a chef can deep-link
  // "Below par + Produce" or "In recipes + Fridge 1" from the kitchen
  // notification banner / a saved tab.
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [storage, setStorage] = useState<string>("all");
  const [belowParOnly, setBelowParOnly] = useState(false);
  // Phase 6D: filter to "things our recipes actually use" - skips
  // generic warehouse items the kitchen doesn't touch.
  const [recipeLinkedOnly, setRecipeLinkedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const [usingItem, setUsingItem] = useState<Inventory | null>(null);
  // KS-A: action-aware dialog state. `action` picks the verb (used /
  // received / wasted / count) which in turn picks the math + the
  // transaction_type tag we write into inventory_transactions. Keeps
  // the audit trail truthful instead of mashing everything into
  // "adjustment".
  const [action, setAction] = useState<StockAction>("used");
  const [usedQty, setUsedQty] = useState<string>("");
  const [usedNotes, setUsedNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // KS-B (XSC Wave B): push-to-shopping flow. The audit found
  // kitchenPrepService.createShoppingListFromShortfall was a dead
  // method - it existed but no UI ever called it. Below-par stock
  // sat on the chef's screen forever unless they walked to the
  // shopping page and manually typed a list. Now they can convert
  // every below-par item into a shopping_lists row + line items
  // with one tap, with a 14-day horizon stamp so the shopping team
  // knows the timeframe.
  const [pushOpen, setPushOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ listId: string; itemCount: number } | null>(null);

  const belowParItems = useMemo(
    () => items.filter((i) => {
      const s = Number(i.current_stock || 0);
      const m = Number(i.minimum_stock || 0);
      return m > 0 && s <= m;
    }),
    [items],
  );

  const handlePushToShopping = async () => {
    if (!user?.company_id || !user?.id || belowParItems.length === 0) return;
    setPushing(true);
    try {
      // KS-B: adapt Inventory rows to the IngredientDemand shape the
      // service expects. shortfall is the gap from par to current,
      // clamped to >= 0. used_by is empty - this push is "fill the
      // pantry to par", not "buy for a specific order".
      const demand: IngredientDemand[] = belowParItems.map((i) => {
        const stock = Number(i.current_stock || 0);
        const min = Number(i.minimum_stock || 0);
        const max = Number(i.maximum_stock || 0);
        const reorderQty = Number(i.reorder_quantity || 0);
        const target = reorderQty > 0
          ? stock + reorderQty
          : max > 0
            ? max
            : min * 2;
        const need = Math.max(0, target - stock);
        return {
          name: i.item_name,
          unit: i.unit_of_measure,
          total_quantity: need,
          on_hand: stock,
          shortfall: need,
          inventory_item_id: i.id,
          used_by: [],
        };
      });
      const today = new Date();
      const horizon = new Date();
      horizon.setDate(today.getDate() + 14);
      const result = await kitchenPrepService.createShoppingListFromShortfall(
        user.company_id,
        user.id,
        demand,
        { from: toLocalISO(today), to: toLocalISO(horizon) },
        `Kitchen restock ${toLocalISO(today)}`,
      );
      if (!result) {
        toast({ title: "Nothing to push", description: "All below-par items already at or above par." });
      } else {
        setPushResult({ listId: result.id, itemCount: result.itemCount });
        toast({
          title: "Pushed to shopping",
          description: `${result.itemCount} item${result.itemCount === 1 ? "" : "s"} on the new list`,
        });
      }
    } catch (e: any) {
      captureException(e, { tags: { route: ROUTE, step: "pushToShopping", companyId: user.company_id } });
      toast({ title: "Could not push to shopping", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setPushing(false);
    }
  };

  // KS-A: hydrate filters from URL on first mount. Writing back happens
  // in the input handlers below so router state stays the source of
  // truth for deep links.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || !router.isReady) return;
    hydratedRef.current = true;
    const q = (router.query.q as string) || "";
    const cat = (router.query.cat as string) || "all";
    const stor = (router.query.storage as string) || "all";
    const bp = router.query.below === "1";
    const rec = router.query.recipes === "1";
    const sort = (router.query.sort as SortKey) || "name";
    if (q) setSearch(q);
    if (cat !== "all") setCategory(cat);
    if (stor !== "all") setStorage(stor);
    if (bp) setBelowParOnly(true);
    if (rec) setRecipeLinkedOnly(true);
    if (sort === "status" || sort === "location") setSortKey(sort);
  }, [router.isReady, router.query]);

  // KS-A: write URL back when filters change. Replace not push - users
  // don't want a back-button hit for every keystroke.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const q: Record<string, string> = {};
    if (search) q.q = search;
    if (category !== "all") q.cat = category;
    if (storage !== "all") q.storage = storage;
    if (belowParOnly) q.below = "1";
    if (recipeLinkedOnly) q.recipes = "1";
    if (sortKey !== "name") q.sort = sortKey;
    router.replace({ pathname: router.pathname, query: { ...router.query, ...q,
      // explicitly clear stale keys
      ...(search ? {} : { q: undefined }),
      ...(category !== "all" ? {} : { cat: undefined }),
      ...(storage !== "all" ? {} : { storage: undefined }),
      ...(belowParOnly ? {} : { below: undefined }),
      ...(recipeLinkedOnly ? {} : { recipes: undefined }),
      ...(sortKey !== "name" ? {} : { sort: undefined }),
    } as any }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, storage, belowParOnly, recipeLinkedOnly, sortKey]);

  const load = useCallback(async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      // Cost-stripped getter so the chef's network response never carries
      // rand values. Recipe-linked id set runs in parallel for the filter.
      const [data, linked] = await Promise.all([
        inventoryService.getInventoryPublic(user.company_id),
        inventoryService.getInventoryIdsUsedInRecipes(user.company_id),
      ]);
      setItems(data);
      setRecipeLinkedIds(linked);
      setLastLoadedAt(new Date());
    } catch (e) {
      captureException(e, { tags: { route: ROUTE, step: "loadStock", companyId: user.company_id } });
      toast({ title: "Could not load stock", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user?.company_id, toast]);

  useEffect(() => {
    if (!user?.company_id) return;
    load();
  }, [user?.company_id, load]);

  // KS-A: realtime sub on inventory_items. Shopping team logging a
  // receipt or admin tweaking a par level should reflect on the
  // chef's screen immediately, not after the next manual refresh.
  // Debounced 400ms in case a batch import fires N updates back-to-back.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user?.company_id) return;
    const trigger = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => { load(); }, 400);
    };
    const channel = supabase
      .channel(`kitchen-stock:${user.company_id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "inventory_items", filter: `company_id=eq.${user.company_id}` },
        trigger,
      )
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [user?.company_id, load]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => { if (i.category) s.add(i.category); });
    return ["all", ...Array.from(s).sort()];
  }, [items]);

  // KS-A: distinct storage locations for the new filter. Mirrors the
  // category list but keyed on storage_location. Helps a chef ask
  // "what's in Fridge 1 right now?" without scrolling 80 items.
  const storageLocations = useMemo(() => {
    const s = new Set<string>();
    items.forEach((i) => { if (i.storage_location) s.add(i.storage_location); });
    return ["all", ...Array.from(s).sort()];
  }, [items]);

  const preFiltered = useMemo(() => {
    return items.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (storage !== "all" && i.storage_location !== storage) return false;
      if (recipeLinkedOnly && !recipeLinkedIds.has(i.id)) return false;
      if (belowParOnly) {
        const stock = Number(i.current_stock || 0);
        const min = Number(i.minimum_stock || 0);
        if (stock > min) return false;
      }
      return true;
    });
  }, [items, category, storage, belowParOnly, recipeLinkedOnly, recipeLinkedIds]);

  const fuzzied = useFuzzyItems(
    preFiltered,
    search,
    [
      { key: "item_name" as any, weight: 3 },
      { key: "sku" as any, weight: 2 },
      { key: "category" as any, weight: 2 },
      { key: "storage_location" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  // KS-A: status-priority sort puts out-of-stock then below-par at the
  // top so a chef glancing at the page sees what needs action without
  // scrolling. Location sort groups by storage_location so an end-of-
  // shift physical count can move through Fridge 1 -> Fridge 2 ->
  // Freezer -> Storeroom in order.
  const filtered = useMemo(() => {
    if (sortKey === "name") return fuzzied;
    const arr = [...fuzzied];
    if (sortKey === "status") {
      const rank = (i: Inventory) => {
        const s = Number(i.current_stock || 0);
        const m = Number(i.minimum_stock || 0);
        if (s <= 0) return 0;        // out
        if (s <= m) return 1;        // below par
        return 2;                     // ok
      };
      arr.sort((a, b) => {
        const r = rank(a) - rank(b);
        if (r !== 0) return r;
        return (a.item_name || "").localeCompare(b.item_name || "");
      });
    } else if (sortKey === "location") {
      arr.sort((a, b) => {
        const la = a.storage_location || "zzz";
        const lb = b.storage_location || "zzz";
        const r = la.localeCompare(lb);
        if (r !== 0) return r;
        return (a.item_name || "").localeCompare(b.item_name || "");
      });
    }
    return arr;
  }, [fuzzied, sortKey]);

  const stats = useMemo(() => {
    const total = items.length;
    const below = items.filter((i) => Number(i.current_stock || 0) <= Number(i.minimum_stock || 0)).length;
    const out = items.filter((i) => Number(i.current_stock || 0) <= 0).length;
    const inRecipes = items.filter((i) => recipeLinkedIds.has(i.id)).length;
    return { total, below, out, inRecipes };
  }, [items, recipeLinkedIds]);

  const openUse = (item: Inventory) => {
    setUsingItem(item);
    setAction("used");
    setUsedQty("");
    setUsedNotes("");
  };
  const closeUse = () => { setUsingItem(null); setUsedQty(""); setUsedNotes(""); };

  // KS-A: dialog math + audit-trail mapping. Each action picks both
  // the new stock value (relative or absolute) and the
  // inventory_transactions.transaction_type. "received" is treated as
  // "adjustment" since the enum has no dedicated "receipt" - shopping
  // logs proper purchase_receipts, kitchen logs are inline corrections.
  const resolveAction = (item: Inventory, act: StockAction, qty: number) => {
    const current = Number(item.current_stock || 0);
    if (act === "used") {
      return {
        newStock: Math.max(0, current - qty),
        type: "usage" as const,
        defaultNote: `Kitchen used ${qty} ${item.unit_of_measure}`,
        delta: -qty,
      };
    }
    if (act === "wasted") {
      return {
        newStock: Math.max(0, current - qty),
        type: "waste" as const,
        defaultNote: `Wasted ${qty} ${item.unit_of_measure}`,
        delta: -qty,
      };
    }
    if (act === "received") {
      return {
        newStock: current + qty,
        type: "adjustment" as const,
        defaultNote: `Received ${qty} ${item.unit_of_measure}`,
        delta: qty,
      };
    }
    // count = absolute set
    return {
      newStock: qty,
      type: "adjustment" as const,
      defaultNote: `Counted ${qty} ${item.unit_of_measure}`,
      delta: qty - current,
    };
  };

  const saveUsage = async () => {
    if (!usingItem || !user?.id) return;
    const qty = Number(usedQty);
    if (Number.isNaN(qty) || qty < 0 || (action !== "count" && qty <= 0)) {
      toast({
        title: action === "count" ? "Enter the counted quantity" : "Enter a positive quantity",
        variant: "destructive",
      });
      return;
    }
    const current = Number(usingItem.current_stock || 0);
    // Soft guard: warn but don't block - chef may know better. Negative
    // stock is already clamped to 0 in resolveAction.
    if ((action === "used" || action === "wasted") && qty > current) {
      const proceed = window.confirm(
        `You only have ${current} ${usingItem.unit_of_measure} on hand. Continue and clamp to 0?`,
      );
      if (!proceed) return;
    }
    const { newStock, type, defaultNote, delta } = resolveAction(usingItem, action, qty);
    setSaving(true);
    try {
      await inventoryService.adjustStock(
        usingItem.id,
        newStock,
        user.id,
        usedNotes || defaultNote,
        type,
      );
      const sign = delta > 0 ? "+" : "";
      toast({
        title: action === "received" ? "Stock received" : action === "wasted" ? "Waste logged" : action === "count" ? "Count saved" : "Usage logged",
        description: `${usingItem.item_name}: ${sign}${delta} ${usingItem.unit_of_measure} (now ${newStock})`,
      });
      closeUse();
      // No need to call load() - realtime sub will pick it up. Keep
      // the call anyway as a no-op safety net for any tenant where
      // realtime is misconfigured.
      load();
    } catch (e: any) {
      captureException(e, { tags: { route: ROUTE, step: "saveStockAction", companyId: user.company_id, action } });
      toast({ title: "Could not save", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const tone = (i: Inventory) => {
    const s = Number(i.current_stock || 0);
    const m = Number(i.minimum_stock || 0);
    if (s <= 0) return "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-800";
    if (s <= m) return "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-900";
    return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900";
  };
  const label = (i: Inventory) => {
    const s = Number(i.current_stock || 0);
    const m = Number(i.minimum_stock || 0);
    if (s <= 0) return "Out";
    if (s <= m) return "Below par";
    return "OK";
  };

  return (
    <>
      <Head><title>Kitchen stock - CateringMS</title></Head>
      <NoIndexMeta />
      <KitchenNav />
      <main className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Kitchen stock"
            subtitle="What you have on hand right now, tap any item to log usage, a receipt or waste"
            icon={Package}
            actions={
              <>
                {/* KS-A: as-of chip + manual refresh. Realtime sub keeps the
                    page fresh on inventory_items writes, but the chef
                    doing a stocktake wants the explicit confirmation. */}
                {lastLoadedAt && (
                  <span
                    className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums hidden sm:inline"
                    title={lastLoadedAt.toLocaleString("en-ZA")}
                  >
                    As of {lastLoadedAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
                <Button variant="outline" size="sm" onClick={() => load()} disabled={loading} className="h-8" title="Refresh">
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} />
                </Button>
              </>
            }
          />

          {/* KS-B: push-to-shopping banner. Renders only when there's
              something to push. Surfaces the gap + offers the
              one-tap action to convert it into a shopping list. */}
          {belowParItems.length > 0 && (
            <PortalCard className="mb-6 border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center flex-shrink-0">
                  <ShoppingCart className="h-5 w-5 text-rose-700 dark:text-rose-300" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                    {belowParItems.length} item{belowParItems.length === 1 ? "" : "s"} below par
                  </p>
                  <p className="text-xs text-rose-800 dark:text-rose-300/90 mt-0.5">
                    Push the lot to shopping in one tap. Quantities default to your re-order amounts.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => { setPushResult(null); setPushOpen(true); }}
                className="bg-brand-primary hover:opacity-90 text-white"
                disabled={pushing}
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Push to shopping
              </Button>
            </PortalCard>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <StatTile
              label={<span className="flex items-center gap-1">Total items<InfoTooltip content="Every active line item in your kitchen stock list." /></span>}
              value={stats.total}
            />
            <StatTile
              label={<span className="flex items-center gap-1">In your recipes<InfoTooltip content="Inventory items that at least one of your menu item recipes uses.\n\nUse the 'In recipes' filter below to focus on these." /></span>}
              value={stats.inRecipes}
            />
            <StatTile
              label={<span className="flex items-center gap-1">Below par<InfoTooltip content="Items running low and due for a re-order.\n\nStock is at or below the minimum you've set." /></span>}
              value={<span className="text-rose-600 dark:text-rose-500">{stats.below}</span>}
            />
            <StatTile
              label={<span className="flex items-center gap-1">Out of stock<InfoTooltip content="Items you've run out of completely.\n\nAny order needing these can't be fulfilled until you restock." /></span>}
              value={<span className="text-rose-600 dark:text-rose-500">{stats.out}</span>}
            />
          </div>

          <PortalCard padded className="mb-6">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input placeholder="Search by name, SKU, category..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-full sm:w-[170px]"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c === "all" ? "All categories" : c}</SelectItem>)}</SelectContent>
                </Select>
                {/* KS-A: storage location filter. Chef wants to count
                    Fridge 1, this scopes the list. */}
                <Select value={storage} onValueChange={setStorage}>
                  <SelectTrigger className="w-full sm:w-[170px]">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <SelectValue placeholder="Storage" />
                    </span>
                  </SelectTrigger>
                  <SelectContent>{storageLocations.map((c) => <SelectItem key={c} value={c}>{c === "all" ? "All locations" : c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant={recipeLinkedOnly ? "default" : "outline"} onClick={() => setRecipeLinkedOnly((v) => !v)} className={`h-10 ${recipeLinkedOnly ? "bg-brand-primary hover:opacity-90 text-white" : ""}`}>
                  <ChefHat className="h-4 w-4 mr-2" />In recipes
                </Button>
                <Button size="sm" variant={belowParOnly ? "default" : "outline"} onClick={() => setBelowParOnly((v) => !v)} className={`h-10 ${belowParOnly ? "bg-brand-primary hover:opacity-90 text-white" : ""}`}>
                  <AlertTriangle className="h-4 w-4 mr-2" />Below par
                </Button>
                {/* KS-A: sort selector. Default is alphabetical
                    (familiar). "Status" floats out-of-stock and
                    below-par to the top, "Location" groups by
                    storage for end-of-shift walkthroughs. */}
                <div className="ml-auto inline-flex items-center gap-1.5">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                    <SelectTrigger className="h-10 w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">A-Z</SelectItem>
                      <SelectItem value="status">Status (low first)</SelectItem>
                      <SelectItem value="location">Storage location</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* KS-A: active-filter recap line. Shown only when at
                  least one filter is on. One-tap clear-all. */}
              {(search || category !== "all" || storage !== "all" || belowParOnly || recipeLinkedOnly || sortKey !== "name") && (
                <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-3">
                  <span>
                    Showing <strong className="text-slate-900 dark:text-white tabular-nums">{filtered.length}</strong> of {items.length} items
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSearch(""); setCategory("all"); setStorage("all");
                      setBelowParOnly(false); setRecipeLinkedOnly(false); setSortKey("name");
                    }}
                    className="h-7 text-xs text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    Clear all
                  </Button>
                </div>
              )}
            </div>
          </PortalCard>

          <PortalCard padded={false}>
              {loading ? (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-hidden="true">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <li key={idx} className="flex items-center gap-3 p-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="h-3.5 w-40 max-w-[55%] animate-pulse motion-reduce:animate-none rounded bg-slate-200 dark:bg-slate-800" />
                        <div className="h-3 w-56 max-w-[75%] animate-pulse motion-reduce:animate-none rounded bg-slate-100 dark:bg-slate-800/60" />
                      </div>
                      <div className="h-5 w-16 animate-pulse motion-reduce:animate-none rounded bg-slate-100 dark:bg-slate-800/60" />
                      <div className="h-8 w-12 shrink-0 animate-pulse motion-reduce:animate-none rounded bg-slate-200 dark:bg-slate-800" />
                    </li>
                  ))}
                </ul>
              ) : filtered.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                    <Package className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white">No items match the current filter</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Try clearing a filter or searching a different term.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((i) => {
                    const stock = Number(i.current_stock ?? 0);
                    const min = Number(i.minimum_stock ?? 0);
                    const max = Number(i.maximum_stock ?? 0);
                    const reorderQty = Number(i.reorder_quantity ?? 0);
                    // KS-A: suggested order qty when below par. Prefer
                    // the configured reorder_quantity. Falls back to
                    // (max - stock) if max is set, else (par - stock)
                    // doubled to give the kitchen a little headroom.
                    let suggestion = 0;
                    if (stock <= min) {
                      if (reorderQty > 0) suggestion = reorderQty;
                      else if (max > 0) suggestion = Math.max(0, max - stock);
                      else suggestion = Math.max(min, min * 2 - stock);
                    }
                    return (
                      <button key={i.id} onClick={() => openUse(i)} className="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors duration-150 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-900 dark:text-white truncate">{i.item_name}</span>
                            {recipeLinkedIds.has(i.id) && (
                              <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 inline-flex items-center gap-1">
                                <ChefHat className="w-2.5 h-2.5" />in recipes
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {i.category ?? "--"}
                            {i.storage_location ? (
                              <span className="inline-flex items-center gap-0.5 ml-1">
                                <MapPin className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                                {i.storage_location}
                              </span>
                            ) : ""}
                          </div>
                          {/* KS-A: suggestion line. Only renders when
                              below par so the row stays quiet for OK
                              items. Helps the chef call shopping with
                              an exact ask instead of "we need more". */}
                          {suggestion > 0 && (
                            <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 inline-flex items-center gap-1">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Suggest ordering <strong>{suggestion} {i.unit_of_measure}</strong>
                              {reorderQty > 0 ? " (preferred re-order qty)" : max > 0 ? " (to hit max)" : " (to clear par)"}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <Badge variant="outline" className={`${tone(i)} justify-center min-w-[76px]`}>{label(i)}</Badge>
                          <span className="text-right tabular-nums min-w-[72px]">
                            <span className="font-semibold text-base text-slate-900 dark:text-white">{stock}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400"> {i.unit_of_measure}</span>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500">par {min}</div>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
          </PortalCard>
        </PortalShell>
      </main>

      <Dialog open={!!usingItem} onOpenChange={(o) => !o && closeUse()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "used" ? "Log usage" :
               action === "received" ? "Log a receipt" :
               action === "wasted" ? "Log waste" :
                                     "Save count"}
            </DialogTitle>
            <DialogDescription>
              {usingItem && `${usingItem.item_name} - ${Number(usingItem.current_stock ?? 0)} ${usingItem.unit_of_measure} on hand`}
            </DialogDescription>
          </DialogHeader>

          {/* KS-A: action picker. Replaces the old "log usage only"
              flow that forced a chef to go to /admin/inventory to log
              a delivery or waste. Four verbs, each picks math + audit
              trail tag underneath. */}
          <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setAction("used")}
              className={`flex flex-col items-center gap-1 px-2 py-2 rounded-md text-xs font-medium transition-colors ${action === "used" ? "bg-white dark:bg-slate-900 shadow-sm text-rose-700 dark:text-rose-300" : "text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-900/50"}`}
            >
              <Minus className="w-4 h-4" />
              Used
            </button>
            <button
              type="button"
              onClick={() => setAction("received")}
              className={`flex flex-col items-center gap-1 px-2 py-2 rounded-md text-xs font-medium transition-colors ${action === "received" ? "bg-white dark:bg-slate-900 shadow-sm text-emerald-700 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-900/50"}`}
            >
              <Plus className="w-4 h-4" />
              Received
            </button>
            <button
              type="button"
              onClick={() => setAction("wasted")}
              className={`flex flex-col items-center gap-1 px-2 py-2 rounded-md text-xs font-medium transition-colors ${action === "wasted" ? "bg-white dark:bg-slate-900 shadow-sm text-rose-700 dark:text-rose-300" : "text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-900/50"}`}
            >
              <Trash2 className="w-4 h-4" />
              Wasted
            </button>
            <button
              type="button"
              onClick={() => setAction("count")}
              className={`flex flex-col items-center gap-1 px-2 py-2 rounded-md text-xs font-medium transition-colors ${action === "count" ? "bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-900/50"}`}
            >
              <Package className="w-4 h-4" />
              Count
            </button>
          </div>

          <div className="space-y-3 mt-2">
            <div>
              <Label htmlFor="qty">
                {action === "used" ? `Used (${usingItem?.unit_of_measure})` :
                 action === "received" ? `Received (${usingItem?.unit_of_measure})` :
                 action === "wasted" ? `Wasted (${usingItem?.unit_of_measure})` :
                                       `Counted total (${usingItem?.unit_of_measure})`}
              </Label>
              <Input
                id="qty"
                type="number"
                min="0"
                step="any"
                value={usedQty}
                onChange={(e) => setUsedQty(e.target.value)}
                autoFocus
                placeholder={action === "count" ? "Total on hand" : "e.g. 2.5"}
              />
              {/* KS-A: live preview of new stock so the chef can see
                  what the save will leave them with before tapping. */}
              {usingItem && usedQty && !Number.isNaN(Number(usedQty)) && Number(usedQty) >= 0 && (() => {
                const preview = resolveAction(usingItem, action, Number(usedQty));
                return (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                    New on-hand: <strong className="text-slate-900 dark:text-white">{preview.newStock} {usingItem.unit_of_measure}</strong>
                    {preview.delta !== 0 && (
                      <span className={preview.delta > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>
                        {" "}({preview.delta > 0 ? "+" : ""}{preview.delta})
                      </span>
                    )}
                  </p>
                );
              })()}
            </div>
            <div>
              <Label htmlFor="notes">Reason (optional)</Label>
              <Input
                id="notes"
                placeholder={
                  action === "used" ? "e.g. lunch service, prep for tomorrow" :
                  action === "received" ? "e.g. shopping just dropped off" :
                  action === "wasted" ? "e.g. went off, spilled, freezer burn" :
                                        "e.g. end-of-shift physical count"
                }
                value={usedNotes}
                onChange={(e) => setUsedNotes(e.target.value)}
              />
            </div>
            {action === "wasted" && (
              <p className="text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded p-2">
                Waste shows up on the admin wastage tab so the office can spot trends - what's going off, what's over-prepped.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeUse} disabled={saving}>Cancel</Button>
            <Button
              onClick={saveUsage}
              disabled={saving || !usedQty}
              className={
                action === "received" ? "bg-brand-primary hover:opacity-90 text-white" :
                action === "wasted" ? "bg-brand-primary hover:opacity-90 text-white" :
                action === "count" ? "bg-slate-700 hover:bg-slate-800 text-white" :
                                     "bg-brand-primary hover:opacity-90 text-white"
              }
            >
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin motion-reduce:animate-none" /> Saving</> :
                action === "received" ? "Log receipt" :
                action === "wasted" ? "Log waste" :
                action === "count" ? "Save count" :
                                     "Log usage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KS-B: push-to-shopping dialog. Shows the chef exactly what
          they're about to create + a success state with deep-link
          to the shopping list once it lands. */}
      <Dialog open={pushOpen} onOpenChange={(o) => { if (!o) { setPushOpen(false); setPushResult(null); } }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-slate-400 dark:text-slate-500" />
              {pushResult ? "Shopping list created" : "Push below-par items to shopping"}
            </DialogTitle>
            <DialogDescription>
              {pushResult
                ? "The shopping team will see this on their list page in real time."
                : `Creates a new shopping list with ${belowParItems.length} item${belowParItems.length === 1 ? "" : "s"}. Quantity defaults to your re-order amount, or to maximum stock if no re-order qty is set.`}
            </DialogDescription>
          </DialogHeader>

          {pushResult ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-700 dark:text-emerald-400" />
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 text-center">
                <strong className="text-slate-900 dark:text-white">{pushResult.itemCount}</strong> item{pushResult.itemCount === 1 ? "" : "s"} pushed.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setPushOpen(false); setPushResult(null); }}
                >
                  Done
                </Button>
                <a
                  href={user?.company_slug ? `/${user.company_slug}/team-portal/shopping` : "/team-portal/shopping"}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-brand-primary hover:opacity-90 text-white text-sm font-medium"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Open shopping
                </a>
              </div>
            </div>
          ) : (
            <>
              <div className="max-h-[40vh] overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-md divide-y divide-slate-100 dark:divide-slate-800">
                {belowParItems.map((i) => {
                  const stock = Number(i.current_stock || 0);
                  const min = Number(i.minimum_stock || 0);
                  const max = Number(i.maximum_stock || 0);
                  const reorderQty = Number(i.reorder_quantity || 0);
                  const target = reorderQty > 0 ? stock + reorderQty : max > 0 ? max : min * 2;
                  const need = Math.max(0, target - stock);
                  return (
                    <div key={i.id} className="p-2.5 flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-white truncate">{i.item_name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">have {stock} {i.unit_of_measure}, par {min}</div>
                      </div>
                      <div className="text-right tabular-nums flex-shrink-0">
                        <div className="font-semibold text-rose-600 dark:text-rose-400">+{need} {i.unit_of_measure}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPushOpen(false)} disabled={pushing}>Cancel</Button>
                <Button
                  onClick={handlePushToShopping}
                  disabled={pushing || belowParItems.length === 0}
                  className="bg-brand-primary hover:opacity-90 text-white"
                >
                  {pushing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin motion-reduce:animate-none" />Pushing</> : <><ShoppingCart className="w-4 h-4 mr-2" />Push {belowParItems.length} item{belowParItems.length === 1 ? "" : "s"}</>}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
