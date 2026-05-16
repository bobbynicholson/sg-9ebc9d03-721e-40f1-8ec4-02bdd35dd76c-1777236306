/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Truck, Clock, Users, Search, RefreshCw, Sparkles, ChevronDown, ChevronRight, X, CheckCircle2, MapPin, Filter, ArrowUpRight, ExternalLink, User as UserIcon, Truck as TruckIcon, Snowflake as SnowflakeIcon, Users as UsersIcon, Download } from "lucide-react";
import Link from "next/link";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { ToastAction } from "@/components/ui/toast";
import { supabase } from "@/integrations/supabase/client";
import {
  dispatchService,
  type DispatchSettings,
  type DispatchSuggestion,
  minutesUntilSlaBreach,
  formatMinutesAsCountdown,
} from "@/services/dispatchService";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
import { SortHeader } from "@/components/ui/sort-header";
import { VehiclePickerDialog } from "@/components/admin/dispatch/VehiclePickerDialog";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";

interface OrderRow {
  id: string;
  client_id: string | null;
  client_name: string;
  event_date: string;
  event_time: string | null;
  venue: string;
  status: string;
  total_amount: number;
  venue_lat: number | null;
  venue_lng: number | null;
  confirmed_at: string | null;
  assigned_driver_id: string | null;
  assigned_driver_name: string | null;
  assigned_at: string | null;
  assignment_score: number | null;
  assigned_chef_id: string | null;
  assigned_chef_name: string | null;
  // Fleet fields surfaced on the dispatch queue so the operator can
  // see the booked vehicle inline and override it from the row.
  assigned_vehicle_id: string | null;
  assigned_vehicle_plate: string | null;
  assigned_vehicle_refrigerated: boolean | null;
  secondary_vehicle_id: string | null;
  secondary_vehicle_plate: string | null;
  requires_two_drivers: boolean;
  requires_refrigeration: boolean;
  requires_waiter: boolean;
  guest_count: number | null;
  // Wave 66.3 -- pickup_time is the time the driver leaves the
  // kitchen with the order. Used by kitchenPrepService to backplan
  // prep tasks. Now editable inline in the dispatch expanded drawer
  // because the readiness chip's "Pickup time missing" Fix-it link
  // routes here when only pickup is missing (it's a dispatch
  // decision, not an order detail).
  pickup_time: string | null;
}

const STATUSES: Array<{ value: string; label: string }> = [
  { value: "all",        label: "All confirmed" },
  { value: "unassigned", label: "No driver" },
  { value: "assigned",   label: "Driver assigned" },
  { value: "at_risk",    label: "At risk (SLA)" },
];

