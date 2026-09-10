/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: client-facing menu card.
 *
 * The staff KitchenSection is an internal prep view - it exposes prep-task
 * schedules with minute timings, a cleaning queue, recipe/equipment-page
 * deep links and "make-from-scratch" framing. None of that belongs in the
 * customer's order document. A client legitimately wants one thing here:
 * the menu they ordered (and the crockery/equipment included), rendered as
 * a clean read-only summary.
 *
 * Data access: reads order_items (+ the menu_item embed for category and
 * dietary tags) and equipment_bookings the same way the staff KitchenSection
 * does - a client session already clears RLS on both for an order it owns
 * (that read is what the my-orders + tracking pages rely on). Realtime keeps
 * the card live if an admin amends the order before the event.
 */
import { useEffect, useMemo, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { Utensils, Box, Clock, Loader2 } from "lucide-react";

interface Props {
  orderId: string;
  companyId: string;
  collectionTime: string | null;
  eventDate: string;
  eventTime: string | null;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  highlight?: boolean;
}

interface MenuItemRow {
  id: string;
  item_name: string;
  quantity: number | null;
  special_instructions: string | null;
  menu_item?: {
    category: string | null;
    dietary_tags: string[] | null;
  } | null;
}

interface EquipmentRow {
  id: string;
  quantity: number | null;
  equipment?: { name: string | null; category: string | null } | null;
}

const ITEMS_SELECT =
  "id, item_name, quantity, special_instructions, menu_item:menu_item_id(category, dietary_tags)";
const EQUIP_SELECT = "id, quantity, equipment:equipment_id(name, category)";

export function ClientMenuSection({
  orderId, companyId, collectionTime, eventDate, eventTime,
  defaultOpen, forceOpen, highlight,
}: Props) {
  const [items, setItems] = useState<MenuItemRow[]>([]);
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [itemsRes, eqRes] = await Promise.all([
          (supabase as any)
            .from("order_items")
            .select(ITEMS_SELECT)
            .eq("order_id", orderId)
            .order("item_name", { ascending: true }),
          (supabase as any)
            .from("equipment_bookings")
            .select(EQUIP_SELECT)
            .eq("order_id", orderId),
        ]);
        if (cancelled) return;
        setItems((itemsRes.data || []) as MenuItemRow[]);
        setEquipment((eqRes.data || []) as EquipmentRow[]);
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadClientMenu", orderId, companyId } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, companyId]);

  // Realtime - if an admin amends the order before the event, the menu
  // the client sees updates without a refresh.
  useEffect(() => {
    if (!orderId) return;
    const ch = supabase
      .channel(`order-doc-client-menu:${orderId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "order_items", filter: `order_id=eq.${orderId}` },
        async () => {
          const { data } = await (supabase as any)
            .from("order_items").select(ITEMS_SELECT).eq("order_id", orderId)
            .order("item_name", { ascending: true });
          setItems((data || []) as MenuItemRow[]);
        },
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "equipment_bookings", filter: `order_id=eq.${orderId}` },
        async () => {
          const { data } = await (supabase as any)
            .from("equipment_bookings").select(EQUIP_SELECT).eq("order_id", orderId);
          setEquipment((data || []) as EquipmentRow[]);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId]);

  const serviceDisplay = collectionTime || eventTime;
  const serviceLabel = serviceDisplay
    ? `${serviceDisplay.slice(0, 5)} on ${new Date(eventDate).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}`
    : null;

  const summary = loading
    ? "Loading..."
    : items.length === 0
      ? "Menu to be confirmed"
      : [
          `${items.length} item${items.length === 1 ? "" : "s"}`,
          equipment.length > 0 ? `${equipment.length} equipment line${equipment.length === 1 ? "" : "s"}` : null,
        ].filter(Boolean).join(" · ");

  const equipmentList = useMemo(
    () => equipment.filter((e) => e.equipment?.name),
    [equipment],
  );

  return (
    <CollapsibleSection
      id="section-kitchen"
      title="Your menu"
      summary={summary}
      icon={Utensils}
      accent="orange"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      highlight={highlight}
    >
      <div className="space-y-4">
        {serviceLabel && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-slate-50 border border-slate-200">
            <Clock className="w-4 h-4 text-slate-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold">Service time</p>
              <p className="text-sm font-semibold text-slate-900">{serviceLabel}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 p-2.5">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading your menu...
          </div>
        ) : (
          <>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
                <Utensils className="w-3 h-3 inline mr-1 -mt-0.5" />Menu
              </p>
              {items.length === 0 ? (
                <p className="text-sm text-slate-500">Your menu will appear here once it's confirmed.</p>
              ) : (
                <ul className="space-y-2">
                  {items.map((it) => {
                    const tags = (it.menu_item?.dietary_tags || []).filter(Boolean);
                    return (
                      <li key={it.id} className="flex items-start gap-3 p-3 rounded-md border border-slate-200 bg-white">
                        {it.quantity != null && (
                          <span className="flex-shrink-0 inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-md bg-slate-100 text-slate-800 text-sm font-semibold tabular-nums">
                            {it.quantity}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">{it.item_name}</p>
                          {it.menu_item?.category && (
                            <p className="text-xs text-slate-500 capitalize mt-0.5">{it.menu_item.category}</p>
                          )}
                          {it.special_instructions && (
                            <p className="text-xs text-slate-600 mt-1">{it.special_instructions}</p>
                          )}
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {tags.map((t) => (
                                <span key={t} className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full px-1.5 py-0.5 capitalize">
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {equipmentList.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
                  <Box className="w-3 h-3 inline mr-1 -mt-0.5" />Crockery &amp; equipment included
                </p>
                <ul className="space-y-1.5">
                  {equipmentList.map((eq) => (
                    <li key={eq.id} className="flex items-center gap-3 p-2.5 rounded-md border border-slate-200 bg-white">
                      {eq.quantity != null && (
                        <span className="flex-shrink-0 inline-flex items-center justify-center min-w-[2rem] h-6 px-2 rounded-md bg-slate-100 text-slate-800 text-xs font-semibold tabular-nums">
                          {eq.quantity}
                        </span>
                      )}
                      <span className="text-sm text-slate-800">{eq.equipment?.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </CollapsibleSection>
  );
}
