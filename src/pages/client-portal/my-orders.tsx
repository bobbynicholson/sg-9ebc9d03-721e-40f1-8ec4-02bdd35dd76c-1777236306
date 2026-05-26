import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Users, DollarSign, Package, Truck, Pencil, CalendarX, Receipt, AlertCircle, RotateCcw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ClientNav } from "@/components/navigation/ClientNav";
import { ClientPageHeader } from "@/components/client-portal/ClientPageHeader";
import { computeOrderTimeline, toClientTimeline } from "@/services/order/orderTimeline";
import { TimelineTrack } from "@/components/admin/orders/TimelineTrack";
// Wave 28.4: same wizard the magic-link surfaces use. Auth client
// portal users get the identical 3-step flow so the catering company
// only ever has to support one cancellation UX in the wild.
import { CancellationWizard } from "@/components/cancellation/CancellationWizard";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { RebookDialog } from "@/components/client-portal/RebookDialog";
import { AddToCalendarButton } from "@/components/client-portal/AddToCalendarButton";
import { toLocalISO } from "@/lib/localDate";
import { clientOrderHref } from "@/lib/orderUrls";
import { supabase } from "@/integrations/supabase/client";

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

export default function MyOrders() {
  const { user, company, profile } = useAuth() as any;
  const router = useRouter();
  // Slug-aware navigation prefix - keeps tenant URL space (/{slug}/...)
  // intact when the page is reached via the slug-form rewrite.
  const resolvedSlug =
    (typeof router.query.company_slug === "string" && router.query.company_slug) ||
    (user as any)?.user_metadata?.last_company_slug ||
    "";
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  // Amendment request dialog state. The dialog is a single shared
  // instance reused across rows - simpler than rendering one per
  // order, and the form is small enough that re-mounting on open
  // doesn't matter.
  const [amendingOrder, setAmendingOrder] = useState<Order | null>(null);
  const [amendGuestCount, setAmendGuestCount] = useState<string>("");
  const [amendVenue, setAmendVenue] = useState<string>("");
  const [amendNotes, setAmendNotes] = useState<string>("");
  const [amendSubmitting, setAmendSubmitting] = useState(false);
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

        // Wave 26: extended SELECT to include the columns the client
        // OrderTimeline derives from (deposit_paid, balance_paid,
        // delivered_at, completed_at, equipment_return_method,
        // confirmed_at, deposit_amount, balance_amount). Without
        // these, the per-row compact TimelineTrack would render every
        // post-confirmation stage as upcoming regardless of actual
        // payment / delivery state.
        let ordersQuery = supabase
          .from("orders")
          .select("id, event_date, event_time, order_number, event_name, venue_name, venue_address, guest_count, status, total_amount, payment_status, confirmed_at, deposit_paid, deposit_paid_at, deposit_amount, balance_paid, balance_paid_at, balance_amount, balance_due_date, delivered_at, completed_at, equipment_return_method, created_at, amount_paid, kitchen_prep_started_at, shopping_completed_at")
          .eq("company_id", tenantCompanyId)
          .order("event_date", { ascending: false });

        if (clientIds.length > 0 && user.email) {
          // Same union pattern as the dashboard: client_id match OR
          // email match (catches orphan rows created by email before
          // the user signed up).
          ordersQuery = ordersQuery.or(
            `client_id.in.(${clientIds.join(",")}),client_email.ilike.${user.email}`,
          );
        } else if (clientIds.length > 0) {
          ordersQuery = ordersQuery.in("client_id", clientIds);
        } else if (user.email) {
          ordersQuery = ordersQuery.ilike("client_email", user.email);
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
  }, [user, company?.id]);

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

  const getStatusColor = (status: string) => {
    const colors = {
      pending: "bg-yellow-100 text-yellow-800",
      confirmed: "bg-blue-100 text-blue-800",
      preparing: "bg-purple-100 text-purple-800",
      ready: "bg-green-100 text-green-800",
      completed: "bg-slate-100 text-slate-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return colors[status as keyof typeof colors] || colors.pending;
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>My Orders - CateringMS</title>
      </Head>

      <ClientNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-64 xl:pl-72 pt-16 lg:pt-0">
        <ClientPageHeader
          title="My orders"
          subtitle="Every booking, active or done. Tap one to track, request a change, or grab the invoice."
        />
        <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 md:py-8 lg:py-10">
          <div className="flex gap-2 mb-6">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              onClick={() => setFilter("all")}
            >
              All Orders
            </Button>
            <Button
              variant={filter === "active" ? "default" : "outline"}
              onClick={() => setFilter("active")}
            >
              Active
            </Button>
            <Button
              variant={filter === "completed" ? "default" : "outline"}
              onClick={() => setFilter("completed")}
            >
              Completed
            </Button>
          </div>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Orders ({filteredOrders.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-slate-600">Loading orders...</div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p className="text-slate-600 font-medium mb-2">No orders found</p>
                  <p className="text-sm text-slate-500">Try changing the filter or request a new quote</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredOrders.map((order) => {
                    // Wave 26: client-projected timeline per row.
                    // Computed from the order columns alone (no
                    // related-row fetch on this list page) so the
                    // client sees deposit / delivery / balance state
                    // at a glance without opening the detail view.
                    // Cancelled orders skip the timeline - the badge
                    // already says everything.
                    const clientTl = order.status !== "cancelled"
                      ? toClientTimeline(computeOrderTimeline({ order }))
                      : null;
                    return (
                    <div
                      key={order.id}
                      className={`p-4 md:p-6 border-2 rounded-lg hover:border-blue-300 transition-colors ${
                        clientTl?.blocked
                          ? "border-l-4 border-l-red-500 border-y-slate-200 border-r-slate-200 bg-red-50/30"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className="font-semibold text-lg text-slate-900">
                              {new Date(order.event_date).toLocaleDateString("en-US", {
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </h3>
                            <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                            {order.payment_status && (
                              <Badge
                                className={
                                  order.payment_status === "paid"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-amber-100 text-amber-800"
                                }
                              >
                                {order.payment_status}
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-1 text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              <span>{order.venue_address}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span>{order.guest_count} guests</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-4 h-4" />
                              <span>R{Number(order.total_amount || 0).toLocaleString()}</span>
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
                          <Link href={`/client-portal/tracking?orderId=${order.id}`}>
                            <Button size="sm" variant="outline" className="w-full sm:w-auto">
                              <Truck className="w-4 h-4 mr-2" />
                              Track
                            </Button>
                          </Link>
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
                                  setAmendingOrder(order);
                                  setAmendGuestCount(String(order.guest_count || ""));
                                  setAmendVenue(order.venue_address || "");
                                  setAmendNotes("");
                                }}
                              >
                                <Pencil className="w-4 h-4 mr-2" />
                                Request a change
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full sm:w-auto text-amber-700 border-amber-200 hover:bg-amber-50"
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
                          <Link href={clientOrderHref(order.id, { inPortal: true })}>
                            <Button size="sm" variant="outline" className="w-full sm:w-auto">
                              View details
                            </Button>
                          </Link>
                          {/* Book again - only on completed orders. Opens
                              the same RebookDialog the dashboard uses;
                              prefills via sourceOrder on the dialog side. */}
                          {order.status === "completed" && (
                            <Button
                              size="sm"
                              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => setRebookOrder(order)}
                            >
                              <RotateCcw className="w-4 h-4 mr-2" />
                              Book again
                            </Button>
                          )}
                        </div>
                      </div>
                      {/* Wave 26: per-row client timeline - compact
                          variant so it fits inside the row card
                          without stealing layout space. Renders the
                          "Next to do" banner + cluster pills + a
                          "Show all" chevron. Skipped on cancelled
                          orders (the badge already says it). */}
                      {clientTl && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <TimelineTrack timeline={clientTl} compact />
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
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

      {/* Amendment request dialog. Submits to /api/orders/amendment-request
          which sanitises the diff to allowed fields, verifies the
          amendment window via is_order_amendable, and inserts a
          pending row for the catering team to review. We pass only
          fields that actually changed so the diff is clean. */}
      <Dialog
        open={!!amendingOrder}
        onOpenChange={(o) => { if (!o) setAmendingOrder(null); }}
      >
        <DialogContent className="sm:max-w-lg">
          {amendingOrder && (
            <>
              <DialogHeader>
                <DialogTitle>Request a change to your order</DialogTitle>
                <DialogDescription>
                  Tell us what needs adjusting. The catering team reviews every request before applying it. Bigger changes (full menu rework, date moves) may need a chat - include a note below.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="guest-count">Guest count</Label>
                  <Input
                    id="guest-count"
                    type="number"
                    value={amendGuestCount}
                    onChange={(e) => setAmendGuestCount(e.target.value)}
                    placeholder={String(amendingOrder.guest_count)}
                  />
                  <p className="text-xs text-slate-500">
                    Currently: {amendingOrder.guest_count}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="venue">Venue address</Label>
                  <Input
                    id="venue"
                    value={amendVenue}
                    onChange={(e) => setAmendVenue(e.target.value)}
                    placeholder={amendingOrder.venue_address}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="notes">Notes for the team</Label>
                  <Textarea
                    id="notes"
                    rows={4}
                    value={amendNotes}
                    onChange={(e) => setAmendNotes(e.target.value)}
                    placeholder="Anything else they should know - dietary tweaks, drop-off time, decor, etc."
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setAmendingOrder(null)}
                  disabled={amendSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  disabled={amendSubmitting}
                  onClick={async () => {
                    if (!amendingOrder) return;
                    // Build the diff - only include keys that
                    // actually changed from the current values.
                    const proposed: Record<string, any> = {};
                    const newCount = Number(amendGuestCount);
                    if (Number.isFinite(newCount) && newCount > 0 && newCount !== amendingOrder.guest_count) {
                      proposed.guest_count = newCount;
                    }
                    if (amendVenue.trim() && amendVenue.trim() !== (amendingOrder.venue_address || "").trim()) {
                      proposed.venue_address = amendVenue.trim();
                    }
                    if (Object.keys(proposed).length === 0 && !amendNotes.trim()) {
                      toast({
                        title: "Nothing to change",
                        description: "Adjust at least one field or add a note.",
                        variant: "destructive",
                      });
                      return;
                    }
                    setAmendSubmitting(true);
                    try {
                      const resp = await fetch("/api/orders/amendment-request", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          order_id: amendingOrder.id,
                          proposed_changes: proposed,
                          client_notes: amendNotes.trim() || null,
                        }),
                      });
                      const j = await resp.json().catch(() => ({}));
                      if (!resp.ok) throw new Error(j?.error || "Could not submit request");
                      toast({
                        title: "Request submitted",
                        description: "The catering team will review and confirm shortly.",
                      });
                      setAmendingOrder(null);
                    } catch (err: any) {
                      toast({
                        title: "Could not submit",
                        description: err?.message || "Try again",
                        variant: "destructive",
                      });
                    } finally {
                      setAmendSubmitting(false);
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {amendSubmitting ? "Submitting..." : "Submit request"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

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
                  className="bg-amber-600 hover:bg-amber-700 text-white"
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