/**
 * /admin/orders/delivery-sheet - printable single-page delivery
 * sheet for the day's events.
 *
 * Phase 13 #1. The kitchen-ticket route (Phase 12 #1) covers
 * a single order; dispatch needs the opposite - the whole day
 * on one A4 sheet for the morning briefing. Until now they were
 * screenshotting the orders kanban or copying rows into a Google
 * Sheet by hand.
 *
 * Auto-fires window.print() once data lands so the ?date=...
 * deep-link reads as 'open + print today's sheet' from the
 * realtime new-order toast or a Slack message.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft, Loader2, Calendar } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toLocalISO } from "@/lib/localDate";
import { PageWorkbench } from "@/components/portal/ui";

interface OrderRow {
  id: string;
  order_number: string | null;
  client_name: string | null;
  client_phone: string | null;
  event_date: string | null;
  event_time: string | null;
  setup_time: string | null;
  pickup_time: string | null;
  guest_count: number | null;
  venue_address: string | null;
  status: string | null;
  internal_notes: string | null;
  special_instructions: string | null;
  assigned_driver: { full_name: string | null } | null;
  assigned_vehicle: { plate: string | null; nickname: string | null } | null;
}

const fmtTime = (t: string | null): string => (t ? t.slice(0, 5) : "TBC");

function DeliverySheet() {
  const router = useRouter();
  const { user } = useAuth() as any;
  const companyId = user?.company_id ?? null;
  const queryDate = typeof router.query.date === "string" ? router.query.date : null;
  const targetDate = queryDate || toLocalISO(new Date());
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("orders")
          .select(`
            id, order_number, client_name, client_phone,
            event_date, event_time, setup_time, pickup_time,
            guest_count, venue_address, status,
            internal_notes, special_instructions,
            assigned_driver:profiles!orders_assigned_driver_id_fkey ( full_name ),
            assigned_vehicle:vehicles!orders_assigned_vehicle_id_fkey ( plate, nickname )
          `)
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .eq("event_date", targetDate)
          .in("status", ["confirmed", "preparing", "ready", "in_transit", "delivered"])
          .order("event_time", { ascending: true });
        if (!cancelled) setOrders((data || []) as OrderRow[]);
      } catch {
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, targetDate]);

  useEffect(() => {
    if (!loading && orders.length > 0) {
      const t = setTimeout(() => {
        try { window.print(); } catch { /* noop */ }
      }, 350);
      return () => clearTimeout(t);
    }
  }, [loading, orders]);

  const niceDate = useMemo(() => {
    try {
      return new Date(`${targetDate}T12:00:00`).toLocaleDateString("en-ZA", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });
    } catch { return targetDate; }
  }, [targetDate]);

  return (
    <>
      <Head><title>Delivery sheet - {targetDate}</title></Head>
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
      <div className="admin-page-shell admin-page-shell--no-sidebar admin-page-shell--document admin-page-shell--print">
        <div className="no-print bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={targetDate}
              onChange={(e) => router.replace({ pathname: router.pathname, query: { date: e.target.value } })}
              className="text-sm border border-slate-200 rounded-md px-2 py-1"
            />
            <Button onClick={() => window.print()} size="sm">
              <Printer className="w-4 h-4 mr-2" /> Print
            </Button>
          </div>
        </div>
        <div className="no-print mx-auto max-w-3xl px-6 pt-6">
          <PageWorkbench />
        </div>
        <div className="max-w-3xl mx-auto px-6 py-8 print:px-4 print:py-0">
          <div className="bg-white border border-slate-300 rounded-lg p-6 print:border-0 print:rounded-none print:p-0">
            <div className="flex items-start justify-between gap-4 pb-3 border-b-2 border-slate-900">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Delivery sheet</p>
                <h1 className="text-2xl font-bold text-slate-900">{niceDate}</h1>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-widest text-slate-500">Events</p>
                <p className="text-3xl font-bold text-slate-900 tabular-nums">{orders.length}</p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-slate-500 text-sm">
                <Calendar className="w-10 h-10 text-slate-300 mb-2" />
                Nothing on {targetDate}.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {orders.map((o) => {
                  const driverName = o.assigned_driver?.full_name || null;
                  const vehicle = o.assigned_vehicle
                    ? `${o.assigned_vehicle.nickname || o.assigned_vehicle.plate || "vehicle"}`
                    : null;
                  return (
                    <div key={o.id} className="py-3" style={{ pageBreakInside: "avoid" }}>
                      <div className="flex items-baseline gap-3 mb-1">
                        <span className="text-xl font-bold tabular-nums text-slate-900 w-16 shrink-0">
                          {fmtTime(o.event_time)}
                        </span>
                        <div className="flex-1">
                          <p className="text-base font-semibold text-slate-900">
                            {o.client_name || "-"}
                            <span className="text-xs font-normal text-slate-500 ml-2 tabular-nums">
                              {o.order_number || ""}
                            </span>
                          </p>
                          <p className="text-xs text-slate-600 mt-0.5">{o.venue_address || "-"}</p>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1 flex-wrap">
                            <span className="tabular-nums">{o.guest_count ?? "-"} guests</span>
                            {o.setup_time && <span>setup {fmtTime(o.setup_time)}</span>}
                            {o.pickup_time && <span>pickup {fmtTime(o.pickup_time)}</span>}
                            <span className="capitalize bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{o.status?.replace(/_/g, " ")}</span>
                            {driverName && <span>Driver: {driverName}</span>}
                            {vehicle && <span>Vehicle: {vehicle}</span>}
                            {o.client_phone && <span className="tabular-nums">{o.client_phone}</span>}
                          </div>
                          {(o.special_instructions || o.internal_notes) && (
                            <div className="mt-1 text-[11px] text-slate-700 italic border-l-2 border-slate-200 pl-2">
                              {o.special_instructions || o.internal_notes}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-3 border-t-2 border-slate-900 mt-4 text-[10px] text-slate-400 text-right">
              Printed {new Date().toLocaleString("en-ZA")}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ProtectedDeliverySheet() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.KITCHEN_MANAGER,
        UserRole.KITCHEN_STAFF,
        UserRole.SUPER_ADMIN,
        UserRole.OWNER,
        UserRole.COMPANY_ADMIN,
        UserRole.REGION_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <DeliverySheet />
    </ProtectedRoute>
  );
}
