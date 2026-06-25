/**
 * PreEventCleanlinessPanel - CLN2-F (cleaning deep audit, CLN2-15).
 *
 * One accordion strip per tomorrow's order. Tap to expand, tick the
 * checklist items - optimistic UI write, supabase write underneath.
 * When the last required item ticks, the strip flips to "Ready",
 * status writes to cleaning_event_checklists, and the
 * cateringms:cleaning-ready window event fires so the kitchen
 * dashboard chip flips green within seconds (no refresh needed).
 *
 * Why an accordion strip rather than a grid table: the brief noted
 * "UI weight - mobile first". Five items per event times 6 events
 * is a 30-cell table on a tablet. Collapsed strips show event +
 * status; the cleaner expands only what they're working on right
 * now. Matches the dispatch screens pattern.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, ChevronDown, ChevronUp, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  ensureChecklistForOrder,
  listChecklistsForOrders,
  toggleChecklistItem,
  type ChecklistRow,
} from "@/services/cleaningChecklistService";
import { onCleaningReady } from "@/lib/events/cleaningEvents";

interface TomorrowOrder {
  id: string;
  event_name: string | null;
  client_name: string | null;
  event_time: string | null;
  event_date: string;
  guest_count: number | null;
}

function localTomorrowISO(): string {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

function statusTone(status: ChecklistRow["status"]) {
  if (status === "ready") return { ring: "border-emerald-200 bg-emerald-50", badge: "bg-emerald-100 text-emerald-800 border-emerald-300", label: "Ready" };
  if (status === "in_progress") return { ring: "border-amber-200 bg-amber-50", badge: "bg-amber-100 text-amber-800 border-amber-300", label: "In progress" };
  return { ring: "border-slate-200 bg-white", badge: "bg-slate-100 text-slate-700 border-slate-300", label: "Pending" };
}

function EventStrip({
  order,
  checklist,
  onToggle,
  busyItemIndex,
  expanded,
  onExpandToggle,
}: {
  order: TomorrowOrder;
  checklist: ChecklistRow | null;
  onToggle: (orderId: string, itemIndex: number) => void;
  busyItemIndex: number | null;
  expanded: boolean;
  onExpandToggle: () => void;
}) {
  const tone = statusTone(checklist?.status ?? "pending");
  const eventLabel = order.event_name || order.client_name || "Event";
  const checkedCount = checklist ? checklist.items.filter((i) => i.checked).length : 0;
  const totalCount = checklist ? checklist.items.length : 0;

  return (
    <div className={`rounded-lg border ${tone.ring} transition`}>
      <button
        type="button"
        onClick={onExpandToggle}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50/50 rounded-lg min-h-[44px]"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900 truncate">{eventLabel}</span>
            <Badge variant="outline" className={`tabular-nums ${tone.badge}`}>{tone.label}</Badge>
            {checklist && (
              <span className="text-xs text-slate-600 tabular-nums">
                {checkedCount}/{totalCount}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-2">
            {order.client_name && order.event_name ? <span className="truncate">{order.client_name}</span> : null}
            {order.event_time && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {order.event_time}
              </span>
            )}
            {order.guest_count ? <span>{order.guest_count} guests</span> : null}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-200/70 space-y-1">
          {!checklist && (
            <div className="text-xs text-slate-500 py-2 inline-flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading checklist
            </div>
          )}
          {checklist?.items.map((item, idx) => {
            const isBusy = busyItemIndex === idx;
            return (
              <label
                key={`${checklist.id}-${idx}`}
                className="flex items-center gap-3 py-2 min-h-[44px] rounded hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={item.checked}
                  disabled={isBusy}
                  onChange={() => onToggle(order.id, idx)}
                  className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className={`text-sm flex-1 ${item.checked ? "line-through text-slate-500" : "text-slate-800"}`}>
                  {item.label}
                  {item.required ? null : <span className="text-xs text-slate-400 ml-1">(optional)</span>}
                </span>
                {isBusy && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                {item.checked && !isBusy && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PreEventCleanlinessPanel() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<TomorrowOrder[]>([]);
  const [checklistsByOrder, setChecklistsByOrder] = useState<Record<string, ChecklistRow>>({});
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const tomorrowISO = useMemo(() => localTomorrowISO(), []);

  const load = useCallback(async () => {
    if (!user?.company_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("id, event_name, client_name, event_time, event_date, guest_count")
      .eq("company_id", user.company_id)
      .is("deleted_at", null)
      .eq("event_date", tomorrowISO)
      .in("status", ["confirmed", "preparing", "ready"])
      .order("event_time", { ascending: true });
    if (error) {
      console.warn("[PreEventCleanlinessPanel] orders load failed:", error);
      setOrders([]);
      setChecklistsByOrder({});
      setLoading(false);
      return;
    }
    const rows = (data || []) as TomorrowOrder[];
    setOrders(rows);

    const lists = await listChecklistsForOrders(
      user.company_id,
      rows.map((o) => o.id),
      "pre_event",
    );
    const map: Record<string, ChecklistRow> = {};
    for (const l of lists) map[l.order_id] = l;
    setChecklistsByOrder(map);
    setLoading(false);
  }, [user?.company_id, tomorrowISO]);

  useEffect(() => {
    void load();
  }, [load]);

  // Cross-tab refresh: another device ticked an item or marked it
  // ready. Re-pull so this strip stays in sync.
  useEffect(() => {
    return onCleaningReady(() => { void load(); });
  }, [load]);

  const handleExpand = async (orderId: string) => {
    const next = expandedOrderId === orderId ? null : orderId;
    setExpandedOrderId(next);
    // Lazy-create the checklist row on first expand so we don't
    // seed 50 rows for tenants who never open the section.
    if (next && !checklistsByOrder[orderId] && user?.company_id) {
      const created = await ensureChecklistForOrder(user.company_id, orderId, "pre_event");
      if (created) {
        setChecklistsByOrder((prev) => ({ ...prev, [orderId]: created }));
      }
    }
  };

  const handleToggle = async (orderId: string, itemIndex: number) => {
    const existing = checklistsByOrder[orderId];
    if (!existing) return;
    setBusyKey(`${orderId}:${itemIndex}`);

    // Optimistic update so the tick lands instantly on the cleaner's
    // tablet - the supabase write follows.
    const optimistic: ChecklistRow = {
      ...existing,
      items: existing.items.map((item, i) => i === itemIndex
        ? { ...item, checked: !item.checked }
        : item),
    };
    setChecklistsByOrder((prev) => ({ ...prev, [orderId]: optimistic }));

    const updated = await toggleChecklistItem(existing, itemIndex, user?.id || null);
    if (!updated) {
      // Revert on failure.
      setChecklistsByOrder((prev) => ({ ...prev, [orderId]: existing }));
    } else {
      setChecklistsByOrder((prev) => ({ ...prev, [orderId]: updated }));
    }
    setBusyKey(null);
  };

  const busyForOrder = (orderId: string): number | null => {
    if (!busyKey || !busyKey.startsWith(`${orderId}:`)) return null;
    return Number(busyKey.split(":")[1]);
  };

  return (
    <Card className="border-0 shadow-lg mb-8">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 flex-wrap">
          <ClipboardCheck className="w-5 h-5 text-brand-primary" />
          Pre-event cleanliness
          <Badge variant="outline" className="ml-1 text-xs">Tomorrow</Badge>
        </CardTitle>
        <p className="text-sm text-slate-600">
          Tick each step as it's done. The kitchen dashboard flips its chip green when every required item is checked.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-slate-500 inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading tomorrow's events
          </div>
        ) : orders.length === 0 ? (
          <div className="text-sm text-slate-500">No events scheduled for tomorrow.</div>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <EventStrip
                key={o.id}
                order={o}
                checklist={checklistsByOrder[o.id] || null}
                expanded={expandedOrderId === o.id}
                onExpandToggle={() => void handleExpand(o.id)}
                onToggle={(oid, idx) => void handleToggle(oid, idx)}
                busyItemIndex={busyForOrder(o.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PreEventCleanlinessPanel;
