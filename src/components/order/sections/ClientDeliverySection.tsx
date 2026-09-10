/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: client-facing delivery + driver card.
 *
 * The staff DriverSection is a dispatch run-sheet (POD capture, checklist
 * booleans, secondary-driver assignment) and is hidden from clients. But a
 * customer legitimately wants to know: who is bringing my food, when, in
 * what vehicle, where is it now, and can I reach the driver. This is the
 * read-only, customer-appropriate slice of that.
 *
 * Data access: the assigned driver's name + phone are read through the
 * orders -> profiles FK embed (orders_assigned_driver_id_fkey), the exact
 * pattern the shipped /client-portal/tracking page already uses from a
 * client session, so it clears RLS. Vehicle details are a best-effort
 * lookup - if RLS blocks the vehicles read for a client we simply omit the
 * vehicle chips rather than error the card.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CollapsibleSection } from "./CollapsibleSection";
import { captureException } from "@/lib/observability";
import { useTenantHref } from "@/lib/tenantUrl";
import {
  Truck, MapPin, Clock, CheckCircle2, User, Navigation,
  Snowflake, Flame, Car, Phone, Camera, Route, Loader2, PackageCheck,
} from "lucide-react";

interface Props {
  order: {
    id: string;
    order_number: string | null;
    event_date: string;
    event_time: string | null;
    collection_time: string | null;
    pickup_time: string | null;
    venue_name: string | null;
    venue_address: string | null;
    assigned_driver_id: string | null;
    assigned_vehicle_id: string | null;
    delivery_distance_km: number | null;
    delivery_duration_minutes: number | null;
    status: string;
    picked_up_at: string | null;
    arrived_at_venue_at: string | null;
    delivered_at: string | null;
    pod_captured_at: string | null;
    pod_photo_url: string | null;
    equipment_return_method: string | null;
  };
  defaultOpen?: boolean;
  forceOpen?: boolean;
  highlight?: boolean;
}

interface DriverInfo { full_name: string | null; phone: string | null }
interface VehicleInfo {
  nickname: string | null;
  plate: string | null;
  make: string | null;
  model: string | null;
  refrigerated: boolean | null;
  has_warmer: boolean | null;
}

// Friendly, customer-worded delivery status. Derived from the order's
// timestamps first (most precise) then its status. Never exposes internal
// dispatch language ("en_route", "assignment", etc).
function deliveryStage(order: Props["order"]): {
  key: "delivered" | "arrived" | "on_the_way" | "ready" | "preparing" | "scheduled";
  label: string;
  detail: string;
  tone: "green" | "brand" | "slate";
} {
  const s = String(order.status || "").toLowerCase();
  if (s === "delivered" || s === "completed" || order.delivered_at) {
    return { key: "delivered", label: "Delivered", detail: "Your order has arrived. Enjoy!", tone: "green" };
  }
  if (order.arrived_at_venue_at) {
    return { key: "arrived", label: "Driver has arrived", detail: "Your driver is at the venue.", tone: "brand" };
  }
  if (s === "in_transit" || order.picked_up_at) {
    return { key: "on_the_way", label: "On the way", detail: "Your driver has collected the order and is heading to you.", tone: "brand" };
  }
  if (s === "ready") {
    return { key: "ready", label: "Ready for dispatch", detail: "Prep is done. A driver will collect it shortly.", tone: "brand" };
  }
  if (s === "preparing") {
    return { key: "preparing", label: "Being prepared", detail: "The kitchen is preparing your order.", tone: "slate" };
  }
  return { key: "scheduled", label: "Scheduled", detail: "We'll assign a driver closer to your event.", tone: "slate" };
}

