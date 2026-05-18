/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { orderService } from "@/services/orderService";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_CONFIG } from "@/components/admin/orders/statusConfig";
import { formatDate } from "@/lib/formatters";
import type { AppOrder } from "@/types/app";

interface Props {
  orderId: string;
  /**
   * Pass the parent's orders array so we can fall back to a
   * synthetic timeline (built from the order's own lifecycle
   * timestamps) when order_status_history is empty for a tenant
   * who hasn't wired up the trigger yet.
   */
  orders: AppOrder[];
}

/**
 * Order history timeline used inside the Order Details modal.
 *
 * Merges two data sources into one stream:
 *   - order_status_history rows (workflow transitions)
 *   - audit_logs rows (notes, shift edits, deletions)
 *
 * Filter pills toggle between 'All' / 'Status changes only' /
 * 'Audit + notes only' so the operator can isolate signal.
 *
 * Extracted from inline in src/pages/admin/orders.tsx (P2-13
 * Phase C - companion to the OrderDetailsModal extraction).
 */
export function OrderHistoryTimeline({ orderId, orders }: Props) {
  const [history, setHistory] = useState<any[]>([]);
  // Phase 17 #9: filter the merged timeline. 'all' shows the
  // raw stream (default), 'status' shows only the workflow
  // transitions (pending -> confirmed -> ... -> completed),
  // 'audit' shows only the audit_logs entries (notes, shift
  // edits, deletions). Helps the operator isolate signal.
  const [tlFilter, setTlFilter] = useState<"all" | "status" | "audit">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      // Phase 12 #5: pull status history AND audit_logs in parallel
      // so the timeline merges 'order moved to delivered' with
      // 'note added' / 'shift logged' / 'amendment approved' for a
      // single 'who did what when' read.
      const [statusResult, auditRes] = await Promise.all([
        orderService.getOrderStatusHistory(orderId),
        (supabase as any)
          .from("audit_logs")
          .select("id, action, created_at, details, user_id")
          .eq("entity_type", "order")
          .eq("entity_id", orderId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      let statusEvents: any[] = [];
      if (statusResult.success && Array.isArray(statusResult.data) && statusResult.data.length > 0) {
        statusEvents = statusResult.data;
      } else {
        // Fallback timeline: build a synthetic history from the order's
        // own lifecycle timestamps. The order_status_history table is
        // empty for tenants who haven't wired up the trigger yet, but
        // we still have a perfectly good timeline on the order row.
        const o = orders.find((x) => x.id === orderId) as any;
        if (o) {
          statusEvents = [
            { ts: o.created_at,       status: "pending",    note: "Order created" },
            { ts: o.confirmed_at,     status: "confirmed",  note: "Client confirmed" },
            { ts: o.prep_started_at,  status: "preparing",  note: "Kitchen started prep" },
            { ts: o.ready_at,         status: "ready",      note: "Ready for collection" },
            { ts: o.picked_up_at,     status: "in_transit", note: "Picked up by driver" },
            { ts: o.delivered_at,     status: "delivered",  note: "Delivered to venue" },
            { ts: o.completed_at,     status: "completed",  note: "Order closed out" },
            { ts: o.cancelled_at,     status: "cancelled",  note: o.cancellation_reason || "Order cancelled" },
          ]
            .filter((e) => !!e.ts)
            .map((e, i) => ({
              id: `synthetic-${orderId}-${i}`,
              status: e.status,
              created_at: e.ts,
              notes: e.note,
              changed_by_profile: null,
            }));
        }
      }

      // Map audit_logs entries onto the same shape as status events
      // so the timeline renderer can mix them. status='audit' is a
      // synthetic value - the renderer falls through to a neutral
      // STATUS_CONFIG default for any unknown status.
      const auditEvents = ((auditRes as any)?.data || []).map((a: any) => {
        const action = String(a.action || "").replace(/_/g, " ");
        const author = a.details?.author_name || null;
        return {
          id: `audit-${a.id}`,
          status: "audit",
          created_at: a.created_at,
          notes: author ? `${action} - ${author}` : action,
          changed_by_profile: null,
          details: a.details,
        };
      });

      const merged = [...statusEvents, ...auditEvents].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setHistory(merged);
      setLoading(false);
    };

    fetchHistory();
  }, [orderId, orders]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Clock className="w-12 h-12 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No status changes recorded yet</p>
      </div>
    );
  }

  const visibleHistory = history.filter((h) => {
    if (tlFilter === "all") return true;
    if (tlFilter === "audit") return h.status === "audit";
    // 'status' bucket - everything that isn't an audit entry.
    return h.status !== "audit";
  });

  return (
    <div className="space-y-4">
      {/* Phase 17 #9: filter pills. Toggles the merged stream
          between all events / status transitions only / audit
          entries only. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {([
          { k: "all",    label: "All" },
          { k: "status", label: "Status changes" },
          { k: "audit",  label: "Audit + notes" },
        ] as const).map((p) => (
          <button
            key={p.k}
            type="button"
            onClick={() => setTlFilter(p.k)}
            className={`inline-flex items-center rounded-full text-xs px-2.5 py-0.5 border ${
              tlFilter === p.k
                ? "border-blue-500 bg-blue-100 text-blue-800"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {visibleHistory.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">
          No entries match this filter.
        </p>
      ) : (
      <div className="relative">
        {/* Timeline Line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />

        {/* History Items */}
        <div className="space-y-6">
          {visibleHistory.map((item, index) => {
            const config = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
            const Icon = config.icon;
            const timestamp = new Date(item.created_at);
            const isFirst = index === 0;

            return (
              <div key={item.id} className="relative flex gap-4">
                {/* Timeline Dot */}
                <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  isFirst ? config.dotColor : "bg-slate-300"
                } ${isFirst ? "ring-4 ring-offset-2 " + config.dotColor.replace('bg-', 'ring-').replace('-500', '-300') : ""}`}>
                  <Icon className={`w-4 h-4 ${isFirst ? "text-white" : "text-slate-500"}`} />
                </div>

                {/* Content */}
                <div className="flex-1 pb-6">
                  <Card className={`border-l-4 ${isFirst ? "shadow-md" : ""}`} style={{ borderLeftColor: config.dotColor.replace('bg-', '#') }}>
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <Badge variant="outline" className={`${config.color} border mb-2`}>
                              {config.label}
                            </Badge>
                            <p className="text-sm font-medium text-slate-900">
                              Status changed to {config.label}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-500">
                              {formatDate(timestamp)}
                            </p>
                            <p className="text-xs text-slate-400">
                              {timestamp.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false })}
                            </p>
                          </div>
                        </div>

                        {item.notes && (
                          <p className="text-sm text-slate-600 bg-slate-50 rounded p-2 mt-2">
                            {item.notes}
                          </p>
                        )}

                        {item.changed_by_profile && (
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">
                              {item.changed_by_profile.full_name?.charAt(0) || item.changed_by_profile.email?.charAt(0) || "?"}
                            </div>
                            <div className="text-xs text-slate-600">
                              <span className="font-medium">{item.changed_by_profile.full_name || "User"}</span>
                              {item.changed_by_profile.email && (
                                <span className="text-slate-400"> • {item.changed_by_profile.email}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
