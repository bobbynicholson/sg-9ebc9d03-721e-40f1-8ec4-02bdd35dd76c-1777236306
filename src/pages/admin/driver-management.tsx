import { UserRole } from "@/types/app";
import { useState, useEffect, useMemo, useRef } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
import { SortMenu } from "@/components/ui/sort-menu";
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
import { Truck, UserPlus, Mail, Phone, Search, MoreVertical, Activity, Clock, Settings, MapPin, Calendar, Snowflake, Flame, Users, User, Building2, Download, X, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { AdminNav } from "@/components/admin/AdminNav";
import { LogDriverShiftModal } from "@/components/admin/LogDriverShiftModal";
import { DriverLeaderboard } from "@/components/admin/DriverLeaderboard";
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
import { WhatsAppButton } from "@/components/messaging/WhatsAppButton";
import { toLocalISO } from "@/lib/localDate";

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
  // Pay rates - per-driver overrides. NULL = fall back to the company
  // default on companies.default_*.
  hourly_rate: number | null;
  distance_rate_per_km: number | null;
  base_callout_fee: number | null;
}

interface CompanyPayDefaults {
  default_driver_hourly_rate: number | null;
  default_distance_rate_per_km: number | null;
  default_base_callout_fee: number | null;
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
  const { user, profile } = useAuth() as any;
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  // Phase 26 #10: "/" or Cmd-F focuses the search input.
  // Phase 29 #10: "n" opens the Add New Driver dialog.
  const searchRef = useRef<HTMLInputElement>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
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
        setIsAddDialogOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [addDriverLoading, setAddDriverLoading] = useState(false);
  // The Add-Driver dialog is now a single scrollable form covering driver
  // basics, operational details and the vehicle in one go. See the
  // strategy note on handleAddDriver for the multi-step write path.
  const [newDriver, setNewDriver] = useState({
    // Section 1 - basics (required)
    name: "",
    email: "",
    phone: "",
    password: "",
    // Section 2 - ops (optional)
    home_postcode: "",
    drive_time_to_kitchen_minutes: "",
    max_jobs_per_shift: "",
    // Section 2b - pay rates (optional, falls back to company defaults)
    hourly_rate: "",
    distance_rate_per_km: "",
    base_callout_fee: "",
    // Section 3 - vehicle
    has_vehicle: false,
    vehicle_mode: "new_driver_owned" as "new_driver_owned" | "existing_company",
    existing_vehicle_id: "",
    // sub-form for new driver-owned vehicle
    v_plate: "",
    v_make: "",
    v_model: "",
    v_year: "",
    v_vehicle_type: "bakkie",
    v_nickname: "",
    v_max_pax_served: "",
    v_capacity_kg: "",
    v_cargo_volume_litres: "",
    v_refrigerated: false,
    v_has_warmer: false,
    v_requires_two_people: false,
  });
  const [error, setError] = useState("");

  // Reset the add-driver form back to defaults whenever the dialog closes
  // so a fresh open never inherits stale field values.
  const resetNewDriver = () => setNewDriver({
    name: "", email: "", phone: "", password: "",
    home_postcode: "", drive_time_to_kitchen_minutes: "", max_jobs_per_shift: "",
    hourly_rate: "", distance_rate_per_km: "", base_callout_fee: "",
    has_vehicle: false,
    vehicle_mode: "new_driver_owned",
    existing_vehicle_id: "",
    v_plate: "", v_make: "", v_model: "", v_year: "",
    v_vehicle_type: "bakkie", v_nickname: "",
    v_max_pax_served: "", v_capacity_kg: "", v_cargo_volume_litres: "",
    v_refrigerated: false, v_has_warmer: false, v_requires_two_people: false,
  });

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
  const [editHourlyRate, setEditHourlyRate] = useState("");
  const [editDistanceRate, setEditDistanceRate] = useState("");
  const [editCalloutFee, setEditCalloutFee] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Company-level pay rate defaults. Drivers fall back to these when
  // their own rate columns are NULL. Loaded once on mount + used as
  // placeholder copy in the dialogs so the operator sees what would
  // apply if they leave the field blank.
  const [companyPayDefaults, setCompanyPayDefaults] = useState<CompanyPayDefaults>({
    default_driver_hourly_rate: null,
    default_distance_rate_per_km: null,
    default_base_callout_fee: null,
  });

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

  // Log-shift dialog (manual hours entry for hourly-rate pay).
  const [logShiftTarget, setLogShiftTarget] = useState<Driver | null>(null);

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
      // userManagementService selects * from profiles so the new rate
      // columns flow through at runtime, but the static type
      // (UserWithDepartments) doesn't include them. Cast via unknown
      // because the shapes don't structurally overlap on the TS side.
      const driverUsers = allUsers.filter(u => u.role === "driver") as unknown as Driver[];
      setDrivers(driverUsers);

      const driverIds = driverUsers.map(d => d.id);
      if (driverIds.length === 0) return;

      // Active jobs today
      const today = toLocalISO(new Date());
      const { data: activeOrders } = await supabase
        .from("orders")
        .select("assigned_driver_id")
        .eq("company_id", user.company_id)
        .is("deleted_at", null)
        .eq("event_date", today)
        .in("assigned_driver_id", driverIds)
        .in("status", ["confirmed", "preparing", "ready", "in_transit"]);
      const loadMap: Record<string, number> = {};
      driverIds.forEach(id => { loadMap[id] = 0; });
      for (const o of activeOrders || []) {
        const did = (o as any).assigned_driver_id;
        if (did) loadMap[did] = (loadMap[did] || 0) + 1;
      }
      setLoadByDriver(loadMap);

