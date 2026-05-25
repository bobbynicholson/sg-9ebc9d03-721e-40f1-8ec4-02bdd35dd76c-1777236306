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
  special_instructions: string | null;
  description: string | null;
  menu_item?: { item_name: string | null; description: string | null; category: string | null } | null;
}

export function OrderItemsSection({ orderId, companyId, defaultOpen, forceOpen }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // ODOC: cost-stripped select. No unit_price / line_total /
        // unit_cost - staff-facing surface must never carry money
        // in the network response. Column names match the actual
        // order_items + menu_items schema (special_instructions,
        // not notes; menu_items.item_name, not name).
        const { data, error } = await (supabase as any)
          .from("order_items")
          .select("id, menu_item_id, item_name, quantity, special_instructions, description, menu_item:menu_item_id(item_name, description, category)")
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
            const name = it.menu_item?.item_name || it.item_name || "Item";
            const desc = it.menu_item?.description || it.description;
            return (
              <li key={it.id} className="py-3 flex items-start gap-3">
                <span className="text-sm font-semibold tabular-nums text-slate-700 min-w-[3rem]">
                  {Number(it.quantity || 0)}×
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    {name}
                    {it.menu_item?.category && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 align-middle">
                        {it.menu_item.category}
                      </span>
                    )}
                  </p>
                  {desc && <p className="text-xs text-slate-500 mt-0.5">{desc}</p>}
                  {it.special_instructions && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-1.5 mt-1.5">
                      <span className="font-semibold">Note: </span>{it.special_instructions}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CollapsibleSection>
  );
}
