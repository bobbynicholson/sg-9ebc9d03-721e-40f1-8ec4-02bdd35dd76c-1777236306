/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useState, useEffect, useCallback, useMemo } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Truck, Plus, Snowflake, Edit, Trash2, AlertCircle, Search } from "lucide-react";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { vehicleService, type Vehicle } from "@/services/vehicleService";

function VehiclesPage() {
  const { user, profile } = useAuth() as any;
  const { toast } = useToast();
  const companyId = profile?.company_id ?? user?.company_id ?? null;

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);

  const [form, setForm] = useState({
    plate: "",
    make: "",
    model: "",
    capacity_kg: "",
    refrigerated: false,
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return vehicles;
    const q = search.trim().toLowerCase();
    return vehicles.filter(v =>
      (v.plate || "").toLowerCase().includes(q) ||
      (v.make || "").toLowerCase().includes(q) ||
      (v.model || "").toLowerCase().includes(q),
    );
  }, [vehicles, search]);

  const stats = useMemo(() => ({
    total: vehicles.length,
    active: vehicles.filter(v => v.is_active).length,
    refrigerated: vehicles.filter(v => v.refrigerated).length,
  }), [vehicles]);

  const openNew = () => {
    setEditTarget(null);
    setForm({ plate: "", make: "", model: "", capacity_kg: "", refrigerated: false, notes: "" });
    setError("");
  };

  const openEdit = (v: Vehicle) => {
    setEditTarget(v);
    setForm({
      plate: v.plate || "",
      make: v.make || "",
      model: v.model || "",
      capacity_kg: v.capacity_kg != null ? String(v.capacity_kg) : "",
      refrigerated: !!v.refrigerated,
      notes: v.notes || "",
    });
    setError("");
  };

  const handleSave = async () => {
    if (!form.plate.trim()) { setError("Number plate is required."); return; }
    if (!companyId) { setError("No company on your profile."); return; }
    setSaving(true);
    setError("");
    try {
      if (editTarget) {
        await vehicleService.updateVehicle(editTarget.id, {
          plate: form.plate.trim(),
          make: form.make.trim() || null,
          model: form.model.trim() || null,
          capacity_kg: form.capacity_kg !== "" ? Number(form.capacity_kg) : null,
          refrigerated: form.refrigerated,
          notes: form.notes.trim() || null,
        });
        toast({ title: "Vehicle updated", description: form.plate.trim() });
      } else {
        await vehicleService.createVehicle({
          companyId,
          plate: form.plate.trim(),
          make: form.make.trim(),
          model: form.model.trim(),
          capacityKg: form.capacity_kg !== "" ? Number(form.capacity_kg) : null,
          refrigerated: form.refrigerated,
          notes: form.notes.trim(),
        });
        toast({ title: "Vehicle added", description: form.plate.trim() });
      }
      setEditTarget(null);
      setForm({ plate: "", make: "", model: "", capacity_kg: "", refrigerated: false, notes: "" });
      // Close: leave the dialog by clearing both new + edit state
      setShowNew(false);
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

  // Single dialog that flips between Add and Edit modes via editTarget.
  const [showNew, setShowNew] = useState(false);
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
        <div className="px-4 py-6 max-w-screen-2xl">

          {/* Header */}
          <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Vehicles</h1>
                <p className="text-sm text-slate-500">
                  Fleet roster. Refrigerated vehicles unlock cold-chain orders for assignment.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
              onClick={() => { openNew(); setShowNew(true); }}
            >
              <Plus className="w-4 h-4" />
              Add vehicle
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1">Total fleet</p>
                <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-emerald-100">
              <CardContent className="pt-5 pb-4">
                <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold mb-1">Active</p>
                <p className="text-3xl font-bold text-emerald-900">{stats.active}</p>
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

          {/* Search */}
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm mb-4 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by plate, make or model"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
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
                    <p className="text-xs text-slate-500 mb-4">Add your first vehicle to start tracking the fleet.</p>
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 gap-2" onClick={() => { openNew(); setShowNew(true); }}>
                      <Plus className="w-4 h-4" />
                      Add a vehicle
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">No vehicles match this search.</p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filtered.map(v => (
                  <div key={v.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${v.refrigerated ? "bg-blue-100" : "bg-slate-100"}`}>
                        {v.refrigerated
                          ? <Snowflake className="w-5 h-5 text-blue-600" />
                          : <Truck className="w-5 h-5 text-slate-600" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-900">{v.plate || "—"}</p>
                          {v.refrigerated && (
                            <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px] gap-1">
                              <Snowflake className="w-3 h-3" />
                              Refrigerated
                            </Badge>
                          )}
                          {!v.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          {[v.make, v.model].filter(Boolean).join(" ")}
                          {v.capacity_kg != null && <> · {v.capacity_kg}kg</>}
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
        </div>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? `Edit ${editTarget.plate}` : "Add vehicle"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="plate">Plate *</Label>
              <Input id="plate" value={form.plate} onChange={e => setForm({ ...form, plate: e.target.value })} placeholder="e.g. CA 123-456" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="make">Make</Label>
                <Input id="make" value={form.make} onChange={e => setForm({ ...form, make: e.target.value })} placeholder="Toyota" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="model">Model</Label>
                <Input id="model" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="Hilux" className="mt-1" />
              </div>
            </div>
            <div>
              <Label htmlFor="capacity">Capacity (kg)</Label>
              <Input id="capacity" type="number" min="0" value={form.capacity_kg} onChange={e => setForm({ ...form, capacity_kg: e.target.value })} placeholder="e.g. 800" className="mt-1" />
            </div>
            <label className="flex items-start gap-3 px-3 py-2 rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={form.refrigerated}
                onChange={e => setForm({ ...form, refrigerated: e.target.checked })}
                className="mt-0.5 accent-blue-600"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                  <Snowflake className="w-3.5 h-3.5 text-blue-600" />
                  Refrigerated
                </p>
                <p className="text-xs text-slate-500">Required for cold-chain orders. Dispatch will only suggest this vehicle for those.</p>
              </div>
            </label>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional" className="mt-1" />
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
            The vehicle is removed from the roster. Drivers attached to it stay but lose the link.
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

export default function ProtectedVehiclesPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <VehiclesPage />
    </ProtectedRoute>
  );
}
