/* eslint-disable @typescript-eslint/no-explicit-any */
// KIT3-E (task #248): @ts-nocheck removed; this file is type-checked.
// Remaining `any` casts are isolated to supabase realtime payloads
// and the `equipment_items` JSONB column shape.
import { useEffect, useMemo, useState, useCallback } from "react";
import Head from "next/head";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList, ChefHat, Calendar, Users, MapPin, Clock,
  AlertTriangle, CheckCircle2, ShoppingCart, Layers, Package, Info, ExternalLink,
} from "lucide-react";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader } from "@/components/portal/ui";
import { KitchenNav } from "@/components/navigation/KitchenNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { canAccessAdminDashboard } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { supabase } from "@/integrations/supabase/client";
import { kitchenPrepService, type IngredientDemand } from "@/services/kitchenPrepService";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { toLocalISO } from "@/lib/localDate";
import { captureException } from "@/lib/observability";
import { onOrderUpdated } from "@/lib/events/orderEvents";
import { orderDisplayName } from "@/lib/orderDisplayName";
import { RefreshCw } from "lucide-react";

interface DemandRow {
  order_id: string;
  order_number: string;
  event_name: string;
  event_date: string;
  guest_count: number;
  order_status: string;
  menu_item_name: string;
  ingredient_name: string;
  unit: string | null;
  quantity_required: number;
  inventory_item_id: string | null;
}

interface OutlookRow {
  inventory_item_id: string;
  current_stock: number;
  unit_of_measure: string | null;
}

interface OrderRow {
  id: string;
  venue_address: string | null;
  event_time: string | null;
  client_name: string | null;
  /** From orders.equipment_items jsonb - shape:
   *  [{ equipment_id, name, category, quantity, unit_price, ... }] */
  equipment_items?: any[] | null;
  /** Allergen + dietary text the chef must see before they start prepping.
   *  Surfaced inline on each prep card so the kitchen doesn't have to back
   *  out to the order detail. */
  dietary_requirements?: string | null;
  kitchen_instructions?: string | null;
  special_instructions?: string | null;
}

const dayBucket = (d: string, today: Date) => {
  const date = new Date(d + "T00:00:00");
  const diff = Math.floor((date.getTime() - today.getTime()) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff <= 7) return "This week";
  if (diff <= 14) return "Next week";
  return "Later";
};

type ViewMode = "by_order" | "by_ingredient";

