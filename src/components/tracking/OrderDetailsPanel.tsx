/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Rich Order Details right-pane shown on /admin/tracking when the admin
 * picks an active order. Replaces the four-line summary with a long,
 * scannable, deep-linkable dashboard so an owner can answer "where is
 * order X" in one click instead of five.
 *
 * Each block hides itself when the underlying data is missing rather
 * than showing "N/A" rows. Compose drawer mirrors the QuoteComposeDrawer
 * pattern shipped on /admin/quotes (commit 46ec141).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ComposeDrawerHost } from "@/components/messaging/ComposeDrawerHost";
import { Input } from "@/components/ui/input";
import {
  MapPin,
  Phone,
  Mail,
  ExternalLink,
  User,
  Truck,
  ChefHat,
  Package,
  CreditCard,
  FileText,
  MessageCircle,
  Eye,
  ArrowRight,
  Clock,
  CheckCircle2,
  Circle,
  Send,
  Copy,
  X,
  AlertTriangle,
  Receipt,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { composeEmail } from "@/lib/composeEmail";
import { useToast } from "@/hooks/use-toast";
import { ReassignDriverDialog } from "@/components/admin/dispatch/ReassignDriverDialog";
import { OrderChatPanel } from "@/components/admin/dispatch/OrderChatPanel";
import { WhatsAppButton } from "@/components/messaging/WhatsAppButton";
import { useAuth } from "@/contexts/AuthContext";
import { Camera, FileSignature } from "lucide-react";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";

const fmtMoney = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

interface OrderLike {
  id: string;
  order_number?: string;
  event_name?: string;
  event_date?: string;
  event_time?: string | null;
  delivery_time?: string;
  status?: string;
  client_id?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  venue_address?: string;
  venue_lat?: number | null;
  venue_lng?: number | null;
  driver_id?: string;
  assigned_driver_id?: string;
  driver_name?: string;
  driver_phone?: string;
  driver_lat?: number | null;
  driver_lng?: number | null;
  last_updated?: string;
  total_amount?: number;
  deposit_amount?: number;
  deposit_paid?: boolean;
  balance_amount?: number;
  payment_status?: string;
  menu_items?: any[];
  equipment_items?: any[];
  pod_photo_url?: string | null;
  pod_signature_url?: string | null;
  pod_recipient_name?: string | null;
  pod_captured_at?: string | null;
  requires_refrigeration?: boolean;
  /** Phase 3 #4: postOrderCreationCascade receipt persisted at
   *  order-creation time. Shape lives in postCreationCascade.ts. */
  cascade_receipt?: any;
  cascade_receipt_at?: string | null;
}

interface Props {
  order: OrderLike;
  fromName?: string;
  companyName?: string;
  onClose: () => void;
}

// Audit (May 2026): canonical "truck rolling" status is in_transit
// across DB enum + every workflow writer. out_for_delivery removed.
const STATUS_FLOW = [
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "in_transit", label: "On the way" },
  { key: "delivered", label: "Delivered" },
];

const STATUS_TONE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-800",
  confirmed: "bg-blue-100 text-blue-800",
  preparing: "bg-yellow-100 text-yellow-800",
  ready: "bg-purple-100 text-purple-800",
  in_transit: "bg-orange-100 text-orange-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

function statusIndex(status: string) {
  return STATUS_FLOW.findIndex((s) => s.key === status);
}

