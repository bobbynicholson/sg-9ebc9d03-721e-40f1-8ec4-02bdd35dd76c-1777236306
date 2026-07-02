import { useState, useEffect } from "react";
import Link from "next/link";
import { useRef } from "react";
import { useRouter } from "next/router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Users, Banknote, Package, Truck, Pencil, CalendarX, Receipt, AlertCircle, RotateCcw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ClientNav } from "@/components/navigation/ClientNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, PortalOverview,
  PageWorkbench,
} from "@/components/portal/ui";
import { computeOrderTimeline } from "@/services/order/orderTimeline";
import { TimelineTrack } from "@/components/admin/orders/TimelineTrack";
// Wave 28.4: same wizard the magic-link surfaces use. Auth client
// portal users get the identical 3-step flow so the catering company
// only ever has to support one cancellation UX in the wild.
import { CancellationWizard } from "@/components/cancellation/CancellationWizard";
// Wave 33: same full order editor the magic-link surface uses, so a
// logged-in client gets the whole form (menu / equipment / guests / venue
// / timing) instead of the old guest-count + venue + notes stub. Submits
// to the auth amendment-request endpoint; the catering team still approves.
import { OrderEditDialog } from "@/components/order/OrderEditDialog";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { ChatBot } from "@/components/ChatBot";
import { RebookDialog } from "@/components/client-portal/RebookDialog";
import { AddToCalendarButton } from "@/components/client-portal/AddToCalendarButton";
import { toLocalISO } from "@/lib/localDate";
import { clientOrderHref } from "@/lib/orderUrls";
import { supabase } from "@/integrations/supabase/client";
import { useOrderRefreshSignal } from "@/hooks/useOrderRefreshSignal";

interface Order {
  id: string;
  event_date: string;
  // CLI-I (client deep audit, CLI-29): event_time + order_number
  // are required for the .ics file. Both are nullable on the row;
  // the calendar generator defaults event_time to midday when
  // missing.
  event_time?: string | null;
  order_number?: string | null;
  event_name?: string | null;
  venue_name?: string | null;
  venue_address: string;
  guest_count: number;
  status: string;
  total_amount: number;
  payment_status?: string;
  // Wave 28.4: extra fields the cancellation wizard needs to compute
  // refund/credit terms locally without an extra DB roundtrip.
  amount_paid?: number;
  deposit_amount?: number;
  deposit_paid?: boolean;
  kitchen_prep_started_at?: string | null;
  shopping_completed_at?: string | null;
}

