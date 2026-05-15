/**
 * /admin/orders/[id]/ticket -- print-friendly kitchen ticket for
 * a single order.
 *
 * Phase 12 #1. Kitchens were re-typing or screenshot-printing the
 * order modal, neither of which scales. This page strips the chrome
 * and lays out only what the kitchen needs:
 *
 *   - Big order number + event date / time so the head chef can
 *     match the ticket to the prep list at a glance.
 *   - Client + venue + guest count.
 *   - Menu items with quantity + per-item allergens / dietary tags.
 *   - Special instructions.
 *
 * Triggers window.print() on mount via a small button so the
 * operator just clicks 'Print kitchen ticket' on the order modal.
 * No money, no payment status -- the kitchen doesn't need or want
 * the financials on a paper ticket.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft, Loader2 } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface OrderRow {
  order_number: string | null;
  client_name: string | null;
  client_phone: string | null;
  event_date: string | null;
  event_time: string | null;
  guest_count: number | null;
  venue_address: string | null;
  special_instructions: string | null;
  internal_notes: string | null;
  setup_time: string | null;
  pickup_time: string | null;
  status: string | null;
}

interface OrderItemRow {
  id: string;
  item_name: string | null;
  description: string | null;
  quantity: number | null;
  special_instructions: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-ZA", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  } catch { return iso; }
}

function fmtTime(t: string | null): string {
  if (!t) return "TBC";
  return t.slice(0, 5);
}

function KitchenTicketPage() {
  const router = useRouter();
  const orderId = typeof router.query.id === "string" ? router.query.id : null;
  const { profile } = useAuth() as any;
  const callerCompanyId = (profile as any)?.company_id || null;
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      try {
        // Wave 31: defense-in-depth tenant scope. RLS already blocks
        // cross-tenant SELECT on orders, so this is belt-and-braces
        // -- but it makes a wrong-tenant URL surface as "not found"
        // explicitly instead of relying on RLS to silently return
        // empty.
        //
        // Wave 43 hotfix: previous query asked for orders.menu_items
        // which doesn't exist on the orders table -- line items live
        // in order_items joined on order_id. PostgREST returned a
        // 400 "column orders.menu_items does not exist", the page
        // swallowed the error, and every kitchen ticket showed
        // "Order not found" regardless of tenant or RLS state.
        let q = (supabase as any)
          .from("orders")
          .select("order_number, client_name, client_phone, event_date, event_time, guest_count, venue_address, special_instructions, internal_notes, setup_time, pickup_time, status")
          .eq("id", orderId)
          .is("deleted_at", null);
        if (callerCompanyId) q = q.eq("company_id", callerCompanyId);
        const { data, error } = await q.maybeSingle();
        if (error) {
          // Wave 43 hotfix: surface PostgREST errors instead of
          // silently null-ing them. The original bug went undiagnosed
          // for ages because the `error` field was never destructured.
          console.error("[ticket] orders fetch failed:", error);
        }
        if (!cancelled) setOrder((data || null) as OrderRow | null);

        // Pull line items in a separate query keyed off order_id.
        const { data: itemRows, error: itemErr } = await (supabase as any)
          .from("order_items")
          .select("id, item_name, description, quantity, special_instructions")
          .eq("order_id", orderId)
          .order("created_at", { ascending: true });
        if (itemErr) {
          console.error("[ticket] order_items fetch failed:", itemErr);
        }
        if (!cancelled) setItems((itemRows || []) as OrderItemRow[]);
      } catch (e) {
        console.error("[ticket] unexpected error:", e);
        if (!cancelled) {
          setOrder(null);
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, callerCompanyId]);

  // Auto-trigger print once the data lands. Operator presses cancel
  // on the print dialog if they just wanted to preview.
  useEffect(() => {
    if (!loading && order) {
      const t = setTimeout(() => {
        try { window.print(); } catch { /* noop */ }
      }, 350);
      return () => clearTimeout(t);
    }
  }, [loading, order]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Preparing ticket...
      </div>
    );
  }
  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        Order not found.
      </div>
    );
  }

  // Wave 43 hotfix: items now come from the dedicated state populated
  // by the order_items query above. Old shape relied on a non-existent
  // orders.menu_items JSON column. Allergen aggregation defers to a
  // future enhancement -- order_items doesn't carry dietary_tags
  // directly today; the menu_items table does, but joining adds
  // another round-trip we can ship if the kitchen needs it.
  const allAllergens = new Set<string>();

  return (
    <>
      <Head><title>Kitchen ticket - {order.order_number}</title></Head>
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
      <div className="min-h-screen bg-slate-50 print:bg-white">
        <div className="no-print bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <Button onClick={() => window.print()} size="sm">
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
        </div>
        <div className="max-w-2xl mx-auto px-6 py-8 print:px-4 print:py-0">
          <div className="bg-white border border-slate-300 rounded-lg p-6 print:border-0 print:rounded-none print:p-0">
            {/* Header band */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-slate-900">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">Kitchen ticket</p>
                <h1 className="text-3xl font-bold text-slate-900 tabular-nums">{order.order_number || "—"}</h1>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-600">{fmtDate(order.event_date)}</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{fmtTime(order.event_time)}</p>
                {order.setup_time && (
                  <p className="text-[11px] text-slate-500">setup {fmtTime(order.setup_time)}</p>
                )}
                {order.pickup_time && (
                  <p className="text-[11px] text-slate-500">pickup {fmtTime(order.pickup_time)}</p>
                )}
              </div>
            </div>

            {/* Client + venue band */}
            <div className="grid grid-cols-2 gap-4 py-4 border-b border-slate-200">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Client</p>
                <p className="text-base font-semibold text-slate-900">{order.client_name || "—"}</p>
                {order.client_phone && (
                  <p className="text-xs text-slate-600 tabular-nums">{order.client_phone}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Guests</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{order.guest_count ?? "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Venue</p>
                <p className="text-sm text-slate-900">{order.venue_address || "—"}</p>
              </div>
            </div>

            {/* Allergen warning band -- top of mind */}
            {allAllergens.size > 0 && (
              <div className="py-4 border-b border-slate-200">
                <p className="text-[10px] uppercase tracking-wider text-rose-700 font-semibold mb-1">Watch out</p>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(allAllergens).map((t) => (
                    <span key={t} className="text-[11px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded border border-rose-300 bg-rose-50 text-rose-800">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Menu items */}
            <div className="py-4">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Menu</p>
              {items.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No menu items on this order.</p>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {items.map((it, i) => {
                    const name = it.item_name || `Item ${i + 1}`;
                    const qty = Number(it.quantity ?? 1);
                    const desc = it.description || null;
                    const itemNote = it.special_instructions || null;
                    return (
                      <li key={it.id} className="py-2.5">
                        <div className="flex items-baseline gap-3">
                          <span className="text-2xl font-bold tabular-nums text-slate-900 w-12 shrink-0">{qty}x</span>
                          <div className="flex-1">
                            <p className="text-base font-semibold text-slate-900">{name}</p>
                            {desc && <p className="text-xs text-slate-600 mt-0.5">{desc}</p>}
                            {itemNote && (
                              <p className="text-xs text-rose-700 mt-1 font-medium">
                                {itemNote}
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {(order.special_instructions || order.internal_notes) && (
              <div className="py-4 border-t border-slate-200">
                {order.special_instructions && (
                  <div className="mb-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Client special instructions</p>
                    <p className="text-sm text-slate-900 whitespace-pre-wrap">{order.special_instructions}</p>
                  </div>
                )}
                {order.internal_notes && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Internal notes</p>
                    <p className="text-sm text-slate-900 whitespace-pre-wrap">{order.internal_notes}</p>
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 border-t-2 border-slate-900 text-[10px] text-slate-400 text-right">
              Printed {new Date().toLocaleString("en-ZA")}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ProtectedKitchenTicketPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.KITCHEN_STAFF]}>
      <KitchenTicketPage />
    </ProtectedRoute>
  );
}