export function OrderDetailsPanel({ order, fromName, companyName, onClose }: Props) {
  const { toast } = useToast();
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const { user, profile } = useAuth() as any;
  const companyId = profile?.company_id ?? user?.company_id ?? null;
  const userId = user?.id ?? "";
  const [composeOpen, setComposeOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [statusHistory, setStatusHistory] = useState<any[]>([]);
  const [kitchenStats, setKitchenStats] = useState<{ total: number; done: number } | null>(null);
  const [equipmentCount, setEquipmentCount] = useState<number>(0);
  const [equipmentFlagged, setEquipmentFlagged] = useState<number>(0);
  const [tokenLink, setTokenLink] = useState<string | null>(null);

  // Pull async sections in parallel. Each block tolerates failure --
  // missing data hides the block rather than crashing the pane.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Status history
      try {
        const { data } = await supabase
          .from("order_status_history")
          .select("*")
          .eq("order_id", order.id)
          .order("created_at", { ascending: true });
        if (!cancelled) setStatusHistory(data || []);
      } catch {
        /* table may not exist yet - timeline falls back to current status */
      }

      // Kitchen prep tasks
      try {
        // Total = planned prep tasks for the order; done = completion rows
        // logged against it. kitchen_task_completions has no status column
        // (each row is itself a completion), so don't filter on one.
        const { count: total } = await supabase
          .from("kitchen_prep_tasks")
          .select("*", { count: "exact", head: true })
          .eq("order_id", order.id)
          .is("deleted_at", null);

        const { count: done } = await supabase
          .from("kitchen_task_completions")
          .select("*", { count: "exact", head: true })
          .eq("order_id", order.id);

        if (!cancelled && total !== null) {
          setKitchenStats({ total: total || 0, done: done || 0 });
        }
      } catch {
        /* hide block */
      }

      // Equipment items + any flagged shortages
      try {
        const items = (order.equipment_items || []) as any[];
        if (!cancelled) {
          setEquipmentCount(items.length);
          setEquipmentFlagged(items.filter((i: any) => i?.flagged || i?.shortage).length);
        }
      } catch {
        /* hide block */
      }

      // Wave 70.48c - the eager DB lookup for an existing token
      // previously set tokenLink to the bare `/c/order/{id}` URL with
      // NO ?t= token, on the theory that the page would "redirect to
      // login or the client view depending on session state". It
      // doesn't - the page POSTs to /api/client-tokens/view, finds no
      // cookie (the admin's browser was never validated against this
      // order), and rejects with "We couldn't verify this booking link".
      // Bobby hit this in production immediately after Wave 70.47 ship.
      //
      // Fix: tokenLink is always non-null when an active token exists,
      // and on click we POST to /api/orders/{id}/preview-as-client to
      // mint a FRESH raw token + open the returned URL (which has
      // `?t={token}` baked in - the page's validate flow then sets
      // the cookie and renders). The mint endpoint is admin-only,
      // tokens auto-expire in 60 days, safe to call repeatedly.
      try {
        const { data } = await supabase
          .from("client_access_tokens")
          .select("id")
          .eq("order_id", order.id)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        // Show the button regardless of whether an existing token row
        // is present - the preview endpoint mints fresh on demand.
        // The lookup is now just a "does the order have ANY history of
        // client tokens" hint (kept so the button doesn't surface on
        // orders that were never client-facing, e.g. internal
        // placeholders). For brand-new orders without a token row, we
        // still show the button so admins can mint one on demand.
        if (!cancelled) {
          setTokenLink("__preview__"); // sentinel - triggers onClick mint
        }
      } catch {
        /* hide block */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [order.id, order.equipment_items]);

  const currentStatusIdx = statusIndex(order.status || "");

  // Today / Overdue badge
  const eventBadge = useMemo(() => {
    if (!order.event_date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const event = new Date(order.event_date);
    event.setHours(0, 0, 0, 0);
    const diffDays = Math.round((event.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0 && order.status !== "delivered") return { text: "Overdue", tone: "bg-red-100 text-red-800" };
    if (diffDays === 0) return { text: "Today", tone: "bg-amber-100 text-amber-800" };
    if (diffDays === 1) return { text: "Tomorrow", tone: "bg-blue-100 text-blue-800" };
    return null;
  }, [order.event_date, order.status]);

  const venueMapsUrl = order.venue_address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.venue_address)}`
    : null;

  const total = Number(order.total_amount) || 0;
  const deposit = Number(order.deposit_amount) || 0;
  const balance = Number(order.balance_amount) || (total - deposit);
  const paid = order.deposit_paid ? deposit : 0;
  const hasPaymentInfo = total > 0 || deposit > 0;
  const hasOutstanding = balance > 0 && order.payment_status !== "paid";

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-xs text-slate-500">
              {order.order_number || `ORD-${order.id.slice(0, 8).toUpperCase()}`}
            </p>
            {eventBadge && (
              <Badge className={`${eventBadge.tone} text-xs`}>{eventBadge.text}</Badge>
            )}
          </div>
          <h2 className="text-lg font-semibold text-slate-900 leading-tight mt-1">
            {order.event_name || order.client_name || "Order"}
          </h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge className={STATUS_TONE[order.status || ""] || "bg-slate-100 text-slate-800"}>
              {(order.status || "").replace(/_/g, " ")}
            </Badge>
            {order.event_date && (
              <span className="text-xs text-slate-500">
                {new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                {order.delivery_time && `, ${new Date(order.delivery_time).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}`}
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="flex-shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* CLIENT BLOCK */}
      {(order.client_name || order.client_email || order.client_phone) && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase tracking-wide">
              <User className="h-3 w-3" /> Client
            </div>
            <div className="text-sm">
              <p className="font-medium text-slate-900">{order.client_name || "Unknown"}</p>
              {order.client_email && (
                <a href={`mailto:${order.client_email}`} className="text-blue-600 hover:underline text-xs flex items-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3" /> {order.client_email}
                </a>
              )}
              {order.client_phone && (
                <a href={`tel:${order.client_phone}`} className="text-blue-600 hover:underline text-xs flex items-center gap-1 mt-0.5">
                  <Phone className="h-3 w-3" /> {order.client_phone}
                </a>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap pt-1">
              {order.client_email && (
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => setComposeOpen(true)}>
                  <Send className="h-3 w-3" /> Compose
                </Button>
              )}
              {order.client_phone && (
                <WhatsAppButton
                  kind="client"
                  phone={order.client_phone}
                  clientId={order.client_id || null}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  defaultTemplate="event_day_morning"
                  templates={["event_week", "event_day_morning", "event_arrived", "delay_alert", "quote_chase"]}
                  ctx={{
                    contactName: order.client_name || "",
                    eventName: order.event_name,
                    eventDate: order.event_date
                      ? new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
                      : null,
                    driverName: order.driver_name,
                    arrivalTime: order.delivery_time
                      ? new Date(order.delivery_time).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
                      : null,
                    fromName,
                    companyName,
                  }}
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* VENUE BLOCK */}
      {order.venue_address && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase tracking-wide">
              <MapPin className="h-3 w-3" /> Venue
            </div>
            <p className="text-sm text-slate-900">{order.venue_address}</p>
            {venueMapsUrl && (
              <a href={venueMapsUrl} target="_blank" rel="noopener">
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
                  <ExternalLink className="h-3 w-3" /> Open in Google Maps
                </Button>
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {/* LIVE PROGRESS TIMELINE */}
      {currentStatusIdx >= 0 && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase tracking-wide">
              <Clock className="h-3 w-3" /> Live progress
            </div>
            <ol className="space-y-2 mt-1">
              {STATUS_FLOW.map((step, idx) => {
                const reached = idx <= currentStatusIdx;
                const isCurrent = idx === currentStatusIdx;
                return (
                  <li key={step.key} className="flex items-center gap-2 text-xs">
                    {reached ? (
                      <CheckCircle2 className={`h-4 w-4 flex-shrink-0 ${isCurrent ? "text-orange-500" : "text-emerald-500"}`} />
                    ) : (
                      <Circle className="h-4 w-4 text-slate-300 flex-shrink-0" />
                    )}
                    <span className={`${reached ? "text-slate-900" : "text-slate-400"} ${isCurrent ? "font-semibold" : ""}`}>
                      {step.label}
                    </span>
                    {isCurrent && (
                      <span className="ml-auto text-[10px] text-orange-600 font-semibold uppercase">Now</span>
                    )}
                  </li>
                );
              })}
            </ol>
            {statusHistory.length > 0 && (
              <details className="pt-2 border-t mt-2">
                <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-700">
                  Full history ({statusHistory.length} change{statusHistory.length === 1 ? "" : "s"})
                </summary>
                {/* Phase 6 #4: per-event timeline. Each row in
                    order_status_history is shown chronologically
                    with the timestamp and the status it advanced to.
                    Notes column (when present) surfaces the 'why'
                    - e.g. cancel reason, paused-from snapshot. */}
                <ol className="mt-2 space-y-1.5 text-[11px]">
                  {statusHistory.map((row: any) => {
                    const ts = new Date(row.created_at).toLocaleString("en-ZA", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    return (
                      <li
                        key={row.id || `${row.created_at}-${row.status}`}
                        className="flex items-start gap-2"
                      >
                        <span className="text-slate-400 font-mono tabular-nums shrink-0">
                          {ts}
                        </span>
                        <span className="font-medium text-slate-900 capitalize">
                          {String(row.status || "").replace(/_/g, " ")}
                        </span>
                        {row.notes && (
                          <span className="text-slate-500 truncate" title={row.notes}>
                            {row.notes}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {/* QUICK ACTIONS */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase tracking-wide">
            <ArrowRight className="h-3 w-3" /> Quick actions
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Link href={withSlug(`/order/${order.id}`)} legacyBehavior>
              <a><Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
                <FileText className="h-3 w-3" /> Full order
              </Button></a>
            </Link>
            <Link href={withSlug(`/admin/invoices?orderId=${order.id}`)} legacyBehavior>
              <a><Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
                <Receipt className="h-3 w-3" /> Invoice
              </Button></a>
            </Link>
            {/* Kitchen prep - routes to the real prep list page, not
                the placeholder admin view. /team-portal/kitchen/prep-list
                shows the per-order prep tasks and is the canonical
                source the kitchen team works off. */}
            <Link href={`/team-portal/kitchen/prep-list?orderId=${order.id}`} legacyBehavior>
              <a><Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
                <ChefHat className="h-3 w-3" /> Kitchen prep
              </Button></a>
            </Link>
            {order.driver_phone && (
              <a href={`tel:${order.driver_phone}`}>
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
                  <Phone className="h-3 w-3" /> Call driver
                </Button>
              </a>
            )}
            {tokenLink && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 h-7 text-xs"
                onClick={async () => {
                  // Wave 70.48c - mint a fresh raw token via the admin
                  // preview endpoint, then open the URL it returns
                  // (already has ?t= baked in). The /c/order/{id} page
                  // will validate, set the cookie, and render the
                  // client view. Endpoint is admin-only; tokens
                  // auto-expire in 60 days, safe to spam.
                  try {
                    const r = await fetch(`/api/orders/${order.id}/preview-as-client`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                    });
                    const data = await r.json();
                    if (!r.ok || !data?.url) {
                      alert(data?.error || "Could not generate client preview link");
                      return;
                    }
                    window.open(data.url, "_blank", "noopener");
                  } catch (err: any) {
                    alert(err?.message || "Could not generate client preview link");
                  }
                }}
              >
                <Eye className="h-3 w-3" /> Client view
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* PAYMENT BLOCK */}
      {hasPaymentInfo && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase tracking-wide">
              <CreditCard className="h-3 w-3" /> Payment
            </div>
            <p className="text-sm text-slate-900">
              <span className="font-semibold">{fmtMoney.format(paid)}</span>
              <span className="text-slate-500"> paid of </span>
              <span className="font-semibold">{fmtMoney.format(total)}</span>
              <span className="text-slate-500"> total</span>
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span>Deposit: {fmtMoney.format(deposit)}</span>
              <span>{order.deposit_paid ? <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Paid</Badge> : <Badge variant="outline" className="text-[10px]">Outstanding</Badge>}</span>
            </div>
            {balance > 0 && (
              <div className="text-xs text-slate-600">Balance: <span className="font-semibold text-slate-900">{fmtMoney.format(balance)}</span></div>
            )}
            {hasOutstanding && (
              <Link href={withSlug(`/admin/invoices?orderId=${order.id}&action=balance`)} legacyBehavior>
                <a><Button size="sm" variant="outline" className="gap-1 h-7 text-xs w-full mt-1">
                  <Receipt className="h-3 w-3" /> Generate balance invoice
                </Button></a>
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* KITCHEN PREP BLOCK */}
      {kitchenStats && kitchenStats.total > 0 && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase tracking-wide">
              <ChefHat className="h-3 w-3" /> Kitchen prep
            </div>
            <p className="text-sm text-slate-900">
              <span className="font-semibold">{kitchenStats.done}</span>
              <span className="text-slate-500"> / </span>
              <span className="font-semibold">{kitchenStats.total}</span>
              <span className="text-slate-500"> prep tasks done</span>
            </p>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${kitchenStats.total > 0 ? (kitchenStats.done / kitchenStats.total) * 100 : 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* EQUIPMENT BLOCK */}
      {equipmentCount > 0 && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase tracking-wide">
              <Package className="h-3 w-3" /> Equipment
            </div>
            <p className="text-sm text-slate-900">
              <span className="font-semibold">{equipmentCount}</span>
              <span className="text-slate-500"> item{equipmentCount === 1 ? "" : "s"} on this order</span>
            </p>
            {equipmentFlagged > 0 && (
              <Link href={withSlug("/admin/equipment?tab=shortages")} legacyBehavior>
                <a className="text-xs text-amber-700 hover:underline flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {equipmentFlagged} flagged, open in Equipment Shortages
                </a>
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* DRIVER BLOCK */}
      {(order.driver_id || order.assigned_driver_id) && order.driver_name && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase tracking-wide">
              <Truck className="h-3 w-3" /> Driver
            </div>
            <div className="text-sm">
              <p className="font-medium text-slate-900">{order.driver_name}</p>
              {order.driver_phone && (
                <a href={`tel:${order.driver_phone}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                  <Phone className="h-3 w-3" /> {order.driver_phone}
                </a>
              )}
              {order.last_updated && (
                <p className="text-xs text-slate-500 mt-1">
                  Last GPS ping: {new Date(order.last_updated).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1 h-7 text-xs"
              onClick={() => setReassignOpen(true)}
            >
              <Truck className="h-3 w-3" /> Reassign driver
            </Button>
          </CardContent>
        </Card>
      )}

      {/* PROOF OF DELIVERY, only when captured */}
      {(order.pod_photo_url || order.pod_signature_url || order.pod_captured_at) && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 uppercase tracking-wide">
              <CheckCircle2 className="h-3 w-3" /> Proof of delivery
            </div>
            {order.pod_recipient_name && (
              <p className="text-sm">
                <span className="text-slate-500">Received by:</span>{" "}
                <span className="font-medium text-slate-900">{order.pod_recipient_name}</span>
              </p>
            )}
            {order.pod_captured_at && (
              <p className="text-xs text-slate-500">
                Captured {new Date(order.pod_captured_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {order.pod_photo_url && (
                <a href={order.pod_photo_url} target="_blank" rel="noopener noreferrer" className="group">
                  <div className="aspect-square rounded-md overflow-hidden bg-white border border-emerald-200 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={order.pod_photo_url} alt="Delivery photo" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center text-transparent group-hover:text-white text-xs font-medium">
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                    <Camera className="w-3 h-3" /> Photo
                  </p>
                </a>
              )}
              {order.pod_signature_url && (
                <a href={order.pod_signature_url} target="_blank" rel="noopener noreferrer" className="group">
                  <div className="aspect-square rounded-md overflow-hidden bg-white border border-emerald-200 relative flex items-center justify-center p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={order.pod_signature_url} alt="Signature" className="max-w-full max-h-full object-contain" />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                    <FileSignature className="w-3 h-3" /> Signature
                  </p>
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Phase 3 #4: post-creation cascade receipt. Surfaces every
       *  side-effect the order kicked off when it was created --
       *  invoice generated, confirmation email queued, kitchen prep
       *  tasks, equipment bookings, shortfall alerts, shopping
       *  suggestions. Operator can see at a glance whether anything
       *  failed without dropping into the audit log. */}
      {order.cascade_receipt && (
        <Card className="border-slate-200">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase tracking-wide">
                <CheckCircle2 className="h-3 w-3" /> Order creation receipt
              </div>
              {order.cascade_receipt_at && (
                <span className="text-[10px] text-slate-400">
                  {new Date(order.cascade_receipt_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              )}
            </div>
            <ul className="text-xs space-y-1">
              {[
                { key: "invoice", label: "Invoice generated" },
                { key: "email", label: "Confirmation email" },
                { key: "kitchen", label: "Kitchen prep tasks" },
                { key: "equipment", label: "Equipment bookings" },
                { key: "conflicts", label: "Equipment conflict check" },
                { key: "shopping", label: "Shopping suggestion" },
              ].map(({ key, label }) => {
                const step = (order.cascade_receipt as Record<string, any>)?.[key];
                if (!step) return null;
                const detail =
                  key === "kitchen" && step.tasksCreated != null
                    ? `${step.tasksCreated} task${step.tasksCreated === 1 ? "" : "s"}`
                    : key === "equipment" && step.bookingsCreated != null
                    ? `${step.bookingsCreated} booking${step.bookingsCreated === 1 ? "" : "s"}`
                    : key === "conflicts" && step.shortfalls != null
                    ? step.shortfalls === 0
                      ? "no shortfalls"
                      : `${step.shortfalls} shortfall${step.shortfalls === 1 ? "" : "s"} flagged`
                    : key === "shopping" && step.shortfalls != null
                    ? step.shortfalls === 0
                      ? "no deficit"
                      : `${step.shortfalls} ingredient${step.shortfalls === 1 ? "" : "s"} short`
                    : key === "email" && step.skipped
                    ? `skipped (${step.reason || "no reason"})`
                    : step.reason && !step.ok
                    ? step.reason
                    : "";
                const tone = step.ok
                  ? "text-emerald-700"
                  : step.skipped
                  ? "text-slate-500"
                  : "text-rose-700";
                const icon = step.ok ? "✓" : step.skipped ? "-" : "✗";
                return (
                  <li key={key} className="flex justify-between gap-2">
                    <span className={tone}>
                      <span className="font-mono">{icon}</span> {label}
                    </span>
                    {detail && <span className="text-slate-500 text-[11px]">{detail}</span>}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* DRIVER CHAT BLOCK, only when there's a driver to talk to */}
      {(order.driver_id || order.assigned_driver_id) && companyId && userId && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
              <MessageCircle className="h-3 w-3" /> Driver chat
            </div>
            <OrderChatPanel
              companyId={companyId}
              orderId={order.id}
              userId={userId}
              senderRole="dispatcher"
              compact
              maxHeight="220px"
            />
          </CardContent>
        </Card>
      )}

      {/* COMPOSE DRAWER - shared resizable host */}
      <ComposeDrawerHost open={composeOpen} onClose={() => setComposeOpen(false)}>
        <ComposeDrawer
          order={order}
          fromName={fromName}
          companyName={companyName}
          onClose={() => setComposeOpen(false)}
        />
      </ComposeDrawerHost>

      {/* REASSIGN DRIVER DIALOG (Phase 2B one-click swap) */}
      <ReassignDriverDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        companyId={companyId}
        performedBy={userId}
        order={{
          id: order.id,
          client_name: order.client_name,
          event_date: order.event_date || toLocalISO(new Date()),
          event_time: order.event_time,
          venue_lat: order.venue_lat,
          venue_lng: order.venue_lng,
          requires_refrigeration: order.requires_refrigeration,
          region_id: (order as any).region_id ?? null,
        }}
        allowUnassign
      />
    </div>
  );
}

/**
 * Compose drawer for an order. Mirrors QuoteComposeDrawer's four-channel
 * pattern (Gmail / Outlook / mailto / clipboard) so the email looks like
 * it came from the user, not from us.
 */
function ComposeDrawer({
  order,
  fromName,
  companyName,
  onClose,
}: {
  order: OrderLike;
  fromName?: string;
  companyName?: string;
  onClose: () => void;
}) {
  const initial = useMemo(() => {
    const first = (order.client_name || "there").split(" ")[0];
    const sig = `\n\nBest,\n${fromName || companyName || "the team"}`;
    const eventLine = order.event_name
      ? order.event_date
        ? `your ${order.event_name} on ${new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}`
        : `your ${order.event_name}`
      : order.event_date
        ? `your event on ${new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}`
        : `your upcoming event`;

    let subject = `Quick update on your order`;
    let body = `Hi ${first},\n\nJust a quick note about ${eventLine}.${sig}`;

    switch (order.status) {
      case "preparing":
        subject = `We're prepping for ${eventLine.replace(/^your /, "")}`;
        body = `Hi ${first},\n\nThe kitchen is on it for ${eventLine}. Anything you'd like to flag before we finish prep, let me know now and I'll fold it in.${sig}`;
        break;
      case "ready":
        subject = `Ready to dispatch, ${eventLine.replace(/^your /, "")}`;
        body = `Hi ${first},\n\nEverything is packed and ready for ${eventLine}. The driver will leave shortly. I'll send a tracking link once they're on the road.${sig}`;
        break;
      case "in_transit":
        subject = `Driver on the way`;
        body = `Hi ${first},\n\nThe driver is on the way to you for ${eventLine}. I'll let you know if anything changes.${sig}`;
        break;
      case "delivered":
        subject = `Delivered, enjoy ${eventLine.replace(/^your /, "")}`;
        body = `Hi ${first},\n\nWe've completed delivery for ${eventLine}. Hope it all goes brilliantly. Let me know how it lands and I'll be in touch about the balance once the event wraps.${sig}`;
        break;
    }

    return { subject, body };
  }, [order, fromName, companyName]);

  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSubject(initial.subject);
    setBody(initial.body);
  }, [initial.subject, initial.body]);

  const payload = { to: order.client_email || "", subject, body, fromName };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Send className="w-5 h-5 text-emerald-600" />
          Compose to {order.client_name}
        </SheetTitle>
        <SheetDescription>
          Personal status update. Sent through your own inbox so it looks like it came from you.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 mt-4">
        <Card className="border-0 shadow-sm bg-slate-50">
          <CardContent className="py-3 px-4 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Email</span>
              <span className="font-medium text-slate-900">{order.client_email || "(none)"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status</span>
              <span className="font-medium text-slate-900 capitalize">{(order.status || "").replace(/_/g, " ")}</span>
            </div>
            {order.event_date && (
              <div className="flex justify-between">
                <span className="text-slate-500">Event date</span>
                <span className="font-medium text-slate-900">
                  {new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
                </span>
              </div>
            )}
            {order.total_amount != null && (
              <div className="flex justify-between">
                <span className="text-slate-500">Total</span>
                <span className="font-medium text-slate-900">{fmtMoney.format(order.total_amount)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <div>
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Subject</label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Edit freely, the template is a starting point based on the order's status.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
          <Button
            variant="default"
            disabled={!order.client_email}
            onClick={() => window.open(composeEmail.gmailUrl(payload), "_blank", "noopener")}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <ExternalLink className="w-4 h-4" /> Open in Gmail
          </Button>
          <Button
            variant="outline"
            disabled={!order.client_email}
            onClick={() => window.open(composeEmail.outlookUrl(payload), "_blank", "noopener")}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" /> Open in Outlook
          </Button>
          <Button
            variant="outline"
            disabled={!order.client_email}
            onClick={() => { window.location.href = composeEmail.mailto(payload); }}
            className="gap-2"
          >
            <Mail className="w-4 h-4" /> Default mail app
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const ok = await composeEmail.copyToClipboard(payload);
              if (ok) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            }}
            className="gap-2"
          >
            <Copy className="w-4 h-4" /> {copied ? "Copied!" : "Copy"}
          </Button>
        </div>

        <Button variant="ghost" onClick={onClose} className="w-full">Close</Button>
      </div>
    </>
  );
}

export default OrderDetailsPanel;
