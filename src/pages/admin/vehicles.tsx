/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/vehicles - the catering company's fleet.
 *
 * Two ownership models:
 *   - Company-owned: dispatch can hand it to whichever driver they
 *     pick for the run.
 *   - Driver-owned: the driver brings their own bakkie. The vehicle is
 *     only available when that same driver is assigned to the order.
 *     Surfaced separately so the team knows what's theirs vs leaning
 *     on the driver's car.
 *
 * Capacity model is catering-shaped: max guests served, cargo volume
 * in litres, max kilo. Plus toggles for refrigeration, warmer, and a
 * "needs two people" flag that drives the dispatch's two-driver hint.
 *
 * Nothing on this page is client-facing - vehicles are an internal
 * dispatch concern and never show up in the client portal.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Truck, Plus, Snowflake, Edit, Trash2, AlertCircle, Search, Flame,
  User, Building2, Users, AlertTriangle, X, RefreshCw,
  type LucideIcon,
} from "lucide-react";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { vehicleService, type Vehicle } from "@/services/vehicleService";
import { supabase } from "@/integrations/supabase/client";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface DriverProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

const VEHICLE_TYPES = [
  { id: "bakkie",       label: "Bakkie / pickup" },
  { id: "panel_van",    label: "Panel van" },
  { id: "fridge_truck", label: "Refrigerated truck" },
  { id: "sedan",        label: "Sedan" },
  { id: "suv",          label: "SUV" },
  { id: "motorbike",    label: "Motorbike" },
  { id: "other",        label: "Other" },
];

// VEH-B (vehicles audit, VEH-1): legacy values produced by earlier seed
// + edit paths that wrote `car` even though the dropdown only ever
// offered `sedan`. The 20260523140000 migration backfills the column
// to `sedan` on every existing row, but a stale tab or cached payload
// could still surface the old label; resolve both to the same display
// string so the row subtitle never falls through to the raw column
// value.
const VEHICLE_TYPE_ALIASES: Record<string, string> = { car: "sedan" };
const resolveVehicleTypeLabel = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const canonical = VEHICLE_TYPE_ALIASES[raw] || raw;
  const match = VEHICLE_TYPES.find((t) => t.id === canonical);
  return match ? match.label : raw;
};

interface UtilisationRow {
  vehicle: Vehicle;
  runs: number;
  plannedHours: number;
  distanceKm: number;
  revenueCarried: number;
  completedRuns: number;
  cancelledRuns: number;
}

