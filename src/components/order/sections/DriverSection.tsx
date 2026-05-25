/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: driver section - collection time, delivery target, route,
 * POD status. Phase 1 read-only.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { UserRole } from "@/types/app";
import { Truck, MapPin, Clock, CheckCircle2, Loader2, Camera, User, Navigation } from "lucide-react";

interface Props {
  order: {
    id: string;
    company_id: string;
    event_date: string;
    event_time: string | null;
    collection_time: string | null;
    venue_name: string | null;
    venue_address: string | null;
    assigned_driver_id: string | null;
    status: string;
  };
  defaultOpen?: boolean;
  forceOpen?: boolean;
  highlight?: boolean;
}

interface Assignment {
  id: string;
  driver_id: string;
  status: string;
  pod_captured_at: string | null;
  pod_photo_url: string | null;
  pod_signature_url: string | null;
  arrived_at: string | null;
  delivered_at: string | null;
  driver?: { full_name: string | null; phone: string | null } | null;
}

export function DriverSection({ order, defaultOpen, forceOpen, highlight }: Props) {
  const { user, userRoles } = useAuth();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [driverProfile, setDriverProfile] = useState<{ full_name: string | null; phone: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  // ODOC Phase 2: gate on driver role. POD capture itself uses the
  // existing dialog stack on /team-portal/driver/dashboard -
  // re-implementing here is out of scope; the action deep-links
  // there with the order pre-selected. Navigation is a one-tap
  // helper for any role.
  const isDriver = (() => {
    const roles = Array.isArray(userRoles) ? userRoles : [];
    return roles.includes(UserRole.DRIVER) || user?.role === UserRole.DRIVER;
  })();
  const isAssignedDriver = isDriver && (assignment?.driver_id === user?.id || order.assigned_driver_id === user?.id);
  const navUrl = order.venue_address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.venue_address)}`
    : null;
  const podDeepLink = user?.company_slug
    ? `/${user.company_slug}/team-portal/driver/dashboard#order-${order.id}`
    : `/team-portal/driver/dashboard#order-${order.id}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Pull the latest assignment (there's usually one)
        const { data: aData } = await (supabase as any)
          .from("driver_assignments")
          .select("id, driver_id, status, pod_captured_at, pod_photo_url, pod_signature_url, arrived_at, delivered_at, driver:driver_id(full_name, phone)")
          .eq("order_id", order.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled && aData) setAssignment(aData as Assignment);

        // Fallback to orders.assigned_driver_id profile lookup if no
        // driver_assignment row exists yet (early stage).
        if (!aData && order.assigned_driver_id) {
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
  }, [order.id, order.company_id, order.assigned_driver_id]);

  const driver = assignment?.driver || driverProfile;
  const podCaptured = !!assignment?.pod_captured_at;
  const delivered = order.status === "delivered" || order.status === "completed" || !!assignment?.delivered_at;

  const summary = loading
    ? "Loading..."
    : !driver
      ? "No driver assigned"
      : `${driver.full_name || "Driver"}${podCaptured ? " · POD captured" : delivered ? " · Delivered" : assignment?.status ? ` · ${assignment.status}` : ""}`;

  const collectionDisplay = order.collection_time || order.event_time;
  const collectionLabel = collectionDisplay
    ? `${collectionDisplay.slice(0, 5)} on ${new Date(order.event_date).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}`
    : null;

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
          {collectionLabel && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-indigo-50 border border-indigo-200">
              <Clock className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs uppercase tracking-wider text-indigo-800 font-semibold">Collection time</p>
                <p className="text-sm font-semibold text-indigo-900">{collectionLabel}</p>
              </div>
            </div>
          )}

          {driver ? (
            <div className="flex items-start gap-2">
              <User className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-900">{driver.full_name || "Assigned driver"}</p>
                {driver.phone && (
                  <a href={`tel:${driver.phone}`} className="text-xs text-indigo-700 hover:underline">{driver.phone}</a>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2.5">
              No driver assigned yet. Dispatch will pick one closer to the collection time.
            </p>
          )}

          {(order.venue_name || order.venue_address) && (
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                {order.venue_name && <p className="text-sm font-medium text-slate-900">{order.venue_name}</p>}
                {order.venue_address && <p className="text-xs text-slate-500">{order.venue_address}</p>}
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

          {/* ODOC Phase 2: POD capture deep-link. The PodCaptureDialog
              + supporting state lives on /team-portal/driver/dashboard.
              Re-implementing the camera + signature flow inline is
              out of scope - this deep-link is a one-tap jump there. */}
          {isAssignedDriver && !podCaptured && !delivered && (
            <Link
              href={podDeepLink}
              className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"
            >
              <Camera className="w-4 h-4" />
              Capture POD on driver dashboard
            </Link>
          )}

          {assignment && (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
              <div className="text-xs">
                <p className="text-slate-500 uppercase tracking-wider">Arrived</p>
                <p className="text-slate-900 mt-0.5">
                  {assignment.arrived_at
                    ? new Date(assignment.arrived_at).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                    : "—"}
                </p>
              </div>
              <div className="text-xs">
                <p className="text-slate-500 uppercase tracking-wider">Delivered</p>
                <p className="text-slate-900 mt-0.5">
                  {assignment.delivered_at
                    ? new Date(assignment.delivered_at).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                    : "—"}
                </p>
              </div>
            </div>
          )}

          {podCaptured && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2.5">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">POD captured</span>
              {assignment?.pod_photo_url && (
                <a href={assignment.pod_photo_url} target="_blank" rel="noopener" className="ml-auto text-xs hover:underline inline-flex items-center gap-1">
                  <Camera className="w-3 h-3" />View photo
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