      // Last GPS ping per driver - single-row-per-driver lookup off
      // driver_locations (P1-23 split). The "last seen" timestamp lives
      // on driver_locations.updated_at.
      const { data: pings } = await (supabase as any)
        .from("driver_locations")
        .select("driver_id, updated_at")
        .in("driver_id", driverIds);
      const pingMap: Record<string, string> = {};
      for (const p of pings || []) {
        const did = (p as any).driver_id;
        if (did) pingMap[did] = (p as any).updated_at;
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

  // Load company-level pay rate defaults so the dialogs can show them
  // as placeholder copy when the driver-specific override is blank.
  useEffect(() => {
    if (!user?.company_id) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("companies")
        .select("default_driver_hourly_rate, default_distance_rate_per_km, default_base_callout_fee")
        .eq("id", user.company_id)
        .maybeSingle();
      if (data) {
        setCompanyPayDefaults({
          default_driver_hourly_rate: data.default_driver_hourly_rate ?? null,
          default_distance_rate_per_km: data.default_distance_rate_per_km ?? null,
          default_base_callout_fee: data.default_base_callout_fee ?? null,
        });
      }
    })();
  }, [user?.company_id]);

  const openEditDriver = (driver: Driver) => {
    setEditTarget(driver);
    setEditMaxJobs(driver.max_jobs_per_shift != null ? String(driver.max_jobs_per_shift) : "");
    setEditHomePostcode(driver.home_postcode ?? "");
    setEditVehicleId(driver.vehicle_id ?? "");
    setEditHourlyRate(driver.hourly_rate != null ? String(driver.hourly_rate) : "");
    setEditDistanceRate(driver.distance_rate_per_km != null ? String(driver.distance_rate_per_km) : "");
    setEditCalloutFee(driver.base_callout_fee != null ? String(driver.base_callout_fee) : "");
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
      // Flat shape (ok / value / msg) - discriminated union narrows
      // fine inside this function but can't be relied on if the type
      // is referenced anywhere else, and TS lint catches it as unsafe
      // when the shape escapes. Flat is safer.
      const parseRate = (raw: string, label: string): { ok: boolean; value: number | null; msg?: string } => {
        const trimmed = raw.trim();
        if (trimmed === "") return { ok: true, value: null };
        const n = Number(trimmed);
        if (isNaN(n) || n < 0) return { ok: false, value: null, msg: `${label} must be a positive number.` };
        return { ok: true, value: n };
      };
      const hourly = parseRate(editHourlyRate, "Hourly rate");
      if (!hourly.ok) { toast({ title: "Invalid rate", description: hourly.msg, variant: "destructive" }); return; }
      const distance = parseRate(editDistanceRate, "Per-km rate");
      if (!distance.ok) { toast({ title: "Invalid rate", description: distance.msg, variant: "destructive" }); return; }
      const callout = parseRate(editCalloutFee, "Callout fee");
      if (!callout.ok) { toast({ title: "Invalid rate", description: callout.msg, variant: "destructive" }); return; }
      const { error } = await (supabase as any)
        .from("profiles")
        .update({
          max_jobs_per_shift: max,
          home_postcode: editHomePostcode.trim() || null,
          vehicle_id: editVehicleId || null,
          hourly_rate: hourly.value,
          distance_rate_per_km: distance.value,
          base_callout_fee: callout.value,
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

  /**
   * Add-driver flow.
   *
   * Step 1: validate the basics + the vehicle subform (if a vehicle path
   *         was chosen) BEFORE any write hits the server. Saves us
   *         creating an auth user and then failing on a missing plate.
   *
   * Step 2: create the auth user + profile via /api/admin/create-user
   *         (server-side, service-role, rolls back on failure).
   *
   * Step 3: if a vehicle was picked, attach it. Two paths:
   *           - "new_driver_owned"  -> create a new vehicles row owned
   *             by this driver, set primary_driver_id = newDriverId.
   *           - "existing_company"  -> set primary_driver_id on the
   *             chosen company vehicle.
   *         Either way, also stamp profiles.vehicle_id + the legacy
   *         vehicle_registration field so the dispatch lookups + older
   *         displays stay in sync.
   *
   * If step 3 fails (e.g. duplicate plate, RLS hiccup) the driver is
   * still created - we surface the error and point the operator at
   * /admin/vehicles to finish the link by hand. The alternative would
   * be deleting the driver to roll back, which loses the password the
   * operator just typed.
   */
  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setAddDriverLoading(true);

    // ── Validate driver basics ──
    if (!newDriver.name || !newDriver.email || !newDriver.phone || !newDriver.password) {
      setError("Fill in name, email, phone and password.");
      setAddDriverLoading(false);
      return;
    }
    if (newDriver.password.length < 6) {
      setError("Password must be at least 6 characters long.");
      setAddDriverLoading(false);
      return;
    }
    if (!user?.company_id) {
      setError("Your account is not linked to a company yet, contact support.");
      setAddDriverLoading(false);
      return;
    }

    // ── Validate vehicle subform if a vehicle path was chosen ──
    if (newDriver.has_vehicle) {
      if (newDriver.vehicle_mode === "new_driver_owned") {
        if (!newDriver.v_plate.trim()) {
          setError("Vehicle plate is required when registering the driver's own vehicle.");
          setAddDriverLoading(false);
          return;
        }
      } else if (newDriver.vehicle_mode === "existing_company") {
        if (!newDriver.existing_vehicle_id) {
          setError("Pick a company vehicle from the list, or switch to 'driver brings their own'.");
          setAddDriverLoading(false);
          return;
        }
      }
    }

    // ── Step 2: create auth user + profile ──
    let newDriverId: string | null = null;
    try {
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
          drive_time_to_kitchen_minutes: newDriver.drive_time_to_kitchen_minutes
            ? Number(newDriver.drive_time_to_kitchen_minutes)
            : undefined,
        }),
      });

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

      newDriverId = payload?.user?.id || null;

      // Stamp the optional ops fields the API doesn't write (postcode,
      // max jobs per shift, pay-rate overrides). Done as a separate
      // update so the create-user contract stays narrow.
      const hasOpsExtras =
        newDriver.home_postcode || newDriver.max_jobs_per_shift ||
        newDriver.hourly_rate || newDriver.distance_rate_per_km ||
        newDriver.base_callout_fee;
      if (newDriverId && hasOpsExtras) {
        const numOrNull = (raw: string): number | null => {
          const t = raw.trim();
          if (!t) return null;
          const n = Number(t);
          return isNaN(n) || n < 0 ? null : n;
        };
        await (supabase as any)
          .from("profiles")
          .update({
            home_postcode: newDriver.home_postcode.trim() || null,
            max_jobs_per_shift: newDriver.max_jobs_per_shift
              ? Number(newDriver.max_jobs_per_shift)
              : null,
            hourly_rate: numOrNull(newDriver.hourly_rate),
            distance_rate_per_km: numOrNull(newDriver.distance_rate_per_km),
            base_callout_fee: numOrNull(newDriver.base_callout_fee),
          })
          .eq("id", newDriverId);
      }

      // Toast for the driver-only outcome - vehicle outcomes patch on top.
      let resultDescription = payload?.recovered
        ? `Driver ${newDriver.name} restored from a previous failed attempt.`
        : `Driver ${newDriver.name} has been added.`;
      let resultVariant: "default" | "destructive" = "default";
      let resultTitle = "Driver added";

      // ── Step 3: attach a vehicle if the operator picked one ──
      if (newDriverId && newDriver.has_vehicle) {
        try {
          let attachedVehicleId: string | null = null;
          let attachedPlate: string | null = null;

          if (newDriver.vehicle_mode === "new_driver_owned") {
            const created = await vehicleService.createVehicle({
              companyId: user.company_id,
              plate: newDriver.v_plate.trim(),
              make: newDriver.v_make.trim() || undefined,
              model: newDriver.v_model.trim() || undefined,
              year: newDriver.v_year ? Number(newDriver.v_year) : null,
              vehicleType: newDriver.v_vehicle_type || null,
              nickname: newDriver.v_nickname.trim() || null,
              ownerKind: "driver",
              driverOwnerId: newDriverId,
              primaryDriverId: newDriverId,
              capacityKg: newDriver.v_capacity_kg ? Number(newDriver.v_capacity_kg) : null,
              cargoVolumeLitres: newDriver.v_cargo_volume_litres ? Number(newDriver.v_cargo_volume_litres) : null,
              maxPaxServed: newDriver.v_max_pax_served ? Number(newDriver.v_max_pax_served) : null,
              refrigerated: newDriver.v_refrigerated,
              hasWarmer: newDriver.v_has_warmer,
              requiresTwoPeople: newDriver.v_requires_two_people,
            });
            attachedVehicleId = created?.id ?? null;
            attachedPlate = created?.plate ?? newDriver.v_plate.trim();
          } else {
            // Existing company vehicle - set this driver as the primary.
            const v = vehicleById[newDriver.existing_vehicle_id];
            await vehicleService.updateVehicle(newDriver.existing_vehicle_id, {
              primary_driver_id: newDriverId,
            } as any);
            attachedVehicleId = newDriver.existing_vehicle_id;
            attachedPlate = v?.plate ?? null;
          }

          // Mirror the vehicle id + plate onto profiles so dispatch's
          // existing lookups (profiles.vehicle_id and the legacy
          // vehicle_registration) keep working.
          if (attachedVehicleId) {
            await supabase
              .from("profiles")
              .update({
                vehicle_id: attachedVehicleId,
                vehicle_registration: attachedPlate,
              } as any)
              .eq("id", newDriverId);
          }

          resultDescription += attachedPlate
            ? ` Vehicle ${attachedPlate} attached.`
            : " Vehicle attached.";
        } catch (vehErr: any) {
          // Driver landed, vehicle didn't. Don't roll back the driver;
          // the password is gone after a rollback and the operator would
          // have to re-type everything.
          console.error("Vehicle attach failed:", vehErr);
          resultTitle = "Driver added, vehicle didn't attach";
          resultVariant = "destructive";
          resultDescription = `${newDriver.name} is in. ${vehErr?.message || "Vehicle could not be saved"}. Finish the vehicle on /admin/vehicles.`;
        }
      }

      toast({
        title: resultTitle,
        description: resultDescription,
        variant: resultVariant,
        duration: 4000,
      });

      setIsAddDialogOpen(false);
      resetNewDriver();
      loadDrivers();
      // Refresh the local vehicle list so the new driver-owned vehicle
      // (or the freshly-claimed company vehicle) reflects in pickers.
      vehicleService.getVehiclesForCompany(user.company_id).then(setVehicles);
    } catch (err: any) {
      console.error("Error adding driver:", err);
      setError(err?.message || "Network or browser error, check the console for details.");
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
   * Remove a driver. Server-side soft-delete via /api/admin/delete-user;
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

  const fuzzyDrivers = useFuzzyItems(
    drivers,
    searchQuery,
    [
      { key: "full_name" as any, weight: 3 },
      { key: "email" as any, weight: 2 },
      { key: "phone_number" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  const driverSortColumns: ColumnDef<Driver>[] = useMemo(() => [
    { key: "name",   accessor: (d) => d.full_name || d.email || "",            type: "string" },
    { key: "email",  accessor: (d) => d.email || "",                           type: "string" },
    { key: "phone",  accessor: (d) => (d as any).phone_number || "",           type: "string" },
    { key: "status", accessor: (d) => d.is_active ? "active" : "inactive",     type: "string" },
  ], []);
  const driverSort = useSortable<Driver>(fuzzyDrivers, driverSortColumns, { defaultKey: "name", defaultDir: "asc" });
  const filteredDrivers = driverSort.rows;

  const activeDrivers = drivers.filter(d => d.is_active).length;
  const inactiveDrivers = drivers.filter(d => !d.is_active).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <NoIndexMeta />
      <AdminNav />

      {/* Two-level layout matches admin/dashboard + admin/inventory: outer
          handles the sidebar offset, inner caps the content width. The
          earlier single-div version put pl-72 INSIDE the max-w box, which
          ate ~288px from inside the cap, that's why the content looked
          centred / narrow on wide viewports. */}
      <div className="min-h-screen overflow-x-hidden lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-full">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center">
                  <Truck className="w-6 h-6 text-white" />
                </div>
                Drivers
              </h1>
              <p className="text-slate-600">Driver roster, vehicles, and pay rates. Add a driver, link their vehicle, set per-driver overrides for hourly, distance per km, and callouts. Falls back to company defaults where no override is set.</p>
            </div>

            <div className="flex items-center gap-2">
              {/* Phase 28 #4: manual refresh. Drivers are added
                  from multiple surfaces (this page, mobile sign-up,
                  dispatch creating an account) - dispatch leads
                  need to pull fresh state without a hard reload. */}
              <Button
                variant="outline"
                size="sm"
                onClick={loadDrivers}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {/* Phase 14 #4: driver roster CSV export. Bookkeeping
                  + payroll teams need an offline copy of the team
                  list for monthly run reconciliation. Exports the
                  filtered set so search + sort scope flow through. */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const rows = filteredDrivers as Driver[];
                  if (rows.length === 0) {
                    toast({ title: "Nothing to export", description: "Adjust filters until at least one driver is visible." });
                    return;
                  }
                  const headers = [
                    "Name", "Email", "Phone",
                    "Active", "Created",
                    "Hourly rate", "Distance rate /km", "Callout fee",
                    "Home postcode", "Drive time to kitchen (min)",
                    "Max jobs / shift", "Regions covered",
                  ];
                  const esc = (v: any) => {
                    if (v == null) return "";
                    const s = String(v).replace(/"/g, '""');
                    return /[",\n]/.test(s) ? `"${s}"` : s;
                  };
                  const lines = [headers.join(",")];
                  for (const d of rows) {
                    lines.push([
                      esc(d.full_name), esc(d.email), esc(d.phone_number),
                      esc(d.is_active ? "yes" : "no"), esc(d.created_at),
                      esc(d.hourly_rate), esc(d.distance_rate_per_km), esc(d.base_callout_fee),
                      esc(d.home_postcode), esc(d.drive_time_to_kitchen_minutes),
                      esc(d.max_jobs_per_shift),
                      esc((d.regions_covered || []).join(";")),
                    ].join(","));
                  }
                  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  const stamp = toLocalISO(new Date());
                  a.download = `drivers_${stamp}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <InfoTooltip
                content={"Create a new driver account with login details. They can sign in to their portal as soon as you save."}
                side="left"
              />
              <Dialog
                open={isAddDialogOpen}
                onOpenChange={(o) => {
                  setIsAddDialogOpen(o);
                  if (!o) { resetNewDriver(); setError(""); }
                }}
              >
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-brand-primary to-brand-secondary hover:opacity-90">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add New Driver
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <UserPlus className="w-5 h-5 text-indigo-600" />
                      Add New Driver
                    </DialogTitle>
                    <p className="text-sm text-slate-500 mt-1">
                      Driver basics, operational details and the vehicle, all in one go.
                    </p>
                  </DialogHeader>
                  <form onSubmit={handleAddDriver} className="space-y-5">
                    {error && (
                      <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    {/* ── Section 1: driver basics ── */}
                    <Card className="border-slate-200 shadow-none">
                      <CardContent className="py-4 px-4 space-y-3">
                        <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                          <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
                          Driver basics
                        </Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="name">Full name *</Label>
                            <Input
                              id="name"
                              value={newDriver.name}
                              onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })}
                              placeholder="John Doe"
                              className="mt-1"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="email">Email address *</Label>
                            <Input
                              id="email"
                              type="email"
                              value={newDriver.email}
                              onChange={(e) => setNewDriver({ ...newDriver, email: e.target.value })}
                              placeholder="john.doe@example.com"
                              className="mt-1"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="phone">Phone number *</Label>
                            <Input
                              id="phone"
                              type="tel"
                              value={newDriver.phone}
                              onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })}
                              placeholder="+27 12 345 6789"
                              className="mt-1"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="password">Password *</Label>
                            <Input
                              id="password"
                              type="password"
                              value={newDriver.password}
                              onChange={(e) => setNewDriver({ ...newDriver, password: e.target.value })}
                              placeholder="At least 6 characters"
                              className="mt-1"
                              required
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* ── Section 2: operational details ── */}
                    <Card className="border-slate-200 shadow-none">
                      <CardContent className="py-4 px-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-emerald-600" />
                            Operational details
                          </Label>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wide">Optional, fill what you know</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <Label htmlFor="home_postcode" className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400" /> Home postcode
                            </Label>
                            <Input
                              id="home_postcode"
                              value={newDriver.home_postcode}
                              onChange={(e) => setNewDriver({ ...newDriver, home_postcode: e.target.value })}
                              placeholder="e.g. 7806"
                              className="mt-1"
                            />
                            <p className="text-[11px] text-slate-500 mt-1">Used for regional fit when dispatching.</p>
                          </div>
                          <div>
                            <Label htmlFor="drive_time" className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" /> Drive-time to kitchen (min)
                            </Label>
                            <Input
                              id="drive_time"
                              type="number"
                              min="0"
                              value={newDriver.drive_time_to_kitchen_minutes}
                              onChange={(e) => setNewDriver({ ...newDriver, drive_time_to_kitchen_minutes: e.target.value })}
                              placeholder="e.g. 25"
                              className="mt-1"
                            />
                            <p className="text-[11px] text-slate-500 mt-1">Feeds the dispatch ETA calc.</p>
                          </div>
                          <div>
                            <Label htmlFor="max_jobs">Max jobs / shift</Label>
                            <Input
                              id="max_jobs"
                              type="number"
                              min="0"
                              value={newDriver.max_jobs_per_shift}
                              onChange={(e) => setNewDriver({ ...newDriver, max_jobs_per_shift: e.target.value })}
                              placeholder="e.g. 4"
                              className="mt-1"
                            />
                            <p className="text-[11px] text-slate-500 mt-1">Caps the load picker won't exceed.</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* ── Section 2b: pay rates ── */}
                    <Card className="border-slate-200 shadow-none">
                      <CardContent className="py-4 px-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-orange-600" />
                            Pay rates
                          </Label>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wide">Optional, falls back to company defaults</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <Label htmlFor="hourly_rate">Hourly rate (R / hr)</Label>
                            <Input
                              id="hourly_rate"
                              type="number"
                              min="0"
                              step="0.01"
                              value={newDriver.hourly_rate}
                              onChange={(e) => setNewDriver({ ...newDriver, hourly_rate: e.target.value })}
                              placeholder={
                                companyPayDefaults.default_driver_hourly_rate != null
                                  ? `Default: R ${companyPayDefaults.default_driver_hourly_rate.toFixed(2)}`
                                  : "e.g. 75.00"
                              }
                              className="mt-1"
                            />
                            <p className="text-[11px] text-slate-500 mt-1">Paid per hour on-shift.</p>
                          </div>
                          <div>
                            <Label htmlFor="distance_rate_per_km">Per-km rate (R / km)</Label>
                            <Input
                              id="distance_rate_per_km"
                              type="number"
                              min="0"
                              step="0.01"
                              value={newDriver.distance_rate_per_km}
                              onChange={(e) => setNewDriver({ ...newDriver, distance_rate_per_km: e.target.value })}
                              placeholder={
                                companyPayDefaults.default_distance_rate_per_km != null
                                  ? `Default: R ${companyPayDefaults.default_distance_rate_per_km.toFixed(2)}`
                                  : "e.g. 5.50"
                              }
                              className="mt-1"
                            />
                            <p className="text-[11px] text-slate-500 mt-1">Paid per km driven on a job.</p>
                          </div>
                          <div>
                            <Label htmlFor="base_callout_fee">Callout fee (R)</Label>
                            <Input
                              id="base_callout_fee"
                              type="number"
                              min="0"
                              step="0.01"
                              value={newDriver.base_callout_fee}
                              onChange={(e) => setNewDriver({ ...newDriver, base_callout_fee: e.target.value })}
                              placeholder={
                                companyPayDefaults.default_base_callout_fee != null
                                  ? `Default: R ${companyPayDefaults.default_base_callout_fee.toFixed(2)}`
                                  : "e.g. 100.00"
                              }
                              className="mt-1"
                            />
                            <p className="text-[11px] text-slate-500 mt-1">Flat fee per dispatch.</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* ── Section 3: vehicle ── */}
                    <Card className="border-slate-200 shadow-none">
                      <CardContent className="py-4 px-4 space-y-3">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <Switch
                            checked={newDriver.has_vehicle}
                            onCheckedChange={(v: boolean) => setNewDriver({ ...newDriver, has_vehicle: v })}
                          />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                              <Truck className="w-4 h-4 text-indigo-600" />
                              This driver has a vehicle
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Skip this if you'll attach a vehicle later. Dispatch can still assign deliveries without one, but it can't pick a vehicle automatically.
                            </p>
                          </div>
                        </label>

                        {newDriver.has_vehicle && (
                          <div className="space-y-3 pt-2 border-t border-slate-100">
                            {/* Mode toggle */}
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setNewDriver({ ...newDriver, vehicle_mode: "new_driver_owned" })}
                                className={`px-3 py-2 rounded-md border text-sm flex items-center gap-2 ${
                                  newDriver.vehicle_mode === "new_driver_owned"
                                    ? "bg-amber-500 text-white border-amber-500"
                                    : "bg-white text-slate-700 border-slate-200 hover:border-amber-300"
                                }`}
                              >
                                <User className="w-4 h-4" /> Driver brings their own
                              </button>
                              <button
                                type="button"
                                onClick={() => setNewDriver({ ...newDriver, vehicle_mode: "existing_company" })}
                                className={`px-3 py-2 rounded-md border text-sm flex items-center gap-2 ${
                                  newDriver.vehicle_mode === "existing_company"
                                    ? "bg-indigo-600 text-white border-indigo-600"
                                    : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300"
                                }`}
                              >
                                <Building2 className="w-4 h-4" /> Use a company vehicle
                              </button>
                            </div>

                            {newDriver.vehicle_mode === "existing_company" ? (
                              <div>
                                <Label htmlFor="existing_vehicle">Pick a company vehicle *</Label>
                                <select
                                  id="existing_vehicle"
                                  value={newDriver.existing_vehicle_id}
                                  onChange={(e) => setNewDriver({ ...newDriver, existing_vehicle_id: e.target.value })}
                                  className="mt-1 w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                                >
                                  <option value="">- Select a vehicle -</option>
                                  {vehicles
                                    .filter(v => v.owner_kind === "company")
                                    .map(v => (
                                      <option key={v.id} value={v.id}>
                                        {v.plate}
                                        {v.nickname ? ` · ${v.nickname}` : ""}
                                        {v.make || v.model ? ` (${[v.make, v.model].filter(Boolean).join(" ")})` : ""}
                                        {v.primary_driver_id ? "  • already has a primary driver" : ""}
                                      </option>
                                    ))}
                                </select>
                                <p className="text-[11px] text-slate-500 mt-1">
                                  We'll set this driver as the default for the vehicle. Dispatch will still allow other drivers to take it on a run.
                                </p>
                                {vehicles.filter(v => v.owner_kind === "company").length === 0 && (
                                  <p className="text-[11px] text-amber-700 mt-1">
                                    No company vehicles yet. Add one on /admin/vehicles, or switch to 'driver brings their own'.
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                  <div>
                                    <Label htmlFor="v_plate">Plate *</Label>
                                    <Input
                                      id="v_plate"
                                      value={newDriver.v_plate}
                                      onChange={(e) => setNewDriver({ ...newDriver, v_plate: e.target.value.toUpperCase() })}
                                      placeholder="CA 123-456"
                                      className="mt-1 font-mono"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="v_make">Make</Label>
                                    <Input id="v_make" value={newDriver.v_make} onChange={(e) => setNewDriver({ ...newDriver, v_make: e.target.value })} placeholder="Toyota" className="mt-1" />
                                  </div>
                                  <div>
                                    <Label htmlFor="v_model">Model</Label>
                                    <Input id="v_model" value={newDriver.v_model} onChange={(e) => setNewDriver({ ...newDriver, v_model: e.target.value })} placeholder="Hilux" className="mt-1" />
                                  </div>
                                  <div>
                                    <Label htmlFor="v_year">Year</Label>
                                    <Input id="v_year" type="number" min="1990" max="2100" value={newDriver.v_year} onChange={(e) => setNewDriver({ ...newDriver, v_year: e.target.value })} className="mt-1" />
                                  </div>
                                  <div>
                                    <Label htmlFor="v_type">Type</Label>
                                    <select
                                      id="v_type"
                                      value={newDriver.v_vehicle_type}
                                      onChange={(e) => setNewDriver({ ...newDriver, v_vehicle_type: e.target.value })}
                                      className="mt-1 w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                                    >
                                      <option value="bakkie">Bakkie / pickup</option>
                                      <option value="van">Van</option>
                                      <option value="truck">Truck</option>
                                      <option value="trailer">Trailer</option>
                                      <option value="car">Car</option>
                                      <option value="other">Other</option>
                                    </select>
                                  </div>
                                  <div>
                                    <Label htmlFor="v_nickname">Nickname</Label>
                                    <Input id="v_nickname" value={newDriver.v_nickname} onChange={(e) => setNewDriver({ ...newDriver, v_nickname: e.target.value })} placeholder="e.g. White Bakkie" className="mt-1" />
                                  </div>
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                  <div>
                                    <Label htmlFor="v_max_pax">Rated guests</Label>
                                    <Input id="v_max_pax" type="number" min="0" value={newDriver.v_max_pax_served} onChange={(e) => setNewDriver({ ...newDriver, v_max_pax_served: e.target.value })} placeholder="e.g. 80" className="mt-1" />
                                  </div>
                                  <div>
                                    <Label htmlFor="v_cargo">Cargo (L)</Label>
                                    <Input id="v_cargo" type="number" min="0" value={newDriver.v_cargo_volume_litres} onChange={(e) => setNewDriver({ ...newDriver, v_cargo_volume_litres: e.target.value })} placeholder="e.g. 1500" className="mt-1" />
                                  </div>
                                  <div>
                                    <Label htmlFor="v_kg">Max kg</Label>
                                    <Input id="v_kg" type="number" min="0" value={newDriver.v_capacity_kg} onChange={(e) => setNewDriver({ ...newDriver, v_capacity_kg: e.target.value })} placeholder="e.g. 800" className="mt-1" />
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <label className="flex items-start gap-3 px-3 py-2 rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50">
                                    <Switch checked={newDriver.v_refrigerated} onCheckedChange={(v: boolean) => setNewDriver({ ...newDriver, v_refrigerated: v })} />
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                                        <Snowflake className="w-3.5 h-3.5 text-blue-600" /> Refrigerated
                                      </p>
                                      <p className="text-xs text-slate-500">Required for cold-chain orders.</p>
                                    </div>
                                  </label>
                                  <label className="flex items-start gap-3 px-3 py-2 rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50">
                                    <Switch checked={newDriver.v_has_warmer} onCheckedChange={(v: boolean) => setNewDriver({ ...newDriver, v_has_warmer: v })} />
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                                        <Flame className="w-3.5 h-3.5 text-orange-600" /> Has a hot warmer
                                      </p>
                                      <p className="text-xs text-slate-500">Hot-hold for late-arrival orders.</p>
                                    </div>
                                  </label>
                                  <label className="flex items-start gap-3 px-3 py-2 rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50">
                                    <Switch checked={newDriver.v_requires_two_people} onCheckedChange={(v: boolean) => setNewDriver({ ...newDriver, v_requires_two_people: v })} />
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5 text-rose-600" /> Needs two on board
                                      </p>
                                      <p className="text-xs text-slate-500">Big truck or tight loading. Dispatch will require a co-driver.</p>
                                    </div>
                                  </label>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-800">
                        <strong>Note:</strong> The driver can sign in to their portal as soon as you save. Anything you skip here can be filled in from the row's Edit menu later.
                      </p>
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-brand-primary to-brand-secondary hover:opacity-90"
                      disabled={addDriverLoading}
                    >
                      {addDriverLoading ? "Adding driver..." : "Add driver"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Phase 11 #3: month-to-date driver leaderboard.
              Top 5 by hours worked with completed deliveries as
              a tiebreaker. Self-hides if no driver has activity
              this month. */}
          <DriverLeaderboard companyId={(user as any)?.company_id ?? null} />

          {/* Stats, live operational signals */}
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

        {/* Pay defaults - company-level fallback rates. Each driver's
            profile can override these; left blank, drivers fall back to
            whatever the operator sets here. Stage 1 of the driver
            hourly-rate build laid the columns; this card is the UI. */}
        <CompanyPayDefaultsCard
          companyId={user?.company_id}
          defaults={companyPayDefaults}
          onSaved={(next) => setCompanyPayDefaults(next)}
        />

        {/* Search + sort */}
        <div className="mb-6 flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search drivers by name or email... (press /)"
              className="pl-10 pr-10 h-12"
            />
            {/* Phase 25 #10: clear-search affordance, finishing
                the consistency sweep started in Phase 24 #7. */}
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                title="Clear search"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <SortMenu
            activeKey={driverSort.sortKey}
            activeDir={driverSort.sortDir}
            onPick={driverSort.setSort}
            options={[
              { key: "name",   dir: "asc",  label: "Name (A to Z)" },
              { key: "name",   dir: "desc", label: "Name (Z to A)" },
              { key: "status", dir: "asc",  label: "Active first" },
              { key: "status", dir: "desc", label: "Inactive first" },
              { key: "email",  dir: "asc",  label: "Email (A to Z)" },
              { key: "phone",  dir: "asc",  label: "Phone (A to Z)" },
            ]}
          />
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
                                {/* Phase 17 #7: rate-source badge.
                                    Surfaces whether the driver inherits
                                    the company default or has any per-
                                    driver override set. Saves the admin
                                    from opening each row to find out. */}
                                {(() => {
                                  const hasAny = driver.hourly_rate != null
                                    || driver.distance_rate_per_km != null
                                    || driver.base_callout_fee != null;
                                  return hasAny ? (
                                    <Badge className="bg-purple-50 text-purple-700 border border-purple-200 text-[10px]">
                                      Custom rates
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] text-slate-500">
                                      Default rates
                                    </Badge>
                                  );
                                })()}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                                {/* Phase 21 #8: click-to-copy driver
                                    email + phone. Dispatch leads
                                    routinely paste these into ops
                                    chats and SMS apps when calling
                                    a driver about a job. Clicking
                                    the chip copies the value. */}
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      await navigator.clipboard.writeText(String(driver.email || ""));
                                      toast({ title: "Email copied", description: driver.email });
                                    } catch {
                                      toast({ title: "Copy failed", description: "Browser blocked clipboard access.", variant: "destructive" });
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 hover:underline hover:text-slate-900"
                                  title="Copy email"
                                >
                                  <Mail className="w-3 h-3" />{driver.email}
                                </button>
                                {driver.phone_number && (
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await navigator.clipboard.writeText(String(driver.phone_number || ""));
                                        toast({ title: "Phone copied", description: driver.phone_number });
                                      } catch {
                                        toast({ title: "Copy failed", description: "Browser blocked clipboard access.", variant: "destructive" });
                                      }
                                    }}
                                    className="inline-flex items-center gap-1 hover:underline hover:text-slate-900"
                                    title="Copy phone number"
                                  >
                                    <Phone className="w-3 h-3" />{driver.phone_number}
                                  </button>
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
                                      {perf.onTimeRate == null ? "-" : `${Math.round(perf.onTimeRate * 100)}%`}
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
                                      {perf.totalKm > 0 ? `${perf.totalKm} km` : "-"}
                                    </p>
                                    <p className="text-[10px] uppercase tracking-wide text-slate-500">distance 30d</p>
                                  </div>
                                </>
                              );
                            })()}
                            <div className="text-center">
                              <p className="text-sm font-medium text-slate-700">
                                {lastPing ? relativeTime(lastPing) : "-"}
                              </p>
                              <p className="text-[10px] uppercase tracking-wide text-slate-500">last ping</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {/* WhatsApp the driver. Hidden if the phone
                                is missing or looks like a landline.
                                Templates: confirm shift / job assigned
                                / pickup ready / generic check-in. */}
                            <WhatsAppButton
                              kind="staff"
                              phone={driver.phone_number}
                              variant="ghost"
                              size="sm"
                              label=""
                              className="h-8 w-8 p-0"
                              templates={["general_check_in", "shift_confirm", "job_assigned", "pickup_ready", "schedule_change"]}
                              defaultTemplate="general_check_in"
                              ctx={{
                                staffName: driver.full_name || driver.email,
                                role: "driver",
                                fromName: profile?.full_name || profile?.company_name || "the team",
                                companyName: profile?.company_name,
                              }}
                            />
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
                              onClick={() => setLogShiftTarget(driver)}
                              title="Log hours worked (for hourly-rate pay)"
                            >
                              <Clock className="w-4 h-4" />
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
                                  // setTimeout(0) defers the dialog open
                                  // until after the dropdown's close
                                  // animation finishes - without this,
                                  // Radix's focus trap on the menu can
                                  // swallow the AlertDialog's open
                                  // event and the dialog never appears.
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    setTimeout(() => setRemoveTarget(driver), 0);
                                  }}
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

        {/* Quick Links. The driver portal lives at /{slug}/login - the
            same staff login as kitchen / shopping / cleaning. We never
            send drivers to /auth/login (that's the platform-wide page,
            no tenant branding). Self-signup isn't a route - drivers
            are added by an admin and sign in with the credentials they
            receive by email. */}
        <Card className="border-0 shadow-lg mt-6 bg-gradient-to-br from-blue-50 to-indigo-50">
          <CardHeader>
            <CardTitle className="text-blue-900">Driver Portal Access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const slug = (user as any)?.company_slug || (profile as any)?.company_slug || "";
              const origin = typeof window !== "undefined" ? window.location.origin : "";
              const loginPath = slug ? `/${slug}/login` : "/auth/login";
              const fullUrl = origin ? `${origin}${loginPath}` : loginPath;
              return (
                <>
                  <div className="bg-white rounded-lg p-4 border border-blue-200">
                    <h4 className="font-semibold text-blue-900 mb-2">Driver login URL</h4>
                    <p className="text-sm text-blue-700 mb-2">
                      Share this URL with your drivers so they can bookmark and access their portal:
                    </p>
                    <code className="block bg-blue-100 text-blue-900 px-3 py-2 rounded text-sm break-all">
                      {fullUrl}
                    </code>
                  </div>

                  <div className="bg-white rounded-lg p-4 border border-blue-200">
                    <h4 className="font-semibold text-blue-900 mb-2">Adding new drivers</h4>
                    <p className="text-sm text-blue-700">
                      Drivers don&apos;t self-register. Tap <strong>Add driver</strong> above to
                      create the account; they&apos;ll receive their sign-in details by email and
                      can use them on the URL above.
                    </p>
                  </div>
                </>
              );
            })()}
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

      {/* Edit driver dialog, capacity, home postcode, regions */}
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

            <div className="border-t border-slate-200 pt-4">
              <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Pay rates
              </Label>
              <p className="text-[11px] text-slate-500 mt-0.5 mb-3">
                Per-driver overrides. Leave blank to use the company defaults.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="edit_hourly_rate">Hourly (R / hr)</Label>
                  <Input
                    id="edit_hourly_rate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editHourlyRate}
                    onChange={(e) => setEditHourlyRate(e.target.value)}
                    placeholder={
                      companyPayDefaults.default_driver_hourly_rate != null
                        ? `Default R ${companyPayDefaults.default_driver_hourly_rate.toFixed(2)}`
                        : "e.g. 75.00"
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit_distance_rate">Per-km (R / km)</Label>
                  <Input
                    id="edit_distance_rate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editDistanceRate}
                    onChange={(e) => setEditDistanceRate(e.target.value)}
                    placeholder={
                      companyPayDefaults.default_distance_rate_per_km != null
                        ? `Default R ${companyPayDefaults.default_distance_rate_per_km.toFixed(2)}`
                        : "e.g. 5.50"
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit_callout_fee">Callout (R)</Label>
                  <Input
                    id="edit_callout_fee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editCalloutFee}
                    onChange={(e) => setEditCalloutFee(e.target.value)}
                    placeholder={
                      companyPayDefaults.default_base_callout_fee != null
                        ? `Default R ${companyPayDefaults.default_base_callout_fee.toFixed(2)}`
                        : "e.g. 100.00"
                    }
                    className="mt-1"
                  />
                </div>
              </div>
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

      {/* Log shift (manual hours entry for hourly-rate pay) */}
      {logShiftTarget && user?.company_id && (
        <LogDriverShiftModal
          open={!!logShiftTarget}
          onOpenChange={(o) => { if (!o) setLogShiftTarget(null); }}
          companyId={user.company_id}
          driverId={logShiftTarget.id}
          driverName={logShiftTarget.full_name || logShiftTarget.email}
          actorUserId={user?.id ?? null}
          onCreated={() => { /* shifts list refresh handled when settlement view ships in Stage 3 */ }}
        />
      )}

      {/* Remove driver confirm */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => { if (!open && !removeSaving) setRemoveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.full_name || removeTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-slate-600">
                <p>
                  They'll disappear from the driver list and won't be able to log in to the driver portal.
                </p>
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900 text-xs">
                  <strong>Pay history is preserved.</strong> All shifts, deliveries and the costs
                  you paid this driver remain on file. They'll show in Driver Settlement under
                  a "Removed" badge so you can still pay out anything outstanding.
                </div>
                <p className="text-xs">
                  Restore them later by un-archiving the profile in Users.
                </p>
              </div>
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

// CompanyPayDefaultsCard
//
// Company-level fallback rates for driver pay. Editable inline. When a
// driver's per-profile rate is NULL the calculator uses these. Sits at
// the top of the driver-management page so the operator sees the
// fallbacks before drilling into individual drivers.
function CompanyPayDefaultsCard({
  companyId,
  defaults,
  onSaved,
}: {
  companyId: string | undefined;
  defaults: CompanyPayDefaults;
  onSaved: (next: CompanyPayDefaults) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hourly, setHourly] = useState("");
  const [perKm, setPerKm] = useState("");
  const [callout, setCallout] = useState("");
  const { toast } = useToast();

  const openEdit = () => {
    setHourly(defaults.default_driver_hourly_rate != null ? String(defaults.default_driver_hourly_rate) : "");
    setPerKm(defaults.default_distance_rate_per_km != null ? String(defaults.default_distance_rate_per_km) : "");
    setCallout(defaults.default_base_callout_fee != null ? String(defaults.default_base_callout_fee) : "");
    setEditing(true);
  };

  const save = async () => {
    if (!companyId) return;
    const parse = (raw: string, label: string): number | null | "invalid" => {
      const t = raw.trim();
      if (!t) return null;
      const n = Number(t);
      if (isNaN(n) || n < 0) {
        toast({ title: "Invalid rate", description: `${label} must be a positive number.`, variant: "destructive" });
        return "invalid";
      }
      return n;
    };
    const h = parse(hourly, "Hourly rate");
    if (h === "invalid") return;
    const k = parse(perKm, "Per-km rate");
    if (k === "invalid") return;
    const c = parse(callout, "Callout fee");
    if (c === "invalid") return;

    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("companies")
        .update({
          default_driver_hourly_rate: h,
          default_distance_rate_per_km: k,
          default_base_callout_fee: c,
        })
        .eq("id", companyId);
      if (error) throw error;
      onSaved({
        default_driver_hourly_rate: h ?? null,
        default_distance_rate_per_km: k ?? null,
        default_base_callout_fee: c ?? null,
      });
      toast({ title: "Pay defaults saved" });
      setEditing(false);
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const fmt = (v: number | null) =>
    v == null ? <span className="text-slate-400">Not set</span> : `R ${v.toFixed(2)}`;

  return (
    <Card className="mb-6 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-orange-600" />
              <h3 className="text-sm font-semibold text-slate-900">Company pay defaults</h3>
            </div>
            <p className="text-xs text-slate-600 mb-3">
              Fallback rates used when a driver's profile has no override. Drivers with their own rates set keep those.
            </p>

            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="def_hourly" className="text-xs">Hourly (R / hr)</Label>
                  <Input id="def_hourly" type="number" min="0" step="0.01" value={hourly}
                    onChange={(e) => setHourly(e.target.value)} className="mt-1 bg-white" />
                </div>
                <div>
                  <Label htmlFor="def_perkm" className="text-xs">Per-km (R / km)</Label>
                  <Input id="def_perkm" type="number" min="0" step="0.01" value={perKm}
                    onChange={(e) => setPerKm(e.target.value)} className="mt-1 bg-white" />
                </div>
                <div>
                  <Label htmlFor="def_callout" className="text-xs">Callout (R)</Label>
                  <Input id="def_callout" type="number" min="0" step="0.01" value={callout}
                    onChange={(e) => setCallout(e.target.value)} className="mt-1 bg-white" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-md bg-white border border-orange-200 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Hourly</div>
                  <div className="font-semibold text-slate-900 tabular-nums">{fmt(defaults.default_driver_hourly_rate)}</div>
                </div>
                <div className="rounded-md bg-white border border-orange-200 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Per km</div>
                  <div className="font-semibold text-slate-900 tabular-nums">{fmt(defaults.default_distance_rate_per_km)}</div>
                </div>
                <div className="rounded-md bg-white border border-orange-200 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Callout</div>
                  <div className="font-semibold text-slate-900 tabular-nums">{fmt(defaults.default_base_callout_fee)}</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 sm:flex-col sm:items-end">
            {editing ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={save} disabled={saving} className="bg-brand-primary hover:opacity-90">
                  {saving ? "Saving..." : "Save defaults"}
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={openEdit} className="bg-white">
                <Settings className="w-3.5 h-3.5 mr-1.5" />
                Edit defaults
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
