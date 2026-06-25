/**
 * AvailableJobsCard - Wave 43 Tier 2.
 *
 * Driver-facing list of confirmed orders in the same company that
 * are still unassigned. One-tap "Claim" calls the claim_order RPC
 * (atomic conditional update + audit + admin notification).
 *
 * Self-hides when nothing's available. Polls every 60s + listens
 * for realtime UPDATE on orders so a claim made on phone A drops
 * off phone B without a refresh.
 *
 * The Claim button is busy-disabled while the RPC runs and surfaces
 * the standard outcomes via toast:
 *   - already_claimed -> someone beat you to it (refresh kicks in)
 *   - not_eligible    -> order changed status mid-claim
 *   - ok              -> success, fires the onClaimed callback so the
 *                       parent can re-pull active deliveries
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar, Clock, MapPin, Users, Loader2, Hand, Inbox, Phone, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { orderDriverInterestService } from "@/services/orderDriverInterestService";

interface OpenOrder {
  id: string;
  order_number: string | null;
  client_name: string | null;
  client_phone: string | null;
  event_date: string | null;
  event_time: string | null;
  pickup_time: string | null;
  guest_count: number | null;
  venue_address: string | null;
  total_amount: number | null;
  special_instructions: string | null;
}

interface Props {
  /** Optional callback after a successful claim so the parent can re-fetch. */
  onClaimed?: () => void;
}

