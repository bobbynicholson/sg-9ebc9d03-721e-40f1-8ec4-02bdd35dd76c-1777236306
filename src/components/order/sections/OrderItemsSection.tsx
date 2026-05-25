/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: order items - what's being delivered. The same line items
 * every viewer sees (kitchen needs to know what to cook, driver
 * needs to know what's in the delivery, client knows what they
 * ordered). Cost columns are explicitly excluded - this is the
 * universal-context section, no money.
 */
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { ShoppingBag, Loader2 } from "lucide-react";

interface Props {
  orderId: string;
  companyId: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
}

interface Item {
  id: string;
  menu_item_id: string | null;
  item_name: string | null;
  quantity: number | null;
  notes: string | null;
  menu_item?: { name: string | null; description: string | null } | null;
}

export function OrderItemsSection({ orderId, companyId, defaultOpen, forceOpen }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // ODOC: cost-stripped select. No unit_price / total_price /
        // anything that resolves to a rand value. Staff-facing
        // surface must never carry money in the network response.
        const { data, error } = await (supabase as any)
          .from("order_items")
          .select("id, menu_item_id, item_name, quantity, notes, menu_item:menu_item_id(name, description)")
          .eq("order_id", orderId)
          .order("created_at", { ascending: true });
        if (error) throw error;
        if (!cancelled) setItems((data || []) as Item[]);
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadOrderItems", orderId, companyId } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, companyId]);

  const summary = loading ? "Loading..." : `${items.length} item${items.length === 1 ? "" : "s"}`;
  return (
    <CollapsibleSection
      id="section-items"
      title="Order items"
      summary={summary}
      icon={ShoppingBag}
      accent="blue"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
    >
      {loading ? (
        <div className="flex items-center justify-center py-6 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading items...
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500 py-4">No items on this order yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((it) => {
            const name = it.menu_item?.name || it.item_name || "Item";
            const desc = it.menu_item?.description;
            return (
              <li key={it.id} className="py-3 flex items-start gap-3">
                <span className="text-sm font-semibold tabular-nums text-slate-700 min-w-[3rem]">
                  {Number(it.quantity || 0)}×
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{name}</p>
                  {desc && <p className="text-xs text-slate-500 mt-0.5">{desc}</p>}
                  {it.notes && <p className="text-xs text-amber-700 mt-1">Note: {it.notes}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CollapsibleSection>
  );
}
