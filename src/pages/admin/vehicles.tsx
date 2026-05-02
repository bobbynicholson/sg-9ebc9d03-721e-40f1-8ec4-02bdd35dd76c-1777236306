/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * /admin/vehicles -- the catering company's fleet.
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
 * Nothing on this page is client-facing -- vehicles are an internal
 * dispatch concern and never show up in the client portal.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { AdminNav } from "@/components/admin/AdminNav";
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
  User, Building2, Users,
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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "company" | "driver" | "fridge" | "warmer">("all");
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);

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
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const list = await vehicleService.getVehiclesForCompany(companyId);
      setVehicles(list);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  // Pull drivers + admins so the owner / primary picker has names not
  // raw uuids. Tenant-scoped on the profiles table by RLS.
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, active_role")
        .eq("company_id", companyId)
        .in("role", ["driver", "admin", "company_admin", "owner"]);
      setDrivers((data || []) as DriverProfile[]);
    })();
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

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
      .finally(() => { if (!cancelled) setUtilLoading(false); });
    return () => { cancelled = true; };
  }, [tab, companyId, utilFromDays]);

  const driverNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const d of drivers) m[d.id] = d.full_name || d.email || "(unnamed)";
    return m;
  }, [drivers]);

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
      vehicle_type: v.vehicle_type || "bakkie",
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
    });
    setError("");
  };

  const handleSave = async () => {
    if (!form.plate.trim()) { setError("Number plate is required."); return; }
    if (!companyId) { setError("No company on your profile."); return; }
    if (form.owner_kind === "driver" && !form.driver_owner_id) {
      setError("Pick which driver owns this vehicle.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        plate: form.plate.trim(),
        nickname: form.nickname.trim() || null,
        make: form.make.trim() || null,
        model: form.model.trim() || null,
        year: form.year ? Number(form.year) : null,
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
      };
      if (editTarget) {
        await vehicleService.updateVehicle(editTarget.id, payload as any);
        toast({ title: "Vehicle updated", description: form.plate.trim() });
      } else {
        await vehicleService.createVehicle({
          companyId,
          plate: form.plate.trim(),
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
        toast({ title: "Vehicle added", description: form.plate.trim() });
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await vehicleService.deleteVehicle(deleteTarget.id);
      toast({ title: "Vehicle removed", description: deleteTarget.plate || "" });
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast({ title: "Could not delete", description: e?.message, variant: "destructive" });
    }
  };

  const dialogOpen = showNew || !!editTarget;
  const setDialogOpen = (open: boolean) => {
    if (!open) { setShowNew(false); setEditTarget(null); }
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Vehicles - CateringMS Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 lg:pl-72 xl:pl-80">
        <div className="px-4 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
                  Vehicles
                  <InfoTooltip content={"Your fleet plus any vehicles drivers bring themselves.\n\nDispatch uses these to suggest the right vehicle for an order, and to flag jobs that need two drivers."} />
                </h1>
                <p className="text-sm text-slate-500">
                  Fleet roster. Refrigerated and warmer vehicles unlock cold and hot-chain orders for assignment.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
              onClick={openNew}
            >
              <Plus className="w-4 h-4" />
              Add vehicle
            </Button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1 flex items-center gap-1.5">
                  Total fleet
                  <InfoTooltip content={"Every active vehicle, company-owned and driver-owned together."} />
                </p>
                <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-gradient-to-br from-indigo-50 to-indigo-100">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs uppercase tracking-wide text-indigo-700 font-semibold mb-1 flex items-center gap-1.5">
                  <Building2 className="w-3 h-3" />
                  Company
                </p>
                <p className="text-3xl font-bold text-indigo-900">{stats.company}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-amber-100">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs uppercase tracking-wide text-amber-700 font-semibold mb-1 flex items-center gap-1.5">
                  <User className="w-3 h-3" />
                  Driver-owned
                </p>
                <p className="text-3xl font-bold text-amber-900">{stats.driverOwned}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs uppercase tracking-wide text-blue-700 font-semibold mb-1 flex items-center gap-1.5">
                  <Snowflake className="w-3 h-3" />
                  Refrigerated
                </p>
                <p className="text-3xl font-bold text-blue-900">{stats.refrigerated}</p>
              </CardContent>
            </Card>
          </div>

          {/* Roster vs Utilisation tabs */}
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white shadow-sm p-1 text-xs mb-4 w-fit">
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
                    ? "bg-indigo-100 text-indigo-700 font-medium"
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
                type="text"
                placeholder="Search by plate, nickname, make or model"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
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
                      ? "bg-indigo-100 text-indigo-700 font-medium"
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
                <div className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto mb-3" />
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
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 gap-2" onClick={openNew}>
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
                            <span className="font-mono text-sm text-slate-500">{v.plate || "—"}</span>
                          </p>
                          {v.owner_kind === "driver" ? (
                            <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] gap-1">
                              <User className="w-3 h-3" />
                              {v.driver_owner_id ? driverNameById[v.driver_owner_id] || "Driver-owned" : "Driver-owned"}
                            </Badge>
                          ) : (
                            <Badge className="bg-indigo-100 text-indigo-800 border-0 text-[10px] gap-1">
                              <Building2 className="w-3 h-3" />
                              Company
                            </Badge>
                          )}
                          {v.refrigerated && (
                            <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px] gap-1">
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
                          {v.vehicle_type && <> · {VEHICLE_TYPES.find(t => t.id === v.vehicle_type)?.label || v.vehicle_type}</>}
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
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteTarget(v)} title="Delete">
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
        </div>
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
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300"
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
                    <p className="text-[11px] text-slate-500 mt-1">
                      When set, dispatch will suggest this driver first whenever this vehicle is on the run.
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

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={saving}>Cancel</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? "Saving..." : editTarget ? "Save changes" : "Add vehicle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-700">Remove {deleteTarget?.plate}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-700">
            The vehicle is removed from the roster. Open bookings against it stay on the orders so the run history is preserved.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
                  ? "bg-indigo-100 text-indigo-700 font-medium"
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
            <div className="animate-spin w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto mb-3" />
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
                          <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, share)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {r.distanceKm > 0 ? `${r.distanceKm.toFixed(0)}km` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {r.revenueCarried > 0 ? `R ${Math.round(r.revenueCarried).toLocaleString("en-ZA")}` : "—"}
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
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <VehiclesPage />
    </ProtectedRoute>
  );
}
