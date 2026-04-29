/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
import {
  AlertTriangle, Truck, Clock, Users, Search, RefreshCw, Sparkles,
  ChevronDown, ChevronRight, X, CheckCircle2, Building2, MapPin, Filter,
  ArrowUpRight, MoreHorizontal,
} from "lucide-react";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
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

interface OrderRow {
  id: string;
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
}

const STATUSES: Array<{ value: string; label: string }> = [
  { value: "all",        label: "All confirmed" },
  { value: "unassigned", label: "No driver" },
  { value: "assigned",   label: "Driver assigned" },
  { value: "at_risk",    label: "At risk (SLA)" },
];

function DispatchQueuePage() {
  const { user, profile } = useAuth() as any;
  const { toast } = useToast();
  const companyId = profile?.company_id ?? user?.company_id ?? null;
  const userId = user?.id ?? "";

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

  // Assign dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<OrderRow | null>(null);
  const [suggestions, setSuggestions] = useState<DispatchSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);

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

      const todayISO = new Date().toISOString().slice(0, 10);
      const { data: rows, error } = await supabase
        .from("orders")
        .select(`
          id, client_name, event_date, event_time, status, total_amount,
          venue_lat, venue_lng, venue_name, venue_address,
          confirmed_at, assigned_driver_id, assigned_at, assignment_score,
          assigned_chef_id,
          driver:assigned_driver_id(full_name),
          chef:assigned_chef_id(full_name)
        `)
        .eq("company_id", companyId)
        .gte("event_date", todayISO)
        .in("status", ["confirmed", "preparing", "ready", "out_for_delivery", "in_transit"])
        .order("event_date", { ascending: true })
        .order("event_time", { ascending: true, nullsFirst: false });

      if (error) {
        console.error("Order load error:", error);
        setOrders([]);
        return;
      }
      const mapped: OrderRow[] = (rows || []).map((r: any) => ({
        id: r.id,
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

  const filtered = useMemo(() => {
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
        toast({ title: "Could not assign", description: r.reason, variant: "destructive" });
        return;
      }
      const driverName = suggestions.find(s => s.driver.id === driverId)?.driver.full_name ?? "Driver";
      toast({
        title: "Driver assigned",
        description: `${driverName} on ${assignTarget.client_name}`,
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
      toast({
        title: `${r.assigned} of ${ids.length} assigned`,
        description: `${driverName}${r.errors.length > 0 ? ` · ${r.errors.length} error${r.errors.length === 1 ? "" : "s"}` : ""}`,
      });
      setSelected(new Set());
      setBulkOpen(false);
      loadAll();
    } finally {
      setBulkSaving(false);
    }
  };

  // ── Unassign ──────────────────────────────────────────────────────────────

  const handleUnassign = async (order: OrderRow) => {
    await dispatchService.unassignDriver({
      companyId, orderId: order.id, performedBy: userId, reason: "Unassigned from queue",
    });
    toast({ title: "Driver removed", description: order.client_name });
    loadAll();
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
        <div className="px-4 py-6 max-w-screen-2xl">

          {/* Header */}
          <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-sm">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Dispatch Queue</h1>
                <p className="text-sm text-slate-500">
                  Get every confirmed order to a driver, fast.
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
              <div>Order / Client</div>
              <div>Event</div>
              <div>Venue</div>
              <div>Driver</div>
              <div>Chef</div>
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
                  <div key={order.id} className={`border-b border-slate-100 border-l-4 ${leftBorder}`}>
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
                      </div>
                      <div>
                        <p className="text-xs text-slate-700 tabular-nums">{order.event_date}</p>
                        <p className={`text-xs tabular-nums ${countdownTone}`}>
                          {isAtRisk ? "SLA breached · " : ""}
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
                          <div className="flex items-center gap-1.5">
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
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleUnassign(order)}>
                                <X className="w-4 h-4 mr-2 text-red-600" />
                                Unassign
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
                              R{order.total_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
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