export default function KitchenPrepListPage() {
  const { profile } = useAuth();
  // Wave 70.44b - only show the "Open menu editor" / "Add recipes"
  // links to users who can actually open /admin/menu. Kitchen staff
  // get Access denied by the middleware (admin routes are gated to
  // admin roles). Bobby's brief: "Kitchen doesn't need an 'add recipe'
  // button. That is an admin/owner function". Admin users who
  // view-switch into the kitchen portal still see the link so they
  // can fix recipes inline.
  const canEditMenu = canAccessAdminDashboard((profile?.role || "") as UserRole);
  const { regionFilterId } = useRegionFilter();
  const { toast } = useToast();
  const [rows, setRows] = useState<DemandRow[]>([]);
  const [outlook, setOutlook] = useState<Record<string, OutlookRow>>({});
  const [orderMeta, setOrderMeta] = useState<Record<string, OrderRow>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("by_order");

  // Phase 1: aggregated demand across all orders in the window
  const [aggregated, setAggregated] = useState<IngredientDemand[]>([]);
  const [aggregatedLoading, setAggregatedLoading] = useState(true);

  // Phase 2 #3: kitchen prep lead hours drives the urgency calc. The
  // companies row was already a P1-11 source of truth; default 12h
  // matches the orderWorkflow lead-time warning.
  const [kitchenLeadHours, setKitchenLeadHours] = useState(12);

  // Wave 70.10 - separate count of confirmed orders in the same
  // window so the empty state can tell the chef "there's a job
  // booked but the menu items have no recipes attached" instead of
  // the misleading "Nothing booked yet" - the data shape that
  // previously hid the real cause.
  const [confirmedOrdersInWindow, setConfirmedOrdersInWindow] = useState(0);

  // KIT3-E: horizon selector. Chef gets to pick how far out the pull
  // list looks. 30d (default) covers a whole month for tenants that
  // plan ahead; 7d / 14d narrows the view to the imminent prep load.
  const [horizonDays, setHorizonDays] = useState<7 | 14 | 30>(7);
  // "As of" timestamp - last successful load. Surfaces in the
  // header so the chef knows whether the screen is fresh.
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const companyId = profile?.company_id;
    if (!companyId) return;
    // `cancelled` is a no-op flag now (load() is callable from
    // multiple sources, not anchored to a single useEffect closure
    // that flips it on unmount). The inner `if (!cancelled)` guards
    // are kept so the structure stays the same and a future
    // concurrent-load abort can flip it.
    const cancelled = false;
    setLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = toLocalISO(today);
      const horizon = toLocalISO(new Date(today.getTime() + horizonDays * 86400000));

      const [demandRes, outlookRes] = await Promise.all([
        supabase
          .from("order_ingredient_demand")
          .select("*")
          .eq("company_id", companyId)
          .gte("event_date", todayStr)
          .in("order_status", ["confirmed", "preparing", "ready", "in_transit", "delivered"])
          .order("event_date", { ascending: true }),
        supabase
          .from("inventory_demand_outlook")
          .select("inventory_item_id, current_stock, unit_of_measure")
          .eq("company_id", companyId),
      ]);
      if (cancelled) return;
      if (demandRes.error) console.error("demand", demandRes.error);

      const demandRows = (demandRes.data || []) as DemandRow[];
      setRows(demandRows);

      const outlookMap: Record<string, OutlookRow> = {};
      (outlookRes.data || []).forEach((o: any) => {
        if (o.inventory_item_id) outlookMap[o.inventory_item_id] = o;
      });
      setOutlook(outlookMap);

      const orderIds = Array.from(new Set(demandRows.map((d) => d.order_id)));
      if (orderIds.length) {
        // Pull equipment_items alongside the venue / time meta so the
        // kitchen knows what to pack for each order, not just what to
        // cook. The quote builder writes equipment_items as a JSONB
        // array of { equipment_id, name, category, quantity, ... }.
        const { data: orders } = await supabase
          .from("orders")
          // equipment_items lives on the linked quote, not orders.
          .select("id, venue_address, event_time, client_name, dietary_requirements, kitchen_instructions, special_instructions, quote:quotes!orders_quote_id_fkey(equipment_items)")
          .in("id", orderIds);
        const map: Record<string, OrderRow> = {};
        (orders || []).forEach((o: any) => { map[o.id] = { ...o, equipment_items: o.quote?.equipment_items ?? null }; });
        if (!cancelled) setOrderMeta(map);
      }

      // Pull the company's kitchen lead hours so the urgency calc
      // matches what the order-confirm flow warns about. Single read
      // per page mount, cheap; failures fall back to the 12h default.
      try {
        const { data: companyRow } = await supabase
          .from("companies")
          .select("kitchen_prep_lead_hours")
          .eq("id", companyId)
          .maybeSingle();
        if (!cancelled && (companyRow as any)?.kitchen_prep_lead_hours != null) {
          setKitchenLeadHours(Number((companyRow as any).kitchen_prep_lead_hours));
        }
      } catch (e) {
        // Default already set; not worth toast-ing the user.
      }

      // Wave 70.10 - separate count of confirmed orders in the
      // window so the empty state can distinguish "no orders" from
      // "orders exist but no recipes attached".
      try {
        const { count } = await (supabase as any)
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .gte("event_date", todayStr)
          .lte("event_date", horizon)
          .in("status", ["confirmed", "preparing", "ready", "in_transit", "delivered"]);
        if (!cancelled) setConfirmedOrdersInWindow(count || 0);
      } catch (e) {
        captureException(e, {
          tags: { route: "/team-portal/kitchen/prep-list", step: "orders-count", companyId },
        });
      }

      setLoading(false);

      // Aggregated demand runs in parallel via the kitchen prep service
      setAggregatedLoading(true);
      try {
        const agg = await kitchenPrepService.getAggregatedDemand(companyId, todayStr, horizon, regionFilterId);
        if (!cancelled) setAggregated(agg);
      } catch (e) {
        captureException(e, {
          tags: { route: "/team-portal/kitchen/prep-list", step: "aggregated-demand", companyId },
        });
      } finally {
        if (!cancelled) setAggregatedLoading(false);
        if (!cancelled) setLastLoadedAt(new Date());
      }
    } catch (loadErr) {
      captureException(loadErr, {
        tags: { route: "/team-portal/kitchen/prep-list", step: "load", companyId },
      });
      setLoading(false);
    }
    // The cancelled flag is no longer scoped to a useEffect closure;
    // load() is callable from realtime + refresh. State writes inside
    // are guarded by the local cancelled var which stays false for the
    // current invocation. We leave it in place for the read-aborts
    // inside the await sites above; concurrent invocations rely on
    // setState being a no-op when the most recent value wins.
    void cancelled;
  }, [profile?.company_id, regionFilterId, horizonDays]);

  // Initial load + refire when the deps change (region scope, horizon).
  useEffect(() => {
    load();
  }, [load]);

  // KIT3-E: realtime subscriptions + cross-tab event bus. Without
  // these the chef has to reload to see a new booking land. Debounced
  // through a 400ms timer so a chatty tenant doesn't burn requests.
  useEffect(() => {
    const companyId = profile?.company_id;
    if (!companyId) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (document.hidden) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        load();
      }, 400);
    };
    const sub = supabase
      .channel(`kitchen-prep-list-${companyId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "*", schema: "public", table: "orders",
        filter: `company_id=eq.${companyId}`,
      }, refresh)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "*", schema: "public", table: "order_items",
      }, refresh)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "UPDATE", schema: "public", table: "inventory_items",
        filter: `company_id=eq.${companyId}`,
      }, refresh)
      .subscribe();
    const offBus = onOrderUpdated(() => { refresh(); });
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      offBus();
      void sub.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id]);

  // ── Group by order ────────────────────────────────────────────────
  const orders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const map = new Map<string, {
      order_id: string;
      order_number: string;
      event_name: string;
      event_date: string;
      guest_count: number;
      order_status: string;
      bucket: string;
      menu: Map<string, { menu_item_name: string }>;
      ingredients: { ingredient_name: string; unit: string | null; quantity: number; inventory_item_id: string | null }[];
    }>();
    rows.forEach((r) => {
      let entry = map.get(r.order_id);
      if (!entry) {
        entry = {
          order_id: r.order_id,
          order_number: r.order_number,
          event_name: r.event_name,
          event_date: r.event_date,
          guest_count: r.guest_count,
          order_status: r.order_status,
          bucket: dayBucket(r.event_date, today),
          menu: new Map(),
          ingredients: [],
        };
        map.set(r.order_id, entry);
      }
      if (!entry.menu.has(r.menu_item_name)) {
        entry.menu.set(r.menu_item_name, { menu_item_name: r.menu_item_name });
      }
      entry.ingredients.push({
        ingredient_name: r.ingredient_name,
        unit: r.unit,
        quantity: Number(r.quantity_required),
        inventory_item_id: r.inventory_item_id,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.event_date.localeCompare(b.event_date));
  }, [rows]);

  // Phase 2 #3: compute prep urgency per order. The chef cards now
  // surface a tier (critical / high / watch / ok) and the in-bucket
  // sort uses urgency_score directly instead of just date+time so
  // big jobs and tight events rank above leisurely ones on the same
  // day. Inputs:
  //   slackHours = (event_start - now) - kitchen_prep_lead_hours
  //   guestPressure = clamp(guest_count / 50, 1, 3) - big jobs are
  //     less recoverable when something slips
  //   statusBoost = +6h penalty if order is still 'confirmed' but the
  //     event is within the lead window (chef hasn't started)
  // Tiers: critical <= 0h slack, high <= 4h, watch <= 12h, else ok.
  const urgencyOf = (
    o: { event_date: string; guest_count: number; order_status: string },
    meta: OrderRow | undefined,
  ) => {
    let eventTs: number;
    if (meta?.event_time) {
      const composed = new Date(`${o.event_date}T${meta.event_time}`);
      eventTs = isNaN(composed.getTime())
        ? new Date(o.event_date + "T12:00:00").getTime()
        : composed.getTime();
    } else {
      // No stamped time -> assume midday for sort stability. The lead
      // window of 12h means a noon event still surfaces as urgent
      // overnight, which matches the chef's mental model.
      eventTs = new Date(o.event_date + "T12:00:00").getTime();
    }
    const hoursUntilEvent = (eventTs - Date.now()) / 3_600_000;
    const guestPressure = Math.min(3, Math.max(1, Number(o.guest_count || 0) / 50));
    let slackHours = hoursUntilEvent - kitchenLeadHours;
    // Confirmed-but-not-started inside the lead window = chef is late
    // to start. Bias the score downward so it ranks above same-slack
    // orders that ARE in progress.
    if (o.order_status === "confirmed" && hoursUntilEvent <= kitchenLeadHours) {
      slackHours -= 6;
    }
    // Score: lower = more urgent. Multiply slack by guestPressure
    // inverse so a 200-pax event with 4h slack ranks above a 30-pax
    // event with the same 4h slack.
    const score = slackHours / guestPressure;
    let tier: "critical" | "high" | "watch" | "ok";
    if (slackHours <= 0) tier = "critical";
    else if (slackHours <= 4) tier = "high";
    else if (slackHours <= 12) tier = "watch";
    else tier = "ok";
    return { tier, slackHours, score };
  };

  const grouped = useMemo(() => {
    // Priority sort within each bucket - urgency_score asc means the
    // tightest jobs appear first. Falls back to event_date / event_time
    // when scores tie. [P1-36 kept; Phase 2 #3 added urgency layer.]
    const priority = (
      a: { event_date: string; guest_count: number; order_status: string; order_id: string },
      b: typeof a,
    ) => {
      const ua = urgencyOf(a, orderMeta[a.order_id]);
      const ub = urgencyOf(b, orderMeta[b.order_id]);
      if (ua.score !== ub.score) return ua.score - ub.score;
      if (a.event_date !== b.event_date) return a.event_date < b.event_date ? -1 : 1;
      const at = orderMeta[a.order_id]?.event_time || null;
      const bt = orderMeta[b.order_id]?.event_time || null;
      if (!at && !bt) return 0;
      if (!at) return 1;
      if (!bt) return -1;
      return at < bt ? -1 : at > bt ? 1 : 0;
    };
    const buckets: Record<string, typeof orders> = {};
    orders.forEach((o) => {
      buckets[o.bucket] = buckets[o.bucket] || [];
      buckets[o.bucket].push(o);
    });
    return ["Today", "Tomorrow", "This week", "Next week", "Later"]
      .filter((b) => buckets[b]?.length)
      .map((b) => ({
        name: b,
        items: [...buckets[b]].sort(priority),
      }));
    // urgencyOf depends on orderMeta + kitchenLeadHours, so list both.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, orderMeta, kitchenLeadHours]);

  const shortfallCount = aggregated.filter(d => d.shortfall > 0).length;
  const [creatingList, setCreatingList] = useState(false);

  // KIT3-E (task #248): wire the per-ingredient "Add to list" CTA
  // to actually write a shopping_list_item row instead of toasting
  // a lie. Reuses the same createShoppingListFromShortfall helper
  // with a single-item array so procurement sees the row immediately.
  const [addingId, setAddingId] = useState<string | null>(null);
  const handleAddToShoppingList = async (d: IngredientDemand) => {
    const companyId = profile?.company_id;
    const userId = (profile as { id?: string } | null)?.id;
    if (!companyId || !userId) return;
    setAddingId(d.inventory_item_id || d.name);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const fromStr = toLocalISO(today);
      const toStr = toLocalISO(new Date(today.getTime() + horizonDays * 86400000));
      const result = await kitchenPrepService.createShoppingListFromShortfall(
        companyId,
        userId,
        [d],
        { from: fromStr, to: toStr },
      );
      // Three outcomes, each with its own toast so the chef knows exactly
      // what happened: result null = no shortfall (in stock); itemCount 0 =
      // already on the list (not added again); itemCount > 0 = newly added.
      if (!result) {
        toast({
          title: "Already in stock",
          description: `${d.name} has no shortfall right now - nothing to add.`,
        });
      } else if (result.itemCount > 0) {
        toast({
          title: "Added to shopping list",
          description: `${d.shortfall} ${d.unit} ${d.name} added. The shopping team has been notified.`,
        });
      } else {
        toast({
          title: "Already on the list",
          description: `${d.name} is already on the shopping list - not added again.`,
        });
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      captureException(e, {
        tags: { route: "/team-portal/kitchen/prep-list", step: "add-to-shopping-list", companyId },
      });
      toast({ title: "Could not add", description: err?.message, variant: "destructive" });
    } finally {
      setAddingId(null);
    }
  };

  // ── Phase 3: turn the entire aggregated shortfall into a real shopping
  //    list row + line items, one click. Removes the manual transcribe step
  //    that was burning chef time. ──
  const handleCreateShoppingList = async () => {
    const companyId = profile?.company_id;
    const userId = (profile as any)?.id;
    if (!companyId || !userId) return;
    setCreatingList(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const fromStr = toLocalISO(today);
      const toStr = toLocalISO(new Date(today.getTime() + horizonDays * 86400000));
      const result = await kitchenPrepService.createShoppingListFromShortfall(
        companyId,
        userId,
        aggregated,
        { from: fromStr, to: toStr },
      );
      if (!result) {
        toast({ title: "Nothing to buy", description: "No shortfalls in the current window." });
      } else if (result.itemCount > 0) {
        toast({
          title: "Shopping list updated",
          description: `${result.itemCount} item${result.itemCount === 1 ? "" : "s"} added. The shopping team has been notified.`,
        });
      } else {
        toast({
          title: "Already on the list",
          description: "Every short ingredient is already on the shopping list - nothing new added.",
        });
      }
    } catch (e: any) {
      toast({ title: "Could not create list", description: e?.message, variant: "destructive" });
    } finally {
      setCreatingList(false);
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Pull list - CateringMS</title></Head>
      <KitchenNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            icon={ClipboardList}
            title={
              <span className="flex items-center gap-2">
                Pull list
                <InfoTooltip content={`Everything you need to pull from stores. Two views: by order (one card per booking) or by ingredient (totals across the next ${horizonDays} days).`} />
              </span>
            }
            subtitle={`What to pull from stores. Across ${orders.length} order${orders.length === 1 ? "" : "s"} in the next ${horizonDays} days.`}
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                {/* KIT3-E: horizon picker + refresh + last-loaded chip. */}
                <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  {([7, 14, 30] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setHorizonDays(d)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        horizonDays === d
                          ? "bg-brand-primary text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => load()}
                  disabled={loading}
                  className="gap-1.5"
                  title={lastLoadedAt ? `Last loaded ${lastLoadedAt.toLocaleTimeString("en-ZA")}` : "Refresh"}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                {lastLoadedAt && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    As of {lastLoadedAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            }
          />

          {/* KIT3-E: recipe-gap banner. When the by-order view has
              ingredients (sourced from the order_ingredient_demand
              view which includes the buy-and-sell path) but the
              by-ingredient view is empty (sourced from
              getAggregatedDemand which used to be recipe-only),
              warn the chef that the aggregated shortfall calc may
              be lagging until the recipes are attached. The service
              now covers the buy-and-sell path too so this only
              fires in genuinely weird shapes; useful as a safety
              net. */}
          {!loading && !aggregatedLoading && rows.length > 0 && aggregated.length === 0 && (
            <PortalCard padded={false} className="border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20 mb-5">
              <div className="p-3 px-4 flex items-start gap-3 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                <p className="text-amber-900 dark:text-amber-200">
                  Per-order ingredients show below but the cross-order shortfall calc is empty. This usually means recipes haven&apos;t been attached for one or more menu items. Ask admin to add recipes in <span className="font-mono">Menu &rarr; edit item &rarr; Recipe</span>.
                </p>
              </div>
            </PortalCard>
          )}

          {/* Aggregated shortfall banner, Phase 3 wires the one-click
              "create shopping list" path so the chef never has to retype it. */}
          {!aggregatedLoading && shortfallCount > 0 && (
            <PortalCard padded={false} className="border-rose-300 bg-rose-50/40 dark:border-rose-900 dark:bg-rose-950/20 mb-5">
              <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <ShoppingCart className="w-5 h-5 text-rose-600 dark:text-rose-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">
                    {shortfallCount} ingredient{shortfallCount === 1 ? "" : "s"} short for upcoming orders
                  </p>
                  <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
                    Aggregated across every confirmed booking in the next {horizonDays} days.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setView("by_ingredient")}
                    className="border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    View shortfall list
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateShoppingList}
                    disabled={creatingList}
                    className="bg-brand-primary hover:opacity-90 text-white"
                  >
                    {creatingList ? "Creating..." : "Create shopping list"}
                  </Button>
                </div>
              </div>
            </PortalCard>
          )}

          {/* Wave 33.1: segmented control. Was two disconnected pills
              with text-xs that felt like an afterthought; now a single
              tinted container with two equally-weighted segments and
              tap-target-friendly padding for kitchen tablets. */}
          <div className="mb-5 flex w-full gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
            <button
              type="button"
              onClick={() => setView("by_order")}
              className={`flex-1 justify-center min-w-[140px] whitespace-nowrap px-4 py-2 text-sm font-medium rounded-md transition-all inline-flex items-center gap-2 ${
                view === "by_order"
                  ? "bg-brand-primary text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              By order
              <span className={`text-xs tabular-nums ${view === "by_order" ? "text-white/70" : "text-slate-400 dark:text-slate-500"}`}>
                {orders.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setView("by_ingredient")}
              className={`flex-1 justify-center min-w-[140px] whitespace-nowrap px-4 py-2 text-sm font-medium rounded-md transition-all inline-flex items-center gap-2 ${
                view === "by_ingredient"
                  ? "bg-brand-primary text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              By ingredient
              <span className={`text-xs tabular-nums ${view === "by_ingredient" ? "text-white/70" : "text-slate-400 dark:text-slate-500"}`}>
                {aggregated.length}
              </span>
            </button>
          </div>

          {loading ? (
            <div className="space-y-4" aria-busy="true" aria-label="Loading pull list">
              <div className="h-20 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse motion-reduce:animate-none" />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-48 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse motion-reduce:animate-none" />
                ))}
              </div>
            </div>
          ) : view === "by_ingredient" ? (
            // ── BY INGREDIENT view (aggregated demand across all orders) ──
            aggregated.length === 0 ? (
              // Wave 70.10 - smarter empty state. If there are
              // confirmed orders in the window but zero demand
              // rows, it's because the menu items have no recipes
              // attached. Tell the chef what's missing instead of
              // "no orders".
              confirmedOrdersInWindow > 0 ? (
                <PortalCard padded={false} className="border-amber-200 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/20">
                  <div className="py-12 px-6 text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
                      <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-500" />
                    </div>
                    <p className="font-semibold text-slate-900 dark:text-white mb-1">
                      {confirmedOrdersInWindow} order{confirmedOrdersInWindow === 1 ? "" : "s"} booked, but no ingredient demand yet
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                      The menu items on these orders don&apos;t have recipes attached. Recipes drive the prep + ingredient lists. Ask admin to add recipes in <span className="font-mono text-xs">Menu &rarr; edit item &rarr; Recipe section</span>.
                    </p>
                    {/* Wave 70.44b - role-gated. Kitchen role
                        gets Access denied on /admin/menu so we hide
                        the link entirely. Admin / owner who
                        view-switched into the kitchen portal still
                        see it so they can fix recipes inline. */}
                    {canEditMenu && (
                      <Link href="/admin/menu" className="inline-flex items-center gap-1 text-xs text-brand-primary hover:opacity-80 hover:underline mt-3 font-semibold">
                        Open menu editor <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </PortalCard>
              ) : (
                <PortalCard padded={false}>
                  <div className="py-16 px-6 text-center">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                      <Package className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                    </div>
                    <p className="font-semibold text-slate-900 dark:text-white mb-1">Nothing to pull</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">No confirmed orders need ingredients right now.</p>
                  </div>
                </PortalCard>
              )
            ) : (
              <PortalCard>
                <PortalCardHeader title={`Total demand - next ${horizonDays} days`} />
                <p className="text-xs text-slate-600 dark:text-slate-400 -mt-2 mb-3">
                  Sums every confirmed order's ingredient need against your current stock.
                  Shortfalls float to the top.
                </p>
                <div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="text-left py-2 pr-3 font-semibold">Ingredient</th>
                          <th className="text-right py-2 px-3 font-semibold">Need</th>
                          <th className="text-right py-2 px-3 font-semibold">On hand</th>
                          <th className="text-right py-2 px-3 font-semibold">Short</th>
                          <th className="text-left py-2 pl-3 font-semibold">Used by</th>
                          <th className="text-right py-2 pl-3 font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aggregated.map(d => {
                          const isShort = d.shortfall > 0;
                          return (
                            <tr key={`${d.name}-${d.unit}`} className={`border-b border-slate-100 dark:border-slate-800 ${isShort ? "bg-rose-50/40 dark:bg-rose-950/20" : ""}`}>
                              <td className="py-2 pr-3 font-medium text-slate-900 dark:text-white">{d.name}</td>
                              <td className="py-2 px-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                                {d.total_quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                <span className="text-slate-400 dark:text-slate-500 text-xs ml-1">{d.unit}</span>
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                                {d.on_hand.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </td>
                              <td className={`py-2 px-3 text-right tabular-nums font-semibold ${isShort ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                                {isShort ? d.shortfall.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0"}
                              </td>
                              <td className="py-2 pl-3 text-xs text-slate-600 dark:text-slate-400">
                                {d.used_by.length} order{d.used_by.length === 1 ? "" : "s"}
                                {d.used_by.length > 0 && (
                                  <span className="text-slate-400 dark:text-slate-500">
                                    {" · "}
                                    {Array.from(new Set(d.used_by.map(u => u.event_date))).slice(0, 2).join(", ")}
                                    {d.used_by.length > 2 && "..."}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 pl-3 text-right">
                                {isShort ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[11px] gap-1 border-brand-primary/30 text-brand-primary hover:bg-brand-primary/5"
                                    onClick={() => handleAddToShoppingList(d)}
                                  >
                                    <ShoppingCart className="w-3 h-3" />
                                    Add to list
                                  </Button>
                                ) : (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </PortalCard>
            )
          ) : grouped.length === 0 ? (
            // Wave 70.10 - same smart empty state as the by-
            // ingredient view: tell the chef what's actually wrong
            // when orders exist but the demand view is empty.
            confirmedOrdersInWindow > 0 ? (
              <PortalCard padded={false} className="border-amber-200 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/20">
                <div className="py-12 px-6 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-500" />
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white mb-1">
                    {confirmedOrdersInWindow} order{confirmedOrdersInWindow === 1 ? "" : "s"} booked, but nothing to prep
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                    The menu items on these orders don&apos;t have recipes attached, so the prep list can&apos;t show ingredients. Open the Production grid to see prep tasks (which use simpler timing fields), or ask admin to add recipes in <span className="font-mono text-xs">Menu &rarr; edit item &rarr; Recipe</span>.
                  </p>
                  <div className="inline-flex items-center gap-3 mt-3">
                    <Link href="/team-portal/kitchen/production" className="inline-flex items-center gap-1 text-xs text-brand-primary hover:opacity-80 hover:underline font-semibold">
                      Open production <ExternalLink className="w-3 h-3" />
                    </Link>
                    {/* Wave 70.44b - role-gated; see comment above. */}
                    {canEditMenu && (
                      <Link href="/admin/menu" className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 hover:underline font-semibold">
                        Add recipes <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>
              </PortalCard>
            ) : (
              <PortalCard padded={false}>
                <div className="py-16 px-6 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                    <ChefHat className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white mb-1">Nothing booked yet</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Confirmed orders land here once sales locks them in.</p>
                </div>
              </PortalCard>
            )
          ) : (
            // ── BY ORDER view (existing) ──
            <div className="space-y-8">
              {grouped.map((g) => (
                <div key={g.name}>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                    {g.name}
                    <span className="ml-2 text-slate-400 dark:text-slate-500 font-normal">
                      {g.items.length} order{g.items.length === 1 ? "" : "s"}
                    </span>
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {g.items.map((o) => {
                      const meta = orderMeta[o.order_id];
                      const menuItems = Array.from(o.menu.values());
                      const ingMap = new Map<string, { ingredient_name: string; unit: string | null; quantity: number; inventory_item_id: string | null }>();
                      o.ingredients.forEach((ing) => {
                        const key = ing.ingredient_name;
                        const ex = ingMap.get(key);
                        if (ex) {
                          ex.quantity += ing.quantity;
                        } else {
                          ingMap.set(key, { ...ing });
                        }
                      });
                      const ingredients = Array.from(ingMap.values());

                      // Per-ingredient stock check uses AGGREGATED on-hand from
                      // the cross-order projection so two orders sharing an
                      // ingredient don't both render "ok" when together they're short.
                      const aggMap = new Map(aggregated.map(a => [`${a.name.toLowerCase()}|${(a.unit || "").toLowerCase()}`, a]));

                      const urgency = urgencyOf(o, meta);
                      const urgencyBadge =
                        urgency.tier === "critical"
                          ? { label: "CRITICAL", className: "bg-rose-200 text-rose-900 dark:bg-rose-900/60 dark:text-rose-100" }
                          : urgency.tier === "high"
                            ? { label: "HIGH", className: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200" }
                            : urgency.tier === "watch"
                              ? { label: "WATCH", className: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200" }
                              : null;
                      const cardBorder =
                        urgency.tier === "critical"
                          ? "border-l-4 border-l-rose-600 dark:border-l-rose-500"
                          : urgency.tier === "high"
                            ? "border-l-4 border-l-rose-400 dark:border-l-rose-600"
                            : urgency.tier === "watch"
                              ? "border-l-4 border-l-amber-400 dark:border-l-amber-600"
                              : "";

                      return (
                        <PortalCard key={o.order_id} padded={false} className={cardBorder}>
                          <div className="p-5 pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                                  {/* event_name is often the literal
                                      "Untitled"; orderDisplayName falls back
                                      to the client name so the chef sees a
                                      real name. client_name lives on meta. */}
                                  <span className="truncate">
                                    {orderDisplayName({ event_name: o.event_name, client_name: meta?.client_name, order_number: o.order_number })}
                                  </span>
                                  <Badge variant="outline" className="text-[10px]">{o.order_number}</Badge>
                                  {urgencyBadge && (
                                    <Badge
                                      className={`text-[9px] font-bold tracking-wide border-0 ${urgencyBadge.className}`}
                                      title={`${urgency.slackHours.toFixed(1)}h slack vs ${kitchenLeadHours}h lead time`}
                                    >
                                      {urgencyBadge.label}
                                    </Badge>
                                  )}
                                </h3>
                                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(o.event_date).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}
                                  </span>
                                  {meta?.event_time && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" /> {meta.event_time}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Users className="w-3 h-3" /> {o.guest_count} pax
                                  </span>
                                </div>
                                {meta?.venue_address && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1">
                                    <MapPin className="w-3 h-3" />
                                    <span className="truncate">{meta.venue_address}</span>
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="p-5 pt-0 space-y-3">
                            {/* Dietary + kitchen + special notes pulled from
                                orders.* and shown inline so the chef sees
                                allergens / no-pork / vegan etc. without
                                opening the order detail. Kept compact and
                                only renders when there's something to say.
                                Closes the audit gap "kitchen prep card has
                                no allergen visibility on the row itself". */}
                            {(meta?.dietary_requirements || meta?.kitchen_instructions || meta?.special_instructions) && (
                              <div className="space-y-1.5">
                                {meta?.dietary_requirements && (
                                  <p className="text-[11px] text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded px-2 py-1.5 flex items-start gap-1.5">
                                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-rose-600 dark:text-rose-500" />
                                    <span><span className="font-semibold">Allergens / dietary:</span> {meta.dietary_requirements}</span>
                                  </p>
                                )}
                                {meta?.kitchen_instructions && (
                                  <p className="text-[11px] text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 flex items-start gap-1.5">
                                    <ChefHat className="w-3 h-3 mt-0.5 flex-shrink-0 text-slate-500 dark:text-slate-400" />
                                    <span><span className="font-semibold">Kitchen note:</span> {meta.kitchen_instructions}</span>
                                  </p>
                                )}
                                {meta?.special_instructions && (
                                  <p className="text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded px-2 py-1.5 flex items-start gap-1.5">
                                    <Info className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-500" />
                                    <span><span className="font-semibold">Note:</span> {meta.special_instructions}</span>
                                  </p>
                                )}
                              </div>
                            )}
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
                                Menu ({menuItems.length})
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {menuItems.map((m) => (
                                  <Badge key={m.menu_item_name} variant="secondary" className="text-xs">
                                    {m.menu_item_name}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            {/*
                              Equipment to pack, pulled from
                              orders.equipment_items jsonb. Sales
                              writes this on the quote, it persists
                              through the quote->order conversion, the
                              kitchen sees it here, the driver sees it
                              on their delivery card. End-to-end visibility.
                            */}
                            {Array.isArray(meta?.equipment_items) && meta.equipment_items.length > 0 && (
                              <div>
                                <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
                                  Equipment to pack ({meta.equipment_items.length})
                                </p>
                                <ul className="text-sm divide-y divide-slate-100 dark:divide-slate-800">
                                  {meta.equipment_items.map((eq: any, i: number) => {
                                    const fromStock = Number(eq.from_stock_qty);
                                    const fromHire = Number(eq.from_hire_qty);
                                    const hasSplit = Number.isFinite(fromStock) && Number.isFinite(fromHire) && (fromStock > 0 || fromHire > 0);
                                    return (
                                      <li key={`${eq.equipment_id ?? "x"}_${i}`} className="py-1.5 flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-slate-700 dark:text-slate-300 min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
                                          <span className="truncate">{eq.name || "(unnamed)"}</span>
                                          {eq.category && (
                                            <span className="text-[11px] text-slate-400 dark:text-slate-500">{eq.category}</span>
                                          )}
                                          {hasSplit && fromStock > 0 && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
                                              {fromStock} from stock
                                            </span>
                                          )}
                                          {hasSplit && fromHire > 0 && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
                                              {fromHire} hire-in
                                            </span>
                                          )}
                                        </span>
                                        <span className="text-xs font-semibold text-slate-900 dark:text-white flex-shrink-0">
                                          × {Number(eq.quantity) || 0}
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
                                Ingredients to pull
                                <InfoTooltip content="Quantity for this order, scaled to the guest count.\n\nA red warning is a real shortfall once you account for every other order using the same ingredient, not just this one." />
                              </p>
                              {/* Phase 6 #7: explicit scaling
                                  context. The ingredient list is
                                  the per-serving recipe quantity
                                  multiplied by guest_count, and
                                  capped by parallelism on cook
                                  duration (kitchenPrepService Phase
                                  1 #10). Without this header the
                                  chef has no anchor for why each
                                  number is what it is. */}
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 -mt-1 mb-2">
                                Recipes scaled for{" "}
                                <span className="font-semibold text-slate-700 dark:text-slate-300">{o.guest_count} guests</span>
                                {" - "}per-portion x guest_count.
                              </p>
                              <ul className="text-sm divide-y divide-slate-100 dark:divide-slate-800">
                                {ingredients.map((ing) => {
                                  // Look up aggregated shortfall for this ingredient
                                  const aggKey = `${ing.ingredient_name.toLowerCase()}|${(ing.unit || "").toLowerCase()}`;
                                  const agg = aggMap.get(aggKey);
                                  const isShortOverall = agg && agg.shortfall > 0;
                                  return (
                                    <li key={ing.ingredient_name} className="py-1.5 flex items-center justify-between gap-2">
                                      <span className="text-slate-700 dark:text-slate-300 truncate">{ing.ingredient_name}</span>
                                      <span className="flex items-center gap-2 flex-shrink-0">
                                        <span className="tabular-nums text-slate-900 dark:text-white font-medium">
                                          {Number(ing.quantity).toFixed(ing.quantity % 1 === 0 ? 0 : 2)} {ing.unit}
                                        </span>
                                        {isShortOverall ? (
                                          <span title={`Short ${agg!.shortfall} ${agg!.unit} across ${agg!.used_by.length} orders`}>
                                            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                                          </span>
                                        ) : agg ? (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                        ) : null}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          </div>
                        </PortalCard>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </PortalShell>
        <Footer />
      </div>
    </>
  );
}