function DispatchQueuePage() {
  const router = useRouter();
  const { user, profile } = useAuth() as any;
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? user?.company_id ?? null;
  const userId = user?.id ?? "";
  // Phase 10 #1: tenant currency for the order_total render in
  // each row of the dispatch queue.
  const tenantCurrency = useTenantCurrency(companyId);
  const C = tenantCurrency.symbol;

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<DispatchSettings | null>(null);
  const [kpis, setKpis] = useState<{
    unassignedAtRisk: number;
    unassignedTotal: number;
    medianTimeToAssignMinutes: number | null;
    onShiftDrivers: number;
  } | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  // Wave 66.3 -- inline pickup_time editor state. Per-row local draft
  // so multiple drawers can be open in series without state collision;
  // savingId is set while the supabase update is in-flight to dim
  // the save button.
  const [pickupDraft, setPickupDraft] = useState<Record<string, string>>({});
  const [pickupSavingId, setPickupSavingId] = useState<string | null>(null);

  // Assign dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<OrderRow | null>(null);
  const [suggestions, setSuggestions] = useState<DispatchSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);

  // Vehicle picker dialog
  const [vehicleTarget, setVehicleTarget] = useState<OrderRow | null>(null);

  // Bulk dialog
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDriverId, setBulkDriverId] = useState("");
  const [bulkDrivers, setBulkDrivers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Audit log per order
  const [auditByOrder, setAuditByOrder] = useState<Record<string, any[]>>({});

  const searchRef = useRef<HTMLInputElement | null>(null);

  // ── Loaders ───────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [s, k] = await Promise.all([
        dispatchService.getDispatchSettings(companyId),
        dispatchService.getDispatchKpis(companyId),
      ]);
      setSettings(s);
      setKpis(k);

      const todayISO = toLocalISO(new Date());
      const { data: rows, error } = await supabase
        .from("orders")
        .select(`
          id, client_id, client_name, event_date, event_time, pickup_time, status, total_amount,
          venue_lat, venue_lng, venue_name, venue_address,
          confirmed_at, assigned_driver_id, assigned_at, assignment_score,
          assigned_chef_id,
          guest_count, requires_refrigeration, requires_waiter, requires_two_drivers,
          assigned_vehicle_id, secondary_vehicle_id,
          driver:assigned_driver_id(full_name),
          chef:assigned_chef_id(full_name),
          assigned_vehicle:assigned_vehicle_id(id, plate, refrigerated),
          secondary_vehicle:secondary_vehicle_id(id, plate)
        `)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("event_date", todayISO)
        .in("status", ["confirmed", "preparing", "ready", "in_transit"])
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true, nullsFirst: false });

      if (error) {
        console.error("Order load error:", error);
        setOrders([]);
        return;
      }
      const mapped: OrderRow[] = (rows || []).map((r: any) => ({
        id: r.id,
        client_id: r.client_id ?? null,
        client_name: r.client_name ?? "Unnamed",
        event_date: r.event_date,
        event_time: r.event_time ?? null,
        venue: r.venue_name ?? r.venue_address ?? "—",
        status: r.status ?? "confirmed",
        total_amount: Number(r.total_amount ?? 0),
        venue_lat: r.venue_lat ?? null,
        venue_lng: r.venue_lng ?? null,
        confirmed_at: r.confirmed_at ?? null,
        assigned_driver_id: r.assigned_driver_id ?? null,
        assigned_driver_name: r.driver?.full_name ?? null,
        assigned_at: r.assigned_at ?? null,
        assignment_score: r.assignment_score ?? null,
        assigned_chef_id: r.assigned_chef_id ?? null,
        assigned_chef_name: r.chef?.full_name ?? null,
        assigned_vehicle_id: r.assigned_vehicle_id ?? null,
        assigned_vehicle_plate: r.assigned_vehicle?.plate ?? null,
        assigned_vehicle_refrigerated: r.assigned_vehicle?.refrigerated ?? null,
        secondary_vehicle_id: r.secondary_vehicle_id ?? null,
        secondary_vehicle_plate: r.secondary_vehicle?.plate ?? null,
        requires_two_drivers: !!r.requires_two_drivers,
        requires_refrigeration: !!r.requires_refrigeration,
        requires_waiter: !!r.requires_waiter,
        guest_count: r.guest_count ?? null,
        pickup_time: r.pickup_time ?? null,
      }));
      setOrders(mapped);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Realtime: any order change refetches KPIs and the queue.
  useEffect(() => {
    if (!companyId) return;
    const sub = supabase
      .channel("dispatch-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_assignment_audit" }, () => loadAll())
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [companyId, loadAll]);

  // Wave 66.3 -- deeplink detection. When the URL carries
  // ?orderId=X (the readiness chip's "Pickup time missing -- Fix
  // it" link points here when only pickup is missing), auto-expand
  // that row once orders have loaded so the operator lands on the
  // inline editor instead of a generic queue page. Self-clears the
  // pickupDraft when navigating away.
  useEffect(() => {
    if (!router.isReady) return;
    const targetId = typeof router.query.orderId === "string" ? router.query.orderId : null;
    if (!targetId || orders.length === 0) return;
    if (orders.some((o) => o.id === targetId)) {
      setExpandedRowId(targetId);
      // Scroll the row into view after the next paint so the expansion
      // animation doesn't fight the scroll position.
      requestAnimationFrame(() => {
        const el = document.getElementById(`dispatch-row-${targetId}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [router.isReady, router.query.orderId, orders]);

  // Wave 66.3 -- persist pickup_time inline. Direct supabase update
  // keeps the round-trip tight (no orderService.updateOrder cascades
  // are wanted here -- pickup_time changes don't ripple to invoices
  // or quotes). Empty input clears to NULL so kitchenPrepService
  // falls back to event_time defaults.
  const savePickupTime = async (orderId: string) => {
    const draft = pickupDraft[orderId] ?? "";
    const next = draft.trim() || null;
    setPickupSavingId(orderId);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ pickup_time: next })
        .eq("id", orderId);
      if (error) {
        toast({ title: "Could not save", description: error.message, variant: "destructive" });
        return;
      }
      // Optimistic local update so the operator sees the saved time
      // immediately without a full requeue refetch.
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, pickup_time: next } : o));
      toast({ title: "Pickup time saved", description: next ? `Driver leaves the kitchen at ${next}.` : "Pickup time cleared." });
    } finally {
      setPickupSavingId(null);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable;
      if (e.key === "Escape") {
        if (expandedRowId) { setExpandedRowId(null); return; }
        if (selected.size > 0) { setSelected(new Set()); return; }
        if (searchTerm) { setSearchTerm(""); return; }
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "/": e.preventDefault(); searchRef.current?.focus(); break;
        case "b": case "B": e.preventDefault(); if (selected.size > 0) openBulk(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedRowId, selected, searchTerm]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const filteredRaw = useMemo(() => {
    let list = orders;
    if (statusFilter === "unassigned") list = list.filter(o => !o.assigned_driver_id);
    else if (statusFilter === "assigned") list = list.filter(o => o.assigned_driver_id);
    else if (statusFilter === "at_risk" && settings) {
      list = list.filter(o => {
        if (o.assigned_driver_id) return false;
        return minutesUntilSlaBreach(o.event_date, o.event_time, settings.slaAssignMinutes) <= 0;
      });
    }
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(o =>
        o.client_name.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        (o.venue || "").toLowerCase().includes(q) ||
        (o.assigned_driver_name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, statusFilter, searchTerm, settings]);

  // Click-to-sort on every queue column. Default to event date so the
  // soonest events bubble to the top when dispatch opens the page.
  const sortColumns: ColumnDef<any>[] = useMemo(() => [
    { key: "client", accessor: (o) => o.client_name,                 type: "string" },
    { key: "event",  accessor: (o) => `${o.event_date} ${o.event_time || ""}`, type: "string" },
    { key: "venue",  accessor: (o) => o.venue,                       type: "string" },
    { key: "driver", accessor: (o) => o.assigned_driver_name || "",  type: "string" },
    { key: "chef",   accessor: (o) => o.assigned_chef_name || "",    type: "string" },
  ], []);
  const sortedView = useSortable<any>(filteredRaw, sortColumns, { defaultKey: "event", defaultDir: "asc" });
  const filtered = sortedView.rows;

  // ── Selection ─────────────────────────────────────────────────────────────

  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const selectAllVisible = () => {
    const ids = filtered.map(o => o.id);
    setSelected(prev => {
      const all = ids.every(id => prev.has(id));
      const n = new Set(prev);
      ids.forEach(id => { if (all) n.delete(id); else n.add(id); });
      return n;
    });
  };

  // ── Assign dialog ─────────────────────────────────────────────────────────

  const openAssign = async (order: OrderRow) => {
    setAssignTarget(order);
    setAssignOpen(true);
    setSuggestions([]);
    setSuggestLoading(true);
    try {
      const result = await dispatchService.suggestDriversForOrder(companyId, {
        id: order.id,
        event_date: order.event_date,
        event_time: order.event_time,
        venue_lat: order.venue_lat,
        venue_lng: order.venue_lng,
        region_id: (order as any).region_id ?? null,
      }, 3);
      setSuggestions(result);
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleAssignPick = async (driverId: string, score?: number, reason?: string) => {
    if (!assignTarget) return;
    setAssignSaving(true);
    try {
      const r = await dispatchService.assignDriverWithGate({
        companyId,
        orderId: assignTarget.id,
        driverId,
        performedBy: userId,
        score,
        reason: reason ?? "Assigned from dispatch queue",
      });
      if (!r.ok) {
        const reason = r.reason || "";
        const lower = reason.toLowerCase();
        let hint = reason || "Capacity, vehicle or feasibility check rejected this driver.";
        if (lower.includes("shift")) {
          hint = `${reason}. Check the driver's shift on the Drivers page or pick someone still on shift.`;
        } else if (lower.includes("capacity") || lower.includes("load")) {
          hint = `${reason}. The driver is at their max for this slot. Try another suggestion.`;
        } else if (lower.includes("vehicle")) {
          hint = `${reason}. Assign or override the vehicle, then retry.`;
        }
        toast({ title: "Could not assign driver", description: hint, variant: "destructive" });
        return;
      }
      const driverName = suggestions.find(s => s.driver.id === driverId)?.driver.full_name ?? "Driver";
      const eventLabel = assignTarget.event_date + (assignTarget.event_time ? ` at ${assignTarget.event_time}` : "");
      // Phase 2 #4: surface a double-booking warning on warn-and-allow.
      // The assignment landed but the dispatcher needs to know they
      // just put this driver on two overlapping events.
      if (r.conflictWarning) {
        toast({
          title: `${driverName} assigned with conflict`,
          description: r.conflictWarning,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: `${driverName} assigned to ${assignTarget.client_name}`,
        description: `Event ${eventLabel}. Driver app updated.`,
        action: (
          <ToastAction
            altText="Undo this assignment"
            onClick={async () => {
              await dispatchService.unassignDriver({
                companyId, orderId: assignTarget.id, performedBy: userId,
                reason: "Undo assign",
              });
              loadAll();
              toast({ title: "Reverted", description: assignTarget.client_name });
            }}
          >Undo</ToastAction>
        ),
      });
      setAssignOpen(false);
      loadAll();
    } finally {
      setAssignSaving(false);
    }
  };

  // ── Bulk dialog ───────────────────────────────────────────────────────────

  const openBulk = async () => {
    setBulkOpen(true);
    setBulkDriverId("");
    if (companyId && bulkDrivers.length === 0) {
      const list = await dispatchService.getDriversForCompany(companyId);
      setBulkDrivers(list.map(d => ({ id: d.id, full_name: d.full_name })));
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkDriverId) return;
    setBulkSaving(true);
    try {
      const ids = Array.from(selected);
      const r = await dispatchService.bulkAssign({
        companyId, orderIds: ids, driverId: bulkDriverId, performedBy: userId,
      });
      const driverName = bulkDrivers.find(d => d.id === bulkDriverId)?.full_name ?? "Driver";
      const errSuffix = r.errors.length > 0
        ? ` · ${r.errors.length} skipped (capacity, vehicle or feasibility). Expand a row to see why`
        : "";
      toast({
        title: `${driverName} assigned on ${r.assigned} of ${ids.length} order${ids.length === 1 ? "" : "s"}`,
        description: `Driver app updated.${errSuffix}`,
        variant: r.errors.length > 0 && r.assigned === 0 ? "destructive" : undefined,
      });
      setSelected(new Set());
      setBulkOpen(false);
      loadAll();
    } finally {
      setBulkSaving(false);
    }
  };

  // ── Unassign ──────────────────────────────────────────────────────────────

  const [unassignBusy, setUnassignBusy] = useState<string | null>(null);

  const handleUnassign = async (order: OrderRow) => {
    setUnassignBusy(order.id);
    try {
      await dispatchService.unassignDriver({
        companyId, orderId: order.id, performedBy: userId, reason: "Unassigned from queue",
      });
      toast({
        title: `Driver removed from ${order.client_name}`,
        description: order.assigned_driver_name
          ? `${order.assigned_driver_name} no longer on this run. Order is back in the unassigned queue.`
          : "Order is back in the unassigned queue.",
      });
      loadAll();
    } catch (e: any) {
      toast({
        title: "Could not remove driver",
        description: e?.message || "Server rejected the change. Refresh and try again.",
        variant: "destructive",
      });
    } finally {
      setUnassignBusy(null);
    }
  };

  // ── Row expand: lazy load audit ───────────────────────────────────────────

  const toggleRow = async (orderId: string) => {
    if (expandedRowId === orderId) { setExpandedRowId(null); return; }
    setExpandedRowId(orderId);
    if (!auditByOrder[orderId]) {
      const audit = await dispatchService.getAssignmentAudit(orderId);
      setAuditByOrder(a => ({ ...a, [orderId]: audit }));
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <NoIndexMeta />
      <Head><title>Dispatch Queue - CateringMS Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 lg:pl-72 xl:pl-80">
        <div className="px-4 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          {/* Header */}
          <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-sm">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Dispatch queue</h1>
                <p className="text-sm text-slate-500">
                  Confirmed orders waiting on a driver. Auto-suggest a driver per order with capacity, vehicle, and shift checks, or override manually. Bulk-assign by date when prep is locked in.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 text-slate-500 hover:text-slate-900"
                onClick={loadAll}
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={openBulk}
                disabled={selected.size === 0}
              >
                <Users className="w-4 h-4" />
                Bulk assign ({selected.size})
              </Button>
              {/* Phase 20 #4: dispatch queue CSV export. Operations
                  lead regularly hands the queue off to a colleague,
                  drops it into a daily standup deck, or audits SLA
                  outcomes -- having a flat file beats screenshots.
                  Walks 'filtered' so the status + search + sort all
                  flow through. */}
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  if (filtered.length === 0) {
                    toast({ title: "Nothing to export", description: "Adjust the filter / search until at least one order is visible." });
                    return;
                  }
                  const esc = (v: any) => {
                    if (v == null) return "";
                    const s = String(v).replace(/"/g, '""');
                    return /[",\n]/.test(s) ? `"${s}"` : s;
                  };
                  const headers = [
                    "Event date", "Event time", "Client", "Venue", "Guests",
                    "Status", "Driver", "Vehicle", "Refrigeration",
                    "Two drivers", "Total amount", "Assigned at",
                  ];
                  const lines = [headers.join(",")];
                  for (const o of filtered as any[]) {
                    lines.push([
                      esc(o.event_date || ""),
                      esc(o.event_time || ""),
                      esc(o.client_name || ""),
                      esc(o.venue || ""),
                      esc(o.guest_count ?? ""),
                      esc(o.status || ""),
                      esc(o.assigned_driver_name || ""),
                      esc(o.assigned_vehicle_plate || ""),
                      esc(o.assigned_vehicle_refrigerated ? "yes" : "no"),
                      esc(o.requires_two_drivers ? "yes" : "no"),
                      esc(Number(o.total_amount || 0).toFixed(2)),
                      esc(o.assigned_at ? new Date(o.assigned_at).toISOString() : ""),
                    ].join(","));
                  }
                  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `dispatch-queue-${new Date().toISOString().slice(0, 10)}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <button
              type="button"
              onClick={() => setStatusFilter("at_risk")}
              className={`text-left rounded-lg border bg-white p-4 shadow-sm hover:shadow transition-all ${
                (kpis?.unassignedAtRisk ?? 0) > 0 ? "ring-2 ring-red-200 border-red-300" : "border-slate-200"
              } ${statusFilter === "at_risk" ? "ring-2 ring-red-300" : ""}`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  At risk (SLA)
                  <InfoTooltip content={"Unassigned orders whose event is within the SLA window. The number that should be zero by end of day."} />
                </p>
                <AlertTriangle className={`w-4 h-4 ${(kpis?.unassignedAtRisk ?? 0) > 0 ? "text-red-500" : "text-slate-300"}`} />
              </div>
              <p className={`text-2xl font-semibold ${(kpis?.unassignedAtRisk ?? 0) > 0 ? "text-red-700" : "text-slate-900"}`}>
                {kpis?.unassignedAtRisk ?? "—"}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {settings ? `event in < ${(settings.slaAssignMinutes / 60).toFixed(0)}h` : "—"}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("unassigned")}
              className={`text-left rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:shadow transition-all ${statusFilter === "unassigned" ? "ring-2 ring-slate-300" : ""}`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  No driver
                  <InfoTooltip content={"Confirmed orders with no driver assigned yet. Sort by event date."} />
                </p>
                <Truck className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-2xl font-semibold text-slate-900">{kpis?.unassignedTotal ?? "—"}</p>
              <p className="text-xs text-slate-500 mt-1">click to filter</p>
            </button>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  Median time to assign
                  <InfoTooltip content={"From order confirmed to driver assigned. Last 14 days. Shorter is better."} />
                </p>
                <Clock className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-2xl font-semibold text-slate-900">
                {kpis?.medianTimeToAssignMinutes != null
                  ? formatMinutesAsCountdown(kpis.medianTimeToAssignMinutes).replace("-", "")
                  : "—"}
              </p>
              <p className="text-xs text-slate-500 mt-1">last 14 days</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  Drivers on shift
                  <InfoTooltip content={"Drivers with a GPS ping in the last hour. Best signal we have for live availability without a real shift table."} />
                </p>
                <Users className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-semibold text-slate-900">{kpis?.onShiftDrivers ?? "—"}</p>
              <p className="text-xs text-slate-500 mt-1">last hour</p>
            </div>
          </div>

          {/* Search + filters */}
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm mb-4 p-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search client, order, venue, region, driver"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-12 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
                <kbd className="hidden sm:inline-block absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">/</kbd>
              </div>
              <Button variant="outline" size="sm" className="gap-2" disabled title="Coming soon">
                <Filter className="w-4 h-4" />
                Filters
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {STATUSES.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatusFilter(s.value)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                    statusFilter === s.value
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bulk actions bar */}
          {selected.size > 0 && (
            <div className="sticky top-2 z-20 mb-3 rounded-lg border border-slate-900 bg-slate-900 text-white shadow-lg flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">{selected.size} selected</span>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-xs text-slate-300 hover:text-white inline-flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear
                </button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={openBulk}
                className="text-white hover:bg-slate-800 gap-1.5 h-8"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Assign to driver
              </Button>
            </div>
          )}

          {/* Queue table */}
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Header */}
            <div className="hidden md:grid grid-cols-[28px_28px_minmax(0,2fr)_140px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_120px] gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider items-center">
              <div className="flex justify-center">
                <input
                  type="checkbox"
                  className="accent-orange-600 cursor-pointer"
                  checked={filtered.length > 0 && filtered.every(o => selected.has(o.id))}
                  ref={cb => {
                    if (cb) {
                      const all = filtered.length > 0 && filtered.every(o => selected.has(o.id));
                      const any = filtered.some(o => selected.has(o.id));
                      cb.indeterminate = any && !all;
                    }
                  }}
                  onChange={selectAllVisible}
                />
              </div>
              <div></div>
              <div>
                <SortHeader sortKey="client" activeKey={sortedView.sortKey} activeDir={sortedView.sortDir} onToggle={sortedView.toggle}>
                  Order / Client
                </SortHeader>
              </div>
              <div>
                <SortHeader sortKey="event" activeKey={sortedView.sortKey} activeDir={sortedView.sortDir} onToggle={sortedView.toggle}>
                  Event
                </SortHeader>
              </div>
              <div>
                <SortHeader sortKey="venue" activeKey={sortedView.sortKey} activeDir={sortedView.sortDir} onToggle={sortedView.toggle}>
                  Venue
                </SortHeader>
              </div>
              <div>
                <SortHeader sortKey="driver" activeKey={sortedView.sortKey} activeDir={sortedView.sortDir} onToggle={sortedView.toggle}>
                  Driver
                </SortHeader>
              </div>
              <div>
                <SortHeader sortKey="chef" activeKey={sortedView.sortKey} activeDir={sortedView.sortDir} onToggle={sortedView.toggle}>
                  Chef
                </SortHeader>
              </div>
              <div className="text-right">Actions</div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin w-6 h-6 border-2 border-orange-600 border-t-transparent rounded-full mx-auto mb-3" />
                <p className="text-sm text-slate-500">Loading queue...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 px-4">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-700">
                  {orders.length === 0 ? "No upcoming orders" : "Nothing matches this filter"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {orders.length === 0
                    ? "Confirmed orders land here the moment they come in."
                    : "Try a different filter or clear the search."}
                </p>
              </div>
            ) : (
              filtered.map(order => {
                const slaSlack = settings
                  ? minutesUntilSlaBreach(order.event_date, order.event_time, settings.slaAssignMinutes)
                  : Number.POSITIVE_INFINITY;
                const isAtRisk = !order.assigned_driver_id && slaSlack <= 0;
                const isUnassigned = !order.assigned_driver_id;
                const eventDt = order.event_time
                  ? new Date(`${order.event_date}T${order.event_time}`)
                  : new Date(`${order.event_date}T12:00`);
                const minsToEvent = (eventDt.getTime() - Date.now()) / 60_000;
                const countdownTone =
                  isAtRisk        ? "text-red-700 font-semibold" :
                  minsToEvent < 1440 ? "text-amber-700 font-semibold" :
                                       "text-slate-700";

                const leftBorder =
                  isAtRisk     ? "border-l-red-500" :
                  isUnassigned ? "border-l-amber-500" :
                                 "border-l-transparent";

                const isExpanded = expandedRowId === order.id;

                return (
                  <div key={order.id} id={`dispatch-row-${order.id}`} className={`border-b border-slate-100 border-l-4 ${leftBorder}`}>
                    {/* Desktop row */}
                    <div
                      className={`hidden md:grid grid-cols-[28px_28px_minmax(0,2fr)_140px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_120px] gap-3 px-4 py-3 items-center transition-colors cursor-pointer ${
                        selected.has(order.id) ? "bg-orange-50 hover:bg-orange-100" :
                        isAtRisk ? "hover:bg-red-50/40" :
                        "hover:bg-slate-50"
                      }`}
                      onClick={() => toggleRow(order.id)}
                    >
                      <div className="flex justify-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="accent-orange-600 cursor-pointer"
                          checked={selected.has(order.id)}
                          onChange={() => toggleSelected(order.id)}
                        />
                      </div>
                      <div className="flex justify-center text-slate-400">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{order.client_name}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {order.id.slice(0, 8)} · {order.venue}
                        </p>
                        {/* Quick drilldowns -- jump to the underlying order
                            or client without leaving the queue. */}
                        <div className="flex items-center gap-2 mt-0.5" onClick={(e) => e.stopPropagation()}>
                          <Link
                            href={withSlug(`/admin/orders?orderId=${order.id}`)}
                            className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 hover:text-slate-900 hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Order
                          </Link>
                          {order.client_id ? (
                            <Link
                              href={withSlug(`/admin/contacts?clientId=${order.client_id}`)}
                              className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 hover:text-slate-900 hover:underline"
                            >
                              <UserIcon className="w-3 h-3" />
                              Client
                            </Link>
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-slate-700 tabular-nums">{order.event_date}</p>
                        <p className={`text-xs tabular-nums flex items-center gap-1 ${countdownTone}`}>
                          {isAtRisk ? (
                            <>
                              <span className="font-semibold">SLA breached</span>
                              <InfoTooltip
                                content={`Service Level Agreement: every confirmed order must have a driver assigned at least ${settings ? Math.round(settings.slaAssignMinutes / 60) : 24}h before the event. We're past that cutoff and this row still has no driver, so dispatch should jump on it now.\n\nChange the cutoff in Dispatch settings (top right of this page).`}
                              />
                              <span>·</span>
                            </>
                          ) : null}
                          {formatMinutesAsCountdown(minsToEvent).replace("-", "in ")}
                        </p>
                      </div>
                      <div className="min-w-0">
                        {order.venue ? (
                          <span className="text-xs text-slate-600 truncate inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            {order.venue.split(",")[0]}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        {order.assigned_driver_name ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge className="text-[10px] font-normal bg-emerald-100 text-emerald-800 border-0">
                              <CheckCircle2 className="w-3 h-3 mr-0.5" />
                              {order.assigned_driver_name}
                            </Badge>
                          </div>
                        ) : isAtRisk ? (
                          <Badge className="text-[10px] font-semibold bg-red-100 text-red-800 border-0">
                            <AlertTriangle className="w-3 h-3 mr-0.5" />
                            URGENT
                          </Badge>
                        ) : (
                          <span className="text-xs text-amber-700 font-medium">Unassigned</span>
                        )}
                        {/* Vehicle chip -- click to open the picker. Shows a
                            'No vehicle' affordance even when the driver is
                            assigned, so the dispatcher can spot a mid-air
                            mismatch (driver booked, vehicle isn't). */}
                        <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setVehicleTarget(order)}
                            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                              order.assigned_vehicle_id
                                ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                                : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 italic"
                            }`}
                            title="Pick or override the vehicle on this order"
                          >
                            {order.assigned_vehicle_refrigerated
                              ? <SnowflakeIcon className="w-3 h-3" />
                              : <TruckIcon className="w-3 h-3" />}
                            {order.assigned_vehicle_plate
                              ? <span className="font-mono">{order.assigned_vehicle_plate}</span>
                              : "Pick vehicle"}
                            {order.secondary_vehicle_plate && (
                              <>
                                <span className="text-slate-400">+</span>
                                <span className="font-mono">{order.secondary_vehicle_plate}</span>
                              </>
                            )}
                          </button>
                          {order.requires_two_drivers && (
                            <span
                              className="inline-flex items-center gap-1 ml-1.5 rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700"
                              title="This run needs two drivers based on vehicle, guest count or waiter service."
                            >
                              <UsersIcon className="w-3 h-3" />
                              2 drivers
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0 flex items-center gap-1 flex-wrap">
                        {order.assigned_chef_name && (
                          <Badge variant="outline" className="text-[10px] font-normal">
                            🧑‍🍳 {order.assigned_chef_name.split(" ")[0]}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-0.5" onClick={e => e.stopPropagation()}>
                        {order.assigned_driver_id ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                                <ArrowUpRight className="w-3.5 h-3.5" />
                                Manage
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openAssign(order)}>
                                <Sparkles className="w-4 h-4 mr-2 text-emerald-600" />
                                Reassign with suggestions
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setVehicleTarget(order)}>
                                <TruckIcon className="w-4 h-4 mr-2 text-indigo-600" />
                                Pick vehicle / add second
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleUnassign(order)}
                                disabled={unassignBusy === order.id}
                              >
                                <X className="w-4 h-4 mr-2 text-red-600" />
                                {unassignBusy === order.id ? "Unassigning..." : "Unassign"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <Button
                            size="sm"
                            className="h-8 gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
                            onClick={() => openAssign(order)}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            Assign driver
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Mobile compact card */}
                    <div
                      className={`md:hidden p-3 cursor-pointer ${
                        isAtRisk ? "bg-red-50/40" : "hover:bg-slate-50"
                      }`}
                      onClick={() => toggleRow(order.id)}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{order.client_name}</p>
                          <p className="text-xs text-slate-500 truncate">{order.venue}</p>
                          <p className={`text-xs tabular-nums mt-0.5 ${countdownTone}`}>
                            {order.event_date}
                            {" · "}
                            {formatMinutesAsCountdown(minsToEvent).replace("-", "in ")}
                          </p>
                          <div className="flex items-center gap-3 mt-1" onClick={(e) => e.stopPropagation()}>
                            <Link
                              href={withSlug(`/admin/orders?orderId=${order.id}`)}
                              className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 hover:text-slate-900 hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Order
                            </Link>
                            {order.client_id ? (
                              <Link
                                href={withSlug(`/admin/contacts?clientId=${order.client_id}`)}
                                className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 hover:text-slate-900 hover:underline"
                              >
                                <UserIcon className="w-3 h-3" />
                                Client
                              </Link>
                            ) : null}
                          </div>
                        </div>
                        {isAtRisk && (
                          <Badge className="text-[10px] font-semibold bg-red-100 text-red-800 border-0 shrink-0">
                            URGENT
                          </Badge>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className={`w-full gap-1.5 ${order.assigned_driver_id ? "bg-slate-700 hover:bg-slate-800" : "bg-orange-600 hover:bg-orange-700"} text-white`}
                        onClick={(e) => { e.stopPropagation(); openAssign(order); }}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {order.assigned_driver_id ? `Reassign · ${order.assigned_driver_name}` : "Assign driver"}
                      </Button>
                    </div>

                    {/* Expanded drawer */}
                    {isExpanded && (
                      <div className="bg-slate-50 border-t border-slate-200 px-4 py-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Event</p>
                            <p className="text-slate-900">{order.event_date} {order.event_time ? `at ${order.event_time}` : ""}</p>
                            <p className="text-slate-600">{order.venue}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Status</p>
                            <p className="text-slate-900 capitalize">{order.status.replace(/_/g, " ")}</p>
                            {order.assignment_score && (
                              <p className="text-slate-600">Match score: {order.assignment_score}/100</p>
                            )}
                          </div>
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Total</p>
                            <p className="text-slate-900 tabular-nums">
                              {C}{order.total_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                          </div>
                        </div>

                        {/* Wave 66.3 -- inline pickup_time editor. The
                            readiness chip's "Pickup time missing -- Fix
                            it" link routes here when only pickup is
                            missing (it's a dispatch decision: when to
                            send the driver out, given route + prep
                            readiness + driver availability). Rose-tinted
                            warning when the value is missing so the
                            operator sees the gap inside the drawer. */}
                        <div className={`rounded-md border p-3 ${order.pickup_time ? "border-slate-200 bg-white" : "border-rose-200 bg-rose-50/40"}`}>
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                                Pickup from kitchen
                              </p>
                              <p className="text-[11px] text-slate-600 mt-0.5">
                                {order.pickup_time
                                  ? `Driver leaves the kitchen at ${order.pickup_time}.`
                                  : "Driver doesn't know when to leave the kitchen yet -- set the time below."}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                type="time"
                                value={pickupDraft[order.id] ?? order.pickup_time ?? ""}
                                onChange={(e) => setPickupDraft((p) => ({ ...p, [order.id]: e.target.value }))}
                                className="h-8 w-32"
                                aria-label="Pickup time from kitchen"
                              />
                              <Button
                                size="sm"
                                onClick={() => savePickupTime(order.id)}
                                disabled={pickupSavingId === order.id || (pickupDraft[order.id] ?? order.pickup_time ?? "") === (order.pickup_time ?? "")}
                              >
                                {pickupSavingId === order.id ? "Saving..." : "Save"}
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
                            Assignment history
                          </p>
                          {(auditByOrder[order.id] || []).length === 0 ? (
                            <p className="text-xs text-slate-500">No assignments yet.</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {(auditByOrder[order.id] || []).map((a: any) => (
                                <li key={a.id} className="text-xs flex items-start justify-between gap-3 py-1 border-b border-slate-200 last:border-b-0">
                                  <div className="min-w-0 flex-1">
                                    <span className="text-slate-700">
                                      {a.from_driver?.full_name && a.to_driver?.full_name ? (
                                        <>Reassigned {a.from_driver.full_name} → <span className="font-medium">{a.to_driver.full_name}</span></>
                                      ) : a.to_driver?.full_name ? (
                                        <>Assigned <span className="font-medium">{a.to_driver.full_name}</span></>
                                      ) : a.from_driver?.full_name ? (
                                        <>Unassigned {a.from_driver.full_name}</>
                                      ) : (
                                        "Updated"
                                      )}
                                    </span>
                                    {a.reason && <span className="text-slate-500"> · {a.reason}</span>}
                                    {a.actor?.full_name && <span className="text-slate-500"> · by {a.actor.full_name}</span>}
                                  </div>
                                  <span className="text-slate-500 tabular-nums whitespace-nowrap">
                                    {new Date(a.created_at).toLocaleString()}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Assign dialog ──────────────────────────────────────────────── */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              Assign driver · {assignTarget?.client_name}
            </DialogTitle>
            <p className="text-sm text-slate-500">
              Top 3 matches scored by distance, current load, region, on-time rate, rating. One click to accept.
            </p>
          </DialogHeader>

          {suggestLoading ? (
            <div className="py-8 text-center text-sm text-slate-500">
              <div className="animate-spin w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full mx-auto mb-2" />
              Scoring drivers...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              <p>No active drivers available.</p>
              <p className="mt-1">Add drivers from the Drivers page first.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {suggestions.map((s, idx) => {
                const blocked = !s.capacity.ok || !s.feasibility.ok || !s.vehicle.ok;
                return (
                  <button
                    key={s.driver.id}
                    type="button"
                    onClick={() => handleAssignPick(s.driver.id, s.score.total, idx === 0 ? "Top suggestion" : `Suggestion #${idx + 1}`)}
                    disabled={assignSaving}
                    className={`w-full text-left rounded-lg border p-3 transition-all ${
                      idx === 0 && !blocked
                        ? "border-emerald-500 bg-emerald-50 hover:bg-emerald-100 ring-2 ring-emerald-200"
                        : blocked
                          ? "border-red-200 bg-red-50/40 hover:bg-red-50"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {idx === 0 && !blocked && (
                            <span className="text-[9px] font-semibold uppercase tracking-wide bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                              Top match
                            </span>
                          )}
                          <p className="text-sm font-medium text-slate-900">{s.driver.full_name}</p>
                        </div>
                        <p className="text-xs text-slate-600">
                          {s.score.reasons.slice(0, 3).join(" · ")}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {!s.capacity.ok && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
                              {s.capacity.reason}
                            </span>
                          )}
                          {!s.vehicle.ok && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
                              {s.vehicle.reason}
                            </span>
                          )}
                          {!s.feasibility.ok && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
                              {s.feasibility.reason}
                            </span>
                          )}
                          {s.vehicle.refrigerated && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                              Refrigerated
                            </span>
                          )}
                          {s.feasibility.etaMinutes != null && s.feasibility.ok && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                              ETA ~{s.feasibility.etaMinutes}m
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-2xl font-bold tabular-nums ${
                          s.score.total >= 75 ? "text-emerald-700" :
                          s.score.total >= 50 ? "text-blue-700" :
                                                "text-amber-700"
                        }`}>
                          {s.score.total}
                        </p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide">score</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk assign dialog ─────────────────────────────────────────── */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-orange-600" />
              Bulk assign {selected.size} order{selected.size === 1 ? "" : "s"}
            </DialogTitle>
            <p className="text-sm text-slate-500">
              Pick a driver and the system assigns all selected orders. Capacity checks run silently.
            </p>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="bulk_driver">Driver</Label>
              <select
                id="bulk_driver"
                value={bulkDriverId}
                onChange={e => setBulkDriverId(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Pick a driver...</option>
                {bulkDrivers.map(d => (
                  <option key={d.id} value={d.id}>{d.full_name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={bulkSaving}>Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleBulkAssign}
              disabled={!bulkDriverId || bulkSaving}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {bulkSaving ? "Assigning..." : `Assign ${selected.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vehicle picker -- per-order override + secondary vehicle. */}
      {vehicleTarget && (
        <VehiclePickerDialog
          open={!!vehicleTarget}
          onOpenChange={(o) => { if (!o) setVehicleTarget(null); }}
          companyId={companyId}
          order={{
            id: vehicleTarget.id,
            client_name: vehicleTarget.client_name,
            event_date: vehicleTarget.event_date,
            event_time: vehicleTarget.event_time,
            guest_count: vehicleTarget.guest_count,
            requires_refrigeration: vehicleTarget.requires_refrigeration,
            requires_waiter: vehicleTarget.requires_waiter,
            assigned_driver_id: vehicleTarget.assigned_driver_id,
            assigned_vehicle_id: vehicleTarget.assigned_vehicle_id,
            secondary_vehicle_id: vehicleTarget.secondary_vehicle_id,
          }}
          onChanged={() => { loadAll(); }}
        />
      )}
    </>
  );
}

export default function ProtectedDispatchQueuePage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <DispatchQueuePage />
    </ProtectedRoute>
  );
}
