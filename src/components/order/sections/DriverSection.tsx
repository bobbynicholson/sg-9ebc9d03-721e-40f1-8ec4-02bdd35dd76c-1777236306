import { protectedCompanyFileUrl } from "@/lib/companyFiles";
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC Wave C: driver section - everything the driver needs in one
 * scan, plus dispatch oversight.
 *
 * Top of section: collection time + a "Leave by" derived chip when
 * we know the drive time. Distance + duration come from orders.
 *
 * Driver block: primary driver name + phone, vehicle nickname + plate
 * + cold-chain capable + has-warmer chips. If requires_two_drivers,
 * secondary driver + vehicle render below.
 *
 * Venue block: name + address + navigate. Venue contact (different
 * from client) renders as separate tap targets so the driver can
 * ring security/venue manager directly.
 *
 * Status: en_route / arrived / delivered timestamps + POD state.
 * Inline checklist booleans from driver_assignments
 * (checklist_crockery_confirmed / cutlery / food_verified).
 *
 * Driver acknowledgement: when driver_acknowledged_at is set, show
 * who acknowledged + via what channel.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { CollapsibleSection } from "./CollapsibleSection";
import operationStyles from "../OrderOperations.module.css";
import { OrderContributors } from "../OrderContributors";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantHref } from "@/lib/tenantUrl";
import { useToast } from "@/hooks/use-toast";
import { UserRole } from "@/types/app";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Truck, MapPin, Clock, CheckCircle2, Loader2, Camera, User, Navigation,
  Snowflake, Flame, Car, Phone, MessageSquare, Users, Route, AlertCircle, CalendarClock,
} from "lucide-react";

interface Props {
  order: {
    id: string;
    order_number: string | null;
    company_id: string;
    event_date: string;
    event_time: string | null;
    collection_time: string | null;
    pickup_time: string | null;
    venue_name: string | null;
    venue_address: string | null;
    venue_contact_person: string | null;
    venue_contact_phone: string | null;
    assigned_driver_id: string | null;
    assigned_vehicle_id: string | null;
    secondary_driver_id: string | null;
    secondary_vehicle_id: string | null;
    requires_two_drivers: boolean | null;
    requires_refrigeration: boolean | null;
    delivery_distance_km: number | null;
    delivery_duration_minutes: number | null;
    driver_acknowledged_at: string | null;
    driver_acknowledged_via: string | null;
    status: string;
    pod_captured_at: string | null;
    pod_photo_url: string | null;
    pod_signature_url: string | null;
    arrived_at_venue_at: string | null;
    delivered_at: string | null;
    picked_up_at: string | null;
  };
  defaultOpen?: boolean;
  forceOpen?: boolean;
  highlight?: boolean;
}

interface Assignment {
  id: string;
  driver_id: string;
  assignment_type?: string | null;
  status: string | null;
  arrived_at_venue_at: string | null;
  delivered_at: string | null;
  picked_up_at: string | null;
  en_route_at: string | null;
  checklist_crockery_confirmed: boolean | null;
  checklist_cutlery_confirmed: boolean | null;
  checklist_food_verified: boolean | null;
  driver?: { full_name: string | null; phone: string | null } | null;
}

interface VehicleRow {
  id: string;
  nickname: string | null;
  plate: string | null;
  make: string | null;
  model: string | null;
  refrigerated: boolean;
  has_warmer: boolean;
  capacity_kg: number | null;
  requires_two_people: boolean;
}

interface ProfileRow {
  full_name: string | null;
  phone: string | null;
}

function pickVisibleAssignment(rows: any): Assignment | null {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  return (
    (list.find((row: any) => row?.assignment_type === "primary" && row?.driver_id) as Assignment | undefined) ||
    (list.find((row: any) => row?.driver_id) as Assignment | undefined) ||
    null
  );
}

