import { UserRole } from "@/types/app";
import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Truck, UserPlus, Mail, Phone, CheckCircle, XCircle, Search, MoreVertical, Activity, Clock, Settings, MapPin, Calendar, Snowflake } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { authService } from "@/services/authService";
import { profileService } from "@/services/profileService";
import { userManagementService } from "@/services/userManagementService";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { DialogFooter, DialogClose } from "@/components/ui/dialog";
import { ShiftScheduleDialog } from "@/components/admin/dispatch/ShiftScheduleDialog";
import { vehicleService, type Vehicle } from "@/services/vehicleService";
import { dispatchService } from "@/services/dispatchService";

interface Driver {
  id: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  is_active: boolean;
  created_at: string;
  drive_time_to_kitchen_minutes: number | null;
  max_jobs_per_shift: number | null;
  home_postcode: string | null;
  regions_covered: string[] | null;
  vehicle_id: string | null;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 45) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 90) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function ProtectedDriverManagementPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <DriverManagementPage />
    </ProtectedRoute>
  );
}

function DriverManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addDriverLoading, setAddDriverLoading] = useState(false);
  const [newDriver, setNewDriver] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [error, setError] = useState("");

  // Phase 1B: live signals per driver
  const [loadByDriver, setLoadByDriver] = useState<Record<string, number>>({});
  const [lastPingByDriver, setLastPingByDriver] = useState<Record<string, string>>({});
  // Phase 2B: 30-day performance rollup per driver
  const [perfByDriver, setPerfByDriver] = useState<Record<string, {
    completedJobs: number;
    onTimeRate: number | null;
    totalKm: number;
    totalEarnings: number;
    declineCount: number;
  }>>({});

  // Edit driver dialog
  const [editTarget, setEditTarget] = useState<Driver | null>(null);
  const [editMaxJobs, setEditMaxJobs] = useState("");
  const [editHomePostcode, setEditHomePostcode] = useState("");
  const [editVehicleId, setEditVehicleId] = useState<string>("");
  const [editSaving, setEditSaving] = useState(false);

  // Remove driver confirm dialog
  const [removeTarget, setRemoveTarget] = useState<Driver | null>(null);
  const [removeSaving, setRemoveSaving] = useState(false);

  // Vehicles list for the picker + per-driver vehicle map
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const vehicleById = useMemo(() => {
    const m: Record<string, Vehicle> = {};
    for (const v of vehicles) m[v.id] = v;
    return m;
  }, [vehicles]);

  // Shift schedule dialog
  const [scheduleTarget, setScheduleTarget] = useState<Driver | null>(null);

  useEffect(() => {
    if (user) {
      loadDrivers();
    }
  }, [user]);

  const loadDrivers = async () => {
    if (!user?.company_id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const allUsers = await userManagementService.getAllUsers(user.company_id);
      const driverUsers = allUsers.filter(u => u.role === "driver") as Driver[];
      setDrivers(driverUsers);

      const driverIds = driverUsers.map(d => d.id);
      if (driverIds.length === 0) return;

      // Active jobs today
      const today = new Date().toISOString().slice(0, 10);
      const { data: activeOrders } = await supabase
        .from("orders")
        .select("assigned_driver_id")
        .eq("company_id", user.company_id)
        .eq("event_date", today)
        .in("assigned_driver_id", driverIds)
        .in("status", ["confirmed", "preparing", "ready", "out_for_delivery", "in_transit"]);
      const loadMap: Record<string, number> = {};
      driverIds.forEach(id => { loadMap[id] = 0; });
      for (const o of activeOrders || []) {
        const did = (o as any).assigned_driver_id;
        if (did) loadMap[did] = (loadMap[did] || 0) + 1;
      }
      setLoadByDriver(loadMap);

      // Last GPS ping per driver
      const { data: pings } = await supabase
        .from("gps_tracking")
        .select("driver_id, timestamp")
        .in("driver_id", driverIds)
        .order("timestamp", { ascending: false });
      const pingMap: Record<string, string> = {};
      for (const p of pings || []) {
        const did = (p as any).driver_id;
        if (did && !pingMap[did]) pingMap[did] = (p as any).timestamp;
      }
      setLastPingByDriver(pingMap);

      // Phase 2B: 30-day performance rollup. Fetched in parallel; failures
      // per-driver don't block the others.
      const perfEntries = await Promise.all(driverIds.map(async (id) => {
        try {
          const p = await dispatchService.getDriverPerformance(user.company_id, id, 30);
          return [id, p] as const;
        } catch {
          return [id, null] as const;
        }
      }));
      const perfMap: typeof perfByDriver = {};
      for (const [id, p] of perfEntries) {
        if (p) perfMap[id] = {
          completedJobs: p.completedJobs,
          onTimeRate: p.onTimeRate,
          totalKm: p.totalKm,
          totalEarnings: p.totalEarnings,
          declineCount: p.declineCount,
        };
      }
      setPerfByDriver(perfMap);
    } catch (err) {
      console.error("Error loading drivers:", err);
      toast({
        title: "Error",
        description: "Failed to load drivers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Load vehicles when company is known
  useEffect(() => {
    if (!user?.company_id) return;
    vehicleService.getVehiclesForCompany(user.company_id).then(setVehicles);
  }, [user?.company_id]);

  const openEditDriver = (driver: Driver) => {
    setEditTarget(driver);
    setEditMaxJobs(driver.max_jobs_per_shift != null ? String(driver.max_jobs_per_shift) : "");
    setEditHomePostcode(driver.home_postcode ?? "");
    setEditVehicleId(driver.vehicle_id ?? "");
  };

  const handleEditDriverSave = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      const max = editMaxJobs.trim() === "" ? null : Number(editMaxJobs);
      if (max != null && (isNaN(max) || max < 0)) {
        toast({ title: "Invalid capacity", description: "Max jobs per shift must be a positive number.", variant: "destructive" });
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update({
          max_jobs_per_shift: max,
          home_postcode: editHomePostcode.trim() || null,
          vehicle_id: editVehicleId || null,
        })
        .eq("id", editTarget.id);
      if (error) throw error;
      toast({ title: "Driver updated", description: editTarget.full_name });
      setEditTarget(null);
      loadDrivers();
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message, variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setAddDriverLoading(true);

    if (!newDriver.name || !newDriver.email || !newDriver.phone || !newDriver.password) {
      setError("Please fill in all fields");
      setAddDriverLoading(false);
      return;
    }

    if (newDriver.password.length < 6) {
      setError("Password must be at least 6 characters long");
      setAddDriverLoading(false);
      return;
    }

    if (!user?.company_id) {
      setError("Your account is not linked to a company yet -- contact support");
      setAddDriverLoading(false);
      return;
    }

    try {
      // Use the server-side create-user endpoint. It runs as service-role,
      // confirms the email automatically and rolls back the auth user if the
      // profile insert fails -- no more "user already exists" on retry.
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: newDriver.email,
          password: newDriver.password,
          full_name: newDriver.name,
          phone: newDriver.phone,
          role: "driver",
          company_id: user.company_id,
        }),
      });

      // Read the body once as text first, then try parsing as JSON. This
      // way we surface the actual server message even if the response is
      // an HTML error page (e.g. middleware redirect, framework crash).
      const rawText = await res.text();
      let payload: any = {};
      try { payload = JSON.parse(rawText); } catch { /* keep raw */ }

      if (!res.ok) {
        const serverMsg = payload?.error
          || (rawText && rawText.length < 200 ? rawText : null)
          || `Server returned ${res.status}`;
        setError(`Could not add driver: ${serverMsg}`);
        console.error("Add driver failed:", { status: res.status, payload, rawText });
        setAddDriverLoading(false);
        return;
      }

      toast({
        title: "Success!",
        description: payload?.recovered
          ? `Driver ${newDriver.name} restored from a previous failed attempt.`
          : `Driver ${newDriver.name} has been added successfully`,
        duration: 3000,
      });

      setIsAddDialogOpen(false);
      setNewDriver({ name: "", email: "", phone: "", password: "" });
      loadDrivers();
    } catch (err: any) {
      console.error("Error adding driver:", err);
      setError(err?.message || "Network or browser error -- check the console for details.");
    } finally {
      setAddDriverLoading(false);
    }
  };

  const handleToggleDriverStatus = async (driverId: string, currentStatus: boolean) => {
    try {
      await userManagementService.updateUserStatus(driverId, !currentStatus);

      toast({
        title: "Success",
        description: `Driver ${currentStatus ? "deactivated" : "activated"} successfully`,
        duration: 3000,
      });

      loadDrivers();
    } catch (err) {
      console.error("Error toggling driver status:", err);
      toast({
        title: "Error",
        description: "Failed to update driver status",
        variant: "destructive",
      });
    }
  };

  /**
   * Remove a driver. Server-side soft-delete via /api/admin/delete-user --
   * stamps profiles.deleted_at + bans the auth user so the row stops
   * appearing in queries and the user can no longer log in. Order history
   * stays intact (we never hard-delete because that would cascade through
   * orders / shifts / assignments).
   */
  const handleRemoveDriver = async () => {
    if (!removeTarget) return;
    setRemoveSaving(true);
    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ userId: removeTarget.id }),
      });
      const rawText = await res.text();
      let payload: any = {};
      try { payload = JSON.parse(rawText); } catch { /* keep raw */ }
      if (!res.ok) {
        const msg = payload?.error
          || (rawText && rawText.length < 200 ? rawText : null)
          || `Server returned ${res.status}`;
        toast({ title: "Could not remove driver", description: msg, variant: "destructive" });
        console.error("Remove driver failed:", { status: res.status, payload, rawText });
        return;
      }
      toast({
        title: "Driver removed",
        description: `${removeTarget.full_name || removeTarget.email} can no longer access the portal.`,
      });
      setRemoveTarget(null);
      loadDrivers();
    } catch (err: any) {
      toast({
        title: "Network error",
        description: err?.message || "Could not reach the server.",
        variant: "destructive",
      });
    } finally {
      setRemoveSaving(false);
    }
  };

  const filteredDrivers = useFuzzyItems(
    drivers,
    searchQuery,
    [
      { key: "full_name" as any, weight: 3 },
      { key: "email" as any, weight: 2 },
      { key: "phone_number" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  const activeDrivers = drivers.filter(d => d.is_active).length;
  const inactiveDrivers = drivers.filter(d => !d.is_active).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <NoIndexMeta />
      <AdminNav />

      {/* Two-level layout matches admin/dashboard + admin/inventory: outer
          handles the sidebar offset, inner caps the content width. The
          earlier single-div version put pl-72 INSIDE the max-w box, which
          ate ~288px from inside the cap -- that's why the content looked
          centred / narrow on wide viewports. */}
      <div className="min-h-screen overflow-x-hidden lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 max-w-screen-2xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <Truck className="w-6 h-6 text-white" />
                </div>
                Driver Management
              </h1>
              <p className="text-slate-600">Manage your delivery drivers and their accounts</p>
            </div>

            <div className="flex items-center gap-2">
              <InfoTooltip
                content={"Create a new driver account with login details. They can sign in to their portal as soon as you save."}
                side="left"
              />
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add New Driver
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Driver</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddDriver} className="space-y-4">
                    {error && (
                      <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name *</Label>
                      <Input
                        id="name"
                        value={newDriver.name}
                        onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })}
                        placeholder="John Doe"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newDriver.email}
                        onChange={(e) => setNewDriver({ ...newDriver, email: e.target.value })}
                        placeholder="john.doe@example.com"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number *</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={newDriver.phone}
                        onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })}
                        placeholder="+27 12 345 6789"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password *</Label>
                      <Input
                        id="password"
                        type="password"
                        value={newDriver.password}
                        onChange={(e) => setNewDriver({ ...newDriver, password: e.target.value })}
                        placeholder="At least 6 characters"
                        required
                      />
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-800">
                        <strong>Note:</strong> The driver will receive their login credentials and can access the driver portal immediately.
                      </p>
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={addDriverLoading}
                    >
                      {addDriverLoading ? "Adding Driver..." : "Add Driver"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Stats -- live operational signals */}
          {(() => {
            const onShift = Object.entries(lastPingByDriver).filter(([, ts]) => {
              const ageMin = (Date.now() - new Date(ts).getTime()) / 60_000;
              return ageMin <= 60;
            }).length;
            const totalLoad = Object.values(loadByDriver).reduce((s, n) => s + n, 0);
            const avgLoad = drivers.length > 0 ? (totalLoad / drivers.length) : 0;
            const stalePings = Object.entries(lastPingByDriver).filter(([, ts]) => {
              const ageMin = (Date.now() - new Date(ts).getTime()) / 60_000;
              return ageMin > 60 && ageMin < 24 * 60;
            }).length;

            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="border-0 shadow-md bg-gradient-to-br from-emerald-50 to-emerald-100">
                  <CardContent className="pt-5 pb-4">
                    <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold mb-1 flex items-center gap-1.5">
                      On shift now
                      <InfoTooltip content={"Drivers with a GPS ping in the last 60 minutes. Best signal for live availability."} />
                    </p>
                    <p className="text-3xl font-bold text-emerald-900">{onShift}</p>
                    <p className="text-xs text-emerald-700 mt-0.5">of {activeDrivers} active</p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-md">
                  <CardContent className="pt-5 pb-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1 flex items-center gap-1.5">
                      Total drivers
                      <InfoTooltip content={"Every driver account on your team."} />
                    </p>
                    <p className="text-3xl font-bold text-slate-900">{drivers.length}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{inactiveDrivers} inactive</p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-md">
                  <CardContent className="pt-5 pb-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1 flex items-center gap-1.5">
                      Jobs today
                      <InfoTooltip content={"Active deliveries assigned across all drivers today. Avg per driver shows balance."} />
                    </p>
                    <p className="text-3xl font-bold text-slate-900">{totalLoad}</p>
                    <p className="text-xs text-slate-500 mt-0.5">avg {avgLoad.toFixed(1)} per driver</p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-md bg-gradient-to-br from-amber-50 to-amber-100">
                  <CardContent className="pt-5 pb-4">
                    <p className="text-xs uppercase tracking-wide text-amber-700 font-semibold mb-1 flex items-center gap-1.5">
                      Stale pings
                      <InfoTooltip content={"Drivers whose last GPS update was over 60 minutes ago today. Might be off-shift, might need a check-in."} />
                    </p>
                    <p className="text-3xl font-bold text-amber-900">{stalePings}</p>
                    <p className="text-xs text-amber-700 mt-0.5">last 24h, no recent ping</p>
                  </CardContent>
                </Card>
              </div>
            );
          })()}
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search drivers by name or email..."
              className="pl-10 h-12"
            />
          </div>
        </div>

        {/* Drivers List */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">All Drivers <InfoTooltip content={"Every driver matching your search, active and inactive."} /></CardTitle>
            <CardDescription>
              Manage your delivery drivers and their account status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <p className="text-slate-500">Loading drivers...</p>
              </div>
            ) : filteredDrivers.length === 0 ? (
              <div className="text-center py-12">
                <Truck className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">
                  {searchQuery ? "No drivers found" : "No drivers yet"}
                </h3>
                <p className="text-slate-500 mb-6">
                  {searchQuery ? "Try adjusting your search" : "Add your first driver to get started"}
                </p>
                {!searchQuery && (
                  <Button onClick={() => setIsAddDialogOpen(true)}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add First Driver
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredDrivers.map((driver) => {
                  const lastPing = lastPingByDriver[driver.id];
                  const lastPingAgeMin = lastPing ? (Date.now() - new Date(lastPing).getTime()) / 60_000 : null;
                  const onShift = lastPingAgeMin != null && lastPingAgeMin <= 60;
                  const stale = lastPingAgeMin != null && lastPingAgeMin > 60 && lastPingAgeMin < 24 * 60;
                  const currentLoad = loadByDriver[driver.id] ?? 0;
                  const maxJobs = driver.max_jobs_per_shift ?? null;
                  const capacityFull = maxJobs != null && currentLoad >= maxJobs;

                  return (
                    <Card key={driver.id} className={`border shadow-sm hover:shadow-md transition-shadow ${onShift ? "border-l-4 border-l-emerald-500" : ""}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 ${
                              onShift ? "bg-gradient-to-br from-emerald-500 to-green-600" : "bg-gradient-to-br from-slate-400 to-slate-500"
                            }`}>
                              {driver.full_name.charAt(0).toUpperCase()}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <h3 className="font-semibold text-slate-900 truncate">{driver.full_name}</h3>
                                {onShift && (
                                  <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px] font-medium gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    On shift
                                  </Badge>
                                )}
                                {stale && (
                                  <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] font-medium">
                                    Stale ping
                                  </Badge>
                                )}
                                {!driver.is_active && (
                                  <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                                <span className="inline-flex items-center gap-1">
                                  <Mail className="w-3 h-3" />{driver.email}
                                </span>
                                {driver.phone_number && (
                                  <span className="inline-flex items-center gap-1">
                                    <Phone className="w-3 h-3" />{driver.phone_number}
                                  </span>
                                )}
                                {driver.home_postcode && (
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />{driver.home_postcode}
                                  </span>
                                )}
                                {driver.vehicle_id && vehicleById[driver.vehicle_id] && (
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
                                    vehicleById[driver.vehicle_id].refrigerated ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"
                                  }`}>
                                    {vehicleById[driver.vehicle_id].refrigerated
                                      ? <Snowflake className="w-3 h-3" />
                                      : <Truck className="w-3 h-3" />}
                                    {vehicleById[driver.vehicle_id].plate}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Live signals + 30-day rollup */}
                          <div className="hidden sm:flex items-center gap-4 text-xs shrink-0">
                            <div className="text-center">
                              <p className={`text-lg font-bold tabular-nums ${capacityFull ? "text-red-700" : "text-slate-900"}`}>
                                {currentLoad}{maxJobs != null && <span className="text-sm text-slate-400">/{maxJobs}</span>}
                              </p>
                              <p className="text-[10px] uppercase tracking-wide text-slate-500">jobs today</p>
                            </div>
                            {(() => {
                              const perf = perfByDriver[driver.id];
                              if (!perf) return null;
                              return (
                                <>
                                  <div className="text-center">
                                    <p className={`text-lg font-bold tabular-nums ${
                                      perf.onTimeRate == null ? "text-slate-400" :
                                      perf.onTimeRate >= 0.95 ? "text-emerald-700" :
                                      perf.onTimeRate >= 0.85 ? "text-amber-700" :
                                                                "text-red-700"
                                    }`}>
                                      {perf.onTimeRate == null ? "—" : `${Math.round(perf.onTimeRate * 100)}%`}
                                    </p>
                                    <p className="text-[10px] uppercase tracking-wide text-slate-500">on-time 30d</p>
                                  </div>
                                  <div className="text-center hidden lg:block">
                                    <p className="text-lg font-bold tabular-nums text-slate-900">
                                      {perf.completedJobs}
                                    </p>
                                    <p className="text-[10px] uppercase tracking-wide text-slate-500">jobs 30d</p>
                                  </div>
                                  <div className="text-center hidden lg:block">
                                    <p className="text-sm font-semibold text-slate-700 tabular-nums">
                                      {perf.totalKm > 0 ? `${perf.totalKm} km` : "—"}
                                    </p>
                                    <p className="text-[10px] uppercase tracking-wide text-slate-500">distance 30d</p>
                                  </div>
                                </>
                              );
                            })()}
                            <div className="text-center">
                              <p className="text-sm font-medium text-slate-700">
                                {lastPing ? relativeTime(lastPing) : "—"}
                              </p>
                              <p className="text-[10px] uppercase tracking-wide text-slate-500">last ping</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => setScheduleTarget(driver)}
                              title="Edit shift schedule"
                            >
                              <Calendar className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => openEditDriver(driver)}
                              title="Edit capacity + vehicle"
                            >
                              <Settings className="w-4 h-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleToggleDriverStatus(driver.id, driver.is_active)}>
                                  {driver.is_active ? "Deactivate driver" : "Activate driver"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => setRemoveTarget(driver)}
                                  className="text-red-700 focus:text-red-700 focus:bg-red-50"
                                >
                                  Remove driver
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Links */}
        <Card className="border-0 shadow-lg mt-6 bg-gradient-to-br from-blue-50 to-indigo-50">
          <CardHeader>
            <CardTitle className="text-blue-900">Driver Portal Access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <h4 className="font-semibold text-blue-900 mb-2">Driver Login URL</h4>
              <p className="text-sm text-blue-700 mb-2">
                Share this URL with your drivers so they can easily bookmark and access their portal:
              </p>
              <code className="block bg-blue-100 text-blue-900 px-3 py-2 rounded text-sm">
                {typeof window !== "undefined" ? `${window.location.origin}/auth/login` : "/auth/login"}
              </code>
            </div>

            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <h4 className="font-semibold text-blue-900 mb-2">Driver Signup URL</h4>
              <p className="text-sm text-blue-700 mb-2">
                Share this URL if you want drivers to self-register:
              </p>
              <code className="block bg-blue-100 text-blue-900 px-3 py-2 rounded text-sm">
                {typeof window !== "undefined" ? `${window.location.origin}/auth/register` : "/auth/register"}
              </code>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Shift schedule dialog (Phase 2) */}
      <ShiftScheduleDialog
        open={!!scheduleTarget}
        onOpenChange={open => !open && setScheduleTarget(null)}
        driverId={scheduleTarget?.id ?? null}
        driverName={scheduleTarget?.full_name ?? ""}
        companyId={user?.company_id ?? null}
      />

      {/* Edit driver dialog -- capacity, home postcode, regions */}
      <Dialog open={!!editTarget} onOpenChange={open => !open && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-slate-600" />
              Edit driver · {editTarget?.full_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="max_jobs">Max jobs per shift</Label>
              <Input
                id="max_jobs"
                type="number"
                min="0"
                value={editMaxJobs}
                onChange={e => setEditMaxJobs(e.target.value)}
                placeholder="e.g. 6"
                className="mt-1"
              />
              <p className="text-xs text-slate-500 mt-1">
                Capacity gate uses this. Leave blank for no limit.
              </p>
            </div>
            <div>
              <Label htmlFor="home_postcode">Home postcode</Label>
              <Input
                id="home_postcode"
                value={editHomePostcode}
                onChange={e => setEditHomePostcode(e.target.value)}
                placeholder="e.g. 7700"
                className="mt-1"
              />
              <p className="text-xs text-slate-500 mt-1">
                Used as start point for distance scoring when GPS is stale.
              </p>
            </div>
            <div>
              <Label htmlFor="vehicle">Vehicle</Label>
              <select
                id="vehicle"
                value={editVehicleId}
                onChange={e => setEditVehicleId(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">No vehicle assigned</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.plate}{v.refrigerated ? " · refrigerated" : ""}{[v.make, v.model].filter(Boolean).length > 0 ? ` · ${[v.make, v.model].filter(Boolean).join(" ")}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Refrigerated vehicles unlock cold-chain orders for this driver.
              </p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={editSaving}>Cancel</Button>
            </DialogClose>
            <Button onClick={handleEditDriverSave} disabled={editSaving} className="bg-emerald-600 hover:bg-emerald-700">
              {editSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove driver confirm */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open && !removeSaving) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.full_name || removeTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll disappear from the driver list and won't be able to log in to the driver portal.
              Their order history and shift records stay intact for reporting. You can restore them
              later by un-archiving the profile in Users.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleRemoveDriver(); }}
              disabled={removeSaving}
              className="bg-red-600 hover:bg-red-700"
            >
              {removeSaving ? "Removing..." : "Remove driver"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

        <Footer />
      </div>
    </div>
  );
}