/**
 * AvailableJobsCard -- Wave 43 Tier 2.
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
import { Calendar, Clock, MapPin, Users, Loader2, Hand, Inbox } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface OpenOrder {
  id: string;
  order_number: string | null;
  client_name: string | null;
  event_date: string | null;
  event_time: string | null;
  guest_count: number | null;
  venue_address: string | null;
  total_amount: number | null;
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
  // Refs used inside the realtime closure so we don't need to
  // re-subscribe on every render.
  const refreshRef = useRef<() => Promise<void>>();

  const refresh = useCallback(async () => {
    if (!companyId || !userId) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    const { data } = await (supabase as any)
      .from("orders")
      .select(
        "id, order_number, client_name, event_date, event_time, guest_count, venue_address, total_amount",
      )
      .eq("company_id", companyId)
      .in("status", ["confirmed", "preparing", "ready"])
      .is("assigned_driver_id", null)
      .gte("event_date", todayIso)
      .order("event_date", { ascending: true })
      .limit(20);
    setRows((data || []) as OpenOrder[]);
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
      .channel(`available-jobs-${companyId}`)
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
        description: error.message,
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
        not_authenticated: "Session expired -- sign in again.",
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
          <Inbox className="w-4 h-4 text-emerald-600" />
          Available jobs
          <Badge variant="outline" className="ml-2 bg-emerald-50 text-emerald-800">
            {rows.length} open
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((o) => {
          const isBusy = busyId === o.id;
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
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => onClaim(o.id)}
                disabled={isBusy}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Hand className="w-4 h-4" />
                )}
                <span className="ml-1">Claim</span>
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