function MyOrdersInner() {
  const { user, company, profile } = useAuth() as any;
  const router = useRouter();
  // Slug-aware navigation prefix - keeps tenant URL space (/{slug}/...)
  // intact when the page is reached via the slug-form rewrite.
  const resolvedSlug =
    (typeof router.query.company_slug === "string" && router.query.company_slug) ||
    (user as any)?.user_metadata?.last_company_slug ||
    "";
  const targetOrderId =
    (typeof router.query.orderId === "string" && router.query.orderId) ||
    (typeof router.query.focus === "string" && router.query.focus) ||
    "";
  const clientPortalHref = (href: string) => resolvedSlug ? `/${resolvedSlug}${href}` : href;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  // Amendment request dialog state. The dialog is a single shared
  // instance reused across rows - simpler than rendering one per
  // order, and the form is small enough that re-mounting on open
  // doesn't matter.
  const [amendingOrder, setAmendingOrder] = useState<Order | null>(null);
  // Wave 33: the editor is now the shared OrderEditDialog; we only track
  // which order is open + whether a submit happened (to refresh on close).
  const [amendDone, setAmendDone] = useState(false);
  // Cancel/postpone request dialog state.
  // Wave 28.4: cancellation now lives in CancellationWizard (mounted
  // at the bottom of this file). The Dialog below is locked to
  // postpone-only - the type selector is dropped.
  const [cancelRequestOrder, setCancelRequestOrder] = useState<Order | null>(null);
  const cancelRequestType = "postpone" as const;
  const [cancelPostponeDate, setCancelPostponeDate] = useState<string>("");
  const [cancelReason, setCancelReason] = useState<string>("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelPreview, setCancelPreview] = useState<any | null>(null);
  // Wave 28.4: holds the row whose Cancel button was clicked.
  // Setting it opens the wizard; null closes.
  const [wizardOrder, setWizardOrder] = useState<Order | null>(null);
  const [wizardCompanyPolicy, setWizardCompanyPolicy] = useState<any>(null);
  // Rebook dialog state. Same component as the dashboard surfaces - a
  // single instance reused across rows. Setting the source order opens
  // it; clearing it on close.
  const [rebookOrder, setRebookOrder] = useState<Order | null>(null);
  const { toast } = useToast();
  // TIGHTEN I.119 (2026-06-02): refetch when an order edit lands - admin moving the event date should update the client view immediately.
  const refreshSignal = useOrderRefreshSignal(company?.id ?? null);
  const highlightedOrderRef = useRef<string | null>(null);

  // Pull a refund preview when the cancel/postpone dialog opens so the
  // client sees what they'd get back before submitting.
  useEffect(() => {
    if (!cancelRequestOrder) {
      setCancelPreview(null);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_refund_for_order", { p_order_id: cancelRequestOrder.id });
        if (error) throw error;
        setCancelPreview(data);
      } catch (e) {
        console.warn("[my-orders] preview failed", e);
      }
    })();
  }, [cancelRequestOrder]);

  // Wave 28.4: load this tenant's cancellation_policy once - the
  // wizard reads it locally to render every step's preview without
  // a per-step DB roundtrip. Refreshes only when the company changes
  // (effectively never within a session).
  useEffect(() => {
    if (!company?.id) return;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("companies")
          .select("cancellation_policy, cancellation_fee_percent, phone")
          .eq("id", company.id)
          .maybeSingle();
        setWizardCompanyPolicy(data || null);
      } catch (e) {
        console.warn("[my-orders] policy load failed", e);
      }
    })();
  }, [company?.id]);

  useEffect(() => {
    if (!user?.id) return;
    // Tenant-scope: a user might be a client of multiple catering
    // companies. The portal renders one tenant at a time - always
    // the company resolved from the URL slug (which the auth context
    // already loads). Without this filter, we'd merge cross-tenant
    // orders into one list.
    const tenantCompanyId: string | null = company?.id ?? null;
    if (!tenantCompanyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Multiple historical clients rows per (email, company) are
        // possible - collect every id rather than maybeSingle().
        const { data: clientRows } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", user.id)
          .eq("company_id", tenantCompanyId);
        const clientIds = ((clientRows as any[]) || []).map((r) => r.id);

        // Full timeline fields: the row card renders the same
        // 22-stage TimelineTrack as the order document, so expose the
        // canonical order column names the timeline derivation reads.
        let ordersQuery = supabase
          .from("orders")
          .select("id, event_date, event_time, order_number, event_name, venue_name, venue_address, guest_count, status, total_amount, payment_status, confirmed_at, deposit_paid, deposit_paid_at, deposit_amount, balance_paid, balance_paid_at, balance_amount, balance_due_date, prep_started_at, ready_at, picked_up_at, arrived_at_venue_at, pod_captured_at, delivered_at, setup_started_at, service_started_at, departed_venue_at, completed_at, equipment_return_method, created_at, amount_paid")
          .eq("company_id", tenantCompanyId)
          .is("deleted_at", null)
          .order("event_date", { ascending: false });

        const normEmail = (user.email || "").toLowerCase();
        if (clientIds.length > 0 && normEmail) {
          // Same union pattern as the dashboard: client_id match OR
          // email match (catches orphan rows created by email before
          // the user signed up). Use eq not ilike: ilike treats '_'
          // as a wildcard and could expose another client's orders.
          ordersQuery = ordersQuery.or(
            `client_id.in.(${clientIds.join(",")}),client_email.eq.${normEmail}`,
          );
        } else if (clientIds.length > 0) {
          ordersQuery = ordersQuery.in("client_id", clientIds);
        } else if (normEmail) {
          ordersQuery = ordersQuery.eq("client_email", normEmail);
        } else {
          if (!cancelled) {
            setOrders([]);
            setLoading(false);
          }
          return;
        }

        const { data, error } = await ordersQuery;
        if (error) {
          console.error("Error loading client orders:", error);
          if (!cancelled) setOrders([]);
          return;
        }
        if (!cancelled) setOrders((data || []) as unknown as Order[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, company?.id, refreshSignal]);

  useEffect(() => {
    if (!targetOrderId || loading || orders.length === 0) return;
    if (!orders.some((order) => order.id === targetOrderId)) return;
    setFilter("all");
    if (highlightedOrderRef.current === targetOrderId) return;
    highlightedOrderRef.current = targetOrderId;
    window.requestAnimationFrame(() => {
      document.getElementById(`order-${targetOrderId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [targetOrderId, loading, orders]);

  const filteredOrders = orders.filter((o) => {
    // "Completed" tab covers both `delivered` (driver dropped off,
    // pre-completion) and `completed` (closed out) so a client's past
    // events don't disappear from their list just because the team
    // hasn't ticked completed yet.
    const isDone = o.status === "completed" || o.status === "delivered";
    if (filter === "active") return !isDone && o.status !== "cancelled";
    if (filter === "completed") return isDone;
    return true;
  });
  const activeCount = orders.filter((o) => !["completed", "delivered", "cancelled"].includes(o.status)).length;
  const completedCount = orders.filter((o) => ["completed", "delivered"].includes(o.status)).length;
  const totalBookedValue = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  const getStatusColor = (status: string) => {
    const colors = {
      pending: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
      confirmed: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
      preparing: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
      ready: "bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/15 dark:text-brand-primary dark:border-brand-primary/30",
      completed: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
      cancelled: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900",
    };
    return colors[status as keyof typeof colors] || colors.pending;
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Your bookings - CateringMS</title>
      </Head>

      <ClientNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Your bookings"
            subtitle="Every confirmed booking, active or completed. Open one to track delivery, request a change, view the invoice, or rebook."
            icon={Package}
          />
          <PageWorkbench />

          <PortalOverview
            eyebrow="Bookings"
            title={orders.length > 0 ? "Every booking is grouped here with the next action on each row" : "No bookings linked to this portal yet"}
            description="Use Bookings for the full history: live tracking when a driver is moving, change requests before the event, invoices, cancellation/postpone requests, and rebooking completed events."
            items={[
              { label: "Total", value: orders.length, helper: "All bookings", icon: Package, tone: orders.length > 0 ? "brand" : "neutral" },
              { label: "Active", value: activeCount, helper: "Still in progress", icon: Truck, tone: activeCount > 0 ? "warning" : "success" },
              { label: "Completed", value: completedCount, helper: "Delivered or closed", icon: Users, tone: "success" },
              { label: "Value", value: `R${totalBookedValue.toLocaleString()}`, helper: "Across loaded orders", icon: Banknote, tone: "neutral" },
            ]}
            actions={
              <>
                <Link
                  href={clientPortalHref("/client-portal/tracking")}
                  className="inline-flex min-h-9 items-center rounded-md bg-brand-primary px-3 text-sm font-semibold text-white hover:opacity-90"
                >
                  Live tracking
                </Link>
                <Link
                  href={clientPortalHref("/client-portal/billing")}
                  className="inline-flex min-h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Billing
                </Link>
              </>
            }
          />

          {/* Filter chips - amber active-chip pattern (shopping dashboard).
              onClick / variant logic unchanged; presentation only. */}
          <div className="flex gap-2 mb-6">
            <Button
              size="sm"
              variant={filter === "all" ? "default" : "outline"}
              onClick={() => setFilter("all")}
              className={filter === "all" ? "bg-brand-primary hover:opacity-90" : ""}
            >
              All bookings
            </Button>
            <Button
              size="sm"
              variant={filter === "active" ? "default" : "outline"}
              onClick={() => setFilter("active")}
              className={filter === "active" ? "bg-brand-primary hover:opacity-90" : ""}
            >
              Active
            </Button>
            <Button
              size="sm"
              variant={filter === "completed" ? "default" : "outline"}
              onClick={() => setFilter("completed")}
              className={filter === "completed" ? "bg-brand-primary hover:opacity-90" : ""}
            >
              Completed
            </Button>
          </div>

          <PortalCard>
            <PortalCardHeader title={`Bookings (${filteredOrders.length})`} />
            <div>
              {loading ? (
                // Skeleton placeholder rows so the layout doesn't jump
                // when the orders arrive. Reduced-motion users get a
                // static block (animate-pulse respects prefers-reduced-motion).
                <div className="space-y-4" aria-busy="true" aria-label="Loading your orders">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-32 rounded-2xl border border-slate-200/80 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50 animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="py-14 px-6 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                    <Package className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1.5">
                    {filter === "all" ? "No bookings yet" : "Nothing in this view"}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                    {filter === "all"
                      ? "Your bookings show up here once your caterer confirms a quote. Want something on the calendar? Ask them for a quote and accept it - it lands here automatically."
                      : "No bookings match this filter. Switch back to All bookings to see everything, active or done."}
                  </p>
                  {filter !== "all" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setFilter("all")}
                      className="mt-5"
                    >
                      Show all orders
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredOrders.map((order) => {
                    // Full 22-stage timeline per row. Keep the same
                    // pipeline model clients see on the order document;
                    // admin/source links stay disabled from this client
                    // surface.
                    const clientTl = order.status !== "cancelled"
                      ? computeOrderTimeline({ order })
                      : null;
                    const isTargetOrder = targetOrderId === order.id;
                    return (
                    <div
                      id={`order-${order.id}`}
                      key={order.id}
                      className={`p-4 md:p-6 border rounded-2xl transition-colors duration-200 ${
                        isTargetOrder
                          ? "border-brand-primary/50 bg-brand-primary/5 ring-2 ring-brand-primary/20 dark:border-brand-primary/50 dark:bg-brand-primary/10 dark:ring-brand-primary/30"
                          : clientTl?.blocked
                          ? "border-l-4 border-l-rose-500 border-y-rose-100 border-r-rose-100 bg-rose-50/40 dark:border-l-rose-500 dark:border-y-rose-900/40 dark:border-r-rose-900/40 dark:bg-rose-950/20"
                          : "border-slate-200/80 bg-white hover:border-brand-primary/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-primary/40"
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className="font-semibold text-lg text-slate-900 dark:text-white">
                              {new Date(order.event_date).toLocaleDateString("en-US", {
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </h3>
                            <Badge variant="outline" className={`capitalize ${getStatusColor(order.status)}`}>{order.status}</Badge>
                            {order.payment_status && (
                              <Badge
                                variant="outline"
                                className={
                                  order.payment_status === "paid"
                                    ? "capitalize bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/15 dark:text-brand-primary dark:border-brand-primary/30"
                                    : "capitalize bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900"
                                }
                              >
                                {order.payment_status}
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                              <span>{order.venue_address}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                              <span>{order.guest_count} guests</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Banknote className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                              <span className="tabular-nums">R{Number(order.total_amount || 0).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          {/* CLI-I (client deep audit, CLI-29): Add to
                              calendar. Renders only for future events
                              that aren't cancelled - no point dropping
                              a past or void event into the user's
                              calendar. Uses the chip variant so it
                              sits comfortably alongside Track / View
                              without dominating the row. */}
                          {order.event_date >= toLocalISO(new Date()) &&
                            order.status !== "cancelled" && (
                              <AddToCalendarButton
                                event={{
                                  eventDate: order.event_date,
                                  eventTime: order.event_time,
                                  summary: order.event_name
                                    ? `${order.event_name} - ${company?.company_name || "Catering"}`
                                    : `Catering by ${company?.company_name || "your caterer"}`,
                                  location:
                                    order.venue_address || order.venue_name || null,
                                  description: [
                                    order.event_name ? `Event: ${order.event_name}` : null,
                                    order.guest_count ? `Guests: ${order.guest_count}` : null,
                                    company?.company_name
                                      ? `Catered by ${company.company_name}`
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join("\n"),
                                  orderNumber: order.order_number,
                                }}
                                variant="chip"
                                label="Calendar"
                                brandPrimary={company?.primary_color || undefined}
                                className="w-full sm:w-auto justify-center"
                              />
                            )}
                          {order.status === "in_transit" && (
                            <Link href={clientPortalHref(`/client-portal/tracking?orderId=${order.id}`)}>
                              <Button size="sm" variant="outline" className="w-full sm:w-auto">
                                <Truck className="w-4 h-4 mr-2" />
                                Track live
                              </Button>
                            </Link>
                          )}
                          {/* Request a change - only when the order is
                              still in a state where amendments make
                              sense. The server-side is_order_amendable
                              RPC is the actual gate; this is just a
                              friendly UI hint to hide the button on
                              completed / cancelled orders. */}
                          {!["completed", "cancelled", "delivered"].includes(order.status) && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full sm:w-auto"
                                onClick={() => {
                                  setAmendDone(false);
                                  setAmendingOrder(order);
                                }}
                              >
                                <Pencil className="w-4 h-4 mr-2" />
                                Request a change
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full sm:w-auto text-brand-primary border-brand-primary/20 hover:bg-brand-primary/5"
                                onClick={() => {
                                  setCancelRequestOrder(order);
                                  setCancelPostponeDate("");
                                  setCancelReason("");
                                }}
                              >
                                <CalendarX className="w-4 h-4 mr-2" />
                                Postpone
                              </Button>
                              {/* Wave 28.4: dedicated Cancel button --
                                  opens the wizard with the rules-engine
                                  preview + payout choice. */}
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full sm:w-auto text-rose-700 border-rose-200 hover:bg-rose-50"
                                onClick={() => setWizardOrder(order)}
                              >
                                <CalendarX className="w-4 h-4 mr-2" />
                                Cancel
                              </Button>
                            </>
                          )}
                          {/* ODOC G.7: logged-in client lands on the
                              unified order doc with the Finance
                              section gated (client mode hides money).
                              Was sending to /c/order/[id] with no
                              token - that fell through to magic-link
                              'request a new link' for portal-auth
                              users, which is wrong. */}
                          <Link href={clientPortalHref(clientOrderHref(order.id, { inPortal: true }))}>
                            <Button size="sm" variant="outline" className="w-full sm:w-auto">
                              View details
                            </Button>
                          </Link>
                          {/* Book again - only on completed/delivered orders. Opens
                              the same RebookDialog the dashboard uses;
                              prefills via sourceOrder on the dialog side. */}
                          {["completed", "delivered"].includes(order.status) && (
                            <Button
                              size="sm"
                              className="w-full sm:w-auto bg-brand-primary hover:opacity-90"
                              onClick={() => setRebookOrder(order)}
                            >
                              <RotateCcw className="w-4 h-4 mr-2" />
                              Book again
                            </Button>
                          )}
                        </div>
                      </div>
                      {/* Full 22-stage timeline. Skipped on cancelled
                          orders because the badge already says it. */}
                      {clientTl && (
                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                          <TimelineTrack timeline={clientTl} hideOperatorGlossary disableSourceLinks />
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </PortalCard>
        </PortalShell>
      </div>

      <RebookDialog
        open={!!rebookOrder}
        onOpenChange={(o) => { if (!o) setRebookOrder(null); }}
        sourceOrder={
          rebookOrder
            ? {
                id: rebookOrder.id,
                event_name: rebookOrder.event_name ?? null,
                event_date: rebookOrder.event_date,
                guest_count: rebookOrder.guest_count ?? null,
                venue_name: rebookOrder.venue_name ?? null,
                venue_address: rebookOrder.venue_address ?? null,
              }
            : null
        }
        companyId={company?.id}
        companyName={company?.company_name || "Your caterer"}
        brandPrimary={company?.primary_color || "#059669"}
        brandSecondary={company?.secondary_color || "#10b981"}
        user={user ? { id: user.id, email: user.email } : null}
        profileFullName={profile?.full_name || (user as any)?.full_name || null}
        profilePhone={(profile as any)?.phone_number || null}
      />

      <ChatBot userRole="client" companyId={user?.user_metadata?.company_id} />

      {/* Wave 33: full order editor (same component as the magic-link
          surface), pointed at the session-auth endpoints. Replaces the
          old guest-count + venue + notes stub so the logged-in client
          gets the whole form. The catering team still reviews/approves
          via the amendment cascade. */}
      {amendingOrder && (
        <OrderEditDialog
          open={!!amendingOrder}
          onOpenChange={(o) => {
            if (!o) {
              const done = amendDone;
              setAmendingOrder(null);
              setAmendDone(false);
              if (done) window.location.reload();
            }
          }}
          orderId={amendingOrder.id}
          primary="var(--brand-primary)"
          secondary="var(--brand-secondary)"
          dataUrl={`/api/orders/${amendingOrder.id}/edit-data`}
          submitUrl="/api/orders/amendment-request"
          onSubmitted={() => setAmendDone(true)}
        />
      )}

      {/* Cancel / postpone request dialog. Submits to
          /api/orders/cancellation-request which captures the policy
          snapshot + refund preview at submit time. The catering team
          reviews and approves via /api/orders/cancellation-review. */}
      <Dialog
        open={!!cancelRequestOrder}
        onOpenChange={(o) => { if (!o) setCancelRequestOrder(null); }}
      >
        <DialogContent className="max-w-lg">
          {cancelRequestOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="text-amber-700 flex items-center gap-2">
                  <CalendarX className="w-5 h-5" />
                  Postpone your booking
                </DialogTitle>
                <DialogDescription>
                  Pick a new date and the team will confirm by email. Your deposit travels with you to the new date - nothing is lost.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">New event date</Label>
                  <Input
                    type="date"
                    value={cancelPostponeDate}
                    onChange={(e) => setCancelPostponeDate(e.target.value)}
                  />
                  <p className="text-xs text-slate-500">
                    Postponements need at least {cancelPreview?.postponement_notice_days || 14} days' notice. We'll confirm the new date with you.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">Reason / notes (optional)</Label>
                  <Textarea
                    rows={3}
                    placeholder="A short note helps us understand and offer alternatives if useful"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCancelRequestOrder(null)}
                  disabled={cancelSubmitting}
                >
                  Keep the date
                </Button>
                <Button
                  className="bg-brand-primary hover:opacity-90 text-white"
                  disabled={cancelSubmitting || !cancelPostponeDate}
                  onClick={async () => {
                    if (!cancelRequestOrder) return;
                    setCancelSubmitting(true);
                    try {
                      const resp = await fetch("/api/orders/cancellation-request", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          order_id: cancelRequestOrder.id,
                          request_type: "postpone",
                          requested_postpone_date: cancelPostponeDate,
                          reason: cancelReason.trim() || undefined,
                        }),
                      });
                      const j = await resp.json().catch(() => ({}));
                      if (!resp.ok) throw new Error(j?.error || "Could not submit");
                      toast({
                        title: "Postponement request submitted",
                        description: "The catering team will confirm by email shortly.",
                      });
                      setCancelRequestOrder(null);
                    } catch (err: any) {
                      toast({
                        title: "Could not submit",
                        description: err?.message || "Try again",
                        variant: "destructive",
                      });
                    } finally {
                      setCancelSubmitting(false);
                    }
                  }}
                >
                  {cancelSubmitting ? "Submitting..." : "Submit request"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Wave 28.4: CancellationWizard for the Cancel button. Posts
          to /api/orders/cancellation-request - the auth-portal API
          path. Wave 28.5 makes that endpoint auto-process when the
          policy says so, otherwise it queues for admin review. */}
      {wizardOrder && (
        <CancellationWizard
          open={!!wizardOrder}
          onOpenChange={(o) => {
            if (!o) setWizardOrder(null);
          }}
          mode="order"
          companyName={company?.company_name || "the catering team"}
          companyPhone={wizardCompanyPolicy?.phone || null}
          termsInput={{
            amountPaid: Number(wizardOrder.amount_paid) || 0,
            depositAmount: Number(wizardOrder.deposit_amount) || 0,
            depositPaid: !!wizardOrder.deposit_paid,
            eventDate: wizardOrder.event_date,
            status: wizardOrder.status,
            kitchenPrepStarted: !!wizardOrder.kitchen_prep_started_at,
            shoppingDone: !!wizardOrder.shopping_completed_at,
            dispatched: ["out_for_delivery", "in_transit", "delivered"].includes(
              wizardOrder.status,
            ),
            policy: (wizardCompanyPolicy?.cancellation_policy as any) || {},
            legacyCancelFeePct:
              Number(wizardCompanyPolicy?.cancellation_fee_percent) || undefined,
          }}
          onSubmit={async (payload) => {
            const r = await fetch("/api/orders/cancellation-request", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                order_id: wizardOrder.id,
                request_type: "cancel",
                reason: payload.reason || payload.reason_category,
                payout_choice: payload.payout_choice,
                credit_amount: payload.credit_amount,
                committed_cost_note: payload.committed_cost_note,
              }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j?.error || "Could not submit");
            toast({
              title: j.auto_processed
                ? "Order cancelled"
                : "Cancellation request submitted",
              description: j.auto_processed
                ? "All done - the catering team has been notified and your payout has been processed."
                : "The catering team will review and confirm by email shortly.",
            });
            // Reload the list so status flips and the row hides.
            window.location.reload();
          }}
        />
      )}
    </>
  );
}

export default function MyOrders() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.CLIENT, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.REGION_ADMIN, UserRole.ADMIN]}>
      <MyOrdersInner />
    </ProtectedRoute>
  );
}
