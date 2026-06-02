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
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantHref } from "@/lib/tenantUrl";
import { UserRole } from "@/types/app";
import {
  Truck, MapPin, Clock, CheckCircle2, Loader2, Camera, User, Navigation,
  Snowflake, Flame, Car, Phone, MessageSquare, Users, Route, AlertCircle, CalendarClock,
} from "lucide-react";

interface Props {
  order: {
    id: string;
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

export function DriverSection({ order, defaultOpen, forceOpen, highlight }: Props) {
  const { user, userRoles } = useAuth();
  const { withSlug } = useTenantHref();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [driverProfile, setDriverProfile] = useState<ProfileRow | null>(null);
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [secondaryDriver, setSecondaryDriver] = useState<ProfileRow | null>(null);
  const [secondaryVehicle, setSecondaryVehicle] = useState<VehicleRow | null>(null);
  const [loading, setLoading] = useState(true);

  const isDriver = (() => {
    const roles = Array.isArray(userRoles) ? userRoles : [];
    return roles.includes(UserRole.DRIVER) || user?.role === UserRole.DRIVER;
  })();
  const isAssignedDriver = isDriver && (assignment?.driver_id === user?.id || order.assigned_driver_id === user?.id);

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
            .select("id, driver_id, status, arrived_at_venue_at, delivered_at, picked_up_at, en_route_at, checklist_crockery_confirmed, checklist_cutlery_confirmed, checklist_food_verified, driver:driver_id(full_name, phone)")
            .eq("order_id", order.id)
            .eq("assignment_type", "primary")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
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
        if (aRes?.data) setAssignment(aRes.data as Assignment);
        if (vRes?.data) setVehicle(vRes.data as VehicleRow);
        if (sdRes?.data) setSecondaryDriver(sdRes.data as ProfileRow);
        if (svRes?.data) setSecondaryVehicle(svRes.data as VehicleRow);

        // Fallback driver lookup when no assignment row exists yet.
        if (!aRes?.data && order.assigned_driver_id) {
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
            .select("id, driver_id, status, arrived_at_venue_at, delivered_at, picked_up_at, en_route_at, checklist_crockery_confirmed, checklist_cutlery_confirmed, checklist_food_verified, driver:driver_id(full_name, phone)")
            .eq("order_id", order.id)
            .eq("assignment_type", "primary")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) setAssignment(data as Assignment);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [order.id]);

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

  const collectionDisplay = order.collection_time || order.event_time;
  const collectionLabel = collectionDisplay
    ? `${collectionDisplay.slice(0, 5)} on ${new Date(order.event_date).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}`
    : null;

  const renderVehicleChips = (v: VehicleRow | null) => {
    if (!v) return null;
    const incompatibleColdChain = order.requires_refrigeration && !v.refrigerated;
    return (
      <div className="flex flex-wrap items-center gap-1 mt-1">
        {v.plate && (
          <span className="text-[11px] bg-slate-100 text-slate-800 border border-slate-200 rounded-full px-2 py-0.5 font-mono">
            {v.plate}
          </span>
        )}
        {(v.make || v.model) && (
          <span className="text-[11px] text-slate-600">
            {[v.make, v.model].filter(Boolean).join(" ")}
          </span>
        )}
        {v.refrigerated && (
          <span className="inline-flex items-center gap-1 text-[10px] bg-cyan-50 text-cyan-800 border border-cyan-200 rounded-full px-1.5 py-0.5">
            <Snowflake className="w-3 h-3" />Cold chain
          </span>
        )}
        {v.has_warmer && (
          <span className="inline-flex items-center gap-1 text-[10px] bg-orange-50 text-orange-800 border border-orange-200 rounded-full px-1.5 py-0.5">
            <Flame className="w-3 h-3" />Warmer
          </span>
        )}
        {v.capacity_kg && (
          <span className="text-[10px] text-slate-500">{v.capacity_kg}kg</span>
        )}
        {incompatibleColdChain && (
          <span className="inline-flex items-center gap-1 text-[10px] bg-rose-50 text-rose-800 border border-rose-300 rounded-full px-1.5 py-0.5 font-semibold">
            <AlertCircle className="w-3 h-3" />Not cold-chain capable
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
        <div className="flex items-center justify-center py-6 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading driver info...
        </div>
      ) : (
        <div className="space-y-3">
          {/* Collection time + distance + leave-by header strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {collectionLabel && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-indigo-50 border border-indigo-200">
                <Clock className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-indigo-800 font-semibold">Collection time</p>
                  <p className="text-sm font-semibold text-indigo-900">{collectionLabel}</p>
                </div>
              </div>
            )}
            {(order.delivery_distance_km != null || order.delivery_duration_minutes != null) && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-slate-50 border border-slate-200">
                <Route className="w-4 h-4 text-slate-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-slate-700 font-semibold">Distance · drive</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {order.delivery_distance_km != null ? `${Number(order.delivery_distance_km).toFixed(1)} km` : "-"}
                    {order.delivery_duration_minutes != null && (
                      <span className="text-slate-600"> · {order.delivery_duration_minutes} min</span>
                    )}
                  </p>
                </div>
              </div>
            )}
            {leaveByLabel && (
              <div className={`flex items-start gap-2 p-3 rounded-md border ${isLeaveByRed ? "bg-rose-50 border-rose-300" : "bg-emerald-50 border-emerald-200"}`}>
                <CalendarClock className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isLeaveByRed ? "text-rose-700" : "text-emerald-700"}`} />
                <div className="min-w-0">
                  <p className={`text-[10px] uppercase tracking-wider font-semibold ${isLeaveByRed ? "text-rose-800" : "text-emerald-800"}`}>
                    {isLeaveByRed ? "Should have left" : "Leave by"}
                  </p>
                  <p className={`text-sm font-semibold ${isLeaveByRed ? "text-rose-900" : "text-emerald-900"}`}>{leaveByLabel}</p>
                </div>
              </div>
            )}
          </div>

          {/* Driver acknowledgement chip */}
          {order.driver_acknowledged_at && (
            <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
              <CheckCircle2 className="w-3 h-3" />
              Driver acknowledged
              {order.driver_acknowledged_via && <span className="text-emerald-600">via {order.driver_acknowledged_via}</span>}
              <span className="text-emerald-600">· {new Date(order.driver_acknowledged_at).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          )}

          {/* Primary driver + vehicle block */}
          {driver ? (
            <div className="flex items-start gap-2 p-2.5 rounded-md border border-indigo-200 bg-indigo-50/40">
              <User className="w-4 h-4 text-indigo-700 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{driver.full_name || "Assigned driver"}</p>
                {driver.phone && (
                  <a href={`tel:${driver.phone}`} className="inline-flex items-center gap-1 text-xs text-indigo-700 hover:underline mt-0.5">
                    <Phone className="w-3 h-3" />{driver.phone}
                  </a>
                )}
                {vehicle && (
                  <div className="mt-1">
                    <p className="inline-flex items-center gap-1 text-xs text-slate-700">
                      <Car className="w-3 h-3 text-slate-400" />
                      {vehicle.nickname || "Vehicle"}
                    </p>
                    {renderVehicleChips(vehicle)}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2.5">
              No driver assigned yet. Dispatch will pick one closer to the collection time.
            </p>
          )}

          {/* Secondary driver + vehicle (two-driver jobs) */}
          {(order.requires_two_drivers || secondaryDriver || secondaryVehicle) && (
            <div className="flex items-start gap-2 p-2.5 rounded-md border border-indigo-200 bg-indigo-50/40">
              <Users className="w-4 h-4 text-indigo-700 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-indigo-800 font-semibold">Secondary</p>
                {secondaryDriver ? (
                  <>
                    <p className="text-sm font-medium text-slate-900">{secondaryDriver.full_name || "Secondary driver"}</p>
                    {secondaryDriver.phone && (
                      <a href={`tel:${secondaryDriver.phone}`} className="inline-flex items-center gap-1 text-xs text-indigo-700 hover:underline mt-0.5">
                        <Phone className="w-3 h-3" />{secondaryDriver.phone}
                      </a>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-amber-700">No secondary driver assigned (required for this job).</p>
                )}
                {secondaryVehicle && (
                  <div className="mt-1">
                    <p className="inline-flex items-center gap-1 text-xs text-slate-700">
                      <Car className="w-3 h-3 text-slate-400" />
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
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                {order.venue_name && <p className="text-sm font-medium text-slate-900">{order.venue_name}</p>}
                {order.venue_address && <p className="text-xs text-slate-500">{order.venue_address}</p>}
                {(order.venue_contact_person || order.venue_contact_phone) && (
                  <p className="text-xs text-slate-700 mt-1">
                    Venue contact:
                    {order.venue_contact_person && <span className="font-medium ml-1">{order.venue_contact_person}</span>}
                    {order.venue_contact_phone && (
                      <a href={`tel:${order.venue_contact_phone}`} className="ml-1 text-indigo-700 hover:underline inline-flex items-center gap-1">
                        <Phone className="w-3 h-3" />{order.venue_contact_phone}
                      </a>
                    )}
                  </p>
                )}
              </div>
              {navUrl && (
                <a
                  href={navUrl}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-indigo-300 text-indigo-800 hover:bg-indigo-50 flex-shrink-0"
                  title="Open in Google Maps"
                >
                  <Navigation className="w-3 h-3" />
                  Navigate
                </a>
              )}
            </div>
          )}

          {/* POD capture deep-link */}
          {isAssignedDriver && !podCaptured && !delivered && (
            <Link
              href={podDeepLink}
              className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
            >
              <Camera className="w-4 h-4" />
              Capture POD on driver dashboard
            </Link>
          )}

          {/* Pre-flight checklist (from driver_assignments booleans) */}
          {assignment && (assignment.checklist_food_verified != null || assignment.checklist_crockery_confirmed != null || assignment.checklist_cutlery_confirmed != null) && (
            <div className="pt-2 border-t border-slate-200">
              <p className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold mb-1.5">Pre-departure checklist</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: "food", label: "Food verified", checked: !!assignment.checklist_food_verified },
                  { key: "crockery", label: "Crockery", checked: !!assignment.checklist_crockery_confirmed },
                  { key: "cutlery", label: "Cutlery", checked: !!assignment.checklist_cutlery_confirmed },
                ].map((c) => (
                  <span
                    key={c.key}
                    className={`inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 border ${c.checked ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}
                  >
                    {c.checked ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {c.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Status timestamps grid */}
          {(assignment || pickedUpAt) && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200">
              <div className="text-xs">
                <p className="text-slate-500 uppercase tracking-wider">Collected</p>
                <p className="text-slate-900 mt-0.5 tabular-nums">
                  {pickedUpAt
                    ? new Date(pickedUpAt).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                    : enRouteAt
                      ? new Date(enRouteAt).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                      : "-"}
                </p>
              </div>
              <div className="text-xs">
                <p className="text-slate-500 uppercase tracking-wider">Arrived</p>
                <p className="text-slate-900 mt-0.5 tabular-nums">
                  {arrivedAt
                    ? new Date(arrivedAt).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                    : "-"}
                </p>
              </div>
              <div className="text-xs">
                <p className="text-slate-500 uppercase tracking-wider">Delivered</p>
                <p className="text-slate-900 mt-0.5 tabular-nums">
                  {deliveredAt
                    ? new Date(deliveredAt).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                    : "-"}
                </p>
              </div>
            </div>
          )}

          {podCaptured && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2.5">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">POD captured</span>
              {order.pod_photo_url && (
                <a href={order.pod_photo_url} target="_blank" rel="noopener" className="ml-auto text-xs hover:underline inline-flex items-center gap-1">
                  <Camera className="w-3 h-3" />View photo
                </a>
              )}
              {order.pod_signature_url && (
                <a href={order.pod_signature_url} target="_blank" rel="noopener" className="text-xs hover:underline inline-flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />Signature
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
