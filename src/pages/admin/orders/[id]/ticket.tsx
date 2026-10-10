/**
 * /admin/orders/[id]/ticket - compact, print-friendly kitchen ticket.
 * This is the operational kitchen screen: booking facts, simple menu,
 * equipment when present, plus on-screen prep and handover controls.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { tenantDateTime } from "@/lib/portalTime";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft, Loader2, ChefHat, Package, FileText } from "lucide-react";
import { BookingHeader } from "@/components/booking/BookingHeader";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { KitchenPrepTasksCard } from "@/components/kitchen/KitchenPrepTasksCard";
import { HandoverToDriverPanel } from "@/components/kitchen/HandoverToDriverPanel";
import { PageWorkbench } from "@/components/portal/ui";

interface OrderRow {
  id: string;
  company_id: string | null;
  order_number: string | null;
  event_name: string | null;
  client_name: string | null;
  event_date: string | null;
  event_time: string | null;
  guest_count: number | null;
  venue_address: string | null;
  special_instructions: string | null;
  setup_time: string | null;
  pickup_time: string | null;
  status: string | null;
}

interface OrderItemRow {
  id: string;
  item_name: string | null;
  quantity: number | null;
}

interface EquipmentBookingRow {
  id: string;
  quantity: number | null;
  equipment: { name: string | null; category: string | null } | null;
}

function fmtClock(value: Date | null): string {
  if (!value) return "-";
  try {
    return value.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "-";
  }
}

function combineDateTime(date: string | null, time: string | null): Date | null {
  if (!date) return null;
  const value = tenantDateTime(date, time ? time.slice(0, 5) : "12:00") ?? new Date(NaN);
  return Number.isNaN(value.getTime()) ? null : value;
}

function resolvePickupAt(order: OrderRow): Date | null {
  return combineDateTime(order.event_date, order.pickup_time || order.event_time);
}

function KitchenTicketPage() {
  const router = useRouter();
  const orderId = typeof router.query.id === "string" ? router.query.id : null;
  const { profile } = useAuth() as any;
  const { withSlug } = useTenantHref();
  const callerCompanyId = (profile as any)?.company_id || null;
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [equipment, setEquipment] = useState<EquipmentBookingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    (async () => {
      try {
        let orderQuery = (supabase as any)
          .from("orders")
          .select("id, company_id, order_number, event_name, client_name, event_date, event_time, guest_count, venue_address, special_instructions, setup_time, pickup_time, status")
          .eq("id", orderId)
          .is("deleted_at", null);
        if (callerCompanyId) orderQuery = orderQuery.eq("company_id", callerCompanyId);

        const [orderRes, itemsRes, equipmentRes] = await Promise.all([
          orderQuery.maybeSingle(),
          (supabase as any)
            .from("order_items")
            .select("id, item_name, quantity")
            .eq("order_id", orderId)
            .order("created_at", { ascending: true }),
          (supabase as any)
            .from("equipment_bookings")
            .select("id, quantity, equipment:equipment_id (name, category)")
            .eq("order_id", orderId)
            .neq("status", "cancelled"),
        ]);

        if (orderRes.error) console.error("[ticket] orders fetch failed:", orderRes.error);
        if (itemsRes.error) console.error("[ticket] order_items fetch failed:", itemsRes.error);
        if (equipmentRes.error) console.error("[ticket] equipment_bookings fetch failed:", equipmentRes.error);

        if (!cancelled) {
          setOrder((orderRes.data || null) as OrderRow | null);
          setItems((itemsRes.data || []) as OrderItemRow[]);
          setEquipment((equipmentRes.data || []) as EquipmentBookingRow[]);
        }
      } catch (error) {
        console.error("[ticket] unexpected error:", error);
        if (!cancelled) {
          setOrder(null);
          setItems([]);
          setEquipment([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [orderId, callerCompanyId]);

  const printRequested = router.isReady && router.query.print === "1";
  useEffect(() => {
    if (!printRequested || loading || !order) return;
    const timer = setTimeout(() => {
      try { window.print(); } catch { /* no-op */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [printRequested, loading, order]);

  const equipmentByCategory = useMemo(() => {
    const grouped = new Map<string, EquipmentBookingRow[]>();
    for (const item of equipment) {
      const category = item.equipment?.category || "Other";
      const rows = grouped.get(category);
      if (rows) rows.push(item); else grouped.set(category, [item]);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [equipment]);

  if (loading) {
    return <div className="admin-page-shell admin-page-shell--no-sidebar admin-page-shell--center text-slate-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Preparing ticket...</div>;
  }
  if (!order) {
    return <div className="admin-page-shell admin-page-shell--no-sidebar admin-page-shell--center text-sm text-slate-500">Order not found.</div>;
  }

  const guestCount = Number(order.guest_count || 1);
  const pickupAt = resolvePickupAt(order);
  const setupAt = combineDateTime(order.event_date, order.setup_time);

  return (
    <>
      <Head><title>Kitchen ticket - {order.order_number}</title></Head>
      <style jsx global>{`
        @media print {
          @page { size: A4 portrait; margin: 6mm; }
          .no-print { display: none !important; }
          body { background: white !important; }
          .kitchen-ticket-print { zoom: 0.72; max-width: none !important; padding: 0 !important; }
          .kitchen-ticket-print > .bg-white { gap: 0.5rem !important; padding: 0.65rem !important; border: 0 !important; }
          .kitchen-ticket-print .print-row { padding-top: 0.25rem !important; padding-bottom: 0.25rem !important; }
          .kitchen-ticket-print .text-base { font-size: 0.78rem !important; }
          .kitchen-ticket-print .text-sm { font-size: 0.7rem !important; }
          .kitchen-ticket-print .text-xs { font-size: 0.64rem !important; }
        }
      `}</style>
      <div className="admin-page-shell admin-page-shell--no-sidebar admin-page-shell--document admin-page-shell--print">
        <div className="no-print bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-2 sticky top-0 z-10">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
            <Link href={withSlug(staffOrderHref(orderId, "kitchen_staff"))} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-semibold text-orange-700 hover:bg-orange-50 border border-orange-200">
              <FileText className="w-4 h-4" /> Open full order document
            </Link>
          </div>
          <Button onClick={() => window.print()} size="sm"><Printer className="w-4 h-4 mr-2" /> Print</Button>
        </div>

        <div className="no-print mx-auto max-w-3xl px-6 pt-6"><PageWorkbench /></div>
        <div className="kitchen-ticket-print max-w-3xl mx-auto px-6 py-8 print:px-4 print:py-0">
          <div className="bg-white border border-slate-300 rounded-lg p-6 print:border-0 print:rounded-none print:p-0 space-y-4">
            <BookingHeader
              variant="kitchen"
              booking={{ id: order.id, order_number: order.order_number, event_name: order.event_name, event_date: order.event_date, event_time: order.event_time, guest_count: guestCount, status: order.status, client_name: order.client_name, venue_address: order.venue_address }}
              rightSlot={(setupAt || pickupAt) ? (
                <div className="text-right text-[11px] text-slate-600 leading-tight">
                  {setupAt && <div>setup <span className="tabular-nums font-semibold text-slate-900">{fmtClock(setupAt)}</span></div>}
                  {pickupAt && <div>pickup <span className="tabular-nums font-semibold text-slate-900">{fmtClock(pickupAt)}</span></div>}
                </div>
              ) : undefined}
            />

            <KitchenPrepTasksCard orderId={order.id} companyId={order.company_id} />
            <div className="no-print rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Hand over to driver</p>
              <HandoverToDriverPanel orderId={order.id} orderNumber={order.order_number || order.id} />
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1"><ChefHat className="w-3 h-3" /> Menu ({items.length})</p>
              {items.length === 0 ? <p className="text-sm text-slate-500 italic">No menu items on this order.</p> : (
                <ul className="divide-y divide-slate-200">
                  {items.map((item) => (
                    <li key={item.id} className="py-2.5 print-row flex items-baseline gap-3">
                      <span className="text-base font-bold tabular-nums text-slate-900 w-12 shrink-0">{Number(item.quantity || 1)}x</span>
                      <p className="text-base font-semibold text-slate-900">{item.item_name || "Item"}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {equipmentByCategory.length > 0 && (
              <div className="pt-3 border-t border-slate-200">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1"><Package className="w-3 h-3" /> Equipment</p>
                <div className="grid grid-cols-2 gap-3">
                  {equipmentByCategory.map(([category, rows]) => (
                    <div key={category} className="print-keep rounded-md border border-slate-200 p-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold mb-1">{category}</p>
                      <ul className="space-y-0.5">
                        {rows.map((item) => (
                          <li key={item.id} className="text-xs text-slate-900 flex items-baseline justify-between gap-2 tabular-nums"><span>{item.equipment?.name || "Item"}</span><span className="font-semibold">{item.quantity ?? 1}x</span></li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {order.special_instructions && (
              <div className="pt-3 border-t border-slate-200"><p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Client special instructions</p><p className="text-sm text-slate-900 whitespace-pre-wrap leading-snug">{order.special_instructions}</p></div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function ProtectedKitchenTicketPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.KITCHEN_MANAGER, UserRole.KITCHEN_STAFF, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.REGION_ADMIN, UserRole.ADMIN]}>
      <KitchenTicketPage />
    </ProtectedRoute>
  );
}