function fmtDate(d: string | null): string {
  if (!d) return "TBD";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

export function AvailableJobsCard({ onClaimed }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const companyId = user?.company_id;
  const userId = user?.id;
  const [rows, setRows] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [interestBusyId, setInterestBusyId] = useState<string | null>(null);
  const [interestedOrderIds, setInterestedOrderIds] = useState<Set<string>>(new Set());
  // Bobby's brief: drivers were tapping Claim without realising the
  // commitment. Two-step confirm with the order facts spelled out so
  // the driver consciously accepts the date / time / venue before the
  // RPC fires. Stash the candidate row here while the dialog is open.
  const [confirmRow, setConfirmRow] = useState<OpenOrder | null>(null);
  // Refs used inside the realtime closure so we don't need to
  // re-subscribe on every render.
  const refreshRef = useRef<() => Promise<void>>();

  const refresh = useCallback(async () => {
    if (!companyId || !userId) return;
    const todayIso = toLocalISO(new Date());
    const { data, error } = await (supabase as any)
      .from("orders")
      .select(
        "id, order_number, client_name, client_phone, event_date, event_time, pickup_time, guest_count, venue_address, total_amount, special_instructions",
      )
      .eq("company_id", companyId)
      .in("status", ["confirmed", "preparing", "ready"])
      .is("assigned_driver_id", null)
      .gte("event_date", todayIso)
      .order("event_date", { ascending: true })
      .limit(50);
    if (error) {
      console.error("[AvailableJobsCard] orders fetch failed:", error);
    }

    // Wave 70.12 - additional client-side time filter. The DB query
    // is event_date >= today, but for SAME-DAY orders the event
    // might already have happened (e.g. event_time was 14:30 and
    // it's now 16:30). Claiming a job that's already passed is
    // pointless and confusing - drop them here. We allow a 30-min
    // grace window past event_time so a driver who arrived late but
    // hasn't been formally assigned can still claim. After grace,
    // the job disappears from "Available" - admin can still
    // manually assign from /admin/orders if recovery is needed.
    const GRACE_MIN = 30;
    const now = new Date();
    const nowMs = now.getTime();
    const todayStr = todayIso;
    const filtered = ((data || []) as OpenOrder[]).filter((o) => {
      if (!o.event_date) return true;
      if (o.event_date !== todayStr) return true; // future date always shows
      // Same-day: compare event_time to now + grace.
      if (!o.event_time) return true; // no time set, can't time-filter
      const [h, m] = o.event_time.slice(0, 5).split(":").map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return true;
      const eventMs = new Date(o.event_date + "T" + o.event_time.slice(0, 5) + ":00").getTime();
      if (!Number.isFinite(eventMs)) return true;
      return eventMs + GRACE_MIN * 60_000 >= nowMs;
    });

    setRows(filtered);
    const interestIds = await orderDriverInterestService.getMyInterestedOrderIds(
      companyId,
      userId,
      filtered.map((row) => row.id),
    );
    setInterestedOrderIds(interestIds);
    setLoading(false);
  }, [companyId, userId]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!companyId) return;
    void refresh();
    const poll = setInterval(() => {
      refreshRef.current?.();
    }, 60000);
    // Realtime: any order assignment change invalidates the list.
    const channel = (supabase as any)
      .channel(`available-jobs-${companyId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `company_id=eq.${companyId}` },
        () => {
          refreshRef.current?.();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `company_id=eq.${companyId}` },
        () => {
          refreshRef.current?.();
        },
      )
      .subscribe();
    return () => {
      clearInterval(poll);
      try {
        (supabase as any).removeChannel(channel);
      } catch {
        /* no-op */
      }
    };
  }, [companyId, refresh]);

  const onClaim = async (orderId: string) => {
    setBusyId(orderId);
    const { data, error } = await (supabase as any).rpc("claim_order", {
      p_order_id: orderId,
    });
    setBusyId(null);
    if (error) {
      toast({
        title: "Couldn't claim",
        description: dbErrorMessage(error, { entity: "job" }),
        variant: "destructive",
      });
      return;
    }
    const result = (data || {}) as { ok?: boolean; reason?: string };
    if (!result.ok) {
      const reasonLabel: Record<string, string> = {
        already_claimed: "Another driver claimed this first.",
        not_eligible: "Order is no longer eligible to claim.",
        not_found: "Order is no longer available.",
        not_a_driver: "Your account isn't allowed to claim orders.",
        not_authenticated: "Session expired - sign in again.",
      };
      toast({
        title: "Couldn't claim",
        description: reasonLabel[result.reason || ""] || result.reason || "Try again.",
        variant: "destructive",
      });
      void refresh();
      return;
    }
    toast({ title: "Job claimed", description: "Added to your active deliveries." });
    void refresh();
    if (onClaimed) onClaimed();

    // Fire admin notification so the dispatch lead knows a driver
    // self-claimed without them having to assign. Non-critical:
    // failure is swallowed because the claim itself already
    // succeeded.
    try {
      const claimedRow = rows.find((r) => r.id === orderId);
      const { notificationService } = await import("@/services/notificationService");
      const driverName = (user as any)?.full_name || (user as any)?.email || "A driver";
      const orderLabel = claimedRow?.order_number || orderId.slice(0, 8);
      await notificationService.broadcastNotification({
        companyId,
        targetRoles: ["company_admin" as any, "admin" as any, "owner" as any],
        title: "Driver self-claimed an order",
        message: `${driverName} claimed ${orderLabel} (${claimedRow?.client_name || "client"}) for ${claimedRow?.event_date || "event"}.`,
        type: "driver_self_claimed" as any,
        priority: "normal",
        link: `/admin/orders?orderId=${orderId}`,
        relatedEntityType: "order",
        relatedEntityId: orderId,
      });
    } catch (notifErr) {
      console.warn("[AvailableJobsCard] self-claim broadcast failed:", notifErr);
    }
  };

  const onInterested = async (order: OpenOrder) => {
    if (!companyId || !userId) return;
    setInterestBusyId(order.id);
    try {
      await orderDriverInterestService.markInterested({
        companyId,
        orderId: order.id,
        driverId: userId,
      });
      setInterestedOrderIds((prev) => new Set(prev).add(order.id));
      toast({
        title: "Interest sent",
        description: `${order.order_number || order.client_name || "Order"} is flagged for dispatch.`,
      });
    } catch (error: any) {
      toast({
        title: "Could not mark interest",
        description: dbErrorMessage(error, {
          entity: "driver interest",
          fallback: "Refresh and try again.",
        }),
        variant: "destructive",
      });
    } finally {
      setInterestBusyId(null);
    }
  };

  if (!companyId || !userId) return null;
  if (loading) {
    return (
      <Card className="mb-6 border-0 shadow-md">
        <CardContent className="py-6 text-center text-sm text-slate-500">
          Loading available jobs...
        </CardContent>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card className="mb-6 border-0 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="w-4 h-4 text-slate-600" />
            Available jobs
          </CardTitle>
        </CardHeader>
        <CardContent className="py-4 text-center text-sm text-slate-500">
          No open jobs right now. Check back soon.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-0 shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="w-4 h-4 text-brand-primary" />
          Available jobs
          <Badge variant="outline" className="ml-2 bg-brand-primary/10 text-brand-primary">
            {rows.length} open
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((o) => {
          const isBusy = busyId === o.id;
          const isInterestBusy = interestBusyId === o.id;
          const isInterested = interestedOrderIds.has(o.id);
          return (
            <div
              key={o.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-white"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  {o.order_number && <span className="tabular-nums">{o.order_number}</span>}
                  <span className="truncate">{o.client_name || "Unknown client"}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {fmtDate(o.event_date)}
                    {o.event_time && (
                      <>
                        <Clock className="w-3 h-3 ml-1" />
                        <span className="tabular-nums">{o.event_time.slice(0, 5)}</span>
                      </>
                    )}
                  </span>
                  {/* Collection time is what the driver wants to know
                      first - "when do I leave the kitchen?". Render
                      with the tenant brand so it stands out from the
                      event time without introducing another role color. */}
                  {o.pickup_time && (
                    <span className="inline-flex items-center gap-1 text-brand-primary font-medium">
                      <Clock className="w-3 h-3" />
                      Collect {o.pickup_time.slice(0, 5)}
                    </span>
                  )}
                  {o.guest_count != null && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {o.guest_count} guests
                    </span>
                  )}
                  {o.venue_address && (
                    <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{o.venue_address}</span>
                    </span>
                  )}
                  {/* Wave 46 T5 - tap-to-call client + special
                      instructions inline so the driver knows what
                      they're walking into BEFORE they claim. */}
                  {o.client_phone && (
                    <a
                      href={`tel:${String(o.client_phone).replace(/\s+/g, "")}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-brand-primary hover:underline tabular-nums"
                    >
                      📞 {o.client_phone}
                    </a>
                  )}
                </div>
                {o.special_instructions && (
                  <p className="mt-1 text-[11px] text-rose-700 italic line-clamp-2">
                    {o.special_instructions}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant={isInterested ? "outline" : "secondary"}
                  onClick={() => onInterested(o)}
                  disabled={isInterestBusy || isInterested}
                  className={isInterested ? "border-brand-primary/20 text-brand-primary bg-brand-primary/10" : ""}
                >
                  {isInterestBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Star className="w-4 h-4" />
                  )}
                  <span className="ml-1">Interested</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => setConfirmRow(o)}
                  disabled={isBusy}
                  className="bg-brand-primary hover:bg-brand-primary/90"
                >
                  {isBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Hand className="w-4 h-4" />
                  )}
                  <span className="ml-1">Claim</span>
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>

      {/* Claim confirmation dialog. Surfaces the order facts the
          driver is committing to (date, time, venue, guests) so a
          stray thumb tap doesn't turn into an accepted delivery the
          driver hasn't read. */}
      <AlertDialog open={!!confirmRow} onOpenChange={(o) => { if (!o) setConfirmRow(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Hand className="w-5 h-5 text-brand-primary" />
              Claim this delivery?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Claiming locks the order to you. You become responsible for picking up from the kitchen and getting it to the client on time. Dispatch and the company admin are notified.
                </p>
                {confirmRow && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                    <p className="font-semibold text-slate-900">
                      {confirmRow.order_number ? `${confirmRow.order_number} - ` : ""}
                      {confirmRow.client_name || "Unknown client"}
                    </p>
                    <div className="flex items-center gap-2 text-slate-700">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{fmtDate(confirmRow.event_date)}</span>
                      {confirmRow.event_time && (
                        <>
                          <Clock className="w-3.5 h-3.5 ml-1" />
                          <span className="tabular-nums">{confirmRow.event_time.slice(0, 5)}</span>
                        </>
                      )}
                    </div>
                    {confirmRow.pickup_time && (
                      <div className="flex items-center gap-2 text-brand-primary font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          Collect from kitchen at{" "}
                          <span className="tabular-nums">
                            {confirmRow.pickup_time.slice(0, 5)}
                          </span>
                        </span>
                      </div>
                    )}
                    {confirmRow.venue_address && (
                      <div className="flex items-start gap-2 text-slate-700">
                        <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>{confirmRow.venue_address}</span>
                      </div>
                    )}
                    {confirmRow.guest_count != null && (
                      <div className="flex items-center gap-2 text-slate-700">
                        <Users className="w-3.5 h-3.5" />
                        <span>{confirmRow.guest_count} guests</span>
                      </div>
                    )}
                    {confirmRow.client_phone && (
                      <div className="flex items-center gap-2 text-slate-700">
                        <Phone className="w-3.5 h-3.5" />
                        <span className="tabular-nums">{confirmRow.client_phone}</span>
                      </div>
                    )}
                    {confirmRow.special_instructions && (
                      <p className="text-xs text-rose-700 italic mt-2">
                        {confirmRow.special_instructions}
                      </p>
                    )}
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  You can release the order later from your active deliveries if plans change. Repeated late releases may affect future dispatch.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = confirmRow?.id;
                setConfirmRow(null);
                if (id) void onClaim(id);
              }}
              className="bg-brand-primary hover:bg-brand-primary/90"
            >
              Yes, claim it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