function VehiclesPage() {
  const { user, profile } = useAuth() as any;
  const { toast } = useToast();
  const companyId = profile?.company_id ?? user?.company_id ?? null;

  const [tab, setTab] = useState<"roster" | "utilisation">("roster");
  const [utilisation, setUtilisation] = useState<UtilisationRow[]>([]);
  const [utilLoading, setUtilLoading] = useState(false);
  const [utilFromDays, setUtilFromDays] = useState<number>(30);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  // Phase 29 #7: "/" or Cmd-F focuses search; "n" opens the
  // Add vehicle dialog. Same keyboard pattern as the other admin
  // list pages.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        openNew();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [filter, setFilter] = useState<"all" | "company" | "driver" | "fridge" | "warmer">("all");
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  // VEH-C (vehicles follow-ups): pre-fetched impact of the pending
  // soft-delete so the confirmation dialog can warn about active
  // bookings / future orders that still point at this vehicle. null
  // = still loading; populated = "show the numbers + arm cascade".
  const [deleteImpact, setDeleteImpact] = useState<{ activeBookings: number; activeOrders: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    plate: "",
    nickname: "",
    make: "",
    model: "",
    year: "",
    vehicle_type: "bakkie",
    owner_kind: "company" as "company" | "driver",
    driver_owner_id: "",
    primary_driver_id: "",
    capacity_kg: "",
    cargo_volume_litres: "",
    max_pax_served: "",
    refrigerated: false,
    has_warmer: false,
    requires_two_people: false,
    notes: "",
    // Phase 7 #1: maintenance fields, mirroring the equipment edit
    // form. service_interval_days NULL = no recurring schedule.
    service_interval_days: "",
    next_service_due: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  // Phase 7 #1: log-a-service dialog state.
  const [loggingServiceFor, setLoggingServiceFor] = useState<Vehicle | null>(null);
  const [logServiceType, setLogServiceType] = useState<string>("service");
  const [logServiceNotes, setLogServiceNotes] = useState("");
  const [logServiceCost, setLogServiceCost] = useState("");
  const [logServiceOdometer, setLogServiceOdometer] = useState("");
  const [logServiceSaving, setLogServiceSaving] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    setLoadError("");
    try {
      const list = await vehicleService.getVehiclesForCompany(companyId);
      setVehicles(list);
    } catch (e: any) {
      const message = e?.message || "Could not load vehicles.";
      setLoadError(message);
      toast({ title: "Could not load vehicles", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  // Pull drivers + admins so the owner / primary picker has names not
  // raw uuids. Tenant-scoped on the profiles table by RLS.
  // Note: only enum values that actually exist on user_role - "owner"
  // was previously in this list but isn't a valid enum label, so the
  // whole .in() filter threw at Postgres level and the dropdown
  // silently came back empty. Drivers + admins + company_admins is
  // the right set: those are the people who can be allocated as a
  // vehicle's registered driver/owner.
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, active_role")
        .eq("company_id", companyId)
        .in("role", ["driver", "admin", "company_admin"]);
      if (error) {
        console.error("Failed to load driver list for vehicles owner picker:", error);
      }
      setDrivers((data || []) as DriverProfile[]);
    })();
  }, [companyId]);

  // VEH-C (vehicles follow-ups): widen the owner-name resolver beyond
  // the role-filtered drivers dropdown. The picker only loads
  // driver/admin/company_admin profiles, so a vehicle owned by e.g. a
  // super_admin or a sales_admin renders as the generic "Driver-owned"
  // chip with no name. Fetch the missing owner profiles by ID set so
  // every chip carries the human name.
  const [extraOwnerNames, setExtraOwnerNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!companyId || vehicles.length === 0) return;
    const knownIds = new Set(drivers.map((d) => d.id));
    const missingIds = Array.from(new Set(
      vehicles
        .map((v) => v.driver_owner_id)
        .filter((id): id is string => !!id && !knownIds.has(id)),
    ));
    if (missingIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", missingIds);
      if (cancelled) return;
      const m: Record<string, string> = {};
      for (const p of (data || []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
        m[p.id] = p.full_name || p.email || "(unnamed)";
      }
      setExtraOwnerNames(m);
    })();
    return () => { cancelled = true; };
  }, [companyId, vehicles, drivers]);

  useEffect(() => { load(); }, [load]);

  // VEH-B (vehicles audit, VEH-3): supabase realtime sub on the
  // fleet so colleague hires / service log updates land without a
  // manual refresh. Filter by company_id so multi-tenant noise is
  // muted.
  useEffect(() => {
    if (!companyId) return;
    const sub = supabase
      .channel(`vehicles-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicles",                 filter: `company_id=eq.${companyId}` }, () => { load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicle_maintenance_log",  filter: `company_id=eq.${companyId}` }, () => { load(); })
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [companyId, load]);

  // Pull the utilisation rollup whenever the user opens the tab or
  // adjusts the window. Cheap query: one indexed range scan + a per-
  // vehicle sum in JS.
  useEffect(() => {
    if (tab !== "utilisation" || !companyId) return;
    let cancelled = false;
    setUtilLoading(true);
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - utilFromDays);
    vehicleService.getUtilisation(companyId, from.toISOString(), to.toISOString())
      .then((rows) => { if (!cancelled) setUtilisation(rows as UtilisationRow[]); })
      .catch((e: any) => {
        if (cancelled) return;
        const message = e?.message || "Could not load vehicle utilisation.";
        setLoadError(message);
        toast({ title: "Could not load utilisation", description: message, variant: "destructive" });
      })
      .finally(() => { if (!cancelled) setUtilLoading(false); });
    return () => { cancelled = true; };
  }, [tab, companyId, utilFromDays, toast]);

  const driverNameById = useMemo(() => {
    const m: Record<string, string> = { ...extraOwnerNames };
    for (const d of drivers) m[d.id] = d.full_name || d.email || "(unnamed)";
    return m;
  }, [drivers, extraOwnerNames]);

  const filtered = useMemo(() => {
    let list = vehicles;
    if (filter === "company")  list = list.filter(v => v.owner_kind === "company");
    if (filter === "driver")   list = list.filter(v => v.owner_kind === "driver");
    if (filter === "fridge")   list = list.filter(v => v.refrigerated);
    if (filter === "warmer")   list = list.filter(v => v.has_warmer);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(v =>
        (v.plate || "").toLowerCase().includes(q) ||
        (v.nickname || "").toLowerCase().includes(q) ||
        (v.make || "").toLowerCase().includes(q) ||
        (v.model || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [vehicles, filter, search]);

  const stats = useMemo(() => ({
    total: vehicles.length,
    company: vehicles.filter(v => v.owner_kind === "company").length,
    driverOwned: vehicles.filter(v => v.owner_kind === "driver").length,
    refrigerated: vehicles.filter(v => v.refrigerated).length,
  }), [vehicles]);

  // VEH-B (vehicles audit, VEH-5): cold-chain coverage gap warning.
  // The hero copy promises that refrigerated vehicles "unlock cold-
  // chain orders for assignment". If the fleet has zero refrigerated
  // vehicles AND any non-cancelled order on the books needs
  // refrigeration, dispatchService.findAvailableVehicles will silently
  // return [] for those orders and the dispatcher has no signal until
  // the assignment fails. Soft warning surfaced inline.
  const [coldChainPending, setColdChainPending] = useState<number>(0);
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { count } = await (supabase as any)
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("requires_refrigeration", true)
        .not("status", "in", "(cancelled,completed)")
        .gte("event_date", today);
      if (!cancelled) setColdChainPending(count || 0);
    })();
    return () => { cancelled = true; };
  }, [companyId, vehicles.length]);

  // Phase 19 #5: maintenance rollup, same shape as the equipment
  // page's banner. The cron broadcasts daily but the fleet list
  // itself never surfaced 'how many vehicles are overdue right now'
  // so the operator had to count badges or trust the cron emails.
  const serviceRollup = useMemo(() => {
    const SEVEN = 7 * 86400_000;
    const now = Date.now();
    let overdue = 0;
    let dueSoon = 0;
    for (const v of vehicles) {
      const t = v.next_service_due ? new Date(v.next_service_due).getTime() : null;
      if (!t) continue;
      if (t < now) overdue += 1;
      else if (t - now <= SEVEN) dueSoon += 1;
    }
    return { overdue, dueSoon };
  }, [vehicles]);

  const resetForm = () => {
    setForm({
      plate: "",
      nickname: "",
      make: "",
      model: "",
      year: "",
      vehicle_type: "bakkie",
      owner_kind: "company",
      driver_owner_id: "",
      primary_driver_id: "",
      capacity_kg: "",
      cargo_volume_litres: "",
      max_pax_served: "",
      refrigerated: false,
      has_warmer: false,
      requires_two_people: false,
      notes: "",
      service_interval_days: "",
      next_service_due: "",
    });
  };

  const openNew = () => {
    setEditTarget(null);
    resetForm();
    setError("");
    setShowNew(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditTarget(v);
    setForm({
      plate: v.plate || "",
      nickname: v.nickname || "",
      make: v.make || "",
      model: v.model || "",
      year: v.year != null ? String(v.year) : "",
      // VEH-B (VEH-1): map legacy `car` -> `sedan` so the dropdown
      // lands on the right option when editing a pre-backfill row
      // that's still in a stale client cache.
      vehicle_type: VEHICLE_TYPE_ALIASES[v.vehicle_type || ""] || v.vehicle_type || "bakkie",
      owner_kind: v.owner_kind || "company",
      driver_owner_id: v.driver_owner_id || "",
      primary_driver_id: v.primary_driver_id || "",
      capacity_kg: v.capacity_kg != null ? String(v.capacity_kg) : "",
      cargo_volume_litres: v.cargo_volume_litres != null ? String(v.cargo_volume_litres) : "",
      max_pax_served: v.max_pax_served != null ? String(v.max_pax_served) : "",
      refrigerated: !!v.refrigerated,
      has_warmer: !!v.has_warmer,
      requires_two_people: !!v.requires_two_people,
      notes: v.notes || "",
      service_interval_days:
        v.service_interval_days != null
          ? String(v.service_interval_days)
          : "",
      next_service_due: v.next_service_due || "",
    });
    setError("");
  };

  const handleSave = async () => {
    const trimmedPlate = form.plate.trim().toUpperCase();
    if (!trimmedPlate) { setError("Number plate is required."); return; }
    if (!companyId) { setError("No company on your profile."); return; }
    if (form.owner_kind === "driver" && !form.driver_owner_id) {
      setError("Pick which driver owns this vehicle.");
      return;
    }
    // VEH-B (vehicles audit, VEH-2): client-side duplicate-plate
    // preflight. The 20260523140000 migration enforces uniqueness at
    // the DB level with a partial unique index, but the index error
    // bubbles up as an opaque Postgres message; this guard gives a
    // clean toast pointing at the conflicting row instead.
    try {
      const { data: dup } = await (supabase as any)
        .from("vehicles")
        .select("id, plate, nickname")
        .eq("company_id", companyId)
        .eq("plate", trimmedPlate)
        .is("deleted_at", null)
        .maybeSingle();
      if (dup && (!editTarget || dup.id !== editTarget.id)) {
        setError(
          `Plate ${trimmedPlate} is already on ${dup.nickname || "another vehicle"}. Plates must be unique per company.`,
        );
        return;
      }
    } catch {
      // The dup-check is opportunistic; the DB constraint still
      // catches it if the lookup fails for any reason.
    }
    // VEH-B (vehicles audit, VEH-3): NaN guard on year. Pre-VEH-B
    // typing letters into the year input produced Number("abc")=NaN
    // which Postgres rejected with a 22P02 invalid-input error rather
    // than the friendly "Year doesn't look right" UX a number field
    // implies.
    let parsedYear: number | null = null;
    if (form.year !== "") {
      const yr = Number(form.year);
      if (!Number.isFinite(yr) || yr < 1900 || yr > 2100) {
        setError("Year must be a number between 1900 and 2100.");
        return;
      }
      parsedYear = yr;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        plate: trimmedPlate,
        nickname: form.nickname.trim() || null,
        make: form.make.trim() || null,
        model: form.model.trim() || null,
        year: parsedYear,
        vehicle_type: form.vehicle_type || null,
        owner_kind: form.owner_kind,
        driver_owner_id: form.owner_kind === "driver" ? (form.driver_owner_id || null) : null,
        primary_driver_id: form.primary_driver_id || null,
        capacity_kg: form.capacity_kg !== "" ? Number(form.capacity_kg) : null,
        cargo_volume_litres: form.cargo_volume_litres !== "" ? Number(form.cargo_volume_litres) : null,
        max_pax_served: form.max_pax_served !== "" ? Number(form.max_pax_served) : null,
        refrigerated: form.refrigerated,
        has_warmer: form.has_warmer,
        requires_two_people: form.requires_two_people,
        notes: form.notes.trim() || null,
        // Phase 7 #1: maintenance schedule. Empty interval -> NULL
        // means no recurring service for this vehicle (the service-
        // due cron skips NULLs). next_service_due is a manual
        // override; the AFTER INSERT trigger on vehicle_maintenance_
        // log auto-derives it from interval when a service lands.
        service_interval_days:
          form.service_interval_days !== "" ? Number(form.service_interval_days) : null,
        next_service_due: form.next_service_due || null,
      };
      if (editTarget) {
        await vehicleService.updateVehicle(editTarget.id, payload as any);
        toast({ title: "Vehicle updated", description: trimmedPlate });
      } else {
        await vehicleService.createVehicle({
          companyId,
          plate: trimmedPlate,
          nickname: payload.nickname,
          make: form.make.trim(),
          model: form.model.trim(),
          year: payload.year,
          vehicleType: payload.vehicle_type,
          ownerKind: form.owner_kind,
          driverOwnerId: payload.driver_owner_id,
          primaryDriverId: payload.primary_driver_id,
          capacityKg: payload.capacity_kg,
          cargoVolumeLitres: payload.cargo_volume_litres,
          maxPaxServed: payload.max_pax_served,
          refrigerated: form.refrigerated,
          hasWarmer: form.has_warmer,
          requiresTwoPeople: form.requires_two_people,
          notes: form.notes.trim(),
        });
        toast({ title: "Vehicle added", description: trimmedPlate });
      }
      setEditTarget(null);
      setShowNew(false);
      resetForm();
      load();
    } catch (e: any) {
      setError(e?.message ?? "Could not save vehicle.");
    } finally {
      setSaving(false);
    }
  };

  // VEH-C (vehicles follow-ups): pre-flight the deletion impact when
  // the operator opens the confirm dialog so we can show a concrete
  // count rather than a generic "are you sure". Reruns whenever the
  // delete target changes.
  useEffect(() => {
    if (!deleteTarget) { setDeleteImpact(null); return; }
    let cancelled = false;
    vehicleService.getVehicleDeletionImpact(deleteTarget.id)
      .then((impact) => { if (!cancelled) setDeleteImpact(impact); })
      .catch(() => { if (!cancelled) setDeleteImpact({ activeBookings: 0, activeOrders: 0 }); });
    return () => { cancelled = true; };
  }, [deleteTarget]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const hasImpact = !!deleteImpact
        && (deleteImpact.activeBookings > 0 || deleteImpact.activeOrders > 0);
      // VEH-C: cascade only when the operator has seen the impact
      // count. If the pre-flight failed (deleteImpact === null) we
      // still soft-delete; the cascade is a best-effort cleanup, not
      // a gate.
      await vehicleService.deleteVehicle(deleteTarget.id, { cascadeDetach: hasImpact });
      toast({
        title: "Vehicle removed",
        description: hasImpact
          ? `${deleteTarget.plate} - ${deleteImpact!.activeBookings} bookings cancelled, ${deleteImpact!.activeOrders} future orders detached.`
          : (deleteTarget.plate || ""),
      });
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast({ title: "Could not delete", description: e?.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const dialogOpen = showNew || !!editTarget;
  const setDialogOpen = (open: boolean) => {
    if (!open) { setShowNew(false); setEditTarget(null); }
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Vehicles - CateringMS</title></Head>
      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          <PortalHeader
            title={
              <span className="flex items-center gap-2">
                Vehicles
                <InfoTooltip content={"Your fleet plus any vehicles drivers bring themselves.\n\nDispatch uses these to suggest the right vehicle for an order, and to flag jobs that need two drivers."} />
              </span>
            }
            icon={Truck}
            subtitle="Fleet roster. Refrigerated and warmer vehicles unlock cold and hot-chain orders for assignment."
            actions={
            <>
              {/* Phase 28 #3: manual refresh. Fleet roster loads on
                  mount; a dispatcher who has just had a colleague
                  add a hire-in vehicle needs to pull the new row. */}
              <Button
                size="sm"
                variant="outline"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                className="bg-brand-primary hover:opacity-90 gap-2"
                onClick={openNew}
              >
                <Plus className="w-4 h-4" />
                Add vehicle
              </Button>
            </>
            }
          />
          <PageWorkbench />

          {loadError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{loadError}</span>
            </div>
          )}

          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <VehicleMetricTile
              label="Total fleet"
              value={stats.total}
              icon={Truck}
              tooltip="Every active vehicle, company-owned and driver-owned together."
            />
            <VehicleMetricTile
              label="Company"
              value={stats.company}
              icon={Building2}
              tone="brand"
            />
            <VehicleMetricTile
              label="Driver-owned"
              value={stats.driverOwned}
              icon={User}
              tone="amber"
            />
            <VehicleMetricTile
              label="Refrigerated"
              value={stats.refrigerated}
              icon={Snowflake}
              tone="sky"
            />
          </div>

          {/* VEH-B (vehicles audit, VEH-5): cold-chain coverage gap.
              Pre-VEH-B a tenant with cold-chain orders queued + zero
              refrigerated vehicles got no signal until the dispatch
              suggester silently returned an empty list. */}
          {stats.refrigerated === 0 && coldChainPending > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
              <Snowflake className="w-4 h-4 text-blue-700" />
              <span className="text-xs font-medium text-blue-900">Cold-chain gap:</span>
              <span className="text-xs text-blue-900">
                {coldChainPending} upcoming order{coldChainPending === 1 ? "" : "s"} need{coldChainPending === 1 ? "s" : ""} refrigerated transport but no vehicle on your fleet is marked refrigerated. Dispatch can&apos;t suggest a vehicle for {coldChainPending === 1 ? "it" : "them"} until you add or flag one.
              </span>
            </div>
          )}

          {/* Phase 19 #5: service-due rollup. Renders only when at
              least one vehicle is overdue or due within 7 days. Same
              shape and rules as the equipment page banner so a fleet
              manager scanning both sees one consistent surface. */}
          {(serviceRollup.overdue > 0 || serviceRollup.dueSoon > 0) && (
            <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              <span className="text-xs font-medium text-amber-900">Vehicle maintenance:</span>
              {serviceRollup.overdue > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 border border-rose-300 text-rose-800 text-xs px-2 py-0.5">
                  <span className="font-semibold">{serviceRollup.overdue}</span> overdue
                </span>
              )}
              {serviceRollup.dueSoon > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 text-amber-800 text-xs px-2 py-0.5">
                  <span className="font-semibold">{serviceRollup.dueSoon}</span> due within 7 days
                </span>
              )}
              <span className="text-[11px] text-amber-700 ml-auto">Open a vehicle to log a service.</span>
            </div>
          )}

          {/* Roster vs Utilisation tabs */}
          <div className="mb-4 flex w-fit gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs shadow-sm">
            {([
              { id: "roster", label: "Roster" },
              { id: "utilisation", label: "Utilisation" },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-4 py-1.5 rounded-md ${
                  tab === t.id
                    ? "bg-brand-primary/10 text-brand-primary font-medium"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "utilisation" ? (
            <UtilisationView
              rows={utilisation}
              loading={utilLoading}
              days={utilFromDays}
              onDaysChange={setUtilFromDays}
            />
          ) : (
            <>
          {/* Filter pills + search */}
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm mb-4 p-3 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search by plate, nickname, make or model (press /)"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-9 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
              />
              {/* Phase 25 #8: clear-search affordance. */}
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs">
              {([
                { id: "all", label: "All" },
                { id: "company", label: "Company" },
                { id: "driver", label: "Driver-owned" },
                { id: "fridge", label: "Fridge" },
                { id: "warmer", label: "Warmer" },
              ] as const).map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setFilter(p.id)}
                  className={`px-3 py-1.5 rounded-md ${
                    filter === p.id
                      ? "bg-brand-primary/10 text-brand-primary font-medium"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full mx-auto mb-3" />
                <p className="text-sm text-slate-500">Loading...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 px-4">
                <Truck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                {vehicles.length === 0 ? (
                  <>
                    <p className="text-sm font-medium text-slate-700 mb-1">No vehicles yet</p>
                    <p className="text-xs text-slate-500 mb-4">
                      Add your first vehicle to start tracking the fleet. Driver-owned cars work too.
                    </p>
                    <Button size="sm" className="bg-brand-primary hover:opacity-90 gap-2" onClick={openNew}>
                      <Plus className="w-4 h-4" />
                      Add a vehicle
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">No vehicles match this filter.</p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filtered.map(v => (
                  <div key={v.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        v.refrigerated ? "bg-blue-100" : v.has_warmer ? "bg-orange-100" : "bg-slate-100"
                      }`}>
                        {v.refrigerated
                          ? <Snowflake className="w-5 h-5 text-blue-600" />
                          : v.has_warmer
                            ? <Flame className="w-5 h-5 text-orange-600" />
                            : <Truck className="w-5 h-5 text-slate-600" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-900">
                            {v.nickname ? `${v.nickname} ` : ""}
                            <span className="font-mono text-sm text-slate-500">{v.plate || "-"}</span>
                          </p>
                          {v.owner_kind === "driver" ? (
                            <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] gap-1">
                              <User className="w-3 h-3" />
                              {v.driver_owner_id ? driverNameById[v.driver_owner_id] || "Driver-owned" : "Driver-owned"}
                            </Badge>
                          ) : (
                            <Badge className="border border-slate-200 bg-slate-50 text-slate-700 text-[10px] gap-1">
                              <Building2 className="w-3 h-3" />
                              Company
                            </Badge>
                          )}
                          {v.refrigerated && (
                            <Badge className="border border-sky-200 bg-sky-50 text-sky-700 text-[10px] gap-1">
                              <Snowflake className="w-3 h-3" />
                              Fridge
                            </Badge>
                          )}
                          {v.has_warmer && (
                            <Badge className="bg-orange-100 text-orange-800 border-0 text-[10px] gap-1">
                              <Flame className="w-3 h-3" />
                              Warmer
                            </Badge>
                          )}
                          {v.requires_two_people && (
                            <Badge className="bg-rose-100 text-rose-800 border-0 text-[10px] gap-1">
                              <Users className="w-3 h-3" />
                              2-person
                            </Badge>
                          )}
                          {!v.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          {[v.make, v.model, v.year ? `${v.year}` : null].filter(Boolean).join(" ")}
                          {v.vehicle_type && <> · {resolveVehicleTypeLabel(v.vehicle_type)}</>}
                          {v.capacity_kg != null && <> · {v.capacity_kg}kg</>}
                          {v.max_pax_served != null && <> · serves {v.max_pax_served}</>}
                          {v.cargo_volume_litres != null && <> · {v.cargo_volume_litres}L</>}
                          {v.notes && <> · {v.notes}</>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(v)} title="Edit">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50" onClick={() => setDeleteTarget(v)} title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
            </>
          )}
        </PortalShell>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? `Edit ${editTarget.plate}` : "Add vehicle"}</DialogTitle>
            <DialogDescription>
              The more we know about this vehicle, the smarter dispatch gets when picking one for an order.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Identity */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="plate">Number plate *</Label>
                <Input id="plate" value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value })} placeholder="CA 123-456" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="nickname">Nickname</Label>
                <Input id="nickname" value={form.nickname} onChange={e => setForm({ ...form, nickname: e.target.value })} placeholder="e.g. White Bakkie" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="make">Make</Label>
                <Input id="make" value={form.make} onChange={e => setForm({ ...form, make: e.target.value })} placeholder="Toyota" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="model">Model</Label>
                <Input id="model" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="Hilux" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="year">Year</Label>
                <Input id="year" type="number" min="1990" max="2100" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="vehicle_type">Type</Label>
                <select
                  id="vehicle_type"
                  value={form.vehicle_type}
                  onChange={e => setForm({ ...form, vehicle_type: e.target.value })}
                  className="mt-1 w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  {VEHICLE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </div>

            {/* Ownership */}
            <Card className="border-slate-200 shadow-none">
              <CardContent className="py-4 px-4 space-y-3">
                <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                  Ownership
                  <InfoTooltip content={"Company-owned vehicles can be assigned to any driver.\n\nDriver-owned means the driver brings their own bakkie. The vehicle is only available when that driver is on the run."} />
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, owner_kind: "company", driver_owner_id: "" })}
                    className={`px-3 py-2 rounded-md border text-sm flex items-center gap-2 ${
                      form.owner_kind === "company"
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-slate-700 border-slate-200 hover:border-blue-300"
                    }`}
                  >
                    <Building2 className="w-4 h-4" /> Company-owned
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, owner_kind: "driver" })}
                    className={`px-3 py-2 rounded-md border text-sm flex items-center gap-2 ${
                      form.owner_kind === "driver"
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-white text-slate-700 border-slate-200 hover:border-amber-300"
                    }`}
                  >
                    <User className="w-4 h-4" /> Driver-owned
                  </button>
                </div>
                {form.owner_kind === "driver" ? (
                  <div>
                    <Label htmlFor="driver_owner">Owned by *</Label>
                    <select
                      id="driver_owner"
                      value={form.driver_owner_id}
                      onChange={e => setForm({ ...form, driver_owner_id: e.target.value })}
                      className="mt-1 w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="">Pick a driver</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.full_name || d.email}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="primary_driver">Default driver (optional)</Label>
                    <select
                      id="primary_driver"
                      value={form.primary_driver_id}
                      onChange={e => setForm({ ...form, primary_driver_id: e.target.value })}
                      className="mt-1 w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option value="">None, anyone can drive it</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.full_name || d.email}</option>
                      ))}
                    </select>
                    {/* VEH-B (vehicles audit, VEH-4): honest copy. The
                        pre-VEH-B promise ("dispatch will suggest this
                        driver first whenever this vehicle is on the
                        run") is not implemented anywhere -
                        findAvailableVehicles in vehicleService.ts
                        never reads primary_driver_id. Until that's
                        wired into the dispatch ranking heuristic the
                        field is metadata only. */}
                    <p className="text-[11px] text-slate-500 mt-1">
                      Default driver for this vehicle. Recorded for
                      reference; dispatch ranking does not yet bias
                      toward this driver.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Capacity */}
            <Card className="border-slate-200 shadow-none">
              <CardContent className="py-4 px-4 space-y-3">
                <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                  Capacity
                  <InfoTooltip content={"Used to filter vehicles when assigning an order.\n\nRated guests is the most useful field for catering, the rest are nice-to-haves the dispatcher can use to break ties."} />
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="max_pax">Rated guests</Label>
                    <Input id="max_pax" type="number" min="0" value={form.max_pax_served} onChange={e => setForm({ ...form, max_pax_served: e.target.value })} placeholder="e.g. 80" className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="cargo_l">Cargo (L)</Label>
                    <Input id="cargo_l" type="number" min="0" value={form.cargo_volume_litres} onChange={e => setForm({ ...form, cargo_volume_litres: e.target.value })} placeholder="e.g. 2200" className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="capacity">Max kg</Label>
                    <Input id="capacity" type="number" min="0" value={form.capacity_kg} onChange={e => setForm({ ...form, capacity_kg: e.target.value })} placeholder="e.g. 800" className="mt-1" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Capabilities */}
            <Card className="border-slate-200 shadow-none">
              <CardContent className="py-4 px-4 space-y-2">
                <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Capabilities
                </Label>
                <label className="flex items-start gap-3 px-3 py-2 rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <Switch checked={form.refrigerated} onCheckedChange={(v: boolean) => setForm({ ...form, refrigerated: v })} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                      <Snowflake className="w-3.5 h-3.5 text-blue-600" /> Refrigerated
                    </p>
                    <p className="text-xs text-slate-500">Required for cold-chain orders. Dispatch only suggests this vehicle for those.</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 px-3 py-2 rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <Switch checked={form.has_warmer} onCheckedChange={(v: boolean) => setForm({ ...form, has_warmer: v })} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-orange-600" /> Has a hot warmer
                    </p>
                    <p className="text-xs text-slate-500">Hot-hold for ovens, grills, soup pots. Used for late-arrival hot food orders.</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 px-3 py-2 rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50">
                  <Switch checked={form.requires_two_people} onCheckedChange={(v: boolean) => setForm({ ...form, requires_two_people: v })} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-rose-600" /> Needs two on board
                    </p>
                    <p className="text-xs text-slate-500">Big truck or tight loading. Dispatch will require a co-driver when this vehicle is picked.</p>
                  </div>
                </label>
              </CardContent>
            </Card>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional, e.g. tow bar, extra storage" className="mt-1" />
            </div>

            {/* Phase 7 #1: maintenance schedule. Mirrors the
                equipment edit dialog from Phase 5 #1. Only renders
                on edit (existing rows) - you can't log service
                for a vehicle that doesn't exist yet. */}
            {editTarget && (
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Maintenance schedule</p>
                    <p className="text-xs text-slate-500">
                      Drives the daily 'service due' notifications to admin.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setLoggingServiceFor(editTarget)}
                  >
                    Log a service
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="service_interval_days" className="text-xs">Service interval (days)</Label>
                    <Input
                      id="service_interval_days"
                      type="number"
                      min={0}
                      value={form.service_interval_days}
                      onChange={e => setForm({ ...form, service_interval_days: e.target.value })}
                      placeholder="e.g. 180 for 6-month service, 365 for COR"
                      className="mt-1"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Empty = no recurring service. next_service_due auto-fills when a service is logged.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="next_service_due" className="text-xs">Next service due (manual)</Label>
                    <Input
                      id="next_service_due"
                      type="date"
                      value={form.next_service_due}
                      onChange={e => setForm({ ...form, next_service_due: e.target.value })}
                      className="mt-1"
                    />
                    {editTarget.last_serviced_at && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Last serviced{" "}
                        {new Date(editTarget.last_serviced_at).toLocaleDateString("en-ZA", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                        {editTarget.current_odometer_km && (
                          <> at {editTarget.current_odometer_km} km</>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={saving}>Cancel</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={saving} className="bg-brand-primary hover:opacity-90">
              {saving ? "Saving..." : editTarget ? "Save changes" : "Add vehicle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 7 #1: log a service event for a vehicle. Inserts
          into vehicle_maintenance_log; the AFTER INSERT trigger
          rolls last_serviced_at + next_service_due + current_
          odometer_km onto the vehicle row. */}
      <Dialog
        open={!!loggingServiceFor}
        onOpenChange={(o) => {
          if (!o) {
            setLoggingServiceFor(null);
            setLogServiceType("service");
            setLogServiceNotes("");
            setLogServiceCost("");
            setLogServiceOdometer("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log a service</DialogTitle>
            <DialogDescription>
              {loggingServiceFor
                ? `Record a service event for ${loggingServiceFor.plate}. Stamps last_serviced_at and rolls next_service_due forward by the schedule.`
                : "Record a service event."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Service type</Label>
              <select
                value={logServiceType}
                onChange={(e) => setLogServiceType(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
              >
                <option value="service">Service</option>
                <option value="repair">Repair</option>
                <option value="tyres">Tyres</option>
                <option value="cor">COR / roadworthy</option>
                <option value="inspection">Inspection</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Cost (R, optional)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={logServiceCost}
                  onChange={(e) => setLogServiceCost(e.target.value)}
                  placeholder="What you paid"
                />
              </div>
              <div>
                <Label className="text-xs">Odometer (km, optional)</Label>
                <Input
                  type="number"
                  min={0}
                  value={logServiceOdometer}
                  onChange={(e) => setLogServiceOdometer(e.target.value)}
                  placeholder="Current reading"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input
                value={logServiceNotes}
                onChange={(e) => setLogServiceNotes(e.target.value)}
                placeholder="Replaced front brake pads, tyre rotation..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setLoggingServiceFor(null)}
              disabled={logServiceSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!loggingServiceFor || !companyId) return;
                setLogServiceSaving(true);
                try {
                  const { error: insErr } = await (supabase as any)
                    .from("vehicle_maintenance_log")
                    .insert({
                      company_id: companyId,
                      vehicle_id: loggingServiceFor.id,
                      serviced_at: new Date().toISOString(),
                      service_type: logServiceType,
                      notes: logServiceNotes.trim() || null,
                      cost: logServiceCost ? Number(logServiceCost) : null,
                      odometer_km: logServiceOdometer ? Number(logServiceOdometer) : null,
                    });
                  if (insErr) throw insErr;
                  toast({
                    title: "Service logged",
                    description: "next_service_due rolled forward by the schedule.",
                  });
                  setLoggingServiceFor(null);
                  setLogServiceType("service");
                  setLogServiceNotes("");
                  setLogServiceCost("");
                  setLogServiceOdometer("");
                  load();
                } catch (e: any) {
                  toast({
                    title: "Could not log service",
                    description: e?.message || "Try again",
                    variant: "destructive",
                  });
                } finally {
                  setLogServiceSaving(false);
                }
              }}
              disabled={logServiceSaving}
            >
              {logServiceSaving ? "Logging..." : "Log service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm - VEH-C (vehicles follow-ups): now shows the
          real cascade impact (active bookings + future-event orders)
          and on confirm cancels the bookings + nulls the order FKs.
          Pre-VEH-C the dialog promised history-preservation but in
          practice left dangling references that dispatch availability
          treated as still-blocked. */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-rose-700">Remove {deleteTarget?.plate}?</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-slate-700 space-y-2">
            <p>
              The vehicle is soft-deleted from the roster. Past runs keep their record so reporting stays accurate.
            </p>
            {deleteImpact === null ? (
              <p className="text-xs text-slate-500">Checking impact...</p>
            ) : deleteImpact.activeBookings === 0 && deleteImpact.activeOrders === 0 ? (
              <p className="text-xs text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded px-2 py-1.5">
                No active bookings or future orders reference this vehicle. Clean removal.
              </p>
            ) : (
              <div className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                <p className="font-medium text-amber-900 mb-0.5 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Cascade impact
                </p>
                <p className="text-amber-800">
                  {deleteImpact.activeBookings > 0 && (
                    <>{deleteImpact.activeBookings} planned booking{deleteImpact.activeBookings === 1 ? "" : "s"} will be cancelled. </>
                  )}
                  {deleteImpact.activeOrders > 0 && (
                    <>{deleteImpact.activeOrders} future order{deleteImpact.activeOrders === 1 ? "" : "s"} will lose their vehicle assignment.</>
                  )}
                </p>
                <p className="text-amber-700 mt-1">Reassign a vehicle on those orders before the run day.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={deleting}>Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting || deleteImpact === null}>
              {deleting ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function VehicleMetricTile({
  label,
  value,
  icon: Icon,
  tooltip,
  tone = "slate",
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tooltip?: string;
  tone?: "slate" | "brand" | "amber" | "sky";
}) {
  const toneClass = {
    slate: "bg-slate-100 text-slate-600",
    brand: "bg-brand-primary/10 text-brand-primary",
    amber: "bg-amber-50 text-amber-700",
    sky: "bg-sky-50 text-sky-700",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-normal text-slate-500">
            {label}
            {tooltip && <InfoTooltip content={tooltip} />}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-950">{value}</p>
        </div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

/**
 * Utilisation rollup. Helps the dispatcher spot the truck nobody's
 * touching and the truck doing all the work. Window picker (7 / 30
 * / 90 days) drives the underlying query.
 */
function UtilisationView({
  rows, loading, days, onDaysChange,
}: {
  rows: UtilisationRow[];
  loading: boolean;
  days: number;
  onDaysChange: (n: number) => void;
}) {
  const totals = rows.reduce((acc, r) => ({
    runs: acc.runs + r.runs,
    hours: acc.hours + r.plannedHours,
    distance: acc.distance + r.distanceKm,
    revenue: acc.revenue + r.revenueCarried,
  }), { runs: 0, hours: 0, distance: 0, revenue: 0 });
  const totalsHours = Math.max(1, totals.hours); // for share %
  const fmtR = (v: number) => `R ${Math.round(v).toLocaleString("en-ZA")}`;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-3 flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide">
          Window
        </span>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs">
          {([7, 30, 90] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onDaysChange(n)}
              className={`px-3 py-1.5 rounded-md ${
                days === n
                  ? "bg-brand-primary/10 text-brand-primary font-medium"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Last {n}d
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="text-xs text-slate-600">
          <strong className="text-slate-900">{totals.runs}</strong> runs ·
          {" "}<strong className="text-slate-900">{totals.hours.toFixed(1)}h</strong> on the road ·
          {" "}<strong className="text-slate-900">{totals.distance.toFixed(0)}km</strong> ·
          {" "}<strong className="text-slate-900">{fmtR(totals.revenue)}</strong> carried
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm text-slate-500">Crunching bookings...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-sm text-slate-500">
            No vehicles in the fleet yet. Add one on the Roster tab.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="text-left px-4 py-2.5">Vehicle</th>
                <th className="text-right px-3 py-2.5">Runs</th>
                <th className="text-right px-3 py-2.5">Hours</th>
                <th className="text-right px-3 py-2.5">Share</th>
                <th className="text-right px-3 py-2.5">Distance</th>
                <th className="text-right px-3 py-2.5">Revenue carried</th>
                <th className="text-right px-3 py-2.5">Cancels</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const share = (r.plannedHours / totalsHours) * 100;
                const isQuiet = r.runs === 0;
                return (
                  <tr key={r.vehicle.id} className={isQuiet ? "bg-amber-50/30" : ""}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {r.vehicle.refrigerated
                          ? <Snowflake className="w-3.5 h-3.5 text-blue-600" />
                          : r.vehicle.has_warmer
                            ? <Flame className="w-3.5 h-3.5 text-orange-600" />
                            : <Truck className="w-3.5 h-3.5 text-slate-500" />}
                        <span className="font-medium text-slate-900">
                          {r.vehicle.nickname ? `${r.vehicle.nickname} ` : ""}
                          <span className="font-mono text-xs text-slate-500">{r.vehicle.plate}</span>
                        </span>
                        {r.vehicle.owner_kind === "driver" && (
                          <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px]">Driver-owned</Badge>
                        )}
                        {isQuiet && (
                          <Badge className="bg-rose-100 text-rose-800 border-0 text-[10px]">Idle window</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{r.runs}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 font-medium">{r.plannedHours.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      <div className="inline-flex items-center gap-2">
                        <span>{share.toFixed(0)}%</span>
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-brand-primary" style={{ width: `${Math.min(100, share)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {r.distanceKm > 0 ? `${r.distanceKm.toFixed(0)}km` : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {r.revenueCarried > 0 ? `R ${Math.round(r.revenueCarried).toLocaleString("en-ZA")}` : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.cancelledRuns > 0 ? (
                        <span className="text-rose-700">{r.cancelledRuns}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] text-slate-500">
        Hours are taken from each booking's depart-to-back-at-kitchen window. Distance and revenue
        come from the linked order. Cancelled bookings are counted in the Cancels column but not in
        the runs / hours / distance totals.
      </p>
    </div>
  );
}

export default function ProtectedVehiclesPage() {
  return (
    // VEH-B (VEH-2): admit sales_admin (capability matrix for client
    // advisory) + region_admin (regional fleet via RLS narrowing).
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <VehiclesPage />
    </ProtectedRoute>
  );
}