function fmtTime(t: string | null | undefined): string | null {
  if (!t) return null;
  return t.slice(0, 5);
}
function fmtStamp(t: string | null | undefined): string | null {
  if (!t) return null;
  return new Date(t).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function ClientDeliverySection({ order, defaultOpen, forceOpen, highlight }: Props) {
  const { withSlug } = useTenantHref();
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [vehicle, setVehicle] = useState<VehicleInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // A client session cannot read the driver's profile or the
        // vehicles table under RLS, so we go through a server endpoint
        // that returns only the safe fields (name/phone/vehicle basics)
        // for an order the caller owns. No round trip before a driver is
        // even assigned.
        if (order.assigned_driver_id) {
          const resp = await fetch(`/api/orders/${order.id}/client-delivery`);
          if (resp.ok) {
            const json = await resp.json().catch(() => ({}));
            if (!cancelled) {
              if (json?.driver) setDriver(json.driver as DriverInfo);
              if (json?.vehicle) setVehicle(json.vehicle as VehicleInfo);
            }
          }
        }
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadClientDelivery", orderId: order.id } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [order.id, order.assigned_driver_id, order.assigned_vehicle_id]);

  const stage = useMemo(() => deliveryStage(order), [order]);
  const navUrl = order.venue_address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.venue_address)}`
    : null;
  const collectionDisplay = fmtTime(order.collection_time) || fmtTime(order.event_time);
  const eventDateLabel = order.event_date
    ? new Date(order.event_date).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })
    : null;
  const canTrackLive = stage.key === "on_the_way" || stage.key === "arrived";

  const toneRing =
    stage.tone === "green"
      ? "bg-emerald-50 border-emerald-200"
      : stage.tone === "brand"
        ? "bg-brand-primary/10 border-brand-primary/20"
        : "bg-slate-50 border-slate-200";
  const toneText =
    stage.tone === "green" ? "text-emerald-800" : stage.tone === "brand" ? "text-brand-primary" : "text-slate-700";

  const summary = loading
    ? "Loading..."
    : `${stage.label}${driver?.full_name ? ` · ${driver.full_name}` : ""}`;

  return (
    <CollapsibleSection
      id="section-delivery"
      title="Delivery & driver"
      summary={summary}
      icon={Truck}
      accent="indigo"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      highlight={highlight}
    >
      <div className="space-y-3">
        {/* Delivery status headline */}
        <div className={`flex items-start gap-2 p-3 rounded-md border ${toneRing}`}>
          {stage.key === "delivered"
            ? <PackageCheck className={`w-4 h-4 flex-shrink-0 mt-0.5 ${toneText}`} />
            : <Truck className={`w-4 h-4 flex-shrink-0 mt-0.5 ${toneText}`} />}
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${toneText}`}>{stage.label}</p>
            <p className="text-xs text-slate-600 mt-0.5">{stage.detail}</p>
          </div>
        </div>

        {/* Collection/delivery time + distance strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {collectionDisplay && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-slate-50 border border-slate-200">
              <Clock className="w-4 h-4 text-slate-600 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold">Delivery time</p>
                <p className="text-sm font-semibold text-slate-900">
                  {collectionDisplay}{eventDateLabel ? ` on ${eventDateLabel}` : ""}
                </p>
              </div>
            </div>
          )}
          {order.delivery_distance_km != null && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-slate-50 border border-slate-200">
              <Route className="w-4 h-4 text-slate-600 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold">Trip</p>
                <p className="text-sm font-semibold text-slate-900">
                  {Number(order.delivery_distance_km).toFixed(1)} km
                  {order.delivery_duration_minutes != null && (
                    <span className="text-slate-600"> · about {order.delivery_duration_minutes} min</span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Driver block */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 p-2.5">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading driver details...
          </div>
        ) : driver ? (
          <div className="flex items-start gap-2 p-2.5 rounded-md border border-brand-primary/20 bg-brand-primary/10">
            <User className="w-4 h-4 text-brand-primary flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-brand-primary font-semibold">Your driver</p>
              <p className="text-sm font-medium text-slate-900">{driver.full_name || "Assigned driver"}</p>
              {driver.phone && (
                <a href={`tel:${driver.phone}`} className="inline-flex items-center gap-1 text-xs text-brand-primary hover:underline mt-0.5">
                  <Phone className="w-3 h-3" />{driver.phone}
                </a>
              )}
              {vehicle && (vehicle.nickname || vehicle.plate || vehicle.make) && (
                <div className="mt-1.5">
                  <p className="inline-flex items-center gap-1 text-xs text-slate-700">
                    <Car className="w-3 h-3 text-slate-400" />
                    {[vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.nickname || "Vehicle"}
                  </p>
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {vehicle.plate && (
                      <span className="text-[11px] bg-slate-100 text-slate-800 border border-slate-200 rounded-full px-2 py-0.5 font-mono">
                        {vehicle.plate}
                      </span>
                    )}
                    {vehicle.refrigerated && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded-full px-1.5 py-0.5">
                        <Snowflake className="w-3 h-3" />Cold chain
                      </span>
                    )}
                    {vehicle.has_warmer && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-orange-50 text-orange-800 border border-orange-200 rounded-full px-1.5 py-0.5">
                        <Flame className="w-3 h-3" />Kept warm
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded p-2.5">
            A driver will be assigned closer to your event. You'll get a notification the moment they're on the way.
          </div>
        )}

        {/* Live tracking CTA - only meaningful once the driver is rolling */}
        {canTrackLive && (
          <Link
            href={withSlug(`/client-portal/tracking?orderId=${order.id}`)}
            className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-md bg-brand-primary hover:opacity-90 text-white text-sm font-semibold"
          >
            <Navigation className="w-4 h-4" />
            Track your driver live
          </Link>
        )}

        {/* Delivery address */}
        {(order.venue_name || order.venue_address) && (
          <div className="flex items-start gap-2 pt-1">
            <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Delivery address</p>
              {order.venue_name && <p className="text-sm font-medium text-slate-900">{order.venue_name}</p>}
              {order.venue_address && <p className="text-xs text-slate-500">{order.venue_address}</p>}
            </div>
            {navUrl && (
              <a
                href={navUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10 flex-shrink-0"
                title="Open in Google Maps"
              >
                <Navigation className="w-3 h-3" />
                Map
              </a>
            )}
          </div>
        )}

        {/* Delivered proof + timestamps */}
        {(order.picked_up_at || order.arrived_at_venue_at || order.delivered_at) && (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200">
            <div className="text-xs">
              <p className="text-slate-500 uppercase tracking-wider">Collected</p>
              <p className="text-slate-900 mt-0.5 tabular-nums">{fmtStamp(order.picked_up_at) || "-"}</p>
            </div>
            <div className="text-xs">
              <p className="text-slate-500 uppercase tracking-wider">Arrived</p>
              <p className="text-slate-900 mt-0.5 tabular-nums">{fmtStamp(order.arrived_at_venue_at) || "-"}</p>
            </div>
            <div className="text-xs">
              <p className="text-slate-500 uppercase tracking-wider">Delivered</p>
              <p className="text-slate-900 mt-0.5 tabular-nums">{fmtStamp(order.delivered_at) || "-"}</p>
            </div>
          </div>
        )}

        {order.pod_captured_at && order.pod_photo_url && (
          <div className="flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-2.5">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">Proof of delivery captured</span>
            <a href={order.pod_photo_url} target="_blank" rel="noopener" className="ml-auto text-xs hover:underline inline-flex items-center gap-1">
              <Camera className="w-3 h-3" />View photo
            </a>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