export function DriverSection({ order, defaultOpen, forceOpen, highlight }: Props) {
  const { user, userRoles } = useAuth();
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [driverProfile, setDriverProfile] = useState<ProfileRow | null>(null);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [secondaryDriver, setSecondaryDriver] = useState<ProfileRow | null>(null);
  const [secondaryVehicle, setSecondaryVehicle] = useState<VehicleRow | null>(null);
  const [loading, setLoading] = useState(true);
  // Secondary-driver picker (admin only). companyDrivers feeds the
  // dropdown; savingSecondary disables it mid-write.
  const [companyDrivers, setCompanyDrivers] = useState<Array<{ id: string; full_name: string | null; phone: string | null }>>([]);
  const [savingSecondary, setSavingSecondary] = useState(false);

  const isDriver = (() => {
    const roles = Array.isArray(userRoles) ? userRoles : [];
    return roles.includes(UserRole.DRIVER) || user?.role === UserRole.DRIVER;
  })();
  const isAssignedDriver = isDriver && (assignment?.driver_id === user?.id || order.assigned_driver_id === user?.id);
  // Admin/ops viewer - the only ones who can reach /admin/dispatch to
  // assign a driver. Drivers/clients viewing the order doc don't get the
  // "Assign driver" shortcut.
  const isAdminViewer = (() => {
    const roles = Array.isArray(userRoles) ? userRoles : [];
    const adminRoles = [
      UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN,
      UserRole.REGION_ADMIN, UserRole.SALES_ADMIN, UserRole.ADMIN,
    ];
    return adminRoles.some((r) => roles.includes(r)) || adminRoles.includes(user?.role as any);
  })();

  // Nav URL: prefer the lat/lng if available, fall back to address
  // string. Caller decides at click time which app to open in.
  const navUrl = order.venue_address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.venue_address)}`
    : null;
  const podDeepLink = `${withSlug("/team-portal/driver/dashboard")}#order-${order.id}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Batch the lookups. Primary driver assignment (with checklist
        // booleans), assigned vehicle, secondary driver profile + vehicle.
        const tasks: Promise<any>[] = [
          (supabase as any)
            .from("driver_assignments")
            .select("id, assignment_type, driver_id, status, arrived_at_venue_at, delivered_at, picked_up_at, en_route_at, checklist_crockery_confirmed, checklist_cutlery_confirmed, checklist_food_verified, driver:driver_id(full_name, phone)")
            .eq("order_id", order.id)
            .order("created_at", { ascending: false })
            .limit(8),
          order.assigned_vehicle_id
            ? (supabase as any)
                .from("vehicles")
                .select("id, nickname, plate, make, model, refrigerated, has_warmer, capacity_kg, requires_two_people")
                .eq("id", order.assigned_vehicle_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          order.secondary_driver_id
            ? (supabase as any)
                .from("profiles")
                .select("full_name, phone")
                .eq("id", order.secondary_driver_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          order.secondary_vehicle_id
            ? (supabase as any)
                .from("vehicles")
                .select("id, nickname, plate, make, model, refrigerated, has_warmer, capacity_kg, requires_two_people")
                .eq("id", order.secondary_vehicle_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ];
        const [aRes, vRes, sdRes, svRes] = await Promise.all(tasks);
        if (cancelled) return;
        const pickedAssignment = pickVisibleAssignment(aRes?.data);
        if (pickedAssignment) setAssignment(pickedAssignment);
        if (vRes?.data) setVehicle(vRes.data as VehicleRow);
        if (sdRes?.data) setSecondaryDriver(sdRes.data as ProfileRow);
        if (svRes?.data) setSecondaryVehicle(svRes.data as VehicleRow);

        // Fallback driver lookup when no assignment row exists yet.
        if (!pickedAssignment && order.assigned_driver_id) {
          const { data: pData } = await (supabase as any)
            .from("profiles")
            .select("full_name, phone")
            .eq("id", order.assigned_driver_id)
            .maybeSingle();
          if (!cancelled && pData) setDriverProfile(pData);
        }
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadDriverSection", orderId: order.id, companyId: order.company_id } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [order.id, order.company_id, order.assigned_driver_id, order.assigned_vehicle_id, order.secondary_driver_id, order.secondary_vehicle_id]);

  // Realtime: keep the assignment + checklist booleans live.
  useEffect(() => {
    if (!order.id) return;
    const ch = supabase
      .channel(`order-doc-driver:${order.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "driver_assignments", filter: `order_id=eq.${order.id}` },
        async () => {
          const { data } = await (supabase as any)
            .from("driver_assignments")
            .select("id, assignment_type, driver_id, status, arrived_at_venue_at, delivered_at, picked_up_at, en_route_at, checklist_crockery_confirmed, checklist_cutlery_confirmed, checklist_food_verified, driver:driver_id(full_name, phone)")
            .eq("order_id", order.id)
            .order("created_at", { ascending: false })
            .limit(8);
          const picked = pickVisibleAssignment(data);
          if (picked) setAssignment(picked);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [order.id]);

  // Load the company's drivers for the secondary-driver picker - admins
  // only, and only when a second driver is actually needed + not yet set.
  useEffect(() => {
    if (!isAdminViewer || !order.requires_two_drivers || order.secondary_driver_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, phone")
        .eq("company_id", order.company_id)
        .eq("role", "driver")
        .order("full_name", { ascending: true });
      if (!cancelled) setCompanyDrivers((data as any[]) || []);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminViewer, order.requires_two_drivers, order.secondary_driver_id, order.company_id]);

  // Assign a secondary driver: write orders.secondary_driver_id, reflect
  // it locally, and ping that driver so they know they're the second on
  // this job. Best-effort notify - never blocks the assignment.
  const assignSecondaryDriver = async (driverId: string) => {
    if (!driverId) return;
    setSavingSecondary(true);
    try {
      // Server-side route: runs under service role so the orders update +
      // the cross-user driver notification both land reliably (a
      // browser-side insert for another user doesn't always stick under
      // RLS - which is why the earlier client-side notify silently failed).
      const resp = await fetch(`/api/orders/${order.id}/assign-secondary-driver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.ok) {
        throw new Error(json?.error || `Could not assign (${resp.status})`);
      }
      const picked = companyDrivers.find((d) => d.id === driverId) || null;
      if (picked) setSecondaryDriver({ full_name: picked.full_name, phone: picked.phone });
      const emailNote = json.email_sent
        ? "In-app and email notifications sent."
        : "In-app notification saved; email was not sent (check their email settings/provider).";
      toast({ title: "Secondary driver assigned", description: `${picked?.full_name || "Driver"} added. ${emailNote}` });
    } catch (e: any) {
      toast({ title: "Could not assign", description: e?.message || "Try again.", variant: "destructive" });
    } finally {
      setSavingSecondary(false);
    }
  };

  const driver = assignment?.driver || driverProfile;
  const podCaptured = !!order.pod_captured_at;
  const delivered = order.status === "delivered" || order.status === "completed" || !!order.delivered_at || !!assignment?.delivered_at;
  const arrivedAt = order.arrived_at_venue_at || assignment?.arrived_at_venue_at || null;
  const deliveredAt = order.delivered_at || assignment?.delivered_at || null;
  const pickedUpAt = order.picked_up_at || assignment?.picked_up_at || null;
  const enRouteAt = assignment?.en_route_at || null;

  // "Leave by" derived chip - compute the latest moment the driver
  // can leave the kitchen and still make collection_time. We need
  // both a collection target and a drive-time estimate.
  const collectionTime = order.collection_time || order.pickup_time || null;
  const driveMin = order.delivery_duration_minutes || null;
  let leaveByLabel: string | null = null;
  let isLeaveByRed = false;
  if (collectionTime && driveMin) {
    const [hh, mm] = collectionTime.slice(0, 5).split(":").map((n) => parseInt(n, 10));
    const collectionDate = new Date(order.event_date);
    collectionDate.setHours(hh || 0, mm || 0, 0, 0);
    const leaveBy = new Date(collectionDate.getTime() - driveMin * 60_000);
    leaveByLabel = leaveBy.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
    isLeaveByRed = leaveBy.getTime() <= Date.now();
  }

  const summary = loading
    ? "Loading..."
    : !driver
      ? "No driver assigned"
      : `${driver.full_name || "Driver"}${vehicle?.nickname || vehicle?.plate ? ` · ${vehicle.nickname || vehicle.plate}` : ""}${podCaptured ? " · POD captured" : delivered ? " · Delivered" : assignment?.status ? ` · ${assignment.status}` : ""}`;

  // pickup_time is the driver-leg collection target. collection_time is
  // reserved for the post-event return trip.
  const collectionDisplay = order.pickup_time || order.collection_time || order.event_time;
  const collectionLabel = collectionDisplay
    ? `${collectionDisplay.slice(0, 5)} on ${new Date(order.event_date).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}`
    : null;

  const renderVehicleChips = (v: VehicleRow | null) => {
    if (!v) return null;
    const incompatibleColdChain = order.requires_refrigeration && !v.refrigerated;
    return (
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-slate-700">
        {v.plate && (
          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium tabular-nums text-slate-800">
            {v.plate}
          </span>
        )}
        {(v.make || v.model) && (
          <span className="min-w-0 break-words text-slate-600">
            {[v.make, v.model].filter(Boolean).join(" ")}
          </span>
        )}
        {v.refrigerated && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
            <Snowflake aria-hidden="true" className="size-4 shrink-0" />Cold chain
          </span>
        )}
        {v.has_warmer && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
            <Flame aria-hidden="true" className="size-4 shrink-0" />Warmer
          </span>
        )}
        {v.capacity_kg && (
          <span className="tabular-nums text-slate-600">{v.capacity_kg} kg</span>
        )}
        {incompatibleColdChain && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-900">
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" />Not cold-chain capable
          </span>
        )}
      </div>
    );
  };

  return (
    <CollapsibleSection
      id="section-driver"
      title="Driver"
      summary={summary}
      icon={Truck}
      accent="indigo"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      highlight={highlight}
    >
      {loading ? (
        <div role="status" className="flex items-center gap-2 py-4 text-sm text-slate-600">
          <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" /> Loading driver details…
        </div>
      ) : (
        <div className={`${operationStyles.panel} space-y-4`}>
          {/* Collection time + distance + leave-by header strip */}
          <div className={operationStyles.metadata}>
            {collectionLabel && (
              <div className="flex min-w-0 items-start gap-2 rounded-lg bg-slate-50 p-3">
                <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-600" />
                <div className="min-w-0">
                  <p className="text-sm text-slate-700">Collection time</p>
                  <p className="mt-0.5 text-base font-semibold leading-snug tabular-nums text-slate-950">{collectionLabel}</p>
                </div>
              </div>
            )}
            {(order.delivery_distance_km != null || order.delivery_duration_minutes != null) && (
              <div className="flex min-w-0 items-start gap-2 rounded-lg bg-slate-50 p-3">
                <Route aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-600" />
                <div className="min-w-0">
                  <p className="text-sm text-slate-700">Estimated drive</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-base font-semibold tabular-nums text-slate-950">
                    {order.delivery_distance_km != null && <span>{Number(order.delivery_distance_km).toFixed(1)} km</span>}
                    {order.delivery_distance_km != null && order.delivery_duration_minutes != null && <span aria-hidden="true">·</span>}
                    {order.delivery_duration_minutes != null && <span>{order.delivery_duration_minutes} min</span>}
                  </p>
                </div>
              </div>
            )}
            {leaveByLabel && (
              <div className={`flex min-w-0 items-start gap-2 rounded-lg p-3 ${isLeaveByRed ? "bg-rose-50 text-rose-900" : "bg-slate-50 text-slate-900"}`}>
                <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm">
                    {isLeaveByRed ? "Should have left" : "Leave by"}
                  </p>
                  <p className="mt-0.5 text-base font-semibold leading-snug tabular-nums">{leaveByLabel}</p>
                </div>
              </div>
            )}
          </div>

          {/* Driver acknowledgement chip */}
          {order.driver_acknowledged_at && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-800">
                <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" /> Driver acknowledged
              </span>
              {order.driver_acknowledged_via && <span>via {order.driver_acknowledged_via}</span>}
              <time dateTime={order.driver_acknowledged_at} className="tabular-nums">{new Date(order.driver_acknowledged_at).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
            </div>
          )}

          {/* Primary driver + vehicle block */}
          {driver ? (
            <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
              <User aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-slate-600" />
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-base font-semibold text-slate-950">{driver.full_name || "Assigned driver"}</h3>
                {driver.phone && (
                  <a href={`tel:${driver.phone}`} className="inline-flex min-h-11 max-w-full items-center gap-2 break-all text-sm font-medium text-slate-800 underline-offset-4 hover:underline">
                    <Phone aria-hidden="true" className="size-4 shrink-0" />{driver.phone}
                  </a>
                )}
                {vehicle && (
                  <div className="mt-1">
                    <p className="inline-flex max-w-full items-center gap-2 break-words text-sm font-medium text-slate-800">
                      <Car aria-hidden="true" className="size-4 shrink-0 text-slate-600" />
                      {vehicle.nickname || "Vehicle"}
                    </p>
                    {renderVehicleChips(vehicle)}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
              <span className="font-medium">No driver assigned</span>
              {isAdminViewer && (
                <Link
                  href={withSlug(`/admin/order-assignments?orderId=${order.id}`)}
                  className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-md bg-brand-primary px-3 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
                >
                  <Truck aria-hidden="true" className="size-4 shrink-0" /> Assign driver
                </Link>
              )}
            </div>
          )}

          {/* Secondary driver + vehicle (two-driver jobs) */}
          {(order.requires_two_drivers || secondaryDriver || secondaryVehicle) && (
            <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
              <Users aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-slate-600" />
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-950">Secondary driver</h3>
                {secondaryDriver ? (
                  <>
                    <p className="mt-0.5 break-words text-sm font-medium text-slate-800">{secondaryDriver.full_name || "Assigned"}</p>
                    {secondaryDriver.phone && (
                      <a href={`tel:${secondaryDriver.phone}`} className="inline-flex min-h-11 max-w-full items-center gap-2 break-all text-sm font-medium text-slate-800 underline-offset-4 hover:underline">
                        <Phone aria-hidden="true" className="size-4 shrink-0" />{secondaryDriver.phone}
                      </a>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mt-0.5 text-sm text-amber-800">A second driver is required and hasn’t been assigned.</p>
                    {isAdminViewer && (
                      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                        <Select
                          defaultValue=""
                          onValueChange={(driverId) => { if (driverId) void assignSecondaryDriver(driverId); }}
                          disabled={savingSecondary}
                        >
                          <SelectTrigger
                            aria-label="Assign secondary driver"
                            className="h-auto min-h-11 min-w-0 max-w-full flex-1 whitespace-normal rounded-md border-slate-300 bg-white px-2 text-left text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-primary/40 disabled:opacity-60"
                          >
                            <SelectValue placeholder={companyDrivers.some((d) => d.id !== order.assigned_driver_id) ? "Choose a secondary driver" : "No other drivers found"} />
                          </SelectTrigger>
                          <SelectContent align="start" className="w-[var(--radix-select-trigger-width)]">
                            {companyDrivers
                              .filter((d) => d.id !== order.assigned_driver_id)
                              .map((d) => (
                                <SelectItem key={d.id} value={d.id}>{d.full_name || "Driver"}</SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        {savingSecondary && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-primary" />}
                      </div>
                    )}
                  </>
                )}
                {secondaryVehicle && (
                  <div className="mt-1">
                    <p className="inline-flex max-w-full items-center gap-2 break-words text-sm font-medium text-slate-800">
                      <Car aria-hidden="true" className="size-4 shrink-0 text-slate-600" />
                      {secondaryVehicle.nickname || "Vehicle"}
                    </p>
                    {renderVehicleChips(secondaryVehicle)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Venue block */}
          {(order.venue_name || order.venue_address) && (
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 p-3">
              <div className="flex min-w-0 grow items-start gap-3">
              <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-slate-600" />
              <div className="min-w-0">
                <h3 className="break-words text-base font-semibold text-slate-950">{order.venue_name || "Delivery address"}</h3>
                {order.venue_address && <p className="mt-0.5 break-words text-sm leading-relaxed text-slate-600">{order.venue_address}</p>}
                {(order.venue_contact_person || order.venue_contact_phone) && (
                  <div className="mt-2 text-sm text-slate-700">
                    <p>Venue contact{order.venue_contact_person && <span className="font-medium"> · {order.venue_contact_person}</span>}</p>
                    {order.venue_contact_phone && (
                      <a href={`tel:${order.venue_contact_phone}`} className="inline-flex min-h-11 max-w-full items-center gap-2 break-all text-sm font-medium text-slate-800 underline-offset-4 hover:underline">
                        <Phone aria-hidden="true" className="size-4 shrink-0" />{order.venue_contact_phone}
                      </a>
                    )}
                  </div>
                )}
              </div>
              </div>
              {navUrl && (
                <a
                  href={navUrl}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  title="Open in Google Maps"
                >
                  <Navigation aria-hidden="true" className="size-4 shrink-0" />
                  Open map
                </a>
              )}
            </div>
          )}

          {/* POD capture deep-link */}
          {isAssignedDriver && !podCaptured && !delivered && (
            <Link
              href={podDeepLink}
              className="inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
            >
              <Camera aria-hidden="true" className="size-4 shrink-0" />
              Capture proof of delivery
            </Link>
          )}

          {/* Pre-flight checklist (from driver_assignments booleans) */}
          {assignment && (assignment.checklist_food_verified != null || assignment.checklist_crockery_confirmed != null || assignment.checklist_cutlery_confirmed != null) && (
            <div className="border-t border-slate-200 pt-3">
              <h3 className="mb-2 text-base font-semibold text-slate-950">Pre-departure checklist</h3>
              <ul className="flex flex-wrap gap-2">
                {[
                  { key: "food", label: "Food verified", checked: !!assignment.checklist_food_verified },
                  { key: "crockery", label: "Crockery", checked: !!assignment.checklist_crockery_confirmed },
                  { key: "cutlery", label: "Cutlery", checked: !!assignment.checklist_cutlery_confirmed },
                ].map((c) => (
                  <li
                    key={c.key}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm ${c.checked ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}
                  >
                    {c.checked ? <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" /> : <AlertCircle aria-hidden="true" className="size-4 shrink-0" />}
                    <span>{c.label}<span className="sr-only">{c.checked ? ": confirmed" : ": not confirmed"}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Status timestamps grid */}
          {(assignment || pickedUpAt) && (
            <div className="border-t border-slate-200 pt-3">
              <h3 className="mb-2 text-base font-semibold text-slate-950">Delivery progress</h3>
              <dl className={operationStyles.metadata}>
                {[
                  { label: "Collected", at: pickedUpAt || enRouteAt },
                  { label: "Arrived", at: arrivedAt },
                  { label: "Delivered", at: deliveredAt },
                ].map(({ label, at }) => (
                  <div key={label} className="min-w-0 rounded-lg bg-slate-50 p-3">
                    <dt className="text-sm text-slate-600">{label}</dt>
                    <dd className="mt-0.5 text-base font-medium tabular-nums text-slate-950">
                      {at ? (
                        <time dateTime={at}>{new Date(at).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
                      ) : "Not recorded"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {podCaptured && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 p-3 text-emerald-900">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" /> Proof of delivery captured
              </div>
              {(order.pod_photo_url || order.pod_signature_url) && (
                <div className={operationStyles.rowActions}>
                  {order.pod_photo_url && (
                    <a href={protectedCompanyFileUrl(order.pod_photo_url)} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium underline-offset-4 hover:bg-emerald-100 hover:underline">
                      <Camera aria-hidden="true" className="size-4 shrink-0" /> View photo
                    </a>
                  )}
                  {order.pod_signature_url && (
                    <a href={protectedCompanyFileUrl(order.pod_signature_url)} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium underline-offset-4 hover:bg-emerald-100 hover:underline">
                      <MessageSquare aria-hidden="true" className="size-4 shrink-0" /> View signature
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <OrderContributors orderId={order.id} area="driver" label="Delivered by" />
    </CollapsibleSection>
  );
}
