/**
 * Shopping dashboard - Wave 70.30 rework.
 *
 * Before: the page generated a synthetic "shopping list" from order
 * items + low-stock inventory and tracked tick state in localStorage.
 * That meant ticks were lost on device switch and never reached a
 * shopping_lists record. The synthetic list also competed with the
 * proper shopping_list workflow on /orders + /buy-list.
 *
 * Now: the page is the canonical "your active shopping list" view.
 * Reads shopping_list_items via useActiveShoppingList, ticks
 * persist to the DB (works across devices). The "what to buy"
 * surface lives on /buy-list - the dashboard focuses on running
 * the list you've already chosen.
 *
 * Empty state directs to /buy-list to start a list. No more
 * silent auto-creation of synthetic lists.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ShoppingCart, CheckCircle, Clock, Package, ListChecks, Camera,
  ArrowRight, Loader2, User, Users as UsersIcon, AlertCircle,
  Printer, RefreshCw,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { UserRole } from "@/types/app";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ShoppingPageShell, SHOPPING_HERO_CHIP } from "@/components/shopping/ShoppingPageShell";
import { PortalCard, PortalCardHeader, StatTile } from "@/components/portal/ui";
import { useActiveShoppingList } from "@/hooks/useActiveShoppingList";
import { BarcodeScanFab } from "@/components/shopping/BarcodeScanFab";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useTenantHref } from "@/lib/tenantUrl";
import { useToast } from "@/hooks/use-toast";
import { getShoppingCostVariance, formatShoppingVariance, parseMoneyInput } from "@/lib/shopping/completionRules";

function ShoppingDashboardInner() {
  const { user } = useAuth();
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const companyId = (user as any)?.company_id || null;
  const tenantCurrency = useTenantCurrency(companyId);
  const activeList = useActiveShoppingList();

  const [filter, setFilter] = useState<"all" | "pending" | "purchased">("pending");
  const [completing, setCompleting] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [actualTotalInput, setActualTotalInput] = useState("");
  const [noReceiptReason, setNoReceiptReason] = useState("");
  // SHP2-G (shopping deep audit, SHP2-32 part b): live search input so
  // a shopper holding a phone in one hand at the supplier can type
  // "tom" and immediately see tomatoes - faster than scrolling 30
  // rows. Case-insensitive substring match against item name + notes.
  const [searchTerm, setSearchTerm] = useState("");

  // SHP2-J (shopping deep audit, SHP2-34): cross-page peeks. Two
  // counts surface alongside the Buy-list + Receipts action tiles:
  //   - pendingReceiptsCount: completed lists with no receipt_url
  //     yet. The shopper needs a nudge to snap before the lifecycle
  //     finishes.
  //   - lowStockCount: distinct inventory_items where current_stock
  //     < minimum_stock. Tomorrow's prep is about to be short.
  // Both refresh on the same realtime sub the hook owns; failures
  // are best-effort (badge just stays at 0).
  const [pendingReceiptsCount, setPendingReceiptsCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const fetchPeeks = async () => {
      try {
        const [{ count: receiptsCount }, lowStockRes] = await Promise.all([
          (supabase as any)
            .from("shopping_lists")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("status", "completed")
            .is("receipt_url", null),
          // PostgREST can't compare two columns, so the old
          // .filter("current_stock","lt","minimum_stock") 400'd (it sent the
          // literal "minimum_stock"). Fetch the two numbers and count
          // current_stock <= minimum_stock client-side (same as kitchen).
          (supabase as any)
            .from("inventory_items")
            .select("current_stock, minimum_stock")
            .eq("company_id", companyId),
        ]);
        if (cancelled) return;
        const lowCount = ((lowStockRes?.data || []) as Array<{ current_stock: number | null; minimum_stock: number | null }>)
          .filter((i) => i.current_stock != null && i.minimum_stock != null && i.current_stock <= i.minimum_stock)
          .length;
        setPendingReceiptsCount(receiptsCount ?? 0);
        setLowStockCount(lowCount);
      } catch (e) {
        // Counts are non-critical, log + leave at 0.
        console.warn("[shopping/dashboard] peek counts failed:", e);
      }
    };
    void fetchPeeks();
    return () => { cancelled = true; };
  }, [companyId, activeList.list?.status]);

  const items = activeList.items;
  const bought = items.filter(i => i.purchased);
  const remaining = items.filter(i => !i.purchased);

  // Command-centre restructure (2026-07-02): a hook load failure used to
  // leave list=null and render the "No active shopping list" empty state
  // over a failed read. Distinguish the two: error with no list = failed
  // load (rose recovery card); error while a list is showing = mutation
  // hiccup (kept as the inline notice under the list).
  const loadFailed = !!activeList.error && !activeList.list && !activeList.loading;
  const chipsReady = !activeList.loading && !loadFailed;

  // Per-item async guard: the whole row is tappable, so a double tap
  // could fire togglePurchased twice before the first write returns.
  // Claim + out-of-stock share the same lane per item.
  const [busyItems, setBusyItems] = useState<Set<string>>(new Set());
  const withItemBusy = async (itemId: string, fn: () => Promise<void>) => {
    if (busyItems.has(itemId)) return;
    setBusyItems(prev => new Set(prev).add(itemId));
    try {
      await fn();
    } finally {
      setBusyItems(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };
  const trimmedSearch = searchTerm.trim().toLowerCase();
  const filteredItems = items.filter(i => {
    if (filter === "pending" && i.purchased) return false;
    if (filter === "purchased" && !i.purchased) return false;
    if (trimmedSearch) {
      const haystack = `${i.name} ${i.notes ?? ""} ${i.supplier_name ?? ""}`.toLowerCase();
      if (!haystack.includes(trimmedSearch)) return false;
    }
    return true;
  });

  // SHP2-F (shopping deep audit, SHP2-31): group items by supplier so
  // the shopper can walk through PnP first, then Checkers, then Makro
  // - one shop per visit instead of zig-zagging. Items with no
  // inventory link or no preferred_supplier_id collect into an
  // "Other" bucket pinned to the bottom. Stable insertion order
  // keeps the list non-jumpy as items get ticked.
  const itemsBySupplier = useMemo(() => {
    const buckets = new Map<string, { id: string | null; name: string; items: typeof filteredItems }>();
    for (const it of filteredItems) {
      const key = it.supplier_id ?? "__other__";
      const existing = buckets.get(key);
      if (existing) {
        existing.items.push(it);
      } else {
        buckets.set(key, {
          id: it.supplier_id,
          name: it.supplier_name ?? "Other / no supplier",
          items: [it],
        });
      }
    }
    return Array.from(buckets.values()).sort((a, b) => {
      // Pin the "Other" group last; everything else alphabetical by
      // supplier_name so the order stays stable as items are ticked.
      if (a.id === null) return 1;
      if (b.id === null) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [filteredItems]);

  // Render-time helper: does the active list span more than one
  // supplier? If everything is at one shop (or all "Other"), skip
  // the grouped layout and render the flat list.
  const showSupplierGroups = itemsBySupplier.length > 1;

  // Rough estimate from the notes ("Need X unit, have Y") isn't
  // reliable, so we use the list's estimated_total if set,
  // otherwise leave blank.
  const estimatedTotal = activeList.list?.estimated_total ?? null;
  const yourList = activeList.list?.isYours ?? false;

  const handleToggle = async (itemId: string, currentValue: boolean) => {
    await withItemBusy(itemId, async () => {
      const next = !currentValue;
      const name = activeList.items.find((i) => i.id === itemId)?.name || "Item";
      const ok = await activeList.togglePurchased(itemId, next);
      if (!ok) {
        toast({
          title: "Could not update",
          description: activeList.error || "That didn't save. Try again.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: next ? "Marked as bought" : "Back on the to-buy list",
        description: next
          ? `${name} ticked off${activeList.items.find((i) => i.id === itemId)?.item_id ? " and stock updated" : ""}.`
          : `${name} moved back to to-buy.`,
      });
    });
  };

  // SHP2-I (SHP2-33): parses the [OOS@Supplier] tag back out of the
  // notes string for chip display. Empty array when the item has no
  // OOS tags yet.
  const OOS_TAG_RE = /\[OOS@([^\]]+)\]/g;
  const readOosSuppliers = (notes: string | null | undefined): string[] => {
    if (!notes) return [];
    const out: string[] = [];
    let m: RegExpExecArray | null;
    OOS_TAG_RE.lastIndex = 0;
    while ((m = OOS_TAG_RE.exec(notes))) out.push(m[1].trim());
    return out;
  };
  // Strips the tags out of the notes string for the "real notes"
  // body that renders below the title - so the user doesn't see the
  // raw [OOS@PnP] token alongside the chip.
  const stripOosTags = (notes: string | null | undefined): string => {
    if (!notes) return "";
    return notes.replace(/\[OOS@[^\]]+\]\s*/g, "").trim();
  };

  const handleFlagOOS = async (
    e: React.MouseEvent | React.KeyboardEvent,
    itemId: string,
    supplierName: string | null,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    await withItemBusy(itemId, () => activeList.flagOutOfStock(itemId, supplierName).then(() => undefined));
  };

  // Shopping persona 5.4: per-line claim handler. Stops propagation
  // so the row's toggle-purchased click handler doesn't also fire.
  const handleClaim = async (
    e: React.MouseEvent | React.KeyboardEvent,
    itemId: string,
    claim: boolean,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    await withItemBusy(itemId, async () => {
      await activeList.claimItem(itemId, claim);
      const name = activeList.items.find((i) => i.id === itemId)?.name || "Item";
      toast({
        title: claim ? "Claimed" : "Released",
        description: claim ? `You're buying ${name}.` : `${name} is back up for anyone to grab.`,
      });
    });
  };

  // Resolve the current user's id once. Used by the claim chips to
  // decide between "Claim", "You" (release), and "Claimed by X" labels.
  const currentUserId = (user as { id?: string } | null)?.id ?? null;

  const handleCompleteOpen = () => {
    setActualTotalInput("");
    setNoReceiptReason("");
    setCompleteOpen(true);
  };

  const handleCompleteConfirm = async () => {
    const parsed = parseMoneyInput(actualTotalInput);
    if (actualTotalInput.trim() && (parsed == null || parsed < 0)) {
      toast({ title: "Enter a valid total", variant: "destructive" });
      return;
    }
    const reason = noReceiptReason.trim();
    if (!activeList.list?.receipt_url && !reason) {
      toast({
        title: "Receipt status required",
        description: "Enter a no-receipt reason before closing this list.",
        variant: "destructive",
      });
      return;
    }
    setCompleting(true);
    try {
      const ok = await activeList.completeList(parsed, { noReceiptReason: reason });
      if (!ok) {
        toast({
          title: "Could not complete",
          description: activeList.error || "Receipt status is required before closing the list.",
          variant: "destructive",
        });
        return;
      }
      // SHP2-E (SHP2-30): completeList now writes supplier_payables
      // when an actual total was entered. The cashflow forecast
      // refreshes via the cateringms:shopping-updated event listener.
      // Receipt status is captured in the same closeout flow.
      toast({
        title: parsed && parsed > 0 ? "List complete · payable recorded" : "List complete",
        description: parsed && parsed > 0
          ? "Cashflow is updated and receipt status is captured."
          : "Receipt status is captured.",
      });
      setCompleteOpen(false);
    } finally {
      setCompleting(false);
    }
  };

  const completionActual = parseMoneyInput(actualTotalInput);
  const completionVariance = getShoppingCostVariance(
    activeList.list?.estimated_total,
    completionActual,
  );

  return (
    <>
      <ShoppingPageShell
        pageTitle="Shopping dashboard - CateringMS"
        heading="Shopping today"
        subheading={
          chipsReady && activeList.list
            ? "Live run desk: tick purchases, attach receipt details, and close out today's active list."
            : "Start from Buy list for shortfalls, or Active shop when you already know what needs buying."
        }
        icon={ShoppingCart}
        headerAction={
          <Button
            variant="outline"
            size="sm"
            onClick={activeList.refresh}
            disabled={activeList.loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${activeList.loading ? "animate-spin motion-reduce:animate-none" : ""}`} />
            Refresh
          </Button>
        }
        meta={
          chipsReady ? (
            activeList.list ? (
              <>
                <span className={SHOPPING_HERO_CHIP}>
                  <Clock className="h-3 w-3" />
                  {remaining.length} to buy
                </span>
                <span className={SHOPPING_HERO_CHIP}>
                  <CheckCircle className="h-3 w-3" />
                  {bought.length} bought
                </span>
                {lowStockCount > 0 && (
                  <span className={SHOPPING_HERO_CHIP}>
                    <AlertCircle className="h-3 w-3" />
                    {lowStockCount} low stock
                  </span>
                )}
              </>
            ) : (
              <span className={SHOPPING_HERO_CHIP}>
                <ShoppingCart className="h-3 w-3" />
                No active list
              </span>
            )
          ) : undefined
        }
      >
          {/* Recovery card: the list read failed. Never dress a failed
              load up as "no active shopping list". */}
          {loadFailed ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40">
              <h2 className="text-base font-bold text-rose-900 dark:text-rose-200 mb-1">Couldn&apos;t load your shopping list</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{activeList.error}</p>
              <Button
                size="sm"
                onClick={activeList.refresh}
                disabled={activeList.loading}
                className="bg-brand-primary hover:bg-brand-primary/90 text-white"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : activeList.loading ? (
            // Skeleton over a centre spinner: the page loads straight
            // into the task shape (hero strip + 4 metric tiles + rows)
            // so the layout doesn't jump when data arrives.
            <div className="space-y-6 sm:space-y-8" aria-busy="true" aria-label="Loading your active list">
              <div className="h-40 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="h-24 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse" />
                ))}
              </div>
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} className="h-16 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse" />
                ))}
              </div>
            </div>
          ) : !activeList.list ? (
            <PortalCard padded={false}>
              <div className="py-16 px-6 text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                  <ShoppingCart className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1.5">
                  No active shopping list
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto mb-5">
                  Open the Buy list to see what's short and start a new shopping run. Ticks save automatically once a list is going.
                </p>
                <Link href={withSlug("/team-portal/shopping/buy-list")}>
                  <Button className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-lg gap-1.5">
                    <ListChecks className="w-4 h-4" />
                    Open Buy list
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </Link>
              </div>
            </PortalCard>
          ) : (
            <>
              {/* Active list hero */}
              <PortalCard className="mb-6 sm:mb-8">
                <div className="mb-4 flex flex-wrap items-center gap-2 text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                  <Package className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                  <span>{activeList.list.title || "Your shopping list"}</span>
                  <Badge variant="outline" className={yourList
                    ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900 gap-1"
                    : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 gap-1"
                  }>
                    {yourList ? <User className="w-3 h-3" /> : <UsersIcon className="w-3 h-3" />}
                    {yourList ? "Your list" : "Team list"}
                  </Badge>
                  <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 capitalize text-[10px]">
                    {activeList.list.status.replace("_", " ")}
                  </Badge>
                </div>
                <div>
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                      <div>
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Items left to buy</p>
                        <p className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-white tabular-nums">
                          {remaining.length}
                          <span className="text-base text-slate-500 dark:text-slate-400 font-normal">
                            {" "}of {items.length}
                          </span>
                        </p>
                      </div>
                      {estimatedTotal != null && (
                        <div className="text-left sm:text-right">
                          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Estimated cost</p>
                          <p className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
                            {tenantCurrency.format(estimatedTotal, 0)}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Link href={withSlug("/team-portal/shopping/buy-list")} className="flex-1">
                        <Button variant="outline" className="w-full text-sm sm:text-base h-10 sm:h-11 gap-1.5">
                          <ListChecks className="w-4 h-4" />
                          Add more from Buy list
                          {/* SHP2-J: low-stock peek - tomorrow's prep
                              has shortfalls the buy-list will surface. */}
                          {lowStockCount > 0 && (
                            <Badge
                              variant="outline"
                              className="ml-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900 tabular-nums"
                              title={`${lowStockCount} inventory items below minimum stock`}
                            >
                              {lowStockCount} low
                            </Badge>
                          )}
                        </Button>
                      </Link>
                      <Link href={withSlug("/team-portal/shopping/receipts")} className="flex-1">
                        <Button variant="outline" className="w-full text-sm sm:text-base h-10 sm:h-11 gap-1.5">
                          <Camera className="w-4 h-4" />
                          Snap a receipt
                          {/* SHP2-J: receipt peek - completed shopping
                              lists awaiting a receipt upload. */}
                          {pendingReceiptsCount > 0 && (
                            <Badge
                              variant="outline"
                              className="ml-1 bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900 tabular-nums"
                              title={`${pendingReceiptsCount} completed list${pendingReceiptsCount === 1 ? "" : "s"} need a receipt`}
                            >
                              {pendingReceiptsCount} to upload
                            </Badge>
                          )}
                        </Button>
                      </Link>
                      {/* SHP2-A (shopping audit, SHP2-2): paper for the
                          shopper. Admin /admin/shopping shipped print
                          via AD-2; staff finally gets it here. */}
                      <Button
                        variant="outline"
                        className="flex-1 text-sm sm:text-base h-10 sm:h-11 gap-1.5"
                        onClick={() => {
                          if (remaining.length === 0) {
                            toast({ title: "Nothing to print", description: "All items already ticked off." });
                            return;
                          }
                          setTimeout(() => window.print(), 100);
                        }}
                      >
                        <Printer className="w-4 h-4" />
                        Print
                      </Button>
                      {remaining.length === 0 && items.length > 0 && (
                        <Button
                          onClick={handleCompleteOpen}
                          className="flex-1 text-sm sm:text-base h-10 sm:h-11 bg-brand-primary hover:bg-brand-primary/90 text-white rounded-lg gap-1.5"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Mark list complete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </PortalCard>

              {/* Metric tiles */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
                <StatTile
                  icon={ShoppingCart}
                  label="Total items"
                  value={items.length}
                  hint="On your active list"
                />
                <StatTile
                  icon={Clock}
                  label="Remaining"
                  value={remaining.length}
                  hint="Still to buy"
                />
                <StatTile
                  icon={CheckCircle}
                  label="Bought"
                  value={bought.length}
                  hint="Already ticked off"
                />
                <StatTile
                  icon={AlertCircle}
                  label="List date"
                  value={activeList.list.list_date ? new Date(activeList.list.list_date).getDate() : "--"}
                  hint={activeList.list.list_date || "No date set"}
                />
              </div>

              {/* SHP2-G (shopping deep audit, SHP2-32): live search
                  + filter chips. Search input first so a shopper at
                  the supplier with one hand free can type and the
                  list immediately filters. Cleared by tapping X
                  inside the input. */}
              <div className="mb-3">
                <div className="relative">
                  <Input
                    type="text"
                    inputMode="search"
                    placeholder="Search items, notes, or supplier..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-9 h-11"
                    aria-label="Search items"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors duration-150"
                      aria-label="Clear search"
                    >
                      <span className="text-lg leading-none">×</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Filter chips */}
              <div className="flex gap-2 mb-4">
                {(["pending", "all", "purchased"] as const).map(f => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filter === f ? "default" : "outline"}
                    onClick={() => setFilter(f)}
                    className={filter === f ? "bg-brand-primary hover:bg-brand-primary/90 capitalize" : "capitalize"}
                  >
                    {f === "pending" ? "Remaining" : f === "purchased" ? "Bought" : "All"}
                  </Button>
                ))}
              </div>

              {/* Shopping list - persisted */}
              <PortalCard>
                <PortalCardHeader
                  title={filter === "pending" ? "Still to buy" : filter === "purchased" ? "Already bought" : "All items"}
                />
                <div>
                  <div className="space-y-2 sm:space-y-3">
                    {filteredItems.length === 0 ? (
                      <div className="text-center py-10 px-4">
                        <p className="text-sm sm:text-base font-medium text-slate-700 dark:text-slate-200">
                          {filter === "pending"
                            ? items.length > 0 ? "All ticked off. Nice work." : "Nothing on the list yet."
                            : filter === "purchased" ? "Nothing bought yet."
                            : "No items on the list."}
                        </p>
                        {items.length === 0 && (
                          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-2 max-w-md mx-auto">
                            Head to the <Link href={withSlug("/team-portal/shopping/buy-list")} className="text-brand-primary dark:text-brand-primary underline underline-offset-2">Buy list</Link> to add items based on the next 7 days of demand.
                          </p>
                        )}
                      </div>
                    ) : showSupplierGroups ? (
                      // SHP2-F (SHP2-31): per-supplier shopping. Each
                      // supplier becomes a header strip with an item
                      // count + pending count, then the items render
                      // beneath in the same style as the flat layout.
                      itemsBySupplier.map((group) => {
                        const pendingCount = group.items.filter(i => !i.purchased).length;
                        return (
                          <div key={group.id ?? "__other__"} className="mb-3">
                            <div className="flex items-center justify-between gap-2 px-3 py-2 mb-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                {group.name}
                              </p>
                              <Badge variant="outline" className={`text-[10px] tabular-nums ${
                                pendingCount > 0
                                  ? "bg-white text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700"
                                  : "bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/15 dark:text-brand-primary dark:border-brand-primary/30"
                              }`}>
                                {pendingCount > 0
                                  ? `${pendingCount} of ${group.items.length} to buy`
                                  : `${group.items.length} done`}
                              </Badge>
                            </div>
                            {/* SHP2-G (SHP2-32): whole row tappable via
                                role=button + onClick on the wrapper div.
                                Visible checkbox is preserved so the
                                affordance stays obvious; checkbox click
                                stops propagation so it doesn't fire twice. */}
                            <div className="space-y-2 sm:space-y-3">
                              {group.items.map(item => (
                                <div
                                  key={item.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => handleToggle(item.id, item.purchased)}
                                  onKeyDown={(e) => {
                                    if (e.key === " " || e.key === "Enter") {
                                      e.preventDefault();
                                      handleToggle(item.id, item.purchased);
                                    }
                                  }}
                                  className={`flex items-center gap-3 p-3 sm:p-4 rounded-lg border transition-colors duration-150 cursor-pointer select-none min-h-11 ${
                                    item.purchased
                                      ? "bg-slate-50 border-slate-200 dark:bg-slate-900/60 dark:border-slate-800"
                                      : "bg-white border-slate-200 hover:border-brand-primary/50 active:bg-brand-primary/5 dark:bg-slate-900 dark:border-slate-700 dark:hover:border-brand-primary/50 dark:active:bg-brand-primary/10"
                                  }`}
                                  aria-pressed={item.purchased}
                                  aria-label={`Mark ${item.name} as ${item.purchased ? "not bought" : "bought"}`}
                                >
                                  <Checkbox
                                    checked={item.purchased}
                                    onCheckedChange={() => handleToggle(item.id, item.purchased)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-5 h-5 flex-shrink-0"
                                    aria-label={`Mark ${item.name} as ${item.purchased ? "not bought" : "bought"}`}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                      <h4 className={`font-semibold text-sm sm:text-base ${
                                        item.purchased ? "line-through text-slate-500 dark:text-slate-400" : "text-slate-900 dark:text-white"
                                      }`}>
                                        {item.name}
                                      </h4>
                                      <Badge variant="outline" className="text-xs tabular-nums">
                                        {Number(item.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })} {item.unit || ""}
                                      </Badge>
                                      {/* SHP2-I (SHP2-33): per-supplier OOS chips parsed from notes. */}
                                      {readOosSuppliers(item.notes).map((s) => (
                                        <Badge
                                          key={`oos-${item.id}-${s}`}
                                          variant="outline"
                                          className="text-[10px] bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900"
                                        >
                                          Not at {s}
                                        </Badge>
                                      ))}
                                    </div>
                                    {(() => {
                                      const cleanNotes = stripOosTags(item.notes);
                                      return cleanNotes ? (
                                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 italic truncate">
                                          {cleanNotes}
                                        </p>
                                      ) : null;
                                    })()}
                                  </div>
                                  {/* SHP2-I (SHP2-33): "Not here" button
                                      next to the status icon. Lets the
                                      shopper at PnP flag tomatoes as
                                      out-of-stock at PnP, item stays
                                      pending but gets a chip + survives
                                      to the next supplier in the run.
                                      Hidden once purchased. */}
                                  {/* Shopping persona 5.4: per-line
                                      claim chip. Three states:
                                      unclaimed -> "Claim", claimed by
                                      you -> "You" (releases on tap),
                                      claimed by teammate -> "@Name"
                                      (read-only chip). Hidden once
                                      the row is purchased. */}
                                  {!item.purchased && (
                                    (() => {
                                      const aId = item.assigned_shopper_id;
                                      const aName = item.assigned_shopper_name;
                                      if (!aId) {
                                        return (
                                          <button
                                            type="button"
                                            onClick={(e) => handleClaim(e, item.id, true)}
                                            onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") handleClaim(e, item.id, true); }}
                                            className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded border min-h-9 transition-colors duration-150 flex-shrink-0 bg-slate-100 text-slate-600 border-slate-200 hover:bg-brand-primary/10 hover:text-brand-primary hover:border-brand-primary/30 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-brand-primary/10 dark:hover:text-brand-primary dark:hover:border-brand-primary/40"
                                            title="Claim this line - shows your teammates you're on it"
                                          >Claim</button>
                                        );
                                      }
                                      if (aId === currentUserId) {
                                        return (
                                          <button
                                            type="button"
                                            onClick={(e) => handleClaim(e, item.id, false)}
                                            onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") handleClaim(e, item.id, false); }}
                                            className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded border min-h-9 transition-colors duration-150 flex-shrink-0 bg-brand-primary/10 text-brand-primary border-brand-primary/20 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 dark:bg-brand-primary/10 dark:text-brand-primary dark:border-brand-primary/30 dark:hover:bg-rose-950 dark:hover:text-rose-300 dark:hover:border-rose-900"
                                            title="You claimed this. Tap to release."
                                          >You</button>
                                        );
                                      }
                                      return (
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded border bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 flex-shrink-0"
                                          title={`Claimed by ${aName ?? "teammate"}`}
                                        >{aName ?? "Teammate"}</Badge>
                                      );
                                    })()
                                  )}
                                  {!item.purchased && (
                                    <button
                                      type="button"
                                      onClick={(e) => handleFlagOOS(e, item.id, item.supplier_name)}
                                      onKeyDown={(e) => {
                                        if (e.key === " " || e.key === "Enter") handleFlagOOS(e, item.id, item.supplier_name);
                                      }}
                                      className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded border min-h-9 transition-colors duration-150 flex-shrink-0 ${
                                        readOosSuppliers(item.notes).includes(item.supplier_name ?? "Unknown")
                                          ? "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900"
                                          : "bg-slate-100 text-slate-600 border-slate-300 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-rose-950 dark:hover:text-rose-300 dark:hover:border-rose-900"
                                      }`}
                                      title="Mark as out of stock at this supplier"
                                    >
                                      Not here
                                    </button>
                                  )}
                                  {item.purchased ? (
                                    <CheckCircle className="w-5 h-5 text-brand-primary dark:text-brand-primary flex-shrink-0" />
                                  ) : (
                                    <Clock className="w-5 h-5 text-brand-primary flex-shrink-0" />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      filteredItems.map(item => (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleToggle(item.id, item.purchased)}
                          onKeyDown={(e) => {
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              handleToggle(item.id, item.purchased);
                            }
                          }}
                          className={`flex items-center gap-3 p-3 sm:p-4 rounded-lg border transition-colors duration-150 cursor-pointer select-none min-h-11 ${
                            item.purchased
                              ? "bg-slate-50 border-slate-200 dark:bg-slate-900/60 dark:border-slate-800"
                              : "bg-white border-slate-200 hover:border-brand-primary/50 active:bg-brand-primary/5 dark:bg-slate-900 dark:border-slate-700 dark:hover:border-brand-primary/50 dark:active:bg-brand-primary/10"
                          }`}
                          aria-pressed={item.purchased}
                          aria-label={`Mark ${item.name} as ${item.purchased ? "not bought" : "bought"}`}
                        >
                          <Checkbox
                            checked={item.purchased}
                            onCheckedChange={() => handleToggle(item.id, item.purchased)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-5 h-5 flex-shrink-0"
                            aria-label={`Mark ${item.name} as ${item.purchased ? "not bought" : "bought"}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <h4 className={`font-semibold text-sm sm:text-base ${
                                item.purchased ? "line-through text-slate-500 dark:text-slate-400" : "text-slate-900 dark:text-white"
                              }`}>
                                {item.name}
                              </h4>
                              <Badge variant="outline" className="text-xs tabular-nums">
                                {Number(item.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })} {item.unit || ""}
                              </Badge>
                            </div>
                            {(() => {
                              const cleanNotes = stripOosTags(item.notes);
                              return cleanNotes ? (
                                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 italic truncate">
                                  {cleanNotes}
                                </p>
                              ) : null;
                            })()}
                          </div>
                          {/* Shopping 5.4: claim chip - same shape
                              as the grouped path above. */}
                          {!item.purchased && (
                            (() => {
                              const aId = item.assigned_shopper_id;
                              const aName = item.assigned_shopper_name;
                              if (!aId) {
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => handleClaim(e, item.id, true)}
                                    onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") handleClaim(e, item.id, true); }}
                                    className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded border min-h-9 transition-colors duration-150 flex-shrink-0 bg-slate-100 text-slate-600 border-slate-200 hover:bg-brand-primary/10 hover:text-brand-primary hover:border-brand-primary/30 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-brand-primary/10 dark:hover:text-brand-primary dark:hover:border-brand-primary/40"
                                    title="Claim this line - shows your teammates you're on it"
                                  >Claim</button>
                                );
                              }
                              if (aId === currentUserId) {
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => handleClaim(e, item.id, false)}
                                    onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") handleClaim(e, item.id, false); }}
                                    className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded border min-h-9 transition-colors duration-150 flex-shrink-0 bg-brand-primary/10 text-brand-primary border-brand-primary/20 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 dark:bg-brand-primary/10 dark:text-brand-primary dark:border-brand-primary/30 dark:hover:bg-rose-950 dark:hover:text-rose-300 dark:hover:border-rose-900"
                                    title="You claimed this. Tap to release."
                                  >You</button>
                                );
                              }
                              return (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded border bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900 flex-shrink-0"
                                  title={`Claimed by ${aName ?? "teammate"}`}
                                >{aName ?? "Teammate"}</Badge>
                              );
                            })()
                          )}
                          {!item.purchased && (
                            <button
                              type="button"
                              onClick={(e) => handleFlagOOS(e, item.id, item.supplier_name)}
                              onKeyDown={(e) => {
                                if (e.key === " " || e.key === "Enter") handleFlagOOS(e, item.id, item.supplier_name);
                              }}
                              className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded border min-h-9 transition-colors duration-150 flex-shrink-0 ${
                                readOosSuppliers(item.notes).includes(item.supplier_name ?? "Unknown")
                                  ? "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900"
                                  : "bg-slate-100 text-slate-600 border-slate-300 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-rose-950 dark:hover:text-rose-300 dark:hover:border-rose-900"
                              }`}
                              title="Mark as out of stock at this supplier"
                            >
                              Not here
                            </button>
                          )}
                          {item.purchased ? (
                            <CheckCircle className="w-5 h-5 text-brand-primary dark:text-brand-primary flex-shrink-0" />
                          ) : (
                            <Clock className="w-5 h-5 text-brand-primary flex-shrink-0" />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </PortalCard>

              {activeList.error && (
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-3 text-center">
                  {activeList.error}
                </p>
              )}
            </>
          )}
      </ShoppingPageShell>

      {/* Complete-list dialog */}
      <Dialog
        open={completeOpen}
        onOpenChange={(open) => {
          setCompleteOpen(open);
          if (!open) setNoReceiptReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark list complete</DialogTitle>
            <DialogDescription>
              Records the actual total spent and closes the list. A receipt or no-receipt reason is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="total">Actual total spent ({tenantCurrency.symbol})</Label>
              <Input
                id="total"
                type="number"
                min="0"
                step="0.01"
                value={actualTotalInput}
                onChange={e => setActualTotalInput(e.target.value)}
                placeholder="Leave blank if not known yet"
              />
            </div>
            {completionVariance?.shouldFlag && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>
                    Actual spend is {formatShoppingVariance(completionVariance)} estimate; admins will be notified when this list closes.
                  </p>
                </div>
              </div>
            )}
            {!activeList.list?.receipt_url && (
              <div>
                <Label htmlFor="no_receipt_reason">No receipt reason</Label>
                <Textarea
                  id="no_receipt_reason"
                  value={noReceiptReason}
                  onChange={(e) => setNoReceiptReason(e.target.value)}
                  placeholder="Supplier did not provide a slip, till offline, cash purchase, etc."
                  className="min-h-[84px]"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)} disabled={completing}>
              Cancel
            </Button>
            <Button
              onClick={handleCompleteConfirm}
              disabled={completing}
              className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-lg"
            >
              {completing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving</> : "Mark complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SHP2-A (SHP2-2): print-only view of the active shopping list.
          Hidden on screen via the print CSS below. One row per
          remaining item with a checkbox so the shopper can tick off
          on paper. Bought items at the bottom in muted style. */}
      <div id="print-shopping-staff-list" className="print-only">
        <h1 style={{ fontSize: "18pt", marginBottom: "6pt", fontFamily: "sans-serif" }}>
          {activeList.list?.title || "Shopping list"}
        </h1>
        <p style={{ fontSize: "10pt", color: "#475569", marginBottom: "14pt", fontFamily: "sans-serif" }}>
          {new Date().toLocaleDateString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          {" - "}
          {remaining.length} of {items.length} item{items.length === 1 ? "" : "s"} left
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt", fontFamily: "sans-serif" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #0f172a" }}>
              <th style={{ width: "24pt", textAlign: "left", padding: "4pt" }}> </th>
              <th style={{ textAlign: "left", padding: "4pt" }}>Item</th>
              <th style={{ textAlign: "right", padding: "4pt" }}>Qty</th>
              <th style={{ textAlign: "left", padding: "4pt" }}>Unit</th>
              <th style={{ textAlign: "left", padding: "4pt" }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderBottom: "1px solid #cbd5e1", pageBreakInside: "avoid", color: item.purchased ? "#94a3b8" : "#0f172a" }}>
                <td style={{ padding: "6pt 4pt" }}>
                  <span style={{ display: "inline-block", width: "14pt", height: "14pt", border: "1.5pt solid #0f172a", verticalAlign: "middle", backgroundColor: item.purchased ? "#0f172a" : "transparent" }} />
                </td>
                <td style={{ padding: "6pt 4pt", textDecoration: item.purchased ? "line-through" : "none" }}>
                  <strong>{item.name}</strong>
                </td>
                <td style={{ padding: "6pt 4pt", textAlign: "right" }}>
                  {Number(item.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
                <td style={{ padding: "6pt 4pt" }}>{item.unit || ""}</td>
                <td style={{ padding: "6pt 4pt", color: "#64748b" }}>{item.notes || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: "18pt", fontSize: "9pt", color: "#64748b", fontFamily: "sans-serif" }}>
          Generated {new Date().toLocaleString("en-ZA")} from CateringMS Shopping
        </p>
      </div>

      <style jsx global>{`
        @media print {
          @page { margin: 14mm; }
          body * { visibility: hidden !important; }
          #print-shopping-staff-list, #print-shopping-staff-list * { visibility: visible !important; }
          #print-shopping-staff-list {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
          }
        }
        @media not print {
          .print-only { display: none !important; }
        }
      `}</style>

      {/* SHP2-H (shopping deep audit, SHP2-22): barcode-scan FAB.
          Bottom-right floating camera button. Only renders when an
          active list exists. On scan-match the hook flips purchased
          via togglePurchased so the SHP2-B inventory chain still
          fires. */}
      <BarcodeScanFab
        companyId={companyId}
        visible={!!activeList.list}
        onScanMatch={async (inventoryItemId, barcode) => {
          const r = await activeList.tickByInventoryItemId(inventoryItemId);
          if (!r.found) {
            toast({
              title: "Found in inventory, not on your list",
              description: "Tap Add to buy list to bring it onto today’s run.",
            });
            return;
          }
          if (r.alreadyPurchased) {
            toast({
              title: "Already ticked: " + (r.itemName ?? "item"),
              description: "Barcode " + barcode + " matched but already bought.",
            });
          }
        }}
      />

      <ChatBot userRole="shopping" companyId={companyId} />
    </>
  );
}

// SHP2-D (shopping deep audit, SHP2-7 / SHP2-31): defense-in-depth.
// Every admin dashboard in the audit programme wraps in ProtectedRoute;
// this page did not. shopping_staff owns the buy-now flow, region_admin
// reads regional shops, admin trio supports cross-tenant.
export default function ShoppingDashboard() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SHOPPING_STAFF, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.REGION_ADMIN, UserRole.ADMIN]}>
      <ShoppingDashboardInner />
    </ProtectedRoute>
  );
}
