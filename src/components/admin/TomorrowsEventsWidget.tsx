/**
 * TomorrowsEventsWidget - compact list of confirmed events for
 * tomorrow.
 *
 * Phase 14 #3. Today's Pulse (Phase 9 #5) tells the operator
 * what's happening today. The evening-before review needs the
 * opposite - a quick read on tomorrow's load so the kitchen +
 * dispatch can prep the right amount of stock and roster the
 * right team.
 *
 * Wave 70.55 (owner brief 2026-05-22): two button changes on this
 * card. The "Print sheet" button used to link to
 * /admin/orders/delivery-sheet with no date param, so the page
 * defaulted to today - on a quiet today + busy tomorrow the
 * operator clicked through to an empty sheet. Fixed by passing
 * ?date={tomorrowIso} so the print sheet matches the widget
 * label. Per-row "View as client" button added so the operator
 * can pop the client-facing /c/order/{id}?t=... view in a new tab
 * when ringing the client about tomorrow.
 *
 * Self-hides when no events sit on tomorrow's calendar.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays, ArrowRight, Users as UsersIcon, MapPin, Truck, Eye, Loader2,
} from "lucide-react";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";
import { useToast } from "@/hooks/use-toast";

interface OrderRow {
  id: string;
  order_number: string | null;
  client_name: string | null;
  event_time: string | null;
  guest_count: number | null;
  venue_address: string | null;
  status: string | null;
  assigned_driver: { full_name: string | null } | null;
}

const fmtTime = (t: string | null): string => (t ? t.slice(0, 5) : "TBC");

export function TomorrowsEventsWidget({ companyId }: { companyId: string | null }) {
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  // Resolve tomorrow's ISO date ONCE per render. The Print sheet
  // button uses it as a query param and the data fetch uses it as
  // the event_date filter, so they stay in lockstep.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = toLocalISO(tomorrow);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("orders")
          .select(`
            id, order_number, client_name, event_time, guest_count,
            venue_address, status,
            assigned_driver:profiles!orders_assigned_driver_id_fkey ( full_name )
          `)
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("status", ["confirmed", "preparing", "ready"])
          .eq("event_date", tomorrowIso)
          .order("event_time", { ascending: true })
          .limit(8);
        if (error) {
          console.error("[TomorrowsEventsWidget] orders fetch failed:", error);
        }
        if (!cancelled) setRows((data || []) as OrderRow[]);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // tomorrowIso is derived from `new Date()` so re-evaluating each
  // render is fine; the dep we actually care about is companyId.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // View-as-client: mint a fresh token via the SECURITY DEFINER RPC
  // and pop the client-facing view in a new tab. Same path the
  // OrderDetailsModal + ClientLinkButton use, so behaviour is
  // identical wherever the operator triggers it.
  const previewAsClient = async (orderId: string) => {
    setPreviewingId(orderId);
    try {
      const resp = await fetch(`/api/orders/${orderId}/preview-as-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await resp.json();
      if (!resp.ok || !data?.url) {
        throw new Error(data?.error || "Could not generate client link");
      }
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const path = String(data.url);
      const link = path.startsWith("http") ? path : `${origin.replace(/\/$/, "")}${path}`;
      if (typeof window !== "undefined") {
        window.open(link, "_blank", "noopener,noreferrer");
      }
    } catch (e: any) {
      toast({
        title: "Couldn't open client view",
        description: e?.message || "Try again from the order drawer.",
        variant: "destructive",
      });
    } finally {
      setPreviewingId(null);
    }
  };

  if (!companyId) return null;
  if (!loading && rows.length === 0) return null;

  const totalGuests = rows.reduce((acc, r) => acc + Number(r.guest_count || 0), 0);

  return (
    <Card className="mb-6 border-indigo-200 bg-indigo-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="w-4 h-4 text-indigo-600" />
              Tomorrow's events
            </CardTitle>
            <CardDescription className="text-xs">
              Confirmed-and-onwards events on tomorrow's calendar. Earliest first.
            </CardDescription>
          </div>
          {/* Wave 70.55: print sheet now passes ?date={tomorrowIso}
              so the linked page reads the matching date instead of
              defaulting to today (which left operators staring at an
              empty sheet on a quiet today / busy tomorrow). */}
          <Link href={withSlug(`/admin/orders/delivery-sheet?date=${tomorrowIso}`)}>
            <Button variant="ghost" size="sm" className="text-indigo-700">
              Print sheet <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading...</p>
        ) : (
          <>
            <ul className="divide-y divide-indigo-100">
              {rows.map((o) => {
                const driverName = o.assigned_driver?.full_name || null;
                const isPreviewing = previewingId === o.id;
                return (
                  <li key={o.id} className="py-2">
                    <div className="flex items-start gap-3">
                      {/* Time + main row content - the whole inner
                          block stays a single click target into the
                          admin order drawer, same as before. */}
                      <Link
                        href={withSlug(`/admin/orders?orderId=${o.id}`)}
                        className="flex-1 min-w-0 flex items-baseline gap-3 hover:bg-indigo-50/60 rounded transition px-1"
                      >
                        <span className="text-base font-bold tabular-nums text-slate-900 w-14 shrink-0">
                          {fmtTime(o.event_time)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-900 truncate">{o.client_name || "—"}</span>
                            {o.order_number && (
                              <span className="text-[11px] text-slate-500 tabular-nums">{o.order_number}</span>
                            )}
                            <Badge variant="outline" className="text-[10px] capitalize">{o.status?.replace(/_/g, " ")}</Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
                            {o.guest_count != null && (
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <UsersIcon className="w-3 h-3" />{o.guest_count}
                              </span>
                            )}
                            {o.venue_address && (
                              <span className="inline-flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3" />{o.venue_address}
                              </span>
                            )}
                            {!driverName && (
                              <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                                <Truck className="w-3 h-3" /> No driver
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>

                      {/* Per-row View-as-client button. Mints a fresh
                          token via /api/orders/{id}/preview-as-client
                          and opens /c/order/{id}?t=... in a new tab
                          so the operator can sanity-check what the
                          client is seeing before they ring. Same path
                          OrderDetailsModal uses. */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] gap-1 shrink-0 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                        onClick={() => previewAsClient(o.id)}
                        disabled={isPreviewing}
                        title="Open the client-facing view of this booking in a new tab"
                      >
                        {isPreviewing
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Eye className="w-3 h-3" />}
                        View as client
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 pt-2 border-t border-indigo-100 text-[11px] text-slate-500 flex items-center justify-between">
              <span>{rows.length} event{rows.length === 1 ? "" : "s"}</span>
              {totalGuests > 0 && (
                <span className="tabular-nums font-medium text-slate-700">{totalGuests} guests total</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
