import { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChefHat, Clock, CheckCircle, Calendar, Users, Package, AlertTriangle, Truck, ExternalLink, Loader2, Printer } from "lucide-react";
import Link from "next/link";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { orderDisplayName } from "@/lib/orderDisplayName";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DynamicNav } from "@/components/DynamicNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile } from "@/components/portal/ui";
import { CleaningScheduleDialog } from "@/components/kitchen/CleaningScheduleDialog";
import { ChatBot } from "@/components/ChatBot";
import { KitchenServiceFAB } from "@/components/kitchen/KitchenServiceFAB";
import { KitchenStaffTileBoard } from "@/components/kitchen/KitchenStaffTileBoard";
import { TaskCompletionButtons } from "@/components/kitchen/TaskCompletionButtons";
// KIT2-L (kitchen deep audit, KIT2-41): per-task countdown chips
// over kitchen_prep_tasks. Lives on every preparing-column card,
// auto-expanded (no more <details>) so the chef sees timers
// without expanding each card.
import { PrepTaskTimer } from "@/components/kitchen/PrepTaskTimer";
// Wave 49 B3 - kitchen-to-driver handover surface. Mounts on every
// "ready" + "preparing" order so the kitchen lead has a single tap
// to sign food + equipment over to the driver. This row is the gate
// that confirmDepartedKitchen now refuses to bypass.
import { HandoverToDriverPanel } from "@/components/kitchen/HandoverToDriverPanel";
import { UserRole } from "@/types/app";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { useOrderRefreshSignal } from "@/hooks/useOrderRefreshSignal";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { kitchenPrepService } from "@/services/kitchenPrepService";
import { markOrderReady } from "@/services/order/orderWorkflow";
import { emitOrderUpdated, onOrderUpdated } from "@/lib/events/orderEvents";
import { onEquipmentDamaged } from "@/lib/events/equipmentEvents";
import { onCleaningReady } from "@/lib/events/cleaningEvents";
import { useToast } from "@/hooks/use-toast";
import { captureException } from "@/lib/observability";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";

type Order = Database["public"]["Tables"]["orders"]["Row"];
type InventoryItem = Database["public"]["Tables"]["inventory_items"]["Row"];

interface DamageAlert {
  id: string;
  orderId: string | null;
  equipmentName: string;
  orderLabel: string;
  quantity: number;
  damageType: string;
  createdAt: string;
}

function formatCountdown(mins: number): string {
  if (!isFinite(mins)) return "-";
  const sign = mins < 0 ? "-" : "";
  const abs = Math.abs(mins);
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const minutes = Math.floor(abs % 60);
  if (days > 0) return `${sign}${days}d ${hours}h`;
  if (hours > 0) return `${sign}${hours}h ${minutes}m`;
  return `${sign}${minutes}m`;
}

