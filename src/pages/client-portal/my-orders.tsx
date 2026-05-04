import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, Users, DollarSign, Package, Truck, ArrowLeft, Pencil, CalendarX, Receipt, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ClientNav } from "@/components/navigation/ClientNav";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { DynamicNav } from "@/components/DynamicNav";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";

interface Order {
  id: string;
  event_date: string;
  venue_address: string;
  guest_count: number;
  status: string;
  total_amount: number;
  payment_status?: string;
}

export default function MyOrders() {
  const { user, company } = useAuth() as any;
  const router = useRouter();
  // Slug-aware "Back to Dashboard" link -- keep nav inside the tenant
  // URL space when the page was reached via /[slug]/client-portal/my-orders.
  const resolvedSlug =
    (typeof router.query.company_slug === "string" && router.query.company_slug) ||
    (user as any)?.user_metadata?.last_company_slug ||
    "";
  const dashboardHref = resolvedSlug
    ? `/${resolvedSlug}/client-portal/dashboard`
    : "/client-portal/dashboard";
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  // Amendment request dialog state. The dialog is a single shared
  // instance reused across rows -- simpler than rendering one per
  // order, and the form is small enough that re-mounting on open
  // doesn't matter.
  const [amendingOrder, setAmendingOrder] = useState<Order | null>(null);
  const [amendGuestCount, setAmendGuestCount] = useState<string>("");
  const [amendVenue, setAmendVenue] = useState<string>("");
  const [amendNotes, setAmendNotes] = useState<string>("");
  const [amendSubmitting, setAmendSubmitting] = useState(false);
  // Cancel/postpone request dialog state.
  const [cancelRequestOrder, setCancelRequestOrder] = useState<Order | null>(null);
  const [cancelRequestType, setCancelRequestType] = useState<"cancel" | "postpone">("cancel");
  const [cancelPostponeDate, setCancelPostponeDate] = useState<string>("");
  const [cancelReason, setCancelReason] = useState<string>("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelPreview, setCancelPreview] = useState<any | null>(null);
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

  useEffect(() => {
    if (!user?.id) return;
    // Tenant-scope: a user might be a client of multiple catering
    // companies. The portal renders one tenant at a time -- always
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
        // possible -- collect every id rather than maybeSingle().
        const { data: clientRows } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", user.id)
          .eq("company_id", tenantCompanyId);
        const clientIds = ((clientRows as any[]) || []).map((r) => r.id);

        let ordersQuery = supabase
          .from("orders")
          .select("id, event_date, venue_address, guest_count, status, total_amount, payment_status")
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
    if (filter === "active") return o.status !== "completed" && o.status !== "cancelled";
    if (filter === "completed") return o.status === "completed";
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

      <DynamicNav userRole={UserRole.CLIENT} />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 lg:pl-64 xl:pl-72 pt-16 lg:pt-0">
        <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 md:py-8 lg:py-12">
          <div className="mb-6">
            <Link href={dashboardHref}>
              <Button variant="ghost" size="sm" className="mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-slate-900">My Orders</h1>
            <p className="text-slate-600 mt-1">View and manage all your catering orders</p>
          </div>

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
                  {filteredOrders.map((order) => (
                    <div
                      key={order.id}
                      className="p-4 md:p-6 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-colors"
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
                          <Link href={`/tracking/client?orderId=${order.id}`}>
                            <Button size="sm" variant="outline" className="w-full sm:w-auto">
                              <Truck className="w-4 h-4 mr-2" />
                              Track
                            </Button>
                          </Link>
                          {/* Request a change -- only when the order is
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
                                className="w-full sm:w-auto text-rose-700 border-rose-200 hover:bg-rose-50"
                                onClick={() => {
                                  setCancelRequestOrder(order);
                                  setCancelRequestType("cancel");
                                  setCancelPostponeDate("");
                                  setCancelReason("");
                                }}
                              >
                                <CalendarX className="w-4 h-4 mr-2" />
                                Cancel or postpone
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="outline">
                            View Details
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Footer />
      </div>

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
                  Tell us what needs adjusting. The catering team reviews every request before applying it. Bigger changes (full menu rework, date moves) may need a chat -- include a note below.
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
                    placeholder="Anything else they should know -- dietary tweaks, drop-off time, decor, etc."
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
                    // Build the diff -- only include keys that
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
                <DialogTitle className="text-rose-700 flex items-center gap-2">
                  <CalendarX className="w-5 h-5" />
                  Cancel or postpone your booking
                </DialogTitle>
                <DialogDescription>
                  Tell us what you'd like to do and the team will confirm by email. Postponing is often a softer landing than cancelling.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-600">What do you want to do?</Label>
                  <Select value={cancelRequestType} onValueChange={(v) => setCancelRequestType(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="postpone">Postpone to another date</SelectItem>
                      <SelectItem value="cancel">Cancel the booking</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {cancelRequestType === "postpone" ? (
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
                ) : null}

                {cancelRequestType === "cancel" && cancelPreview ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm space-y-1">
                    <div className="flex items-start gap-2">
                      <Receipt className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-600" />
                      <div>
                        Cancellation policy: event is in <strong>{cancelPreview.days_to_event} day{cancelPreview.days_to_event === 1 ? "" : "s"}</strong>.
                        {" "}Refund: <strong>R{Number(cancelPreview.refund_amount || 0).toFixed(2)}</strong> ({cancelPreview.refund_pct || 0}% of paid).
                      </div>
                    </div>
                    {cancelPreview.requires_owner_override ? (
                      <div className="flex items-start gap-2 text-rose-800 text-xs">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        Late cancellations need owner-level approval. Submit anyway and we'll come back to you.
                      </div>
                    ) : null}
                  </div>
                ) : null}

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
                  Keep the booking
                </Button>
                <Button
                  variant="destructive"
                  disabled={cancelSubmitting || (cancelRequestType === "postpone" && !cancelPostponeDate)}
                  onClick={async () => {
                    if (!cancelRequestOrder) return;
                    setCancelSubmitting(true);
                    try {
                      const resp = await fetch("/api/orders/cancellation-request", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          order_id: cancelRequestOrder.id,
                          request_type: cancelRequestType,
                          requested_postpone_date: cancelRequestType === "postpone" ? cancelPostponeDate : undefined,
                          reason: cancelReason.trim() || undefined,
                        }),
                      });
                      const j = await resp.json().catch(() => ({}));
                      if (!resp.ok) throw new Error(j?.error || "Could not submit");
                      toast({
                        title: cancelRequestType === "cancel" ? "Cancellation request submitted" : "Postponement request submitted",
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
    </>
  );
}