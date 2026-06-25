/**
 * Stock-pressure triage. The owner's morning glance for "what's tight
 * this week" and "what do I need to chase / buy RIGHT NOW".
 *
 * STK-B (stock deferred, 2026-05-24) extends the page beyond the
 * three-tile snapshot:
 *   - Stockout-risk forecast (next 7 days, sources inventory_demand_outlook)
 *   - Auto-generate shopping list from low-stock card -> /admin/shopping
 *   - Equipment double-booking detection (overlapping bookings on same equipment_id)
 *   - Per-event readiness gauge (% ingredients short, hire-ins outstanding)
 *   - Aging hire-in escalation banner (>7 days overdue)
 *   - Re-order point trend (items breaching minimum repeatedly in 30d)
 *   - Supplier-contribution leaderboard (whose items keep going low)
 *   - Lead-time vs urgency red flag (when supplier can't deliver in time)
 *   - Wastage hints (last 30 days of write-offs)
 *   - Realtime channel on inventory_items + equipment_hire_orders
 *   - Equipment window 7/14/30 day selector
 *   - Filter URL persistence
 *
 * Plus the must-fix items the audit flagged:
 *   - "at or below minimum" copy honesty
 *   - Hire-in overdue red flag + days-late sub-line
 *   - Hero copy rewrite into operator-language
 *   - Draft-state plain-English mapping
 *   - "X need attention" scroll-to-anchor
 *   - CSV UTF-8 BOM
 *   - captureException with route + step + companyId tags
 *   - Drop unused total_cost from select (finance gating hygiene)
 *   - Group hire-in rows by (supplier, expected_pickup_date)
 *   - "Hire-in pending" button renamed to "Hire-in orders" and rerouted
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader } from "@/components/portal/ui";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { toLocalISO } from "@/lib/localDate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { supabase } from "@/integrations/supabase/client";
import { inventoryService } from "@/services/inventoryService";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { captureException } from "@/lib/observability";
import {
  Package, Truck, ShoppingBag, AlertTriangle, Loader2, TrendingUp,
  Boxes, ClipboardList, ArrowRight, Filter, MapPin, Download,
  ZapOff, Phone, Clock, Trash2, Sparkles, ListChecks,
} from "lucide-react";

interface AlertRow {
  key: string;
  kind: "ingredient" | "equipment" | "hire-in";
  title: string;
  subtitle: string;
  date: string;       // ISO yyyy-mm-dd, or "" for unspecified
  severity: "red" | "amber" | "blue";
  href: string;
}

interface StockoutItem {
  inventory_item_id: string;
  item_name: string;
  current_stock: number;
  demand_next_7_days: number;
  shortfall_next_7_days: number;
  status: string;
  unit_of_measure: string | null;
}

interface DoubleBooking {
  equipmentId: string;
  equipmentName: string;
  dates: string[];
  bookings: number;
}

interface EventReadiness {
  orderId: string;
  eventDate: string;
  clientName: string;
  ingredientsShort: number;
  hireInsPending: number;
  /** 0-100. Composite: ingredients ready + hire-ins received. */
  readinessPct: number;
}

interface AgingHireIn {
  supplierName: string;
  oldestDate: string;
  count: number;
}

interface ReorderTrend {
  inventoryItemId: string;
  itemName: string;
  breachCount: number;
}

interface SupplierContribution {
  supplierId: string;
  supplierName: string;
  lowItemCount: number;
}

interface LeadTimeFlag {
  inventoryItemId: string;
  itemName: string;
  leadTimeDays: number;
  daysUntilNeed: number;
}

interface WastageEntry {
  inventoryItemId: string;
  itemName: string;
  totalWasted: number;
  unit: string;
}

type EquipWindow = 7 | 14 | 30;
type FilterChip = "all" | "ingredient" | "equipment" | "hire-in";

const severityClasses: Record<string, string> = {
  red:   "border-red-300 bg-red-50",
  amber: "border-amber-300 bg-amber-50",
  blue:  "border-sky-300 bg-sky-50",
};

const severityIcon: Record<string, string> = {
  red:   "text-red-600",
  amber: "text-amber-600",
  blue:  "text-sky-600",
};

const dateFmt = (iso: string) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-ZA", {
      day: "numeric", month: "short",
    });
  } catch { return iso; }
};

/**
 * STK-B: map raw hire-in status enum to operator-language. Pre-STK-B
 * the page rendered "(draft)" with no legend; ops had no clue what
 * action it implied.
 */
const HIRE_STATUS_LABEL: Record<string, string> = {
  draft: "Not yet placed",
  ordered: "Awaiting supplier confirmation",
  confirmed: "Confirmed - awaiting pickup",
  "in-transit": "On the way",
};