export default function KitchenDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  // Wave 70.18 - whether the signed-in user can open admin routes.
  // Admins viewing-as-kitchen still have role=admin so they get the
  // "Order detail" button; real kitchen_staff get just "Kitchen
  // ticket" (the middleware would 403 them on /admin/orders).
  const userRole = ((user as any)?.role || "").toString().toLowerCase();
  // KIT2-H (kitchen deep audit, KIT2-40): drop sales_admin from the
  // kitchen admin-tier gates. sales_admin's job is quote pipeline +
  // client comms; they shouldn't see force-close-stuck-order or the
  // /admin/orders deep-link from the kitchen tablet because:
  //   1. The force-close panel mutates kitchen + driver state -
  //      sales_admin has no operational context to call that
  //      shot.
  //   2. The /admin/orders panel surfaces internal margin + cost
  //      data that's owner/admin-only per the Skylight finance-
  //      visibility rule.
  // region_admin stays - they're an operational tier that does
  // run their region's kitchen.
  const canSeeAdminOrderDetail = ["super_admin", "company_admin", "admin", "owner", "region_admin"].includes(userRole);
  // TIGHTEN I.119 (2026-06-02): refetch when an order edit lands in any tab.
  const refreshSignal = useOrderRefreshSignal(user?.company_id ?? null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [lowStockItems, setLowStockItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [progressByOrder, setProgressByOrder] = useState<Record<string, { total: number; done: number }>>({});
  const [now, setNow] = useState(new Date());
  // Allergen confirmation dialog state - triggers when Mark Ready hits a
  // dietary clash, blocks the action until the chef explicitly overrides.
  const [allergenDialog, setAllergenDialog] = useState<{
    orderId: string;
    clientName?: string | null;
    conflicts: Array<{ menuItem: string; allergens: string[] }>;
    dietary: string;
  } | null>(null);

  // Phase 4: tomorrow + day-after preview, plus hot-hold tunable threshold.
  const [upcoming, setUpcoming] = useState<Array<{
    date: string;
    orders: number;
    guests: number;
    earliest_event_time: string | null;
    items: Array<{ id: string; event_name: string; client_name: string | null; event_time: string | null; guest_count: number; status: string }>;
  }>>([]);
  const [maxHotHoldMin, setMaxHotHoldMin] = useState(90);
  // KIT2-O (kitchen deep audit, KIT2-35 / KIT2-36 / KIT2-84): cleaning
  // readiness chip on the header. Tells the chef "of tomorrow's
  // cleaning jobs, X of Y are done" so the KIT2-A "Cleaning schedule"
  // CTA carries live state instead of being a static link. Bobby's
  // brief: "when cleaning team marks all of tomorrow's equipment
  // cleaned, kitchen flips a chip". V1 surfaces the count; CLN2-F
  // (pre-event cleanliness checklist) will add the formal "ready
  // for prep" signal later.
  const [cleaningReadiness, setCleaningReadiness] = useState<{
    total: number;
    complete: number;
  } | null>(null);

  // CLN2-F: per-order pre-event checklist status, keyed by order
  // id. Used by the print run sheet "Coming up" section so the
  // chef can see ready / not-ready on paper before service.
  const [checklistStatusByOrder, setChecklistStatusByOrder] = useState<Record<string, "ready" | "in_progress" | "pending">>({});

  // Cleaning schedule peek. Replaces the old Link-to-cleaning-portal
  // CTA that swapped sidebar + active-role lens. The chef opens a
  // read-only dialog instead so they can sense-check tomorrow's
  // cleaning state without leaving the kitchen portal.
  const [cleaningDialogOpen, setCleaningDialogOpen] = useState(false);

  // KIT3-A (kitchen second-pass audit, task #244): force-close
  // confirmation now goes through AlertDialog instead of window.confirm.
  // Native confirm() can be unreliable on Android tablets in fullscreen
  // kiosk mode and breaks the visual rhythm of the rest of the page
  // (the allergen gate below already uses AlertDialog).
  const [forceCloseConfirm, setForceCloseConfirm] = useState<{
    orderId: string;
    orderLabel: string;
  } | null>(null);

  // KIT3-A: realtime heartbeat tracker. The dashboard subscribes to
  // 5 postgres_changes events but if the channel drops (kitchen WiFi
  // is notoriously flaky), data goes stale silently. We stamp the
  // last realtime event and surface a quiet "Reconnecting..." chip
  // when it's been more than 2 minutes without any signal.
  const [lastRealtimeAt, setLastRealtimeAt] = useState<number>(Date.now());
  const [realtimeStale, setRealtimeStale] = useState(false);

  // KIT3-B (task #245): four pieces of deferred intel land here.
  //   1. Per-shift staffing flag - kitchen_duty_shifts where
  //      is_active=true counts as "on duty now". Compared to a
  //      simple workload rule (1 cook per 30 guests today) to flag
  //      understaffing.
  //   2. Ingredient-stockout cascade - low-stock inventory items
  //      cross-referenced through menu_items.linked_inventory_item_id
  //      against order_items.menu_item_id to surface "low stock
  //      blocks N active orders".
  //   3. Critical-path bottleneck - the oldest in-progress prep
  //      task whose started_at is more than 90 min ago and which
  //      still has no completed_at.
  //   4. Region scoping - if the kitchen_staff user has a region_id
  //      set, every query filters to that branch's orders + tasks.
  const [onDutyCount, setOnDutyCount] = useState<number>(0);
  const [blockedOrdersByItem, setBlockedOrdersByItem] = useState<
    Array<{ inventoryItemId: string; itemName: string; orderCount: number; orderLabels: string[] }>
  >([]);
  const [bottleneckTask, setBottleneckTask] = useState<{
    taskId: string;
    orderId: string;
    menuItemName: string;
    startedAt: string;
    minsRunning: number;
    orderLabel: string;
  } | null>(null);
  const regionId = (user as { region_id?: string | null } | null)?.region_id ?? null;

  // KIT2-R (kitchen deep audit, KIT2-34 / KIT2-85): ingredient delta
  // banner. When the shopper ticks items on /team-portal/shopping
  // (SHP2-B bumps inventory_items.current_stock), we want the kitchen
  // lead to see WHICH ingredients just arrived without scrolling the
  // Low Stock list. Keyed by inventory item id so a second restock of
  // the same item replaces the prior entry instead of doubling up.
  // Cleared on the per-mount "Got it" dismiss action.
  const [restockDeltas, setRestockDeltas] = useState<Record<string, { name: string; delta: number; unit: string }>>({});
  const [damageAlerts, setDamageAlerts] = useState<DamageAlert[]>([]);

  // Tick the clock every minute so countdowns stay live without polling the DB
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (user?.company_id) {
      loadDashboardData();
    }
  }, [user?.company_id, refreshSignal]);

  // KIT2-Q (kitchen deep audit, KIT2-44 / KIT2-79): supabase realtime
  // sub on orders + kitchen_prep_tasks + order_items, scoped to the
  // tenant. The kitchen lead's tablet refreshes within seconds when:
  //   - admin / dispatcher flips an order status from another tab
  //   - the driver acks pickup
  //   - a prep task is ticked on a sibling device
  //   - the chef adjusts the order_items on the admin orders page
  //
  // Combined with the cateringms:order-updated event bus listener
  // below, this covers BOTH cross-device (channel) and in-browser
  // cross-tab (event) cases. Visibility-aware: pauses while the tab
  // is hidden so 8 open tabs in the kitchen don't burn CPU.
  useEffect(() => {
    if (!user?.company_id) return;
    let closed = false;
    let pendingWhileHidden = false;
    // KIT3-A (task #244): debounce realtime refreshes. 5 channels x
    // postgres_changes can fire dozens of times per minute on a busy
    // tenant. Coalesce into one refresh per 400ms so the chef's
    // tablet isn't burning the network on every prep-task tick from
    // the kanban itself.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (document.hidden) {
        pendingWhileHidden = true;
        return;
      }
      setLastRealtimeAt(Date.now());
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        loadDashboardData();
      }, 400);
    };
    const onVisibility = () => {
      if (!document.hidden && pendingWhileHidden) {
        pendingWhileHidden = false;
        loadDashboardData();
      }
    };
    // Window focus also triggers a refresh - covers the case where
    // a chef switches back from a sibling tab.
    const onFocus = () => { refresh(); };

    const pushDamageAlert = (alert: DamageAlert) => {
      setDamageAlerts((prev) => [alert, ...prev.filter((a) => a.id !== alert.id)].slice(0, 5));
      toast({
        title: "Damage flagged during service",
        description: `${alert.quantity}x ${alert.equipmentName} marked ${alert.damageType} on ${alert.orderLabel}.`,
      });
    };

    const handleDamageInsert = async (payload: any) => {
      const row = payload?.new;
      if (!row || row.company_id !== user.company_id) return;
      try {
        const [eqRes, orderRes] = await Promise.all([
          row.equipment_id
            ? (supabase as any).from("equipment").select("name").eq("id", row.equipment_id).maybeSingle()
            : Promise.resolve({ data: null }),
          row.order_id
            ? (supabase as any).from("orders").select("order_number, event_name, client_name").eq("id", row.order_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        if (closed) return;
        const orderRow = orderRes?.data;
        pushDamageAlert({
          id: row.id,
          orderId: row.order_id || null,
          equipmentName: eqRes?.data?.name || "Equipment",
          orderLabel: orderRow?.order_number || orderRow?.event_name || orderRow?.client_name || "an order",
          quantity: Number(row.quantity_damaged || 1),
          damageType: String(row.damage_type || "damaged").replace(/_/g, " "),
          createdAt: row.created_at || new Date().toISOString(),
        });
      } catch (err) {
        console.warn("[kitchen/dashboard] damage alert lookup failed:", err);
      }
      refresh();
    };

    const sub = supabase
      .channel(`kitchen-dashboard-${user.company_id}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "*", schema: "public", table: "orders",
        filter: `company_id=eq.${user.company_id}`,
      }, refresh)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "*", schema: "public", table: "kitchen_prep_tasks",
        filter: `company_id=eq.${user.company_id}`,
      }, refresh)
      // CLN2-F: cleaning_event_checklists drives the chip now.
      // A cleaner ticking the last required item on another device
      // should flip this tablet to green within a beat.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "*", schema: "public", table: "cleaning_event_checklists",
        filter: `company_id=eq.${user.company_id}`,
      }, refresh)
      // CLI-J (CLI-31): catch inbound client-facing chat threads
      // on this tenant. The bell broadcast surfaces the actual
      // message ping; refresh() keeps any derived state on the
      // dashboard (counts, badges) in sync alongside it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "INSERT", schema: "public", table: "order_chat_messages",
        filter: `company_id=eq.${user.company_id}`,
      }, refresh)
      // T.003: cleaning damage reports need to reach the kitchen lead
      // while service is still live, not just the admin equipment queue.
      // This INSERT listener drives the toast + alert strip below.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "INSERT", schema: "public", table: "equipment_damages",
        filter: `company_id=eq.${user.company_id}`,
      }, handleDamageInsert)
      // KIT2-R (KIT2-34 / KIT2-85): inventory_items UPDATE feeds the
      // ingredient delta banner. We compute new.current_stock minus
      // old.current_stock and, if positive, surface the item name +
      // delta. refresh() also runs so the Low Stock card recomputes.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "UPDATE", schema: "public", table: "inventory_items",
        filter: `company_id=eq.${user.company_id}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }, (payload: any) => {
        const next = payload?.new;
        const prev = payload?.old;
        if (next && prev) {
          const nextStock = Number(next.current_stock) || 0;
          const prevStock = Number(prev.current_stock) || 0;
          const delta = nextStock - prevStock;
          if (delta > 0 && next.item_name) {
            // Kitchen persona follow-up (kitchen.md 5.6): previously
            // a second restock of the same item replaced the first
            // entry (object spread overwrites the key). Chef saw the
            // latest delta but lost any earlier ones from the same
            // shift. Now we accumulate the delta on existing entries
            // so two restocks of the same item read as "+ X total"
            // instead of just the most recent.
            setRestockDeltas((curr) => {
              const existing = curr[next.id];
              const cumulative = existing ? existing.delta + delta : delta;
              return {
                ...curr,
                [next.id]: {
                  name: next.item_name as string,
                  delta: cumulative,
                  unit: (next.unit_of_measure as string) || "",
                },
              };
            });
          }
        }
        refresh();
      })
      .subscribe();

    // In-browser cross-tab bus. The dispatch / orders / driver
    // pages emit this on mutations - the listener catches them
    // even when the postgres channel is mid-reconnect.
    const offBus = onOrderUpdated(() => { refresh(); });
    // CLN2-I: when a cleaner flags damaged equipment, the
    // KIT2-O cleaning readiness chip should re-roll-up
    // cleaning_jobs vs damages immediately. Postgres realtime on
    // cleaning_jobs is not subscribed here - this bus fills the
    // gap without paying for another channel.
    const offDamage = onEquipmentDamaged((detail) => {
      pushDamageAlert({
        id: `${detail.orderId || "order"}-${detail.equipmentId}-${Date.now()}`,
        orderId: detail.orderId || null,
        equipmentName: detail.equipmentId ? `Equipment ${detail.equipmentId.slice(0, 8)}` : "Equipment",
        orderLabel: detail.orderId ? `order ${detail.orderId.slice(0, 8)}` : "an order",
        quantity: Number(detail.quantity || 1),
        damageType: detail.damageType,
        createdAt: new Date().toISOString(),
      });
      refresh();
    });

    // CLN2-F same-device fast path: the cleaning dashboard fires
    // cateringms:cleaning-ready as soon as the supabase write
    // returns. Catches the same-tablet case before the channel
    // round-trips back.
    const offCleaning = onCleaningReady(() => { refresh(); });

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      if (debounceTimer) clearTimeout(debounceTimer);
      offBus();
      offDamage();
      offCleaning();
      void sub.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  // KIT3-A: tick the stale watcher. Anything older than 2 minutes
  // since the last realtime event when the tab is visible flips the
  // chip; the next event clears it.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      setRealtimeStale(Date.now() - lastRealtimeAt > 120_000);
    }, 15_000);
    return () => clearInterval(id);
  }, [lastRealtimeAt]);

  const loadDashboardData = async () => {
    if (!user?.company_id) return;

    try {
      setLoading(true);

      // KIT2-G (kitchen deep audit, KIT2-12 / KIT2-67 / KIT2-69):
      // Three fixes batched in this query:
      //   1. Local-timezone date boundary. Pre-fix this used
      //      `new Date().toISOString().split("T")[0]` which converts
      //      to UTC first - at 02:00 SAST on a Sunday the page was
      //      already serving Monday's events. Use the local-tz
      //      helper instead.
      //   2. Soft-delete guard. The `orders` table has a deleted_at
      //      column and the rest of the codebase respects it; the
      //      kitchen page did not. A soft-deleted order silently
      //      remained on the prep board.
      //   3. Server-side LIMIT. Without it, a tenant with 30+
      //      events on the same weekend would pull all rows and
      //      let the kitchen lead scroll through 8 pages of cards.
      //      Cap at 50 - the kitchen workload-per-period rarely
      //      exceeds that, and the truncated view forces filtering
      //      via tabs / Plenty-of-time rather than firehose render.
      const localToday = new Date();
      const todayIso = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, "0")}-${String(localToday.getDate()).padStart(2, "0")}`;
      const sevenDaysFromNow = new Date(localToday);
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 6);
      const horizonIso = `${sevenDaysFromNow.getFullYear()}-${String(sevenDaysFromNow.getMonth() + 1).padStart(2, "0")}-${String(sevenDaysFromNow.getDate()).padStart(2, "0")}`;

      // KIT3-B: region scoping. A kitchen_staff user with a
      // region_id set only sees orders for their branch. Single-
      // region tenants leave region_id null on the profile and the
      // .eq is skipped, so the existing behaviour stays intact.
      let ordersQuery = supabase
        .from("orders")
        .select("*")
        .eq("company_id", user.company_id)
        .is("deleted_at", null)
        .gte("event_date", todayIso)
        .lte("event_date", horizonIso)
        .in("status", ["confirmed", "preparing", "ready"])
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true })
        .limit(50);
      if (regionId) {
        ordersQuery = ordersQuery.eq("region_id", regionId);
      }
      // Load low stock items. PostgREST can't compare two columns in a
      // filter (the old `.filter("current_stock","lt","minimum_stock")` sent
      // the literal string "minimum_stock" and 400'd with 22P02, so the Low
      // Stock card was permanently broken). Fetch ordered by current_stock and
      // filter current_stock <= minimum_stock client-side, like every other
      // low-stock view in the app (LowStockAlerts, admin dashboard).
      // KIT3-B: region scoping. inventory_items has region_id on
      // multi-branch tenants; null on single-region. Same conditional
      // pattern as the orders query above.
      let invQuery = supabase
        .from("inventory_items")
        .select("*")
        .eq("company_id", user.company_id)
        .order("current_stock", { ascending: true });
      if (regionId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        invQuery = (invQuery as any).eq("region_id", regionId);
      }

      // Orders and low-stock are independent reads - run them in parallel so
      // the board load costs one round-trip instead of two.
      const [
        { data: ordersData, error: ordersError },
        { data: inventoryData, error: inventoryError },
      ] = await Promise.all([ordersQuery, invQuery]);

      if (ordersError) {
        captureException(ordersError, {
          tags: { route: "/team-portal/kitchen/dashboard", step: "load-orders", companyId: user.company_id },
        });
      } else {
        setOrders(ordersData || []);
      }

      if (inventoryError) {
        captureException(inventoryError, {
          tags: { route: "/team-portal/kitchen/dashboard", step: "load-low-stock", companyId: user.company_id },
        });
      } else {
        const lowStock = (inventoryData || []).filter(
          (item: InventoryItem) =>
            item.current_stock != null &&
            item.minimum_stock != null &&
            item.current_stock <= item.minimum_stock,
        );
        setLowStockItems(lowStock.slice(0, 5));
      }

      // Phase 1: load prep task progress per order in one shot
      const orderIds = (ordersData || []).map((o: any) => o.id);
      if (orderIds.length > 0) {
        const prog = await kitchenPrepService.getProgressByOrder(orderIds);
        setProgressByOrder(prog);
      } else {
        setProgressByOrder({});
      }

      // KIT3-B (1): on-duty count. kitchen_duty_shifts rows where
      // is_active=true count as "currently on the clock". Used by
      // the staffing-flag chip below.
      try {
        const { count: dutyCount } = await (supabase as any)
          .from("kitchen_duty_shifts")
          .select("id", { count: "exact", head: true })
          .eq("company_id", user.company_id)
          .eq("is_active", true)
          .is("shift_end", null);
        setOnDutyCount(dutyCount ?? 0);
      } catch (dutyErr) {
        captureException(dutyErr, {
          tags: { route: "/team-portal/kitchen/dashboard", step: "load-on-duty", companyId: user.company_id },
        });
      }

      // KIT3-B (3): critical-path bottleneck. The oldest in-progress
      // prep task with started_at > 90 min ago and completed_at NULL.
      // One query, no per-order N+1. Region-scoped when applicable.
      try {
        const ninetyMinAgo = new Date(Date.now() - 90 * 60_000).toISOString();
        let btQuery = (supabase as any)
          .from("kitchen_prep_tasks")
          .select("id, order_id, menu_item_name, started_at")
          .eq("company_id", user.company_id)
          .is("completed_at", null)
          .not("started_at", "is", null)
          .lt("started_at", ninetyMinAgo)
          .order("started_at", { ascending: true })
          .limit(1);
        if (regionId) btQuery = btQuery.eq("region_id", regionId);
        const { data: btRows } = await btQuery;
        const btRow = (btRows && btRows[0]) || null;
        if (btRow) {
          const order = (ordersData || []).find((o: any) => o.id === btRow.order_id);
          const orderLabel = order
            ? orderDisplayName({ event_name: order.event_name, client_name: order.client_name, order_number: order.order_number })
            : "Order";
          const startedAt = new Date(btRow.started_at);
          const minsRunning = Math.floor((Date.now() - startedAt.getTime()) / 60_000);
          setBottleneckTask({
            taskId: btRow.id,
            orderId: btRow.order_id,
            menuItemName: btRow.menu_item_name || "Prep task",
            startedAt: btRow.started_at,
            minsRunning,
            orderLabel,
          });
        } else {
          setBottleneckTask(null);
        }
      } catch (btErr) {
        captureException(btErr, {
          tags: { route: "/team-portal/kitchen/dashboard", step: "load-bottleneck", companyId: user.company_id },
        });
      }

      // KIT3-B (2): ingredient-stockout cascade. Low-stock inventory
      // items -> menu_items.linked_inventory_item_id -> order_items
      // -> active orders. Surfaces "low stock blocks N orders" with
      // the order labels so the chef can act on the cascade not just
      // the symptom.
      try {
        const lowIds = (inventoryData || []).map((it: any) => it.id);
        if (lowIds.length > 0 && orderIds.length > 0) {
          const { data: blockedMenuItems } = await (supabase as any)
            .from("menu_items")
            .select("id, item_name, linked_inventory_item_id")
            .eq("company_id", user.company_id)
            .in("linked_inventory_item_id", lowIds);
          const blockedMenuIds = (blockedMenuItems || []).map((m: any) => m.id);

          if (blockedMenuIds.length > 0) {
            const { data: blockedOrderItems } = await (supabase as any)
              .from("order_items")
              .select("menu_item_id, order_id")
              .in("menu_item_id", blockedMenuIds)
              .in("order_id", orderIds);

            // Roll up by inventory item id so the operator sees one
            // row per ingredient, not one per order_item.
            const ordersByInvItem = new Map<string, Set<string>>();
            for (const oi of (blockedOrderItems || []) as any[]) {
              const mi = (blockedMenuItems || []).find((m: any) => m.id === oi.menu_item_id);
              if (!mi) continue;
              const invId = mi.linked_inventory_item_id;
              if (!invId) continue;
              if (!ordersByInvItem.has(invId)) ordersByInvItem.set(invId, new Set());
              ordersByInvItem.get(invId)!.add(oi.order_id);
            }

            const orderLabelById = new Map<string, string>();
            for (const o of (ordersData || []) as any[]) {
              orderLabelById.set(o.id, orderDisplayName({ event_name: o.event_name, client_name: o.client_name, order_number: o.order_number }));
            }

            const blocked: Array<{ inventoryItemId: string; itemName: string; orderCount: number; orderLabels: string[] }> = [];
            for (const inv of (inventoryData || []) as any[]) {
              const set = ordersByInvItem.get(inv.id);
              if (!set || set.size === 0) continue;
              blocked.push({
                inventoryItemId: inv.id,
                itemName: inv.item_name || "Ingredient",
                orderCount: set.size,
                orderLabels: Array.from(set).map((oid) => orderLabelById.get(oid) || "Order"),
              });
            }
            blocked.sort((a, b) => b.orderCount - a.orderCount);
            setBlockedOrdersByItem(blocked);
          } else {
            setBlockedOrdersByItem([]);
          }
        } else {
          setBlockedOrdersByItem([]);
        }
      } catch (cascadeErr) {
        captureException(cascadeErr, {
          tags: { route: "/team-portal/kitchen/dashboard", step: "load-stockout-cascade", companyId: user.company_id },
        });
      }

      // Phase 4: tomorrow + day-after preview and hot-hold threshold
      try {
        const preview = await kitchenPrepService.getUpcomingPreview(user.company_id, 2);
        setUpcoming(preview);
      } catch (pErr) {
        captureException(pErr, {
          tags: { route: "/team-portal/kitchen/dashboard", step: "load-upcoming", companyId: user.company_id },
        });
      }
      try {
        const { data: company, error: companyError } = await supabase
          .from("companies")
          .select("kitchen_settings")
          .eq("id", user.company_id)
          .maybeSingle();
        if (companyError) {
          captureException(companyError, {
            tags: { route: "/team-portal/kitchen/dashboard", step: "load-kitchen-settings", companyId: user.company_id },
          });
        }
        const ks: any = company?.kitchen_settings || {};
        if (ks.maxHotHoldMin) setMaxHotHoldMin(Number(ks.maxHotHoldMin));
      } catch (sErr) {
        captureException(sErr, {
          tags: { route: "/team-portal/kitchen/dashboard", step: "load-kitchen-settings-catch", companyId: user.company_id },
        });
      }

      // KIT2-O + CLN2-F: cleaning readiness for tomorrow's events.
      // CLN2-F (#TBD) added the formal cleaning_event_checklists
      // table. We prefer it when any rows exist for tomorrow; if
      // not, fall back to the v1 cleaning_jobs count. That keeps
      // the chip alive for tenants who haven't started ticking the
      // new checklist yet - they keep the equipment-side signal
      // until they migrate.
      //
      // Local-timezone tomorrow (KIT2-G fix preserved): build the
      // YYYY-MM-DD string from local components, not toISOString,
      // so the SAST 23:00 boundary doesn't roll forward early.
      try {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowISO = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
        const tomorrowOrderIds = (ordersData || [])
          .filter((o: any) => o.event_date === tomorrowISO)
          .map((o: any) => o.id);

        if (tomorrowOrderIds.length === 0) {
          setCleaningReadiness(null);
          setChecklistStatusByOrder({});
        } else {
          // CLN2-F preferred source.
          const { data: cecRows, error: cecErr } = await (supabase as any)
            .from("cleaning_event_checklists")
            .select("order_id, status")
            .eq("company_id", user.company_id)
            .eq("kind", "pre_event")
            .is("deleted_at", null)
            .in("order_id", tomorrowOrderIds);

          if (!cecErr && cecRows && cecRows.length > 0) {
            const rows = cecRows as Array<{ order_id: string; status: string }>;
            const total = tomorrowOrderIds.length;
            const ready = rows.filter((r) => r.status === "ready").length;
            setCleaningReadiness({ total, complete: ready });
            const map: Record<string, "ready" | "in_progress" | "pending"> = {};
            for (const r of rows) {
              if (r.status === "ready" || r.status === "in_progress" || r.status === "pending") {
                map[r.order_id] = r.status;
              }
            }
            setChecklistStatusByOrder(map);
          } else {
            setChecklistStatusByOrder({});
            if (cecErr) {
              console.warn("[team-portal/kitchen/dashboard] checklist fetch failed, falling back to cleaning_jobs:", cecErr);
            }
            // KIT2-O fallback: count cleaning_jobs whose
            // triggered_by_event_id is in tomorrow's order set.
            const { data: cjRows, error: cjErr } = await (supabase as any)
              .from("cleaning_jobs")
              .select("id, status")
              .eq("company_id", user.company_id)
              .in("triggered_by_event_id", tomorrowOrderIds);
            if (cjErr) {
              console.warn("[team-portal/kitchen/dashboard] cleaning readiness fetch failed:", cjErr);
              setCleaningReadiness(null);
            } else {
              const rows = (cjRows || []) as Array<{ id: string; status: string }>;
              const total = rows.length;
              const complete = rows.filter((r) => r.status === "complete").length;
              setCleaningReadiness(total === 0 ? null : { total, complete });
            }
          }
        }
      } catch (cjFatal) {
        console.warn("[team-portal/kitchen/dashboard] cleaning readiness threw:", cjFatal);
        setCleaningReadiness(null);
      }
    } catch (error) {
      captureException(error, {
        tags: { route: "/team-portal/kitchen/dashboard", step: "load-dashboard", companyId: user?.company_id },
      });
    } finally {
      setLoading(false);
    }
  };

  // Mark an order ready - one-click action with an allergen safety gate.
  // The order's dietary_requirements text is cross-checked against every
  // menu item's allergen_codes; any hits force a confirm-or-cancel dialog
  // before we let the driver be summoned.
  const handleMarkReady = async (orderId: string, clientName?: string | null) => {
    try {
      const check = await kitchenPrepService.checkOrderAllergens(orderId);
      if (check.hasConflicts) {
        setAllergenDialog({
          orderId,
          clientName,
          conflicts: check.conflicts,
          dietary: check.dietaryRequirements,
        });
        return;
      }
      await finishMarkReady(orderId, clientName, "passed");
    } catch (e: any) {
      toast({ title: "Could not mark ready", description: dbErrorMessage(e, { entity: "order" }), variant: "destructive" });
    }
  };

  const finishMarkReady = async (
    orderId: string,
    clientName: string | null | undefined,
    checkResult: "passed" | "overridden",
  ) => {
    try {
      if (user?.id) {
        await kitchenPrepService.recordAllergenCheck(orderId, user.id, checkResult);
      }
      await markOrderReady(orderId);
      // KIT2-E (kitchen deep audit, KIT2-29, P0): broadcast on the
      // cross-tab event bus so admin /admin/orders, /admin/calendar,
      // /admin/order-assignments, /track/{order_number} (public
      // client portal), and /admin/financial-dashboard all reflect
      // the ready state without waiting for window focus or polling.
      // Driver dashboard's realtime sub on `orders.status='ready'`
      // already catches this - the emit covers everyone else.
      emitOrderUpdated(orderId, "kitchen/dashboard:mark-ready", ["status"]);
      toast({
        title: "Order ready",
        description: clientName ? `${clientName} marked ready. Driver notified.` : "Driver notified.",
      });
      loadDashboardData();
    } catch (e: any) {
      toast({ title: "Could not mark ready", description: dbErrorMessage(e, { entity: "order" }), variant: "destructive" });
    }
  };

  // Find the next pickup across active orders. Drives the headline card --
  // we keep the original event Date alongside the minutes-away so the UI can
  // format it as a real human day + time instead of a T-minus code.
  //
  // Wave 70.21 - a stuck order (confirmed/preparing whose event is
  // hours in the past) was hijacking the "Next Pickup" headline and
  // showing "3h 27m late" for a job that was actually finished
  // (just not ticked through). The card no longer picks orders
  // whose event is more than 4 hours in the past - those land in
  // the "Needs closure" list below where admin can force-close.
  // 4h grace keeps actually-late orders visible (so a chef who
  // ran 1h over still sees the late marker) without letting
  // forgotten paperwork dominate the dashboard.
  const PAST_PICKUP_GRACE_MIN = 4 * 60; // 4 hours
  const nextPickup = useMemo(() => {
    const live = orders.filter(o => o.status === "confirmed" || o.status === "preparing");
    if (live.length === 0) return null;
    let earliest: {
      id: string;
      eventName: string;
      client: string;
      minutesAway: number;
      eventDate: Date;
      hasExplicitTime: boolean;
    } | null = null;
    for (const o of live as any[]) {
      // KIT2-J (kitchen deep audit, KIT2-37 / KIT2-65): kitchen
      // cares about PICKUP time, not event time. Driver collects
      // ~30 min before the guests eat - food has to be plated and
      // boxed by then, not "at event_time". Pre-fix this used
      // event_time, which silently let the chef think they had 30
      // more minutes. pickup_time on the order is the source of
      // truth (set by dispatcher on /admin/order-assignments).
      // Fall back to event_time when pickup_time isn't set yet.
      const timeStr = o.pickup_time || o.event_time;
      const dt = timeStr
        ? new Date(`${o.event_date}T${timeStr}`)
        : new Date(`${o.event_date}T12:00`);
      if (isNaN(dt.getTime())) continue;
      const minutesAway = (dt.getTime() - now.getTime()) / 60_000;
      // Skip stuck orders more than the grace window past pickup time.
      if (minutesAway < -PAST_PICKUP_GRACE_MIN) continue;
      if (!earliest || minutesAway < earliest.minutesAway) {
        earliest = {
          id: o.id,
          eventName: o.event_name || "Event",
          client: o.client_name || "",
          minutesAway,
          eventDate: dt,
          hasExplicitTime: !!timeStr,
        };
      }
    }
    return earliest;
  }, [orders, now]);

  // Wave 70.21 - separate "Needs closure" list for orders the
  // grace window skipped above. Admin / owner can one-click force-
  // close each one to tidy up the dashboard. Sorted oldest-first
  // so the longest-outstanding shows top.
  const needsClosureOrders = useMemo(() => {
    return orders
      .filter((o: any) => {
        const status = (o.status || "").toLowerCase();
        if (!["confirmed", "preparing"].includes(status)) return false;
        if (!o.event_date) return false;
        const dt = o.event_time
          ? new Date(`${o.event_date}T${o.event_time}`)
          : new Date(`${o.event_date}T12:00`);
        if (isNaN(dt.getTime())) return false;
        const minutesAway = (dt.getTime() - now.getTime()) / 60_000;
        return minutesAway < -PAST_PICKUP_GRACE_MIN;
      })
      .sort((a: any, b: any) => {
        const aDt = new Date(`${a.event_date}T${a.event_time || "12:00"}`).getTime();
        const bDt = new Date(`${b.event_date}T${b.event_time || "12:00"}`).getTime();
        return aDt - bDt;
      });
  }, [orders, now]);

  // Wave 70.21 - force-close handler. Hits the API, refreshes the
  // dashboard on success so the closed order disappears.
  // KIT3-A (task #244): opens an AlertDialog instead of native
  // confirm() so the prompt stays inline with the page's UI rhythm
  // and works reliably in tablet kiosk mode.
  const [forceClosingId, setForceClosingId] = useState<string | null>(null);
  const handleForceClose = async (orderId: string, orderLabel: string) => {
    if (forceClosingId) return;
    setForceCloseConfirm({ orderId, orderLabel });
  };

  const confirmForceClose = async () => {
    if (!forceCloseConfirm) return;
    const { orderId, orderLabel } = forceCloseConfirm;
    setForceCloseConfirm(null);
    setForceClosingId(orderId);
    void orderLabel; // surfaced in the dialog body, not needed here
    try {
      const r = await fetch(`/api/orders/${orderId}/force-close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: "Closed from kitchen dashboard" }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Couldn't close order", description: data.error || "Server error", variant: "destructive" });
        return;
      }
      // KIT2-E (KIT2-30, P1): force-close cascade is the biggest
      // status fan-out on the page (prep tasks done + status to
      // delivered + audit row). Same surfaces as Mark-ready need the
      // signal. Force-close from /admin/orders already emits
      // readiness-chip:force-close; this dashboard variant now
      // matches that contract via the shared cateringms:order-updated
      // bus.
      emitOrderUpdated(orderId, "kitchen/dashboard:force-close", ["status", "prep", "handover"]);
      toast({ title: "Order closed", description: data.message });
      await loadDashboardData();
    } catch (e: any) {
      toast({ title: "Close failed", description: dbErrorMessage(e, { entity: "order" }), variant: "destructive" });
    } finally {
      setForceClosingId(null);
    }
  };

  // Human-friendly day label: Today / Tomorrow / weekday name / dated for
  // anything more than a week out. Plain English, no T-minus codes.
  const formatPickupWhen = (date: Date, hasTime: boolean): { dayLabel: string; timeLabel: string } => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(date); target.setHours(0, 0, 0, 0);
    const dayDiff = Math.round((target.getTime() - today.getTime()) / 86400000);
    let dayLabel: string;
    if (dayDiff === 0) dayLabel = "Today";
    else if (dayDiff === 1) dayLabel = "Tomorrow";
    else if (dayDiff > 1 && dayDiff < 7) dayLabel = date.toLocaleDateString("en-ZA", { weekday: "long" });
    else dayLabel = date.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
    const timeLabel = hasTime
      ? date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false })
      : "time TBC";
    return { dayLabel, timeLabel };
  };

  // Plain-English distance-away phrase. "in 2 days", "in 4 hours", "in 25 min",
  // "starting now", "30 min late". No T-minus.
  const formatPickupAway = (mins: number): string => {
    if (mins < -1) {
      const m = Math.abs(Math.floor(mins));
      if (m < 60) return `${m} min late`;
      const h = Math.floor(m / 60);
      const mm = m % 60;
      if (h < 24) return mm > 0 ? `${h}h ${mm}m late` : `${h}h late`;
      const d = Math.floor(h / 24);
      return `${d} day${d === 1 ? "" : "s"} late`;
    }
    if (mins < 1) return "starting now";
    const m = Math.floor(mins);
    if (m < 60) return `in ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `in ${h} hour${h === 1 ? "" : "s"}`;
    const d = Math.floor(h / 24);
    const remH = h % 24;
    if (d < 7) return remH > 0 ? `in ${d}d ${remH}h` : `in ${d} day${d === 1 ? "" : "s"}`;
    return `in ${d} days`;
  };

  // KIT2-P (kitchen deep audit, KIT2-43): fix the UTC drift bug
  // (matched KIT2-G's load query) + scope Production Priority to
  // imminent orders only. Pre-fix, Production Priority duplicated
  // every kanban card with an "event today" date; for a kitchen
  // with 8 confirmed events spaced through the day, the top-3
  // priority list was just a redundant ranking of the same cards.
  // Now: same local-tz today filter, used for the kanban + KPI
  // tiles. Production Priority then narrows further to the next-
  // 4-hours window for the actual "imminent attention" call-out.
  const localToday = new Date();
  const todayLocalISO = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, "0")}-${String(localToday.getDate()).padStart(2, "0")}`;
  const todayOrders = orders.filter((o) => o.event_date === todayLocalISO);
  // Imminent = event_time within the next 4 hours. Catches the
  // "starting prep right now" cases without dragging dinner
  // events 8h away into the alarm list.
  const imminentOrders = todayOrders.filter((o) => {
    if (!(o as any).event_time) return false;
    const [h, m] = String((o as any).event_time).split(":");
    const eventAt = new Date(localToday);
    eventAt.setHours(parseInt(h, 10) || 0, parseInt(m, 10) || 0, 0, 0);
    const minsAway = (eventAt.getTime() - localToday.getTime()) / 60000;
    return minsAway >= -60 && minsAway <= 240; // 1h late through 4h ahead
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      confirmed: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
      preparing: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
      prep: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
      ready: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
      completed: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    };
    return colors[status] || colors.confirmed;
  };

  const getUrgencyLevel = (eventDate: string, eventTime: string | null) => {
    const now = new Date();
    const eventDateTime = new Date(eventDate);
    if (eventTime) {
      const [hours, minutes] = eventTime.split(":");
      eventDateTime.setHours(parseInt(hours), parseInt(minutes));
    }
    const hoursUntil = (eventDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    if (hoursUntil < 4) return { level: "high", color: "border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/30", dot: "bg-rose-500" };
    if (hoursUntil < 8) return { level: "medium", color: "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30", dot: "bg-amber-500" };
    return { level: "low", color: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30", dot: "bg-emerald-500" };
  };

  return (
    <>
      <Head>
        <title>Kitchen today - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <DynamicNav userRole={UserRole.KITCHEN_STAFF} />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Kitchen today"
            subtitle="Today's service board: orders, prep blockers, production handoffs, cleaning readiness, and the printable run sheet."
            icon={ChefHat}
            actions={
              <>
                {/* KIT2-A + KIT2-O (kitchen audit, KIT2-3 / 35 / 36 / 84)
                    + Bobby's "don't swap portals" follow-up: shows
                    tomorrow's cleaning progress at-a-glance and opens
                    a read-only dialog with the cleaning team, active
                    wash jobs and per-event checklist - all without
                    changing the active portal / role lens. */}
                <button
                  type="button"
                  onClick={() => setCleaningDialogOpen(true)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors duration-150 ${
                    cleaningReadiness && cleaningReadiness.complete === cleaningReadiness.total
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                      : cleaningReadiness && cleaningReadiness.complete > 0
                      ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900/60"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                  title={
                    cleaningReadiness
                      ? `Tomorrow's cleaning: ${cleaningReadiness.complete} of ${cleaningReadiness.total} done`
                      : "View the cleaning schedule"
                  }
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Cleaning schedule</span>
                  {cleaningReadiness && (
                    <Badge
                      variant="outline"
                      className={`ml-1 tabular-nums ${
                        cleaningReadiness.complete === cleaningReadiness.total
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-800"
                          : cleaningReadiness.complete > 0
                          ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-300 dark:border-amber-800"
                          : "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600"
                      }`}
                    >
                      {cleaningReadiness.complete}/{cleaningReadiness.total}
                    </Badge>
                  )}
                </button>
                {/* KIT2-N (kitchen deep audit, KIT2-53 / KIT2-83): paper
                    backup of today's prep + tomorrow's preview. Bobby's
                    explicit P1 ask. Chef prep-day morning wants one
                    printable run-sheet not 12 per-order tickets. */}
                <Button
                  variant="outline"
                  onClick={() => {
                    // KIT3-A (task #244): guard against the first-mount
                    // race where the toast fired "Nothing to print" before
                    // loadDashboardData had a chance to populate state.
                    if (loading) {
                      toast({ title: "Still loading", description: "Give it a second, the print sheet is being prepared." });
                      return;
                    }
                    if (orders.length === 0 && upcoming.length === 0) {
                      toast({ title: "Nothing to print", description: "No orders today or in the next 6 days." });
                      return;
                    }
                    setTimeout(() => window.print(), 100);
                  }}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 h-10 sm:h-11 px-3 text-sm"
                >
                  <Printer className="w-4 h-4" />
                  Print run sheet
                </Button>
              </>
            }
          />

          {/* Phase 5C: tile board replaces the per-user Start/End Duty
              widget. One login on the tablet, one tap per staff member. */}
          <div className="mb-6 sm:mb-8">
            <KitchenStaffTileBoard />
          </div>

          {/* KIT2-P: Production Priority now lists ONLY the next-
              4-hours imminent orders, not "first 3 today" which
              duplicated the kanban. Pinned card disappears when
              nothing is imminent so the dashboard de-clutters once
              the rush passes. */}
          {imminentOrders.length > 0 && (
            <PortalCard className="mb-6 sm:mb-8">
              <PortalCardHeader
                title={
                  <span className="flex items-center gap-2 text-base sm:text-lg">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-500" />
                    Imminent (next 4 hours)
                    <Badge variant="outline" className="ml-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900 tabular-nums">
                      {imminentOrders.length}
                    </Badge>
                  </span>
                }
              />
              <div>
                <div className="space-y-2 sm:space-y-3">
                  {imminentOrders.slice(0, 5).map((order, index) => {
                    const urgency = getUrgencyLevel(order.event_date, order.event_time);
                    const eventTime = order.event_time || "TBC";

                    return (
                      <div key={order.id} className={`p-2 sm:p-3 rounded-lg border ${urgency.color}`}>
                        {/* Wave 70.20 - restructured row. Right column
                            now stacks status badge + action buttons
                            inline with the title block, matching the
                            screenshot Bobby drew. Collection time chip
                            renders inline with guests / event time so
                            the kitchen knows when the driver will pick
                            up from the kitchen, not just when guests
                            eat. */}
                        <div className="flex items-start justify-between gap-2 sm:gap-3">
                          <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-brand-primary text-white flex items-center justify-center font-bold flex-shrink-0 text-xs sm:text-base mt-0.5 shadow-sm">
                              {index + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                                {orderDisplayName({ event_name: order.event_name, client_name: (order as any).client_name, order_number: (order as any).order_number })}
                              </p>
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                {order.guest_count} guests • Eat {eventTime}
                                {(order as any).pickup_time && (
                                  <span className="ml-1 text-brand-primary font-medium">
                                    · Collect {String((order as any).pickup_time).slice(0, 5)}
                                  </span>
                                )}
                                {(order as any).client_name && order.event_name && !/^untitled$/i.test(String(order.event_name).trim()) && (
                                  <span> · for <span className="font-medium text-slate-700 dark:text-slate-300">{(order as any).client_name}</span></span>
                                )}
                              </p>
                              {(order as any).venue_address && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                  📍 {(order as any).venue_address}
                                </p>
                              )}
                              {(order as any).special_instructions && (
                                <p className="text-[11px] text-rose-700 dark:text-rose-400 mt-1 italic line-clamp-2">
                                  Special: {(order as any).special_instructions}
                                </p>
                              )}
                            </div>
                          </div>
                          {/* Right column: action buttons + status badge.
                              Desktop: buttons sit alongside the badge.
                              Mobile: stacks under the title so the
                              tap targets stay big-thumb friendly. */}
                          {/* KIT2-K (KIT2-39): Production Priority row
                              buttons up to min-h-11 (44px). */}
                          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 flex-shrink-0">
                            {/* ODOC G.3: primary CTA is now the unified
                                order doc (kitchen section auto-expanded).
                                Ticket lives as a print-only sibling
                                reachable via the small printer icon. */}
                            <Link
                              href={withSlug(staffOrderHref(order.id, "kitchen_staff"))}
                              className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-md text-sm font-semibold bg-brand-primary text-white hover:opacity-90 transition-opacity duration-150 shadow-sm"
                              title="Open the full order document"
                            >
                              <ChefHat className="w-4 h-4" />
                              <span className="hidden xs:inline sm:inline">Open order</span>
                              <span className="xs:hidden sm:hidden">Open</span>
                            </Link>
                            <Link
                              href={withSlug(`${staffOrderHref(order.id, "kitchen_staff")}&print=1#section-kitchen`)}
                              className="inline-flex items-center justify-center min-h-11 w-11 rounded-md text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors duration-150"
                              title="Print order document"
                            >
                              <Printer className="w-4 h-4" />
                            </Link>
                            <Badge variant="outline" className={`${getStatusColor(order.status)} text-xs flex-shrink-0 capitalize`}>{order.status}</Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </PortalCard>
          )}

          {/* Stats Grid - KIT3-A (task #244): rolling readiness +
              skeleton during load so the chef doesn't read "0 / 0 /
              0 / 0" as genuine zeros before data arrives. */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6 md:mb-8">
            {loading ? (
              [0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse" />
              ))
            ) : (
              <>
                <StatTile
                  icon={Calendar}
                  label="Today's orders"
                  value={todayOrders.length}
                  hint="Confirmed, in prep or ready today"
                />
                <StatTile
                  icon={Users}
                  label="Total guests"
                  value={todayOrders.reduce((sum, o) => sum + (o.guest_count || 0), 0)}
                  hint="Across all of today's events"
                />
                <StatTile
                  icon={Clock}
                  label="In prep"
                  value={orders.filter(o => o.status === "preparing").length}
                  hint="Being cooked right now"
                />
                <StatTile
                  icon={CheckCircle}
                  label="Ready"
                  value={orders.filter(o => o.status === "ready").length}
                  hint="Packed, waiting for the driver"
                />
                {/* KIT3-A new tile: rolling prep readiness across
                    every active order. Sum of completed prep tasks
                    over total, formatted as a percentage. Empty when
                    there are no tasks at all. */}
                {(() => {
                  let total = 0;
                  let done = 0;
                  for (const o of orders) {
                    const p = progressByOrder[o.id];
                    if (!p) continue;
                    total += p.total;
                    done += p.done;
                  }
                  const pct = total > 0 ? Math.round((done / total) * 100) : null;
                  return (
                    <StatTile
                      icon={CheckCircle}
                      label="Prep readiness"
                      value={pct == null ? "-" : `${pct}%`}
                      hint={pct == null ? "No prep tasks recorded yet" : `${done} of ${total} prep tasks done`}
                    />
                  );
                })()}
              </>
            )}
          </div>

          {damageAlerts.length > 0 && (
            <PortalCard className="mb-6 sm:mb-8 border-rose-200 bg-rose-50/40 dark:border-rose-900 dark:bg-rose-950/20">
              <PortalCardHeader
                title={
                  <span className="flex items-center gap-2 text-base sm:text-lg text-rose-700 dark:text-rose-300">
                    <AlertTriangle className="w-5 h-5" />
                    Damage flagged
                    <Badge variant="outline" className="bg-white text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900">
                      {damageAlerts.length}
                    </Badge>
                  </span>
                }
                action={
                  <button
                    type="button"
                    onClick={() => setDamageAlerts([])}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white min-h-11 px-3"
                    aria-label="Clear damage alerts"
                  >
                    Clear
                  </button>
                }
              />
              <div>
                <div className="flex flex-wrap gap-2">
                  {damageAlerts.map((alert) => (
                    <span
                      key={alert.id}
                      className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
                    >
                      <span className="tabular-nums">{alert.quantity}x</span>
                      <span>{alert.equipmentName}</span>
                      <span className="text-rose-600 dark:text-rose-300">on {alert.orderLabel}</span>
                      {alert.orderId && (
                        <Link
                          href={withSlug(staffOrderHref(alert.orderId, "kitchen_staff"))}
                          className="inline-flex items-center gap-1 text-rose-700 underline underline-offset-2 dark:text-rose-200"
                        >
                          Open <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </PortalCard>
          )}

          {/* KIT2-R: ingredient delta banner. Sits ABOVE Low Stock so
              the moment butter arrives the chef sees "+2 kg butter"
              before Low Stock recomputes and quietly drops the row.
              Teal accent to distinguish from the amber Low Stock card. */}
          {Object.keys(restockDeltas).length > 0 && (
            <PortalCard className="mb-6 sm:mb-8 border-emerald-200 bg-emerald-50/30 dark:border-emerald-900 dark:bg-emerald-950/20">
              <PortalCardHeader
                title={
                  <span className="flex items-center gap-2 text-base sm:text-lg text-emerald-700 dark:text-emerald-400">
                    <Package className="w-5 h-5" />
                    Just restocked
                  </span>
                }
                action={
                  <button
                    type="button"
                    onClick={() => setRestockDeltas({})}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white min-h-11 px-3"
                    aria-label="Clear restock list"
                  >
                    Got it
                  </button>
                }
              />
              <div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(restockDeltas).map(([id, info]) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-sm font-medium"
                    >
                      <span className="text-emerald-600 dark:text-emerald-400">+{info.delta}{info.unit ? ` ${info.unit}` : ""}</span>
                      <span>{info.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            </PortalCard>
          )}

          {/* KIT3-B (task #245): per-shift staffing flag. Surfaces
              when today has orders + the on-duty count looks light
              vs total guests. Rule: 1 cook per 30 guests. Tunable
              later via companies.kitchen_settings.cooks_per_guest. */}
          {(() => {
            const totalGuests = todayOrders.reduce((sum, o) => sum + (o.guest_count || 0), 0);
            const recommended = Math.max(1, Math.ceil(totalGuests / 30));
            if (totalGuests === 0) return null;
            const understaffed = onDutyCount > 0 && onDutyCount < recommended;
            const noStaff = onDutyCount === 0 && todayOrders.length > 0;
            if (!understaffed && !noStaff) return null;
            return (
              <PortalCard padded={false} className="mb-6 border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30">
                <div className="px-4 py-3 flex items-start gap-3">
                  <Users className="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                  <div className="flex-1 text-sm">
                    <p className="font-semibold text-rose-900 dark:text-rose-200">
                      {noStaff
                        ? "No-one is clocked in for the kitchen yet"
                        : `Looks light: ${onDutyCount} on duty for ${totalGuests} guests today`}
                    </p>
                    <p className="text-xs text-rose-800 dark:text-rose-300 mt-0.5">
                      Rough guide is one cook per 30 guests. Today's recommended is {recommended} based on {todayOrders.length} order{todayOrders.length === 1 ? "" : "s"}. Check the staff tiles above and clock the team in.
                    </p>
                  </div>
                </div>
              </PortalCard>
            );
          })()}

          {/* KIT3-B: critical-path bottleneck. The oldest in-progress
              prep task whose started_at is more than 90 min ago and
              still incomplete. Tells the chef "this is what's
              holding us up". One task at a time so it stays a
              decision-prompt not a backlog dump. */}
          {bottleneckTask && (
            <PortalCard padded={false} className="mb-6 border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30">
              <div className="px-4 py-3 flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-amber-900 dark:text-amber-200">
                    Bottleneck: {bottleneckTask.menuItemName}
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                    Started {Math.floor(bottleneckTask.minsRunning / 60) > 0
                      ? `${Math.floor(bottleneckTask.minsRunning / 60)}h ${bottleneckTask.minsRunning % 60}m`
                      : `${bottleneckTask.minsRunning}m`} ago on {bottleneckTask.orderLabel} and still in progress. Check if the prep needs a second pair of hands or got skipped.
                  </p>
                </div>
                <Link
                  href={withSlug(staffOrderHref(bottleneckTask.orderId, "kitchen_staff"))}
                  className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 underline hover:text-amber-900 dark:hover:text-amber-200 shrink-0"
                >
                  Open order
                </Link>
              </div>
            </PortalCard>
          )}

          {/* Low Stock Alerts */}
          {lowStockItems.length > 0 && (
            <PortalCard className="mb-6 sm:mb-8 border-rose-200 dark:border-rose-900">
              <PortalCardHeader
                title={
                  <span className="flex items-center gap-2 text-base sm:text-lg text-slate-900 dark:text-white">
                    <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-500" />
                    Low stock alerts
                    {/* KIT3-B: aggregate "blocks N orders" badge so the
                        chef sees the cascade impact at the header level
                        not just per-row. */}
                    {blockedOrdersByItem.length > 0 && (
                      <Badge variant="outline" className="bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900 text-[10px] ml-1">
                        Blocks {new Set(blockedOrdersByItem.flatMap((b) => b.orderLabels)).size} active order{new Set(blockedOrdersByItem.flatMap((b) => b.orderLabels)).size === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </span>
                }
              />
              <div>
                <div className="space-y-2">
                  {lowStockItems.map((item) => {
                    // KIT3-B: per-row cascade chip. Pulled from the
                    // blockedOrdersByItem rollup so each low-stock
                    // ingredient surfaces the specific orders it
                    // blocks.
                    const blocked = blockedOrdersByItem.find((b) => b.inventoryItemId === item.id);
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-2 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex-wrap">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Package className="w-5 h-5 text-rose-500 dark:text-rose-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-slate-900 dark:text-white truncate">{item.item_name}</p>
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              Current: {item.current_stock} {item.unit_of_measure} &middot; Minimum: {item.minimum_stock}
                            </p>
                            {blocked && (
                              <p className="text-[11px] text-rose-700 dark:text-rose-400 mt-0.5" title={blocked.orderLabels.join(", ")}>
                                Blocks {blocked.orderCount} active order{blocked.orderCount === 1 ? "" : "s"}: {blocked.orderLabels.slice(0, 2).join(", ")}{blocked.orderLabels.length > 2 ? ` + ${blocked.orderLabels.length - 2}` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`shrink-0 ${
                            blocked
                              ? "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900"
                              : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900"
                          }`}
                        >
                          {blocked ? "Blocking prep" : "Low stock"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            </PortalCard>
          )}

          {/* KIT3-A: calm "All quiet" card when there's no next
              pickup but the page IS loaded. Previously the next-
              pickup card vanished silently and the chef saw blank
              space where the headline used to be - "did it crash?".
              Now they see a clear "no live pickups" reassurance. */}
          {!loading && !nextPickup && orders.length === 0 && needsClosureOrders.length === 0 && (
            <PortalCard padded={false} className="mb-4 sm:mb-6 border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/40">
              <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">Next pickup</p>
                  <p className="text-xl sm:text-2xl font-semibold text-slate-700 dark:text-slate-200 leading-tight mt-1">
                    All quiet
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    No live orders right now. Use the breather to prep ahead, deep-clean, or restock.
                  </p>
                </div>
                <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 text-slate-400 dark:text-slate-500" />
              </div>
            </PortalCard>
          )}

          {/* KIT3-A: realtime stale indicator. The 5 channel
              subscriptions silently drop on flaky kitchen WiFi. This
              chip surfaces when no realtime event has landed in 2+
              min so the chef knows to thumb-refresh. */}
          {realtimeStale && (
            <div className="mb-3 inline-flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded px-2.5 py-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Reconnecting to live updates. Tap refresh if numbers look stuck.
            </div>
          )}

          {/* Next pickup, plain English, no T-minus codes. Tells the chef:
              when (day + 24h time), how far away in normal language, what
              event, who for, and a one-word status word so urgency is read
              at a glance instead of decoded. */}
          {nextPickup && (() => {
            const when = formatPickupWhen(nextPickup.eventDate, nextPickup.hasExplicitTime);
            const away = formatPickupAway(nextPickup.minutesAway);
            const isLate = nextPickup.minutesAway < 0;
            const isSoon = nextPickup.minutesAway >= 0 && nextPickup.minutesAway < 120;
            const statusWord =
              isLate ? "Late" :
              isSoon ? "Starts soon" :
                       "Plenty of time";
            const tone =
              isLate ? "bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/40 dark:to-slate-900 border-rose-200 dark:border-rose-900" :
              isSoon ? "bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/40 dark:to-slate-900 border-amber-200 dark:border-amber-900" :
                       "bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-slate-900 border-emerald-200 dark:border-emerald-900";
            const statusTone =
              isLate ? "bg-rose-600 text-white" :
              isSoon ? "bg-brand-primary text-white" :
                       "bg-emerald-600 text-white";
            const iconTone =
              isLate ? "text-rose-500 dark:text-rose-400" :
              isSoon ? "text-amber-500 dark:text-amber-400" :
                       "text-emerald-500 dark:text-emerald-400";
            const tileTone =
              isLate ? "bg-rose-100/80 dark:bg-rose-500/15" :
              isSoon ? "bg-amber-100/80 dark:bg-amber-500/15" :
                       "bg-emerald-100/80 dark:bg-emerald-500/15";
            return (
              <PortalCard padded={false} className={`mb-4 sm:mb-6 overflow-hidden ${tone}`}>
                <div className="p-4 sm:p-6 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400 font-semibold">Next pickup</p>
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${statusTone}`}>
                        {statusWord}
                      </span>
                    </div>
                    <p className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-none">
                      {when.dayLabel} <span className="tabular-nums">{when.timeLabel}</span>
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 truncate">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{nextPickup.eventName}</span>
                      {nextPickup.client && <span className="text-slate-500 dark:text-slate-400">, {nextPickup.client}</span>}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{away}</p>
                  </div>
                  <span className={`flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-2xl ${tileTone}`}>
                    <Clock className={`w-7 h-7 sm:w-8 sm:h-8 ${iconTone}`} />
                  </span>
                </div>
              </PortalCard>
            );
          })()}

          {/* Wave 70.21 - Needs closure panel for past-event orders
              stuck in confirmed / preparing because the team didn't
              tick them through in real time. Admin / owner only --
              kitchen staff shouldn't be force-closing orders. Each
              row has a single Close out button that cascades through
              prep + ready + collect + delivery + audit in one call. */}
          {canSeeAdminOrderDetail && needsClosureOrders.length > 0 && (
            <PortalCard className="mb-4 sm:mb-6 border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20">
              <PortalCardHeader
                title={
                  <span className="text-sm sm:text-base flex items-center gap-2 text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500" />
                    Needs closure
                    <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-300 dark:border-amber-800 text-[10px]">
                      {needsClosureOrders.length}
                    </Badge>
                    <InfoTooltip content="Orders whose event was hours ago but the team didn't tick them through. Force-close cascades all the prep tasks + ready + collected + delivered stamps in one click. Audit-logged. Admin roles only." />
                  </span>
                }
              />
              <div>
                <ul className="space-y-2">
                  {needsClosureOrders.map((o: any) => {
                    const dt = new Date(`${o.event_date}T${o.event_time || "12:00"}`);
                    const ago = Math.floor((now.getTime() - dt.getTime()) / 3_600_000);
                    const label = `${orderDisplayName({ event_name: o.event_name, client_name: o.client_name })}${o.order_number ? ` (${o.order_number})` : ""}`;
                    return (
                      <li key={o.id} className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {orderDisplayName({ event_name: o.event_name, client_name: o.client_name, order_number: o.order_number })}
                          </p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                            {o.order_number && <span className="tabular-nums mr-1">{o.order_number}</span>}
                            {o.event_date} {o.event_time?.slice(0, 5) || ""} &middot; {ago > 24 ? `${Math.floor(ago / 24)}d` : `${ago}h`} ago &middot; still {o.status}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleForceClose(o.id, label)}
                          disabled={forceClosingId === o.id}
                          className="bg-brand-primary hover:bg-brand-primary/90 gap-1.5 text-xs h-8 flex-shrink-0"
                        >
                          {forceClosingId === o.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5" />
                          )}
                          Close out
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2">
                  Force-close marks all prep tasks done, stamps the delivery/collect times, and flips the order to delivered. Audit-logged. Use for paperwork tidy-up after a real-world event the team forgot to tick.
                </p>
              </div>
            </PortalCard>
          )}

          {/* Phase 4: tomorrow + day-after preview. Quiet glance card so the
              kitchen sees what's brewing before it lands as "Active orders".
              Hidden when nothing's coming up to keep the page calm. */}
          {upcoming.length > 0 && (
            <PortalCard className="mb-6">
              <PortalCardHeader
                title={
                  <span className="text-sm sm:text-base flex items-center gap-2 text-slate-700 dark:text-slate-200">
                    <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    What's coming up
                    <InfoTooltip content="Confirmed orders for the next two days. Not yet in the active board, this is your prep-ahead heads-up." />
                  </span>
                }
              />
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {upcoming.map((day) => {
                    const d = new Date(day.date);
                    const isTomorrow = d.toDateString() === new Date(Date.now() + 86400000).toDateString();
                    const label = isTomorrow ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
                    return (
                      <div key={day.date} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">{label}</div>
                          <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1"><Package className="w-3 h-3" />{day.orders}</span>
                            <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{day.guests}</span>
                            {day.earliest_event_time && (
                              <span className="inline-flex items-center gap-1 tabular-nums"><Clock className="w-3 h-3" />{day.earliest_event_time.slice(0, 5)}</span>
                            )}
                          </div>
                        </div>
                        <ul className="space-y-1">
                          {day.items.slice(0, 4).map((it) => (
                            <li key={it.id} className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                              <span className="tabular-nums text-slate-400 dark:text-slate-500 w-10 shrink-0">{it.event_time?.slice(0, 5) || "--"}</span>
                              <span className="font-medium text-slate-700 dark:text-slate-200 truncate flex-1 min-w-0">{orderDisplayName({ event_name: it.event_name, client_name: it.client_name, order_number: (it as any).order_number })}</span>
                              <span className="text-slate-500 dark:text-slate-400 tabular-nums shrink-0">{it.guest_count} pax</span>
                            </li>
                          ))}
                          {day.items.length > 4 && (
                            <li className="text-[11px] text-slate-400 dark:text-slate-500 italic">+ {day.items.length - 4} more</li>
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            </PortalCard>
          )}

          {/* Active orders, kanban (Confirmed / In prep / Ready) */}
          <PortalCard>
            <PortalCardHeader
              title={
                <span className="text-base sm:text-lg md:text-xl flex items-center gap-2">
                  Active orders
                  <InfoTooltip content="Three columns: Confirmed (waiting to start) → In prep (cooking now) → Ready (waiting for driver). Move cards by completing tasks. Tap Mark ready to notify the driver." />
                </span>
              }
            />
            <div>
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3" aria-busy="true" aria-label="Loading active orders">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                      <div className="h-9 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 animate-pulse" />
                      <div className="p-2 space-y-2">
                        <div className="h-20 rounded-md bg-slate-100 dark:bg-slate-800 animate-pulse" />
                        <div className="h-20 rounded-md bg-slate-100 dark:bg-slate-800 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1.5">All caught up</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                    No live orders right now. Orders show up here automatically once the admin confirms a quote. Use the breather to deep-clean or restock.
                  </p>
                </div>
              ) : (() => {
                const byStatus: Record<string, Order[]> = {
                  confirmed: orders.filter(o => o.status === "confirmed"),
                  preparing: orders.filter(o => o.status === "preparing"),
                  ready:     orders.filter(o => o.status === "ready"),
                };
                const COLUMNS: Array<{
                  key: keyof typeof byStatus;
                  label: string;
                  empty: string;
                  tone: string;
                  dot: string;
                }> = [
                  // KIT3-A: standardised empty-state copy across the
                  // three lanes. Was three different voices ("Nothing
                  // confirmed yet" / "No prep in flight" / "Nothing
                  // ready yet").
                  { key: "confirmed", label: "Confirmed",  empty: "No confirmed orders waiting",  tone: "border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/30",   dot: "bg-slate-400" },
                  { key: "preparing", label: "In prep",    empty: "No orders in prep right now",  tone: "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30",   dot: "bg-amber-400" },
                  { key: "ready",     label: "Ready",      empty: "No orders ready to collect",   tone: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30", dot: "bg-emerald-500" },
                ];

                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {COLUMNS.map(col => {
                      // Wave 33.5: per-column visual boundary. Was a
                      // flat flex-col with no background, so on mobile
                      // (single-column grid) all three lanes ran into
                      // each other as one stream. Tint the header bar
                      // with the lane's tone and wrap in a soft
                      // container so the visual separation survives
                      // the mobile collapse.
                      const headerTone =
                        col.key === "confirmed" ? "bg-slate-100 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300" :
                        col.key === "preparing" ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-900 dark:text-amber-300" :
                                                  "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-900 dark:text-emerald-300";
                      return (
                      <div key={col.key} className="flex flex-col rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 overflow-hidden">
                        <div className={`flex items-center justify-between px-3 py-2 border-b ${headerTone}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide">
                            {col.label}
                          </p>
                          <Badge variant="outline" className="text-[10px] tabular-nums bg-white dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700">
                            {byStatus[col.key].length}
                          </Badge>
                        </div>
                        <div className="space-y-2 min-h-[100px] p-2">
                          {byStatus[col.key].length === 0 ? (
                            <div className="text-xs text-slate-400 dark:text-slate-500 italic px-2 py-3 border border-dashed border-slate-200 dark:border-slate-700 rounded-md text-center">
                              {col.empty}
                            </div>
                          ) : byStatus[col.key].map((order: any) => {
                            const eventDt = order.event_time
                              ? new Date(`${order.event_date}T${order.event_time}`)
                              : new Date(`${order.event_date}T12:00`);
                            const minsToEvent = isNaN(eventDt.getTime())
                              ? null
                              : (eventDt.getTime() - now.getTime()) / 60_000;
                            const isLateCard = minsToEvent != null && minsToEvent < 0;
                            const isSoonCard = minsToEvent != null && minsToEvent >= 0 && minsToEvent < 120;
                            const tone =
                              isLateCard ? "border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30" :
                              isSoonCard ? "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30" :
                                           col.tone;
                            const dotTone =
                              isLateCard ? "bg-rose-500" :
                              isSoonCard ? "bg-amber-500" :
                                           col.dot;

                            const prog = progressByOrder[order.id] || { total: 0, done: 0 };
                            const pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;

                            return (
                              <div
                                key={order.id}
                                className={`p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-[box-shadow,transform,border-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${tone}`}
                              >
                                {/* Wave 70.18 - card title block + order
                                    number. No longer a tiny link --
                                    proper action buttons live below
                                    (Open order + print document). */}
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${dotTone}`} aria-hidden="true" />
                                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                        {orderDisplayName({ event_name: order.event_name, client_name: order.client_name, order_number: (order as any).order_number })}
                                      </p>
                                    </div>
                                    {order.event_name && order.client_name && (
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate pl-3.5">
                                        for {order.client_name}
                                      </p>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                                    {order.order_number}
                                  </span>
                                </div>
                                {/* KIT2-I (kitchen deep audit, KIT2-62 /
                                    82 / 90): allergen badge at first
                                    render. Bobby's brief: chef sees the
                                    warning at the planning stage, not
                                    just at Mark-ready. Red ribbon below
                                    the title so it's the second thing
                                    the eye lands on. */}
                                {(order as any).dietary_requirements && String((order as any).dietary_requirements).trim() && (
                                  <div className="mb-1 flex items-center gap-1.5 rounded border border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40 px-2 py-1">
                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                                    <p className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 truncate" title={String((order as any).dietary_requirements)}>
                                      {String((order as any).dietary_requirements)}
                                    </p>
                                  </div>
                                )}
                                {(order as any).venue_address && (
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mb-1">
                                    📍 {(order as any).venue_address}
                                  </p>
                                )}
                                <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 flex-wrap">
                                  <span className="inline-flex items-center gap-1">
                                    <Users className="w-3 h-3" />{order.guest_count} pax
                                  </span>
                                  {minsToEvent != null && (
                                    <span className={`inline-flex items-center gap-1 tabular-nums font-medium ${
                                      minsToEvent < 0    ? "text-rose-700 dark:text-rose-400"   :
                                      minsToEvent < 120  ? "text-amber-700 dark:text-amber-400" :
                                                            "text-slate-600 dark:text-slate-300"
                                    }`}>
                                      <Clock className="w-3 h-3" />
                                      {minsToEvent < 0
                                        ? `${formatCountdown(minsToEvent).replace("-", "")} late`
                                        : `T-${formatCountdown(minsToEvent)}`}
                                    </span>
                                  )}
                                </div>

                                {/* Task progress bar */}
                                {prog.total > 0 && (
                                  <div className="mt-2">
                                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
                                      <span>Prep tasks</span>
                                      <span className="tabular-nums">{prog.done} of {prog.total}</span>
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                      <div
                                        className={`h-full ${
                                          pct >= 100 ? "bg-emerald-500" :
                                          pct >= 50  ? "bg-amber-500"   :
                                                       "bg-slate-400"
                                        }`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Kitchen instructions inline (compact) */}
                                {order.kitchen_instructions && (
                                  <p className="mt-2 text-[11px] text-slate-700 dark:text-slate-300 bg-brand-primary/5 dark:bg-brand-primary/10 border border-brand-primary/20 rounded px-2 py-1 line-clamp-2">
                                    {order.kitchen_instructions}
                                  </p>
                                )}

                                {/* Wave 70.18 - proper action button row.
                                    Replaces the previous small text link
                                    on the title. Primary opens the unified
                                    order document; secondary opens the same
                                    document in print mode. */}
                                {/* KIT2-K (KIT2-39): tap targets bumped
                                    from h-8 (32px) to min-h-11 (44px).
                                    Floured-hands tap landing. */}
                                {/* ODOC G.3: primary = doc, secondary
                                    = print-mode doc. */}
                                <div className="mt-2 grid grid-cols-[1fr_auto] gap-1.5">
                                  <Link
                                    href={withSlug(staffOrderHref(order.id, "kitchen_staff"))}
                                    className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-md text-sm font-semibold bg-brand-primary text-white hover:opacity-90 transition-opacity duration-150 shadow-sm"
                                    title="Open the full order document"
                                  >
                                    <ChefHat className="w-4 h-4" />
                                    Open order
                                  </Link>
                                  <Link
                                    href={withSlug(`${staffOrderHref(order.id, "kitchen_staff")}&print=1#section-kitchen`)}
                                    className="inline-flex items-center justify-center min-h-11 w-11 rounded-md text-sm bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors duration-150"
                                    title="Print order document"
                                  >
                                    <Printer className="w-4 h-4" />
                                  </Link>
                                </div>

                                {/* KIT2-K (kitchen deep audit, KIT2-39 /
                                    KIT2-71 / KIT2-92): Mark ready
                                    bumped to min-h-11 (44px Apple HIG)
                                    so a chef with floured hands can
                                    land the tap reliably. The
                                    allergen-conflict AlertDialog
                                    already gates the destructive
                                    path; making the button bigger
                                    just helps the right path. */}
                                {col.key === "preparing" && (
                                  <Button
                                    className="w-full mt-2 min-h-11 text-sm gap-1.5 bg-brand-primary hover:opacity-90"
                                    onClick={() => handleMarkReady(order.id, order.client_name || order.event_name)}
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                    Mark ready (notify driver)
                                  </Button>
                                )}
                                {col.key === "ready" && (() => {
                                  // Phase 4: hot-hold warning. Once a Ready
                                  // order has sat past the threshold the
                                  // chef sees a clear red bar instead of
                                  // the calm "waiting for pickup" line.
                                  const hold = kitchenPrepService.computeHoldTime(
                                    order.ready_at,
                                    order.picked_up_at,
                                    maxHotHoldMin,
                                    now,
                                  );
                                  if (!hold) {
                                    return (
                                      <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                                        <Truck className="w-3 h-3" />Waiting for pickup
                                      </p>
                                    );
                                  }
                                  if (hold.overdue) {
                                    return (
                                      <div className="mt-2 text-[11px] font-semibold text-rose-800 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-900 rounded px-2 py-1 inline-flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        Hot {hold.holdMin}m, past {maxHotHoldMin}m hold
                                      </div>
                                    );
                                  }
                                  return (
                                    <p className={`mt-2 text-[11px] font-medium inline-flex items-center gap-1 ${
                                      hold.holdMin > maxHotHoldMin * 0.7 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"
                                    }`}>
                                      <Truck className="w-3 h-3" />Waiting {hold.holdMin}m, pickup soon
                                    </p>
                                  );
                                })()}

                                {/* KIT2-L: prep-task timers + checklist
                                    are auto-expanded now. The previous
                                    <details> hid both behind a "Tasks ▾"
                                    summary so the chef had to expand
                                    every preparing card just to see
                                    whether a timer was running. Inline
                                    means the timers are glanceable from
                                    the kanban at a normal arm's reach.
                                    PrepTaskTimer reads kitchen_prep_tasks
                                    (per-menu-item prep + cook rows);
                                    TaskCompletionButtons reads
                                    kitchen_task_completions (the four
                                    macro Food/Cutlery/Crockery/Pickup
                                    gates). Both surfaces stay - they're
                                    different responsibilities. */}
                                {col.key === "preparing" && (
                                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                                    <PrepTaskTimer orderId={order.id} companyId={user.company_id} />
                                    <TaskCompletionButtons
                                      orderId={order.id}
                                      orderNumber={order.order_number}
                                      clientName={order.client_name || order.event_name}
                                    />
                                  </div>
                                )}

                                {/* Wave 49 B3 - the kitchen-to-driver
                                    sign-off. Surfaces on ready + the
                                    last preparing column where the
                                    kitchen lead actually hands the
                                    job over. Hidden on earlier columns
                                    where there's nothing to hand over
                                    yet. */}
                                {(col.key === "ready" || col.key === "preparing") && (
                                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                                    <HandoverToDriverPanel
                                      orderId={order.id}
                                      orderNumber={order.order_number || order.id}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </PortalCard>
        </PortalShell>

        <Footer />
      </div>

      {/* Wave 70.7c - service-mode FAB at bottom-left so a chef
          one-handed during service can reach the nav without
          stretching to the top-left corner. Self-gates on service
          mode, mobile only. */}
      <KitchenServiceFAB />

      {/* AI Chatbot */}
      <ChatBot userRole="kitchen" companyId={user?.company_id} />

      {/* Cleaning schedule peek - opened from the header chip.
          Read-only by design; the chef stays in the kitchen portal. */}
      {user?.company_id && (
        <CleaningScheduleDialog
          open={cleaningDialogOpen}
          onOpenChange={setCleaningDialogOpen}
          companyId={user.company_id}
          cleaningReadiness={cleaningReadiness}
        />
      )}

      {/* Allergen safety gate, blocks Mark Ready if dietary requirements
          collide with an item's allergen codes. Forces a deliberate override
          that's audit-stamped on the prep tasks. */}
      <AlertDialog open={!!allergenDialog} onOpenChange={(open) => { if (!open) setAllergenDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Allergen warning, check before serving
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <div className="font-semibold text-red-900 mb-1">Customer dietary note</div>
                  <div className="text-red-800 italic">"{allergenDialog?.dietary}"</div>
                </div>
                <div>
                  <div className="font-semibold mb-2">Items that may conflict:</div>
                  <ul className="space-y-2">
                    {allergenDialog?.conflicts.map((c, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="font-medium">{c.menuItem}:</span>
                        <span className="text-red-700">{c.allergens.join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="text-xs text-slate-600">
                  Confirming will record an override against this order. Cancel to revisit the recipe or speak to the customer.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel, recheck</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (allergenDialog) {
                  const { orderId, clientName } = allergenDialog;
                  setAllergenDialog(null);
                  finishMarkReady(orderId, clientName, "overridden");
                }
              }}
            >
              I have checked, mark ready anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* KIT3-A (task #244): force-close confirmation now matches
          the allergen gate's UI rhythm and works reliably in tablet
          kiosk mode where native window.confirm can be flaky. */}
      <AlertDialog
        open={!!forceCloseConfirm}
        onOpenChange={(open) => { if (!open) setForceCloseConfirm(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              Force-close this order?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-semibold text-slate-900">{forceCloseConfirm?.orderLabel}</span> will be force-closed.
                </p>
                <p className="text-slate-700">
                  All prep tasks will be marked complete and the order will move to delivered. This action cannot be reversed and goes into the audit log.
                </p>
                <p className="text-xs text-slate-500">
                  Use this only when the team forgot to tick a real-world event through.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-brand-primary hover:bg-brand-primary/90"
              onClick={confirmForceClose}
            >
              Force-close + mark delivered
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* KIT2-N (kitchen deep audit, KIT2-53 / KIT2-83): print-only
          kitchen run sheet. Hidden on screen via the print CSS below.
          Bobby's brief: chef prep-day morning wants paper - one
          run-sheet that covers today + the next six days, not 12
          per-order kitchen tickets. Allergens render with bold red
          flags so they survive the printer. */}
      <div id="print-kitchen-run-sheet" className="print-only">
        <h1 style={{ fontSize: "20pt", marginBottom: "4pt", fontFamily: "sans-serif" }}>
          Kitchen run sheet
        </h1>
        <p style={{ fontSize: "10pt", color: "#475569", marginBottom: "14pt", fontFamily: "sans-serif" }}>
          {new Date().toLocaleString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          {" - "}
          {orders.length} {orders.length === 1 ? "order" : "orders"} today + next 6 days
        </p>

        {/* Today's active orders */}
        {orders.length > 0 && (
          <>
            <h2 style={{ fontSize: "13pt", marginTop: "12pt", marginBottom: "6pt", fontFamily: "sans-serif", borderBottom: "1pt solid #0f172a", paddingBottom: "2pt" }}>
              Active prep
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9.5pt", fontFamily: "sans-serif" }}>
              <thead>
                <tr style={{ borderBottom: "1.5pt solid #0f172a" }}>
                  <th style={{ textAlign: "left", padding: "4pt" }}>Event</th>
                  <th style={{ textAlign: "left", padding: "4pt" }}>Time</th>
                  <th style={{ textAlign: "left", padding: "4pt" }}>Pickup</th>
                  <th style={{ textAlign: "right", padding: "4pt" }}>Guests</th>
                  <th style={{ textAlign: "left", padding: "4pt" }}>Status</th>
                  <th style={{ textAlign: "left", padding: "4pt" }}>Prep</th>
                  <th style={{ textAlign: "left", padding: "4pt" }}>Allergens / notes</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const o = order as any;
                  const prog = progressByOrder[o.id] || { total: 0, done: 0 };
                  return (
                    <tr key={o.id} style={{ borderBottom: "0.5pt solid #cbd5e1", pageBreakInside: "avoid" }}>
                      <td style={{ padding: "5pt 4pt" }}>
                        <strong>{o.event_name || o.client_name || "Order"}</strong>
                        {o.event_name && o.client_name ? <span style={{ color: "#64748b" }}> ({o.client_name})</span> : null}
                      </td>
                      <td style={{ padding: "5pt 4pt", whiteSpace: "nowrap" }}>
                        {o.event_date}
                        {o.event_time ? <span style={{ color: "#64748b" }}> {o.event_time}</span> : null}
                      </td>
                      <td style={{ padding: "5pt 4pt", whiteSpace: "nowrap" }}>
                        {o.pickup_time ? <strong>{o.pickup_time}</strong> : <span style={{ color: "#dc2626", fontWeight: 700 }}>SET</span>}
                      </td>
                      <td style={{ padding: "5pt 4pt", textAlign: "right" }}>{o.guest_count ?? ""}</td>
                      <td style={{ padding: "5pt 4pt", textTransform: "uppercase", fontSize: "8.5pt", letterSpacing: "0.5pt" }}>
                        {o.status}
                      </td>
                      <td style={{ padding: "5pt 4pt", textAlign: "right", whiteSpace: "nowrap" }}>
                        {prog.total > 0 ? `${prog.done}/${prog.total}` : "-"}
                      </td>
                      <td style={{ padding: "5pt 4pt" }}>
                        {o.dietary_requirements ? (
                          <span style={{ color: "#dc2626", fontWeight: 700 }}>
                            Dietary: {o.dietary_requirements}
                          </span>
                        ) : null}
                        {o.special_instructions ? (
                          <div style={{ color: "#475569", fontSize: "8.5pt", marginTop: "2pt" }}>
                            {o.special_instructions}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {/* Tomorrow + day-after preview */}
        {upcoming.length > 0 && (
          <>
            <h2 style={{ fontSize: "13pt", marginTop: "18pt", marginBottom: "6pt", fontFamily: "sans-serif", borderBottom: "1pt solid #0f172a", paddingBottom: "2pt" }}>
              Coming up
            </h2>
            {upcoming.map((day) => (
              <div key={day.date} style={{ marginBottom: "10pt", pageBreakInside: "avoid" }}>
                <p style={{ fontSize: "11pt", fontWeight: 700, marginBottom: "3pt", fontFamily: "sans-serif" }}>
                  {new Date(day.date).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}
                  {" - "}
                  <span style={{ fontWeight: 400, color: "#475569" }}>
                    {day.orders} {day.orders === 1 ? "order" : "orders"} / {day.guests} guests
                  </span>
                </p>
                {day.items.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: "16pt", fontSize: "9.5pt", color: "#0f172a", fontFamily: "sans-serif" }}>
                    {day.items.map((item) => {
                      // CLN2-F: paper signal for the pre-event
                      // cleanliness state. Only populated for
                      // tomorrow's orders today; day-after items
                      // skip the chip.
                      const checklistStatus = checklistStatusByOrder[item.id];
                      const chipLabel = checklistStatus === "ready"
                        ? "Clean - ready"
                        : checklistStatus === "in_progress"
                        ? "Clean - in progress"
                        : checklistStatus === "pending"
                        ? "Clean - not started"
                        : null;
                      const chipColor = checklistStatus === "ready"
                        ? "#065f46"
                        : checklistStatus === "in_progress"
                        ? "#92400e"
                        : "#475569";
                      return (
                        <li key={item.id} style={{ marginBottom: "2pt" }}>
                          <strong>{item.event_time || "TBD"}</strong>
                          {" - "}
                          {item.event_name}
                          {item.client_name ? <span style={{ color: "#64748b" }}> ({item.client_name})</span> : null}
                          {item.guest_count ? <span style={{ color: "#64748b" }}> · {item.guest_count} guests</span> : null}
                          {chipLabel ? (
                            <span style={{ color: chipColor, marginLeft: "6pt", fontWeight: 600 }}>
                              [{chipLabel}]
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </>
        )}

        {/* Low stock alerts */}
        {lowStockItems.length > 0 && (
          <>
            <h2 style={{ fontSize: "13pt", marginTop: "18pt", marginBottom: "6pt", fontFamily: "sans-serif", borderBottom: "1pt solid #0f172a", paddingBottom: "2pt" }}>
              Low stock
            </h2>
            <ul style={{ margin: 0, paddingLeft: "16pt", fontSize: "9.5pt", fontFamily: "sans-serif" }}>
              {lowStockItems.map((item) => (
                <li key={item.id} style={{ marginBottom: "2pt" }}>
                  <strong>{item.item_name}</strong>
                  <span style={{ color: "#dc2626" }}>
                    {" - "}{item.current_stock} / min {item.minimum_stock}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <p style={{ marginTop: "20pt", fontSize: "9pt", color: "#64748b", fontFamily: "sans-serif" }}>
          Generated {new Date().toLocaleString("en-ZA")} from CateringMS Kitchen Portal
        </p>
      </div>

      <style jsx global>{`
        @media print {
          @page { margin: 12mm; size: landscape; }
          body * { visibility: hidden !important; }
          #print-kitchen-run-sheet, #print-kitchen-run-sheet * { visibility: visible !important; }
          #print-kitchen-run-sheet {
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
    </>
  );
}
