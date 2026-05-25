import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ChefHat, Clock, CheckCircle, Calendar, Users, Package, AlertTriangle, Truck, ExternalLink, Loader2, Sparkles, Printer } from "lucide-react";
import Link from "next/link";
import { useTenantHref } from "@/lib/tenantUrl";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { DynamicNav } from "@/components/DynamicNav";
import { TeamWelcomeBanner } from "@/components/portal/TeamWelcomeBanner";
import { MyShiftTodayCard } from "@/components/portal/MyShiftTodayCard";
import { WidgetErrorBoundary } from "@/components/dashboard/WidgetErrorBoundary";
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
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { kitchenPrepService } from "@/services/kitchenPrepService";
import { markOrderReady } from "@/services/order/orderWorkflow";
import { emitOrderUpdated, onOrderUpdated } from "@/lib/events/orderEvents";
import { onEquipmentDamaged } from "@/lib/events/equipmentEvents";
import { onCleaningReady } from "@/lib/events/cleaningEvents";
import { useToast } from "@/hooks/use-toast";
import { captureException } from "@/lib/observability";

type Order = Database["public"]["Tables"]["orders"]["Row"];
type InventoryItem = Database["public"]["Tables"]["inventory_items"]["Row"];

function formatCountdown(mins: number): string {
  if (!isFinite(mins)) return "—";
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

  // KIT2-R (kitchen deep audit, KIT2-34 / KIT2-85): ingredient delta
  // banner. When the shopper ticks items on /team-portal/shopping
  // (SHP2-B bumps inventory_items.current_stock), we want the kitchen
  // lead to see WHICH ingredients just arrived without scrolling the
  // Low Stock list. Keyed by inventory item id so a second restock of
  // the same item replaces the prior entry instead of doubling up.
  // Cleared on the per-mount "Got it" dismiss action.
  const [restockDeltas, setRestockDeltas] = useState<Record<string, { name: string; delta: number; unit: string }>>({});

  // Tick the clock every minute so countdowns stay live without polling the DB
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (user?.company_id) {
      loadDashboardData();
    }
  }, [user?.company_id]);

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
    const offDamage = onEquipmentDamaged(() => { refresh(); });

    // CLN2-F same-device fast path: the cleaning dashboard fires
    // cateringms:cleaning-ready as soon as the supabase write
    // returns. Catches the same-tablet case before the channel
    // round-trips back.
    const offCleaning = onCleaningReady(() => { refresh(); });

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
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
      const threeDaysFromNow = new Date(localToday);
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 2);
      const horizonIso = `${threeDaysFromNow.getFullYear()}-${String(threeDaysFromNow.getMonth() + 1).padStart(2, "0")}-${String(threeDaysFromNow.getDate()).padStart(2, "0")}`;

      const { data: ordersData, error: ordersError } = await supabase
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

      if (ordersError) {
        captureException(ordersError, {
          tags: { route: "/team-portal/kitchen/dashboard", step: "load-orders", companyId: user.company_id },
        });
      } else {
        setOrders(ordersData || []);
      }

      // Load low stock items - compare current_stock to minimum_stock directly
      const { data: inventoryData, error: inventoryError } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("company_id", user.company_id)
        .filter("current_stock", "lt", "minimum_stock")
        .order("current_stock", { ascending: true })
        .limit(5);

      if (inventoryError) {
        captureException(inventoryError, {
          tags: { route: "/team-portal/kitchen/dashboard", step: "load-low-stock", companyId: user.company_id },
        });
      } else {
        setLowStockItems(inventoryData || []);
      }

      // Phase 1: load prep task progress per order in one shot
      const orderIds = (ordersData || []).map((o: any) => o.id);
      if (orderIds.length > 0) {
        const prog = await kitchenPrepService.getProgressByOrder(orderIds);
        setProgressByOrder(prog);
      } else {
        setProgressByOrder({});
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
          .single();
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
      toast({ title: "Could not mark ready", description: e?.message, variant: "destructive" });
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
      toast({ title: "Could not mark ready", description: e?.message, variant: "destructive" });
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
      toast({ title: "Close failed", description: e?.message, variant: "destructive" });
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
      confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      preparing: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
      prep: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
      ready: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
      completed: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300",
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
    
    if (hoursUntil < 4) return { level: "high", color: "border-red-500 bg-red-50 dark:bg-red-950" };
    if (hoursUntil < 8) return { level: "medium", color: "border-orange-500 bg-orange-50 dark:bg-orange-950" };
    return { level: "low", color: "border-green-500 bg-green-50 dark:bg-green-950" };
  };

  return (
    <>
      <Head>
        <title>Kitchen Dashboard - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <DynamicNav userRole={UserRole.KITCHEN_STAFF} />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-orange-50 via-red-50 to-pink-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 lg:py-12 max-w-screen-2xl">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 mb-6 sm:mb-8">
            <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <ChefHat className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">Kitchen Dashboard</h1>
              <p className="text-xs sm:text-sm md:text-base text-slate-600 dark:text-slate-400">Manage prep, duty shifts, and inventory</p>
            </div>
            {/* KIT2-A + KIT2-O (kitchen audit, KIT2-3 / 35 / 36 / 84)
                + Bobby's "don't swap portals" follow-up: shows
                tomorrow's cleaning progress at-a-glance and opens
                a read-only dialog with the cleaning team, active
                wash jobs and per-event checklist - all without
                changing the active portal / role lens. */}
            <button
              type="button"
              onClick={() => setCleaningDialogOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                cleaningReadiness && cleaningReadiness.complete === cleaningReadiness.total
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : cleaningReadiness && cleaningReadiness.complete > 0
                  ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
              }`}
              title={
                cleaningReadiness
                  ? `Tomorrow's cleaning: ${cleaningReadiness.complete} of ${cleaningReadiness.total} done`
                  : "View the cleaning schedule"
              }
            >
              <Sparkles className="w-4 h-4" />
              <span>Cleaning schedule</span>
              {cleaningReadiness && (
                <Badge
                  variant="outline"
                  className={`ml-1 tabular-nums ${
                    cleaningReadiness.complete === cleaningReadiness.total
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : cleaningReadiness.complete > 0
                      ? "bg-amber-100 text-amber-800 border-amber-300"
                      : "bg-cyan-100 text-cyan-800 border-cyan-300"
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
                  toast({ title: "Nothing to print", description: "No orders today or in the next 2 days." });
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
          </div>

          <TeamWelcomeBanner role="kitchen" userId={user?.id} />

          {/* Wave 42 Tier 3: personal shift card. Lists today's
              kitchen + kitchen_and_cleaning shifts with task chips
              inline. Wave 43 T1: wrapped in WidgetErrorBoundary so
              a render fault doesn't blank the kitchen portal. */}
          <WidgetErrorBoundary label="Your shifts today">
            <MyShiftTodayCard
              scopeShiftTypes={["kitchen", "kitchen_and_cleaning"]}
              defaultTaskType="kitchen"
            />
          </WidgetErrorBoundary>

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
            <Card className="border-0 shadow-lg bg-gradient-to-r from-orange-50 to-red-50 dark:from-slate-800 dark:to-slate-900 mb-6 sm:mb-8">
              <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
                  Imminent (next 4 hours)
                  <Badge variant="outline" className="ml-1 bg-white text-orange-700 border-orange-300 tabular-nums">
                    {imminentOrders.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <div className="space-y-2 sm:space-y-3">
                  {imminentOrders.slice(0, 5).map((order, index) => {
                    const urgency = getUrgencyLevel(order.event_date, order.event_time);
                    const eventTime = order.event_time || "TBC";

                    return (
                      <div key={order.id} className={`p-2 sm:p-3 rounded-lg border-l-4 ${urgency.color}`}>
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
                            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold flex-shrink-0 text-xs sm:text-base mt-0.5">
                              {index + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                                {order.event_name || (order as any).client_name || "Event"}
                              </p>
                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                {order.guest_count} guests • Eat {eventTime}
                                {(order as any).pickup_time && (
                                  <span className="ml-1 text-amber-700 dark:text-amber-400 font-medium">
                                    · Collect {String((order as any).pickup_time).slice(0, 5)}
                                  </span>
                                )}
                                {(order as any).client_name && order.event_name && (
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
                            <Link
                              href={withSlug(`/team-portal/kitchen/orders/${order.id}/ticket`)}
                              className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-md text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600 transition shadow-sm"
                              title="Open the printable kitchen ticket"
                            >
                              <ChefHat className="w-4 h-4" />
                              <span className="hidden xs:inline sm:inline">Kitchen ticket</span>
                              <span className="xs:hidden sm:hidden">Ticket</span>
                            </Link>
                            {canSeeAdminOrderDetail && (
                              <Link
                                href={withSlug(`/admin/orders?orderId=${order.id}`)}
                                className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-md text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition"
                                title="Open the order detail in admin"
                              >
                                <ExternalLink className="w-4 h-4" />
                                <span className="hidden xs:inline sm:inline">Order</span>
                              </Link>
                            )}
                            <Badge className={`${getStatusColor(order.status)} text-xs flex-shrink-0`}>{order.status}</Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats Grid - KIT3-A (task #244): rolling readiness +
              skeleton during load so the chef doesn't read "0 / 0 /
              0 / 0" as genuine zeros before data arrives. */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6 md:mb-8">
            {loading ? (
              [0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 rounded-xl bg-white/60 border border-slate-200 animate-pulse" />
              ))
            ) : (
              <>
                <MetricCard
                  icon={Calendar}
                  iconColor="text-orange-600"
                  label="Today's orders"
                  value={todayOrders.length}
                  tooltip={"Orders happening today that the kitchen is actively working on.\nIncludes anything confirmed, in prep, or ready to go."}
                />
                <MetricCard
                  icon={Users}
                  iconColor="text-blue-600"
                  label="Total guests"
                  value={todayOrders.reduce((sum, o) => sum + (o.guest_count || 0), 0)}
                  tooltip={"How many people you're cooking for today across all events.\nUse this to size your portions and prep list."}
                />
                <MetricCard
                  icon={Clock}
                  iconColor="text-orange-600"
                  label="In prep"
                  value={orders.filter(o => o.status === "preparing").length}
                  tooltip={"Orders the kitchen is busy prepping right now.\nUpdates the moment someone ticks a task off."}
                />
                <MetricCard
                  icon={CheckCircle}
                  iconColor="text-green-600"
                  label="Ready"
                  value={orders.filter(o => o.status === "ready").length}
                  tooltip={"Orders packed and waiting for the driver to collect.\nDrivers see these the moment you mark them ready."}
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
                    <MetricCard
                      icon={Sparkles}
                      iconColor={pct == null ? "text-slate-400" : pct >= 75 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-rose-600"}
                      label="Prep readiness"
                      value={pct == null ? "—" : `${pct}%`}
                      tooltip={
                        pct == null
                          ? "No prep tasks recorded yet for the active orders. Once the kitchen ticks anything off this rolls up automatically."
                          : `${done} of ${total} prep tasks done across every active order.\nUnder 40% in amber, under 75% still warming up, 75%+ on track.`
                      }
                    />
                  );
                })()}
              </>
            )}
          </div>

          {/* KIT2-R: ingredient delta banner. Sits ABOVE Low Stock so
              the moment butter arrives the chef sees "+2 kg butter"
              before Low Stock recomputes and quietly drops the row.
              Teal accent to distinguish from the amber Low Stock card. */}
          {Object.keys(restockDeltas).length > 0 && (
            <Card className="border-0 shadow-lg mb-6 sm:mb-8 border-l-4 border-l-teal-500">
              <CardHeader className="px-3 sm:px-4 md:px-6 pb-3 flex flex-row items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-teal-700 dark:text-teal-400">
                  <Package className="w-5 h-5" />
                  Just restocked
                </CardTitle>
                <button
                  type="button"
                  onClick={() => setRestockDeltas({})}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white min-h-11 px-3"
                  aria-label="Clear restock list"
                >
                  Got it
                </button>
              </CardHeader>
              <CardContent className="px-3 sm:px-4 md:px-6">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(restockDeltas).map(([id, info]) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-300 text-sm font-medium"
                    >
                      <span className="text-teal-600 dark:text-teal-400">+{info.delta}{info.unit ? ` ${info.unit}` : ""}</span>
                      <span>{info.name}</span>
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Low Stock Alerts */}
          {lowStockItems.length > 0 && (
            <Card className="border-0 shadow-lg mb-6 sm:mb-8 border-l-4 border-l-amber-500">
              <CardHeader className="px-3 sm:px-4 md:px-6 pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-5 h-5" />
                  Low Stock Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-4 md:px-6">
                <div className="space-y-2">
                  {lowStockItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Package className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        <div>
                          <p className="font-medium text-sm text-slate-900 dark:text-white">{item.item_name}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            Current: {item.current_stock} {item.unit_of_measure} | Minimum: {item.minimum_stock}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700">
                        Low Stock
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* KIT3-A: calm "All quiet" card when there's no next
              pickup but the page IS loaded. Previously the next-
              pickup card vanished silently and the chef saw blank
              space where the headline used to be - "did it crash?".
              Now they see a clear "no live pickups" reassurance. */}
          {!loading && !nextPickup && orders.length === 0 && needsClosureOrders.length === 0 && (
            <Card className="border-0 shadow-sm mb-4 sm:mb-6 border-l-4 border-l-slate-300 bg-slate-50/60">
              <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Next pickup</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-700 leading-tight mt-1">
                    All quiet
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    No live orders right now. Use the breather to prep ahead, deep-clean, or restock.
                  </p>
                </div>
                <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 text-slate-400" />
              </CardContent>
            </Card>
          )}

          {/* KIT3-A: realtime stale indicator. The 5 channel
              subscriptions silently drop on flaky kitchen WiFi. This
              chip surfaces when no realtime event has landed in 2+
              min so the chef knows to thumb-refresh. */}
          {realtimeStale && (
            <div className="mb-3 inline-flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
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
              isLate ? "bg-red-50 border-l-red-500" :
              isSoon ? "bg-amber-50 border-l-amber-500" :
                       "bg-emerald-50 border-l-emerald-500";
            const statusTone =
              isLate ? "bg-red-600 text-white" :
              isSoon ? "bg-amber-500 text-white" :
                       "bg-emerald-600 text-white";
            const iconTone =
              isLate ? "text-red-500" :
              isSoon ? "text-amber-500" :
                       "text-emerald-500";
            return (
              <Card className={`border-0 shadow-lg mb-4 sm:mb-6 border-l-4 ${tone}`}>
                <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-xs uppercase tracking-wide text-slate-600 font-semibold">Next pickup</p>
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${statusTone}`}>
                        {statusWord}
                      </span>
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">
                      {when.dayLabel} <span className="tabular-nums">{when.timeLabel}</span>
                    </p>
                    <p className="text-sm text-slate-600 mt-1 truncate">
                      <span className="font-medium text-slate-700">{nextPickup.eventName}</span>
                      {nextPickup.client && <span className="text-slate-500">, {nextPickup.client}</span>}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{away}</p>
                  </div>
                  <Clock className={`w-10 h-10 sm:w-12 sm:h-12 shrink-0 ${iconTone}`} />
                </CardContent>
              </Card>
            );
          })()}

          {/* Wave 70.21 - Needs closure panel for past-event orders
              stuck in confirmed / preparing because the team didn't
              tick them through in real time. Admin / owner only --
              kitchen staff shouldn't be force-closing orders. Each
              row has a single Close out button that cascades through
              prep + ready + collect + delivery + audit in one call. */}
          {canSeeAdminOrderDetail && needsClosureOrders.length > 0 && (
            <Card className="border-0 shadow-md mb-4 sm:mb-6 border-l-4 border-l-amber-500 bg-amber-50/40">
              <CardHeader className="px-3 sm:px-4 md:px-6 pb-2">
                <CardTitle className="text-sm sm:text-base flex items-center gap-2 text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Needs closure
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">
                    {needsClosureOrders.length}
                  </Badge>
                  <InfoTooltip content="Orders whose event was hours ago but the team didn't tick them through. Force-close cascades all the prep tasks + ready + collected + delivered stamps in one click. Audit-logged. Owner / admin only." />
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-4 md:px-6 pb-3">
                <ul className="space-y-2">
                  {needsClosureOrders.map((o: any) => {
                    const dt = new Date(`${o.event_date}T${o.event_time || "12:00"}`);
                    const ago = Math.floor((now.getTime() - dt.getTime()) / 3_600_000);
                    const label = `${o.event_name || o.client_name || "Event"}${o.order_number ? ` (${o.order_number})` : ""}`;
                    return (
                      <li key={o.id} className="flex items-center justify-between gap-2 bg-white border border-amber-200 rounded-md px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {o.event_name || o.client_name || "Event"}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {o.order_number && <span className="tabular-nums mr-1">{o.order_number}</span>}
                            {o.event_date} {o.event_time?.slice(0, 5) || ""} &middot; {ago > 24 ? `${Math.floor(ago / 24)}d` : `${ago}h`} ago &middot; still {o.status}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleForceClose(o.id, label)}
                          disabled={forceClosingId === o.id}
                          className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 text-xs h-8 flex-shrink-0"
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
                <p className="text-[11px] text-amber-700 mt-2">
                  Force-close marks all prep tasks done, stamps the delivery/collect times, and flips the order to delivered. Audit-logged. Use for paperwork tidy-up after a real-world event the team forgot to tick.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Phase 4: tomorrow + day-after preview. Quiet glance card so the
              kitchen sees what's brewing before it lands as "Active orders".
              Hidden when nothing's coming up to keep the page calm. */}
          {upcoming.length > 0 && (
            <Card className="border-0 shadow-md mb-4">
              <CardHeader className="px-3 sm:px-4 md:px-6 pb-2">
                <CardTitle className="text-sm sm:text-base flex items-center gap-2 text-slate-700">
                  <Calendar className="w-4 h-4 text-orange-500" />
                  What's coming up
                  <InfoTooltip content="Confirmed orders for the next two days. Not yet in the active board, this is your prep-ahead heads-up." />
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-4 md:px-6 pb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {upcoming.map((day) => {
                    const d = new Date(day.date);
                    const isTomorrow = d.toDateString() === new Date(Date.now() + 86400000).toDateString();
                    const label = isTomorrow ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
                    return (
                      <div key={day.date} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-semibold text-slate-900">{label}</div>
                          <div className="flex items-center gap-3 text-xs text-slate-600">
                            <span className="inline-flex items-center gap-1"><Package className="w-3 h-3" />{day.orders}</span>
                            <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{day.guests}</span>
                            {day.earliest_event_time && (
                              <span className="inline-flex items-center gap-1 tabular-nums"><Clock className="w-3 h-3" />{day.earliest_event_time.slice(0, 5)}</span>
                            )}
                          </div>
                        </div>
                        <ul className="space-y-1">
                          {day.items.slice(0, 4).map((it) => (
                            <li key={it.id} className="text-xs text-slate-600 flex items-center gap-2">
                              <span className="tabular-nums text-slate-400 w-10 shrink-0">{it.event_time?.slice(0, 5) || "--"}</span>
                              <span className="font-medium text-slate-700 truncate flex-1 min-w-0">{it.event_name || it.client_name}</span>
                              <span className="text-slate-500 tabular-nums shrink-0">{it.guest_count} pax</span>
                            </li>
                          ))}
                          {day.items.length > 4 && (
                            <li className="text-[11px] text-slate-400 italic">+ {day.items.length - 4} more</li>
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Active orders, kanban (Confirmed / In prep / Ready) */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="px-3 sm:px-4 md:px-6">
              <CardTitle className="text-base sm:text-lg md:text-xl flex items-center gap-2">
                Active orders
                <InfoTooltip content="Three columns: Confirmed (waiting to start) → In prep (cooking now) → Ready (waiting for driver). Move cards by completing tasks. Tap Mark ready to notify the driver." />
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-4 md:px-6">
              {loading ? (
                <div className="text-center py-8 text-sm text-slate-600">Loading orders...</div>
              ) : orders.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-3" />
                  <p className="text-sm font-medium text-slate-700">All caught up - no live orders right now.</p>
                  <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">
                    Orders show up here automatically once the admin confirms a quote. Use the breather to deep-clean or restock.
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
                }> = [
                  // KIT3-A: standardised empty-state copy across the
                  // three lanes. Was three different voices ("Nothing
                  // confirmed yet" / "No prep in flight" / "Nothing
                  // ready yet").
                  { key: "confirmed", label: "Confirmed",  empty: "No confirmed orders waiting",  tone: "border-l-blue-400 bg-blue-50/50" },
                  { key: "preparing", label: "In prep",    empty: "No orders in prep right now",  tone: "border-l-amber-400 bg-amber-50/50" },
                  { key: "ready",     label: "Ready",      empty: "No orders ready to collect",   tone: "border-l-emerald-400 bg-emerald-50/50" },
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
                        col.key === "confirmed" ? "bg-blue-50 border-blue-200 text-blue-800" :
                        col.key === "preparing" ? "bg-amber-50 border-amber-200 text-amber-800" :
                                                  "bg-emerald-50 border-emerald-200 text-emerald-800";
                      return (
                      <div key={col.key} className="flex flex-col rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden">
                        <div className={`flex items-center justify-between px-3 py-2 border-b ${headerTone}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide">
                            {col.label}
                          </p>
                          <Badge variant="outline" className="text-[10px] tabular-nums bg-white">
                            {byStatus[col.key].length}
                          </Badge>
                        </div>
                        <div className="space-y-2 min-h-[100px] p-2">
                          {byStatus[col.key].length === 0 ? (
                            <div className="text-xs text-slate-400 italic px-2 py-3 border border-dashed border-slate-200 rounded-md text-center">
                              {col.empty}
                            </div>
                          ) : byStatus[col.key].map((order: any) => {
                            const eventDt = order.event_time
                              ? new Date(`${order.event_date}T${order.event_time}`)
                              : new Date(`${order.event_date}T12:00`);
                            const minsToEvent = isNaN(eventDt.getTime())
                              ? null
                              : (eventDt.getTime() - now.getTime()) / 60_000;
                            const tone =
                              minsToEvent != null && minsToEvent < 0     ? "border-l-red-500 bg-red-50/50" :
                              minsToEvent != null && minsToEvent < 120   ? "border-l-amber-500 bg-amber-50/50" :
                                                                            col.tone;

                            const prog = progressByOrder[order.id] || { total: 0, done: 0 };
                            const pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;

                            return (
                              <div
                                key={order.id}
                                className={`p-3 rounded-md border-l-4 border border-slate-200 bg-white hover:shadow transition-all ${tone}`}
                              >
                                {/* Wave 70.18 - card title block + order
                                    number. No longer a tiny link --
                                    proper action buttons live below
                                    (View ticket + View order). */}
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-900 truncate">
                                      {order.event_name || order.client_name || "Order"}
                                    </p>
                                    {order.event_name && order.client_name && (
                                      <p className="text-[11px] text-slate-500 truncate">
                                        for {order.client_name}
                                      </p>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
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
                                  <div className="mb-1 flex items-center gap-1.5 rounded border border-red-300 bg-red-50 px-2 py-1">
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                    <p className="text-[11px] font-semibold text-red-800 truncate" title={String((order as any).dietary_requirements)}>
                                      {String((order as any).dietary_requirements)}
                                    </p>
                                  </div>
                                )}
                                {(order as any).venue_address && (
                                  <p className="text-[11px] text-slate-500 truncate mb-1">
                                    📍 {(order as any).venue_address}
                                  </p>
                                )}
                                <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                                  <span className="inline-flex items-center gap-1">
                                    <Users className="w-3 h-3" />{order.guest_count} pax
                                  </span>
                                  {minsToEvent != null && (
                                    <span className={`inline-flex items-center gap-1 tabular-nums font-medium ${
                                      minsToEvent < 0    ? "text-red-700"   :
                                      minsToEvent < 120  ? "text-amber-700" :
                                                            "text-slate-600"
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
                                    <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                                      <span>Prep tasks</span>
                                      <span className="tabular-nums">{prog.done} of {prog.total}</span>
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                      <div
                                        className={`h-full ${
                                          pct >= 100 ? "bg-emerald-500" :
                                          pct >= 50  ? "bg-blue-500"    :
                                                       "bg-slate-400"
                                        }`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Kitchen instructions inline (compact) */}
                                {order.kitchen_instructions && (
                                  <p className="mt-2 text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded px-2 py-1 line-clamp-2">
                                    {order.kitchen_instructions}
                                  </p>
                                )}

                                {/* Wave 70.18 - proper action button row.
                                    Replaces the previous small text link
                                    on the title. Two clear targets:
                                      "Kitchen ticket" - the printable
                                        prep sheet with allergens, prep
                                        backplan, equipment, instructions.
                                      "Order detail" - the full admin
                                        order modal (for kitchen leads who
                                        need the wider context, e.g.
                                        payment + driver + handover).
                                    Routes to the team-portal/kitchen URL
                                    space so the middleware doesn't block
                                    real kitchen-staff users. */}
                                {/* KIT2-K (KIT2-39): tap targets bumped
                                    from h-8 (32px) to min-h-11 (44px).
                                    Floured-hands tap landing. */}
                                <div className={`mt-2 grid gap-1.5 ${canSeeAdminOrderDetail ? "grid-cols-2" : "grid-cols-1"}`}>
                                  <Link
                                    href={withSlug(`/team-portal/kitchen/orders/${order.id}/ticket`)}
                                    className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-md text-sm font-medium bg-orange-50 border border-orange-200 text-orange-800 hover:bg-orange-100 hover:border-orange-300 transition"
                                    title="Open the printable kitchen ticket"
                                  >
                                    <ChefHat className="w-4 h-4" />
                                    Kitchen ticket
                                  </Link>
                                  {canSeeAdminOrderDetail && (
                                    <Link
                                      href={withSlug(`/admin/orders?orderId=${order.id}`)}
                                      className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-md text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition"
                                      title="Open the order detail in admin"
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                      Order detail
                                    </Link>
                                  )}
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
                                    className="w-full mt-2 min-h-11 text-sm gap-1.5 bg-emerald-600 hover:bg-emerald-700"
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
                                      <p className="mt-2 text-[11px] text-emerald-700 font-medium inline-flex items-center gap-1">
                                        <Truck className="w-3 h-3" />Waiting for pickup
                                      </p>
                                    );
                                  }
                                  if (hold.overdue) {
                                    return (
                                      <div className="mt-2 text-[11px] font-semibold text-red-800 bg-red-100 border border-red-300 rounded px-2 py-1 inline-flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        Hot {hold.holdMin}m, past {maxHotHoldMin}m hold
                                      </div>
                                    );
                                  }
                                  return (
                                    <p className={`mt-2 text-[11px] font-medium inline-flex items-center gap-1 ${
                                      hold.holdMin > maxHotHoldMin * 0.7 ? "text-amber-700" : "text-emerald-700"
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
                                  <div className="mt-2 pt-2 border-t border-slate-200 space-y-2">
                                    <PrepTaskTimer orderId={order.id} />
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
                                  <div className="mt-2 pt-2 border-t border-slate-200">
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
            </CardContent>
          </Card>
        </div>

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
              className="bg-emerald-600 hover:bg-emerald-700"
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
          run-sheet that covers today + tomorrow + day-after, not 12
          per-order kitchen tickets. Allergens render with bold red
          flags so they survive the printer. */}
      <div id="print-kitchen-run-sheet" className="print-only">
        <h1 style={{ fontSize: "20pt", marginBottom: "4pt", fontFamily: "sans-serif" }}>
          Kitchen run sheet
        </h1>
        <p style={{ fontSize: "10pt", color: "#475569", marginBottom: "14pt", fontFamily: "sans-serif" }}>
          {new Date().toLocaleString("en-ZA", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          {" - "}
          {orders.length} {orders.length === 1 ? "order" : "orders"} today + next 2 days
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
                        {prog.total > 0 ? `${prog.done}/${prog.total}` : "–"}
                      </td>
                      <td style={{ padding: "5pt 4pt" }}>
                        {o.dietary_requirements ? (
                          <span style={{ color: "#dc2626", fontWeight: 700 }}>
                            ⚠ {o.dietary_requirements}
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