function StockPage() {
  const { user, profile } = useAuth() as { user: { id?: string; company_id?: string } | null; profile: { company_id?: string } | null };
  const { withSlug } = useTenantHref();
  const companyId = profile?.company_id || user?.company_id;
  const { regionFilterId, options: regionOptions } = useRegionFilter();
  const { toast } = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(true);

  // STK-B: filter chip persists to URL so the operator can bookmark
  // a curated view. Same pattern leads / contacts use.
  const [filterChip, setFilterChip] = useState<FilterChip>("all");
  useEffect(() => {
    if (!router.isReady) return;
    const t = typeof router.query.type === "string" ? router.query.type : "";
    if (t === "all" || t === "ingredient" || t === "equipment" || t === "hire-in") {
      setFilterChip(t as FilterChip);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);
  const setFilterChipPersisted = (next: FilterChip) => {
    setFilterChip(next);
    const q = { ...router.query, type: next === "all" ? undefined : next };
    void router.replace({ pathname: router.pathname, query: q }, undefined, { shallow: true });
  };

  // STK-B: equipment window selector. Pre-STK-B 14d was hard-locked;
  // tenants planning 4 weeks out saw "0 commitments" and assumed
  // the page was broken. Persisted to localStorage per device.
  const [equipWindow, setEquipWindow] = useState<EquipWindow>(14);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("adminStock-equipWindowDays");
      if (stored === "7" || stored === "14" || stored === "30") {
        setEquipWindow(Number(stored) as EquipWindow);
      }
    } catch { /* defaults */ }
  }, []);
  const setEquipWindowPersisted = (n: EquipWindow) => {
    setEquipWindow(n);
    try { localStorage.setItem("adminStock-equipWindowDays", String(n)); } catch { /* non-blocking */ }
  };

  // Tile data
  const [lowStock, setLowStock] = useState<{ count: number; top5: Array<{ id: string; item_name: string; current_stock: number; minimum_stock: number }> }>({ count: 0, top5: [] });
  const [equipPressure, setEquipPressure] = useState<{ count: number; peakDate: string | null }>({ count: 0, peakDate: null });
  const [hireIn, setHireIn] = useState<{ count: number; oldest: string | null }>({ count: 0, oldest: null });
  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  // STK-B: deferred intel state.
  const [stockouts, setStockouts] = useState<StockoutItem[]>([]);
  const [doubleBookings, setDoubleBookings] = useState<DoubleBooking[]>([]);
  const [eventReadiness, setEventReadiness] = useState<EventReadiness[]>([]);
  const [agingHireIns, setAgingHireIns] = useState<AgingHireIn[]>([]);
  const [reorderTrend, setReorderTrend] = useState<ReorderTrend[]>([]);
  const [supplierContribution, setSupplierContribution] = useState<SupplierContribution[]>([]);
  const [leadTimeFlags, setLeadTimeFlags] = useState<LeadTimeFlag[]>([]);
  const [wastage, setWastage] = useState<WastageEntry[]>([]);
  const [generatingShop, setGeneratingShop] = useState(false);

  const regionLabel = useMemo(() => {
    if (!regionFilterId) return null;
    return (regionOptions.find((r: { id: string; label?: string }) => r.id === regionFilterId) as { label?: string } | undefined)?.label || null;
  }, [regionFilterId, regionOptions]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const today = new Date();
    const todayISO = toLocalISO(today);
    const horizonISO = toLocalISO(new Date(today.getTime() + equipWindow * 24 * 3600 * 1000));
    const in30ISO = toLocalISO(new Date(today.getTime() + 30 * 24 * 3600 * 1000));
    const last30ISO = toLocalISO(new Date(today.getTime() - 30 * 24 * 3600 * 1000));

    try {
      // Low stock
      const lowItems = await inventoryService.getLowStockItems(companyId);
      type LowItem = { id: string; item_name: string; current_stock: number | null; minimum_stock: number | null; unit_of_measure?: string | null; region_id?: string | null; is_shared?: boolean; preferred_supplier_id?: string | null };
      const filteredLow = (regionFilterId
        ? lowItems.filter((i) => {
            const r = i as unknown as LowItem;
            return r.region_id === regionFilterId || r.is_shared;
          })
        : lowItems) as unknown as LowItem[];
      const top5Low = filteredLow.slice(0, 5).map((i) => ({
        id: i.id,
        item_name: i.item_name,
        current_stock: Number(i.current_stock || 0),
        minimum_stock: Number(i.minimum_stock || 0),
      }));
      setLowStock({ count: filteredLow.length, top5: top5Low });

      // Equipment commitments next Nd
      const bookingsSelect = regionFilterId
        ? "id, booked_from, booked_to, quantity, status, equipment_id, equipment:equipment_id(id, name), orders!inner(region_id)"
        : "id, booked_from, booked_to, quantity, status, equipment_id, equipment:equipment_id(id, name)";
      let bookingsQ = supabase
        .from("equipment_bookings")
        .select(bookingsSelect)
        .eq("company_id", companyId)
        .gte("booked_from", todayISO)
        .lte("booked_from", horizonISO)
        .neq("status", "cancelled")
        .order("booked_from", { ascending: true });
      if (regionFilterId) {
        bookingsQ = bookingsQ.eq("orders.region_id", regionFilterId);
      }
      const { data: bookingRows } = await bookingsQ;
      type BookingRow = {
        id: string; booked_from: string | null; booked_to: string | null;
        quantity: number | null; status: string; equipment_id: string;
        equipment: { id: string; name: string } | null;
      };
      const bRows = (bookingRows || []) as unknown as BookingRow[];
      const dayCount: Record<string, number> = {};
      for (const b of bRows) {
        const d = (b.booked_from || "").slice(0, 10);
        dayCount[d] = (dayCount[d] || 0) + 1;
      }
      const peakDate = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      setEquipPressure({ count: bRows.length, peakDate });

      // STK-B: equipment double-booking detection. Walks the bookings
      // in the window grouped by equipment_id and flags overlap pairs.
      // Operators care about "same chiller booked to two events that
      // weekend" - one of them will lose out.
      const bookingsByEquip: Record<string, BookingRow[]> = {};
      for (const b of bRows) {
        const eid = b.equipment_id;
        if (!eid) continue;
        (bookingsByEquip[eid] ||= []).push(b);
      }
      const dblBooks: DoubleBooking[] = [];
      for (const [eid, list] of Object.entries(bookingsByEquip)) {
        if (list.length < 2) continue;
        // Sort by booked_from then walk; any pair where bookA.booked_to
        // > bookB.booked_from is an overlap.
        const sorted = [...list].sort((a, b) => (a.booked_from || "").localeCompare(b.booked_from || ""));
        const conflictDates = new Set<string>();
        for (let i = 0; i < sorted.length - 1; i++) {
          const a = sorted[i];
          const b = sorted[i + 1];
          const aEnd = a.booked_to || a.booked_from;
          const bStart = b.booked_from;
          if (aEnd && bStart && aEnd > bStart) {
            conflictDates.add((bStart || "").slice(0, 10));
          }
        }
        if (conflictDates.size > 0) {
          dblBooks.push({
            equipmentId: eid,
            equipmentName: list[0].equipment?.name || "Equipment",
            dates: Array.from(conflictDates).sort(),
            bookings: list.length,
          });
        }
      }
      setDoubleBookings(dblBooks);

      // Hire-in pending receipts
      // STK-B: dropped total_cost from the select (was unused on the
      // page, kept the door open to leak finance data to non-finance
      // roles). The cost lives on /admin/shopping where the role gate
      // already enforces visibility.
      const hireSelect = regionFilterId
        ? "id, expected_pickup_date, expected_return_date, status, supplier_name, equipment_name, quantity, orders!inner(region_id)"
        : "id, expected_pickup_date, expected_return_date, status, supplier_name, equipment_name, quantity";
      let hireQ = supabase
        .from("equipment_hire_orders")
        .select(hireSelect)
        .eq("company_id", companyId)
        .in("status", ["draft", "ordered", "confirmed", "in-transit"])
        .order("expected_pickup_date", { ascending: true, nullsFirst: false });
      if (regionFilterId) {
        hireQ = hireQ.eq("orders.region_id", regionFilterId);
      }
      const { data: hireRows } = await hireQ;
      type HireRow = {
        id: string; expected_pickup_date: string | null; expected_return_date: string | null;
        status: string; supplier_name: string | null; equipment_name: string | null;
        quantity: number | null;
      };
      const hRows = (hireRows || []) as unknown as HireRow[];
      const oldest = hRows[0]?.expected_pickup_date || null;
      setHireIn({ count: hRows.length, oldest });

      // STK-B: aging hire-in escalation banner. Group by supplier the
      // overdue orders (expected pickup more than 7 days ago and not
      // yet received) so the operator can call the right supplier.
      const sevenDaysAgo = toLocalISO(new Date(today.getTime() - 7 * 24 * 3600 * 1000));
      const overdueBySupp: Record<string, { dates: string[]; count: number }> = {};
      for (const h of hRows) {
        const pickup = (h.expected_pickup_date || "").slice(0, 10);
        if (!pickup || pickup >= sevenDaysAgo) continue;
        const supp = h.supplier_name || "Unknown supplier";
        const cur = overdueBySupp[supp] || { dates: [], count: 0 };
        cur.dates.push(pickup);
        cur.count += 1;
        overdueBySupp[supp] = cur;
      }
      const agingList: AgingHireIn[] = Object.entries(overdueBySupp).map(([supplierName, v]) => ({
        supplierName,
        oldestDate: v.dates.sort()[0],
        count: v.count,
      })).sort((a, b) => a.oldestDate.localeCompare(b.oldestDate));
      setAgingHireIns(agingList);

      // Stockout risk (next 7 days)
      // STK-B: inventory_demand_outlook view computes shortfall against
      // upcoming order demand. Status enum lists 'critical', 'warning'
      // etc; we take only those with a real next-7-day shortfall.
      const outlookQ = supabase
        .from("inventory_demand_outlook")
        .select("inventory_item_id, item_name, current_stock, demand_next_7_days, shortfall_next_7_days, status, unit_of_measure")
        .eq("company_id", companyId)
        .gt("shortfall_next_7_days", 0)
        .order("shortfall_next_7_days", { ascending: false })
        .limit(20);
      const { data: outlookRows } = await outlookQ;
      const stockoutList: StockoutItem[] = ((outlookRows || []) as unknown as Array<{
        inventory_item_id: string | null; item_name: string | null;
        current_stock: number | null; demand_next_7_days: number | null;
        shortfall_next_7_days: number | null; status: string | null;
        unit_of_measure: string | null;
      }>)
        .filter((r) => !!r.inventory_item_id)
        .map((r) => ({
          inventory_item_id: r.inventory_item_id!,
          item_name: r.item_name || "Unnamed",
          current_stock: Number(r.current_stock || 0),
          demand_next_7_days: Number(r.demand_next_7_days || 0),
          shortfall_next_7_days: Number(r.shortfall_next_7_days || 0),
          status: r.status || "unknown",
          unit_of_measure: r.unit_of_measure,
        }));
      setStockouts(stockoutList);

      // Per-event readiness (next equipWindow days)
      // STK-B: for each upcoming confirmed order, count short ingredients
      // (from outlook) and pending hire-ins. Composite readiness pct =
      // 100 - (shorts + pending hire-ins clamped). Operators get one
      // gauge per event so a "70% ready Friday" event jumps out.
      const orderSelect = regionFilterId
        ? "id, event_date, status, client_name, region_id"
        : "id, event_date, status, client_name";
      let ordersQ = supabase
        .from("orders")
        .select(orderSelect)
        .eq("company_id", companyId)
        .in("status", ["confirmed", "preparing", "ready"])
        .gte("event_date", todayISO)
        .lte("event_date", horizonISO)
        .is("deleted_at", null)
        .order("event_date", { ascending: true });
      if (regionFilterId) {
        ordersQ = ordersQ.eq("region_id", regionFilterId);
      }
      const { data: orderRows } = await ordersQ;
      type OrderRow = { id: string; event_date: string | null; status: string; client_name: string | null };
      const oRows = ((orderRows || []) as unknown as OrderRow[]).filter((o) => !!o.event_date);

      const eventReadinessList: EventReadiness[] = [];
      if (oRows.length > 0 && oRows.length <= 50) {
        // Pull hire-ins per order in one batch.
        const orderIds = oRows.map((o) => o.id);
        type HireWithOrder = { order_id: string | null; status: string };
        // Cast through any to dodge the deep type instantiation that
        // happens when the in() argument is a wide string[].
        const { data: hireByOrderRows } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { in: (k: string, v: string[]) => { in: (k: string, v: string[]) => Promise<{ data: HireWithOrder[] | null }> } } } } })
          .from("equipment_hire_orders")
          .select("order_id, status")
          .eq("company_id", companyId)
          .in("order_id", orderIds)
          .in("status", ["draft", "ordered", "confirmed", "in-transit"]);
        const hireByOrder: Record<string, number> = {};
        for (const h of (hireByOrderRows || []) as HireWithOrder[]) {
          if (!h.order_id) continue;
          hireByOrder[h.order_id] = (hireByOrder[h.order_id] || 0) + 1;
        }
        // We don't have per-order ingredient shortfall on the outlook
        // view (it's by inventory item). Use a coarse proxy: number of
        // stockouts cluster-attributed to events in this window. Same
        // count applied to each event in the cluster - good enough as
        // an "events at risk" lens until per-order shortfall lands.
        const sharedShortCount = stockoutList.length;
        for (const o of oRows) {
          const hPending = hireByOrder[o.id] || 0;
          const shorts = sharedShortCount;
          const issues = hPending + Math.min(5, shorts); // cap shorts contribution
          const readinessPct = Math.max(0, 100 - issues * 10);
          eventReadinessList.push({
            orderId: o.id,
            eventDate: (o.event_date || "").slice(0, 10),
            clientName: o.client_name || "Unnamed",
            ingredientsShort: shorts,
            hireInsPending: hPending,
            readinessPct,
          });
        }
      }
      setEventReadiness(eventReadinessList);

      // Re-order trend (low-stock breaches in last 30 days)
      // STK-B: an item that keeps slipping below minimum every week
      // signals either the threshold is too tight or the supplier
      // can't keep up. Count adjustment + usage events that pushed
      // stock under minimum in the last 30 days.
      type TxnRow = { inventory_item_id: string; transaction_type: string; quantity: number; created_at: string | null };
      const { data: txnRows } = await supabase
        .from("inventory_transactions")
        .select("inventory_item_id, transaction_type, quantity, created_at")
        .eq("company_id", companyId)
        .gte("created_at", last30ISO)
        .in("transaction_type", ["usage", "adjustment"]);
      const breachCount: Record<string, number> = {};
      for (const t of (txnRows || []) as unknown as TxnRow[]) {
        if (Number(t.quantity || 0) >= 0) continue; // only deductions matter
        breachCount[t.inventory_item_id] = (breachCount[t.inventory_item_id] || 0) + 1;
      }
      // Names from the low-stock list we already have; supplement from
      // a quick id->name lookup for anything not in the low list.
      const lowNameMap = new Map(filteredLow.map((i) => [i.id, i.item_name]));
      const trendIds = Object.entries(breachCount)
        .filter(([, n]) => n >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      const missingNameIds = trendIds.map(([id]) => id).filter((id) => !lowNameMap.has(id));
      if (missingNameIds.length > 0) {
        const { data: extraNames } = await supabase
          .from("inventory_items")
          .select("id, item_name")
          .in("id", missingNameIds);
        for (const r of (extraNames || []) as unknown as Array<{ id: string; item_name: string }>) {
          lowNameMap.set(r.id, r.item_name);
        }
      }
      setReorderTrend(trendIds.map(([id, n]) => ({
        inventoryItemId: id,
        itemName: lowNameMap.get(id) || "Unnamed",
        breachCount: n,
      })));

      // Supplier contribution leaderboard
      // STK-B: which supplier's items keep going low? Group low-stock
      // items by preferred_supplier_id and rank.
      const lowBySupplier: Record<string, number> = {};
      const supplierIdsToName = new Set<string>();
      for (const i of filteredLow) {
        const sid = i.preferred_supplier_id;
        if (!sid) continue;
        lowBySupplier[sid] = (lowBySupplier[sid] || 0) + 1;
        supplierIdsToName.add(sid);
      }
      const supplierList: SupplierContribution[] = [];
      if (supplierIdsToName.size > 0) {
        const { data: supplierNames } = await supabase
          .from("suppliers")
          // suppliers has no `name` column - it's supplier_name everywhere
          // else. Alias so the s.name consumer below stays unchanged.
          .select("id, name:supplier_name")
          .in("id", Array.from(supplierIdsToName));
        const nameMap = new Map(
          ((supplierNames || []) as unknown as Array<{ id: string; name: string | null }>)
            .map((s) => [s.id, s.name || "Unnamed supplier"]),
        );
        for (const [sid, count] of Object.entries(lowBySupplier)) {
          supplierList.push({
            supplierId: sid,
            supplierName: nameMap.get(sid) || "Unnamed supplier",
            lowItemCount: count,
          });
        }
        supplierList.sort((a, b) => b.lowItemCount - a.lowItemCount);
      }
      setSupplierContribution(supplierList.slice(0, 5));

      // Lead-time vs urgency flag
      // STK-B: for each low-stock item with a preferred supplier link
      // and a lead_time_days, compare to the days-until-next-event
      // that consumes this item. If lead time > days until need, we're
      // already late - red flag the line so the operator subs it out.
      // Simplified MVP: use the soonest order in window as the "need"
      // date proxy. Per-recipe ingredient mapping is heavier and lands
      // in a follow-up.
      const soonestEvent = oRows[0]?.event_date || null;
      const daysUntilSoonest = soonestEvent
        ? Math.max(0, Math.ceil((new Date(soonestEvent).getTime() - today.getTime()) / 86_400_000))
        : null;
      const leadFlags: LeadTimeFlag[] = [];
      if (daysUntilSoonest != null && filteredLow.length > 0) {
        const lowIds = filteredLow.map((i) => i.id);
        type SupplierLink = { inventory_item_id: string; lead_time_days: number | null; is_preferred: boolean };
        const { data: linkRows } = await supabase
          .from("inventory_item_suppliers")
          .select("inventory_item_id, lead_time_days, is_preferred")
          .eq("company_id", companyId)
          .in("inventory_item_id", lowIds)
          .eq("is_preferred", true);
        for (const link of (linkRows || []) as unknown as SupplierLink[]) {
          const lead = Number(link.lead_time_days || 0);
          if (lead <= 0) continue;
          if (lead <= daysUntilSoonest) continue;
          const nm = lowNameMap.get(link.inventory_item_id) || "Unnamed";
          leadFlags.push({
            inventoryItemId: link.inventory_item_id,
            itemName: nm,
            leadTimeDays: lead,
            daysUntilNeed: daysUntilSoonest,
          });
        }
        leadFlags.sort((a, b) => (b.leadTimeDays - b.daysUntilNeed) - (a.leadTimeDays - a.daysUntilNeed));
      }
      setLeadTimeFlags(leadFlags.slice(0, 5));

      // Wastage hints (last 30 days)
      // STK-B: sum waste transactions per item over 30 days. Surfaces
      // "you wrote off 8kg of brisket" so the operator can investigate
      // storage / portioning / shelf-life issues.
      type WasteRow = { inventory_item_id: string; quantity: number };
      const { data: wasteRows } = await supabase
        .from("inventory_transactions")
        .select("inventory_item_id, quantity")
        .eq("company_id", companyId)
        .eq("transaction_type", "waste")
        .gte("created_at", last30ISO);
      const wasteByItem: Record<string, number> = {};
      for (const w of (wasteRows || []) as unknown as WasteRow[]) {
        const id = w.inventory_item_id;
        if (!id) continue;
        wasteByItem[id] = (wasteByItem[id] || 0) + Math.abs(Number(w.quantity || 0));
      }
      const wasteIds = Object.keys(wasteByItem).sort((a, b) => wasteByItem[b] - wasteByItem[a]).slice(0, 5);
      const wasteList: WastageEntry[] = [];
      if (wasteIds.length > 0) {
        const { data: wasteNames } = await supabase
          .from("inventory_items")
          .select("id, item_name, unit_of_measure")
          .in("id", wasteIds);
        const wasteNameMap = new Map(
          ((wasteNames || []) as unknown as Array<{ id: string; item_name: string; unit_of_measure: string | null }>)
            .map((w) => [w.id, { item_name: w.item_name, unit_of_measure: w.unit_of_measure }]),
        );
        for (const id of wasteIds) {
          const info = wasteNameMap.get(id);
          if (!info) continue;
          wasteList.push({
            inventoryItemId: id,
            itemName: info.item_name,
            totalWasted: wasteByItem[id],
            unit: info.unit_of_measure || "",
          });
        }
      }
      setWastage(wasteList);

      // Unified feed
      const feed: AlertRow[] = [];

      for (const i of filteredLow) {
        const cur = Number(i.current_stock || 0);
        const min = Number(i.minimum_stock || 0);
        const reorderBuf = min * 1.5;
        const sev: "red" | "amber" = cur <= min ? "red" : (cur <= reorderBuf ? "amber" : "amber");
        feed.push({
          key: `i:${i.id}`,
          kind: "ingredient",
          title: i.item_name || "Unnamed item",
          subtitle: `${cur} ${i.unit_of_measure || ""} on hand, min ${min}`.trim(),
          date: "",
          severity: sev,
          href: `/admin/inventory?id=${i.id}`,
        });
      }

      for (const b of bRows) {
        const d = (b.booked_from || "").slice(0, 10);
        feed.push({
          key: `e:${b.id}`,
          kind: "equipment",
          title: b.equipment?.name || "Equipment booking",
          subtitle: `${b.quantity || 1}x committed for ${dateFmt(d)}`,
          date: d,
          severity: "blue",
          href: "/admin/equipment",
        });
      }

      // STK-B: group hire-in rows by (supplier, expected_pickup_date)
      // so 8 lines on the same event collapse to one row.
      const hireGroups: Record<string, { count: number; supplier: string; date: string; status: string; firstId: string }> = {};
      for (const h of hRows) {
        const pickup = (h.expected_pickup_date || "").slice(0, 10);
        const supp = h.supplier_name || "Unknown supplier";
        const key = `${supp}::${pickup}`;
        if (!hireGroups[key]) {
          hireGroups[key] = { count: 0, supplier: supp, date: pickup, status: h.status, firstId: h.id };
        }
        hireGroups[key].count += h.quantity || 1;
      }
      for (const [key, g] of Object.entries(hireGroups)) {
        const isOverdue = g.date && g.date < todayISO;
        const statusLabel = HIRE_STATUS_LABEL[g.status] || g.status;
        feed.push({
          key: `h:${key}`,
          kind: "hire-in",
          title: g.supplier === "Unknown supplier"
            ? `Hire-in x ${g.count}`
            : `${g.supplier} - ${g.count} item${g.count === 1 ? "" : "s"}`,
          subtitle: g.date
            ? `${isOverdue ? "OVERDUE - was due" : "Pickup expected"} ${dateFmt(g.date)} - ${statusLabel}`
            : `Status: ${statusLabel}`,
          date: g.date,
          severity: isOverdue ? "red" : "amber",
          href: "/admin/shopping?tab=hire-in",
        });
      }

      // Sort: dated items by date asc, undated (low stock) first.
      feed.sort((a, b) => {
        if (!a.date && b.date) return -1;
        if (a.date && !b.date) return 1;
        if (!a.date && !b.date) return 0;
        return a.date < b.date ? -1 : 1;
      });

      setAlerts(feed);
    } catch (err: unknown) {
      captureException(err, { tags: { route: "/admin/stock", step: "load", companyId } });
      toast({
        title: "Could not load stock view",
        description: err instanceof Error ? err.message : "Check your connection and retry.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [companyId, regionFilterId, equipWindow, toast]);

  useEffect(() => { void load(); }, [load]);

  // STK-B: realtime channel. Receive-stock on /admin/shopping or a
  // hire-in status change should refresh this page automatically.
  // Debounced 1.5s to absorb update clusters.
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 1500);
    };
    const channel = supabase
      .channel(`stock:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_hire_orders", filter: `company_id=eq.${companyId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "equipment_bookings", filter: `company_id=eq.${companyId}` }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const filteredAlerts = useMemo(() => {
    if (filterChip === "all") return alerts;
    return alerts.filter((a) => a.kind === filterChip);
  }, [alerts, filterChip]);

  const totalAttention = lowStock.count + equipPressure.count + hireIn.count;

  // STK-B: auto-generate shopping list from low-stock items.
  // Creates a shopping_lists row + shopping_list_items in one round
  // trip per write, then deep-links to /admin/shopping for the
  // operator to walk through. Saves the manual "OK what was low again?"
  // step every morning.
  const handleGenerateShoppingList = async () => {
    if (!companyId || lowStock.count === 0) {
      toast({ title: "Nothing low to add", description: "All inventory above minimum." });
      return;
    }
    setGeneratingShop(true);
    try {
      // Pull the FULL low-stock list (top5 was for the card) plus
      // reorder_quantity so we can pre-fill sensible quantities.
      const { data: fullLow } = await supabase
        .from("inventory_items")
        .select("id, item_name, current_stock, minimum_stock, maximum_stock, reorder_quantity, unit_of_measure, category")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      type FullLow = { id: string; item_name: string; current_stock: number | null; minimum_stock: number | null; maximum_stock: number | null; reorder_quantity: number | null; unit_of_measure: string | null; category: string | null };
      const filtered = ((fullLow || []) as unknown as FullLow[]).filter((i) => {
        const cur = Number(i.current_stock || 0);
        const min = Number(i.minimum_stock || 0);
        if (min > 0) return cur <= min;
        return cur < 0;
      });
      if (filtered.length === 0) {
        toast({ title: "Nothing low to add", description: "Inventory refreshed - all above minimum now." });
        return;
      }
      const { data: listRow, error: listErr } = await (supabase as unknown as {
        from: (t: string) => {
          insert: (v: Record<string, unknown>) => {
            select: (s: string) => {
              single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
            };
          };
        };
      })
        .from("shopping_lists")
        .insert({
          company_id: companyId,
          shopper_id: user?.id || null,
          list_date: todayISO(),
          source: "auto_low_stock",
          status: "draft",
          notes: `Auto-generated from low-stock at ${new Date().toLocaleString("en-ZA")}`,
        })
        .select("id")
        .single();
      if (listErr || !listRow) throw new Error(listErr?.message || "Could not create list");
      const items = filtered.map((i) => {
        const cur = Number(i.current_stock || 0);
        const min = Number(i.minimum_stock || 0);
        const max = Number(i.maximum_stock || 0);
        const reorderQty = Number(i.reorder_quantity || 0);
        // Quantity to buy: reorder_quantity if set, else top up to max,
        // else top up to min + 50% buffer.
        const qty = reorderQty > 0 ? reorderQty
          : max > 0 ? Math.max(1, max - cur)
          : Math.max(1, Math.ceil(min * 1.5 - cur));
        return {
          shopping_list_id: listRow.id,
          item_id: i.id,
          name: i.item_name,
          quantity: qty,
          unit: i.unit_of_measure || "",
          category: i.category || null,
          purchased: false,
          user_id: user?.id || null,
        };
      });
      const { error: itemsErr } = await (supabase as unknown as {
        from: (t: string) => {
          insert: (v: Record<string, unknown>[]) => Promise<{ error: { message: string } | null }>;
        };
      })
        .from("shopping_list_items")
        .insert(items);
      if (itemsErr) throw new Error(itemsErr.message);
      toast({
        title: `Shopping list created with ${items.length} item${items.length === 1 ? "" : "s"}`,
        description: "Opening on /admin/shopping...",
      });
      void router.push(withSlug(`/admin/shopping?list=${listRow.id}`));
    } catch (err: unknown) {
      captureException(err, { tags: { route: "/admin/stock", step: "generate-shopping-list", companyId } });
      toast({
        title: "Could not generate list",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setGeneratingShop(false);
    }
  };

  const todayISO = () => toLocalISO(new Date());
  const today = new Date();
  const daysSince = (iso: string) => {
    if (!iso) return 0;
    return Math.max(0, Math.floor((today.getTime() - new Date(iso).getTime()) / 86_400_000));
  };
  const hireOldestOverdue = hireIn.oldest && daysSince(hireIn.oldest.slice(0, 10)) > 0;
  const hireOverdueDays = hireIn.oldest ? daysSince(hireIn.oldest.slice(0, 10)) : 0;

  return (
    <>
      <NoIndexMeta />
      <Head><title>Stock - CateringMS</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          <PortalHeader
            title="Stock"
            icon={Boxes}
            subtitle={
              <>
                {/* STK-B: operator-language hero copy. "Pressure feed"
                    was too clever; this names the three pillars. */}
                What needs your attention today: stock running low, equipment committed for upcoming events, and hire-in orders still pending.
                {regionLabel && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-500">
                    <MapPin className="w-3 h-3" /> {regionLabel}
                  </span>
                )}
              </>
            }
            actions={
            <>
              {totalAttention > 0 && (
                <a
                  href="#needs-attention"
                  className="inline-flex items-center"
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById("needs-attention")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <Badge variant="destructive" className="bg-amber-500 hover:bg-amber-600 cursor-pointer">
                    {totalAttention} need{totalAttention === 1 ? "s" : ""} attention
                  </Badge>
                </a>
              )}
              <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                Refresh
              </Button>
            </>
            }
          />

          {/* STK-B: aging hire-in escalation banner. Loud when one or
              more suppliers owe orders that are >7 days overdue. */}
          {agingHireIns.length > 0 && (
            <Card className="border-0 shadow-sm bg-rose-50 border-l-4 border-l-rose-500 mb-4">
              <CardContent className="py-3 px-4 flex items-start gap-3 flex-wrap">
                <Phone className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-rose-900">Suppliers to chase today</p>
                  <ul className="text-xs text-rose-800/90 mt-0.5 space-y-0.5">
                    {agingHireIns.map((a) => (
                      <li key={a.supplierName}>
                        <span className="font-medium">{a.supplierName}</span> - {a.count} order{a.count === 1 ? "" : "s"} since {dateFmt(a.oldestDate)} ({daysSince(a.oldestDate)} days overdue)
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Three top tiles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6 mb-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="w-4 h-4 text-red-600" />
                  Low stock
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="text-4xl font-bold text-slate-900">{loading ? "..." : lowStock.count}</span>
                  {/* STK-B: copy honesty. Pre-STK-B said "below minimum"
                      but the rule is <= min (Baby Potatoes 2/2 was AT
                      min, counted as below). */}
                  <span className="text-xs text-slate-600">item{lowStock.count === 1 ? "" : "s"} at or below minimum</span>
                </div>
                {lowStock.top5.length > 0 && (
                  <ul className="space-y-1.5">
                    {lowStock.top5.map((i) => {
                      const cur = i.current_stock;
                      const min = i.minimum_stock;
                      const isCrit = cur <= min;
                      return (
                        <li key={i.id} className="flex items-center justify-between text-xs">
                          <span className="truncate text-slate-700">{i.item_name}</span>
                          <Badge
                            variant="secondary"
                            className={`ml-2 flex-shrink-0 ${isCrit ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
                            title={`On hand: ${cur} - Minimum: ${min}`}
                          >
                            {cur}/{min}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {/* STK-B: auto-generate shopping list - the action the
                    operator was always going to take next. Saves the
                    manual copy-paste step. */}
                <div className="mt-3 flex gap-1.5">
                  <Link href={withSlug("/admin/inventory")} className="flex-1">
                    <Button variant="ghost" size="sm" className="w-full text-xs gap-1">
                      Manage <ArrowRight className="w-3 h-3" />
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    className="flex-1 text-xs gap-1 bg-brand-primary hover:bg-brand-primary/90"
                    onClick={handleGenerateShoppingList}
                    disabled={generatingShop || lowStock.count === 0}
                    title={lowStock.count === 0 ? "Nothing low to add" : "Create a shopping list with all low-stock items"}
                  >
                    {generatingShop
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Sparkles className="w-3 h-3" />}
                    Auto-list
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Truck className="w-4 h-4 text-sky-600" />
                    Equipment
                  </CardTitle>
                  {/* STK-B: window selector. 14d default, 7/14/30
                      toggle. localStorage-persisted. */}
                  <div className="flex gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 text-[10px]">
                    {([7, 14, 30] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setEquipWindowPersisted(n)}
                        className={`px-1.5 py-0.5 rounded ${
                          equipWindow === n ? "bg-sky-600 text-white font-medium" : "text-slate-600"
                        }`}
                      >
                        {n}d
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="text-4xl font-bold text-slate-900">{loading ? "..." : equipPressure.count}</span>
                  <span className="text-xs text-slate-600">commitment{equipPressure.count === 1 ? "" : "s"}</span>
                </div>
                <p className="text-xs text-slate-600">
                  {equipPressure.peakDate
                    ? <>Peak day: <span className="font-semibold text-slate-900">{dateFmt(equipPressure.peakDate)}</span></>
                    : `No commitments in next ${equipWindow}d`}
                </p>
                {doubleBookings.length > 0 && (
                  <p className="text-[10px] text-rose-700 mt-1 inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {doubleBookings.length} double-booking{doubleBookings.length === 1 ? "" : "s"}
                  </p>
                )}
                <Link href={withSlug("/admin/equipment-shortages")}>
                  <Button variant="ghost" size="sm" className="w-full mt-3 text-xs gap-1">
                    Equipment shortages <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingBag className="w-4 h-4 text-amber-600" />
                  Hire-in pending
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-3 mb-3">
                  <span className="text-4xl font-bold text-slate-900">{loading ? "..." : hireIn.count}</span>
                  <span className="text-xs text-slate-600">awaiting receipt</span>
                </div>
                {/* STK-B: overdue red flag with days-late sub-line. */}
                {hireIn.oldest ? (
                  <p className={`text-xs ${hireOldestOverdue ? "text-rose-700" : "text-slate-600"}`}>
                    Oldest:{" "}
                    <span className={`font-semibold ${hireOldestOverdue ? "text-rose-900" : "text-slate-900"}`}>
                      {dateFmt((hireIn.oldest || "").slice(0, 10))}
                    </span>
                    {hireOldestOverdue && <> - {hireOverdueDays}d overdue</>}
                  </p>
                ) : (
                  <p className="text-xs text-slate-600">All caught up</p>
                )}
                {/* STK-B: rename "Shopping" -> "Hire-in orders" + route
                    to /admin/shopping?tab=hire-in (or /admin/equipment
                    ?tab=hire-in once that lands). "Shopping" reads as
                    groceries to operators. */}
                <Link href={withSlug("/admin/shopping?tab=hire-in")}>
                  <Button variant="ghost" size="sm" className="w-full mt-3 text-xs gap-1">
                    Hire-in orders <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* STK-B: stockout risk forecast (next 7 days). */}
          {stockouts.length > 0 && (
            <Card className="border-0 shadow-lg mb-6 border-l-4 border-l-red-500 bg-red-50/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <ZapOff className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                  Stockout risk - next 7 days
                </CardTitle>
                <p className="text-xs text-slate-600 mt-1">
                  Items where projected demand from confirmed orders exceeds current stock. Order now or sub before the day-of-prep panic.
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {stockouts.slice(0, 10).map((s) => (
                    <li key={s.inventory_item_id} className="flex items-center justify-between gap-3 text-sm">
                      <Link href={withSlug(`/admin/inventory?id=${s.inventory_item_id}`)} className="flex-1 min-w-0 hover:underline">
                        <span className="font-medium text-slate-900 truncate">{s.item_name}</span>
                      </Link>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-500 tabular-nums">
                          have {s.current_stock} {s.unit_of_measure || ""}, need {s.demand_next_7_days}
                        </span>
                        <Badge variant="destructive" className="tabular-nums">
                          short {s.shortfall_next_7_days} {s.unit_of_measure || ""}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
                {stockouts.length > 10 && (
                  <p className="text-[10px] text-slate-500 italic mt-2">
                    + {stockouts.length - 10} more shortfall{stockouts.length - 10 === 1 ? "" : "s"}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* STK-B: per-event readiness gauge. One row per upcoming
              event in the equipment-window. Bar fills based on a
              composite (ingredients short + hire-ins outstanding). */}
          {eventReadiness.length > 0 && (
            <Card className="border-0 shadow-lg mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <ListChecks className="w-4 h-4 sm:w-5 sm:h-5 text-brand-primary" />
                  Event readiness - next {equipWindow} days
                </CardTitle>
                <p className="text-xs text-slate-600 mt-1">
                  How close each upcoming event is to being fully prepped. Anything below 70% needs follow-through this week.
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {eventReadiness.slice(0, 8).map((e) => {
                    const tone = e.readinessPct >= 85 ? "bg-brand-primary"
                      : e.readinessPct >= 70 ? "bg-amber-500"
                      : "bg-rose-500";
                    return (
                      <li key={e.orderId}>
                        <Link href={withSlug(staffOrderHref(e.orderId, "shopping_staff"))} className="block hover:bg-slate-50 rounded-md px-1 py-1.5">
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span className="font-medium text-slate-900 truncate flex-1 min-w-0">
                              {dateFmt(e.eventDate)} - {e.clientName}
                            </span>
                            <span className="text-slate-500 tabular-nums ml-2">{e.readinessPct}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full ${tone}`} style={{ width: `${e.readinessPct}%` }} />
                          </div>
                          {(e.ingredientsShort > 0 || e.hireInsPending > 0) && (
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {e.ingredientsShort > 0 && <>{e.ingredientsShort} item{e.ingredientsShort === 1 ? "" : "s"} short</>}
                              {e.ingredientsShort > 0 && e.hireInsPending > 0 && " - "}
                              {e.hireInsPending > 0 && <>{e.hireInsPending} hire-in{e.hireInsPending === 1 ? "" : "s"} outstanding</>}
                            </p>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* STK-B: double-bookings + lead-time + reorder trend +
              supplier contribution + wastage. Compact intel grid. */}
          {(doubleBookings.length > 0 || leadTimeFlags.length > 0 || reorderTrend.length > 0 || supplierContribution.length > 0 || wastage.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {doubleBookings.length > 0 && (
                <Card className="border-0 shadow-sm border-l-4 border-l-rose-500">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide font-semibold text-rose-700 mb-2 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Equipment double-booked
                    </p>
                    <ul className="text-xs space-y-1">
                      {doubleBookings.slice(0, 5).map((d) => (
                        <li key={d.equipmentId} className="flex justify-between">
                          <span className="truncate text-slate-900">{d.equipmentName}</span>
                          <span className="text-slate-500 ml-2 tabular-nums">{d.dates.map(dateFmt).join(", ")}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
              {leadTimeFlags.length > 0 && (
                <Card className="border-0 shadow-sm border-l-4 border-l-rose-500">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide font-semibold text-rose-700 mb-2 inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Won't arrive in time
                    </p>
                    <ul className="text-xs space-y-1">
                      {leadTimeFlags.map((f) => (
                        <li key={f.inventoryItemId} className="flex justify-between gap-2">
                          <span className="truncate text-slate-900">{f.itemName}</span>
                          <span className="text-slate-500 tabular-nums">
                            {f.leadTimeDays}d lead, {f.daysUntilNeed}d to next event
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[10px] text-slate-500 mt-2">Sub these out or change supplier.</p>
                  </CardContent>
                </Card>
              )}
              {reorderTrend.length > 0 && (
                <Card className="border-0 shadow-sm border-l-4 border-l-amber-500">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide font-semibold text-amber-700 mb-2 inline-flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Re-order point too tight
                    </p>
                    <ul className="text-xs space-y-1">
                      {reorderTrend.map((t) => (
                        <li key={t.inventoryItemId} className="flex justify-between gap-2">
                          <span className="truncate text-slate-900">{t.itemName}</span>
                          <span className="text-slate-500 tabular-nums">{t.breachCount}x in 30d</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[10px] text-slate-500 mt-2">Raise the minimum or find a closer supplier.</p>
                  </CardContent>
                </Card>
              )}
              {supplierContribution.length > 0 && (
                <Card className="border-0 shadow-sm border-l-4 border-l-slate-400">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide font-semibold text-slate-700 mb-2 inline-flex items-center gap-1">
                      <Truck className="w-3 h-3" /> Top suppliers by low-stock
                    </p>
                    <ul className="text-xs space-y-1">
                      {supplierContribution.map((s) => (
                        <li key={s.supplierId} className="flex justify-between gap-2">
                          <span className="truncate text-slate-900">{s.supplierName}</span>
                          <span className="text-slate-500 tabular-nums">{s.lowItemCount} item{s.lowItemCount === 1 ? "" : "s"}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
              {wastage.length > 0 && (
                <Card className="border-0 shadow-sm border-l-4 border-l-slate-400">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide font-semibold text-slate-700 mb-2 inline-flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> Wastage, last 30 days
                    </p>
                    <ul className="text-xs space-y-1">
                      {wastage.map((w) => (
                        <li key={w.inventoryItemId} className="flex justify-between gap-2">
                          <span className="truncate text-slate-900">{w.itemName}</span>
                          <span className="text-slate-500 tabular-nums">{w.totalWasted.toFixed(2)} {w.unit}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[10px] text-slate-500 mt-2">Check storage, portioning, or shelf life.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Needs attention feed */}
          <Card id="needs-attention" className="border-0 shadow-lg mb-6 scroll-mt-20">
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                  Needs attention
                </CardTitle>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  {(["all", "ingredient", "equipment", "hire-in"] as const).map((c) => (
                    <Button
                      key={c}
                      size="sm"
                      variant={filterChip === c ? "default" : "outline"}
                      onClick={() => setFilterChipPersisted(c)}
                      className="h-7 px-2.5 text-xs capitalize"
                    >
                      {c === "all" ? "All" : c === "hire-in" ? "Hire-in" : c[0].toUpperCase() + c.slice(1) + "s"}
                    </Button>
                  ))}
                  {/* STK-B: BOM-prefixed CSV. Excel-ZA renders ZAR + diacritics
                      correctly. Same fix every other admin export needed. */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (filteredAlerts.length === 0) {
                        toast({ title: "Nothing to export", description: "No alerts in the current filter." });
                        return;
                      }
                      const esc = (v: string | number | null | undefined) => {
                        if (v == null) return "";
                        const s = String(v).replace(/"/g, '""');
                        return /[",\n]/.test(s) ? `"${s}"` : s;
                      };
                      const headers = ["Kind", "Severity", "Title", "Subtitle", "Date", "Link"];
                      const lines = [headers.join(",")];
                      for (const a of filteredAlerts) {
                        lines.push([
                          esc(a.kind), esc(a.severity), esc(a.title),
                          esc(a.subtitle), esc(a.date), esc(a.href),
                        ].join(","));
                      }
                      const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = `stock-alerts-${toLocalISO(new Date())}.csv`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                    }}
                    className="h-7 px-2.5 text-xs"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : filteredAlerts.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">Nothing flagged. Stock looks healthy.</p>
              ) : (
                <ul className="space-y-2">
                  {filteredAlerts.length > 30 && (
                    <li className="text-xs text-slate-500 italic px-1">
                      Showing the first 30 of {filteredAlerts.length}. Use the CSV export for the full list.
                    </li>
                  )}
                  {filteredAlerts.slice(0, 30).map((a) => (
                    <li key={a.key}>
                      <Link
                        href={withSlug(a.href)}
                        className={`flex items-start sm:items-center justify-between gap-3 p-3 rounded-lg border-l-4 ${severityClasses[a.severity]} hover:bg-white transition-colors`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${severityIcon[a.severity]}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{a.title}</p>
                            <p className="text-xs text-slate-600 truncate">{a.subtitle}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                            {a.kind === "hire-in" ? "Hire-in" : a.kind}
                          </Badge>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* STK-B: dropped the Shortcuts grid - the three KPI tiles
              above already reach Inventory / Equipment / Hire-in.
              Duplicate destinations was the audit smell. */}
        </PortalShell>
      </div>
    </>
  );
}

export default function AdminStockPage() {
  return (
    // STK-A (stock audit, STK-3): admit sales_admin (advise on
    // ordering) + region_admin (regional inventory pressure).
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <StockPage />
    </ProtectedRoute>
  );
}
