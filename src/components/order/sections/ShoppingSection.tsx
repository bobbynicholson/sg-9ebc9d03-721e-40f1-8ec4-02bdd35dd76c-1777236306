/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: shopping section - ingredients pulled from the
 * order_ingredient_demand view + any shopping_list_items linked
 * back to this order (via shopping_lists.source_period). Phase 1
 * shows demand + purchase status, no money.
 */
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { kitchenPrepService, type IngredientDemand } from "@/services/kitchenPrepService";
import { toLocalISO } from "@/lib/localDate";
import { canAccessDriverWidgets } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
import { ShoppingCart, Loader2, CheckCircle2 } from "lucide-react";

interface Props {
  orderId: string;
  companyId: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  highlight?: boolean;
}

interface DemandRow {
  inventory_item_id: string | null;
  name: string;
  unit: string | null;
  total_quantity: number | null;
  on_hand: number | null;
  shortfall: number | null;
}

export function ShoppingSection({ orderId, companyId, defaultOpen, forceOpen, highlight }: Props) {
  const { user, userRoles } = useAuth();
  const { toast } = useToast();
  const [demand, setDemand] = useState<DemandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [pushed, setPushed] = useState<{ id: string; itemCount: number } | null>(null);

  // ODOC Phase 2: shopping push gate - kitchen, shopping staff, admins.
  const canPush = (() => {
    const roles = Array.isArray(userRoles) ? userRoles : [];
    if (roles.includes(UserRole.KITCHEN_STAFF) || roles.includes(UserRole.SHOPPING_STAFF)) return true;
    return canAccessDriverWidgets(roles);
  })();

  const pushToShopping = async () => {
    if (!user?.id || !user?.company_id) return;
    setPushing(true);
    try {
      const items: IngredientDemand[] = demand
        .filter((d) => Number(d.shortfall || 0) > 0)
        .map((d) => ({
          name: d.name,
          unit: d.unit || "",
          total_quantity: Number(d.total_quantity || 0),
          on_hand: Number(d.on_hand || 0),
          shortfall: Number(d.shortfall || 0),
          inventory_item_id: d.inventory_item_id,
          used_by: [],
        }));
      if (items.length === 0) {
        toast({ title: "Nothing to push", description: "All in stock." });
        return;
      }
      const today = new Date();
      const horizon = new Date();
      horizon.setDate(today.getDate() + 14);
      const result = await kitchenPrepService.createShoppingListFromShortfall(
        user.company_id,
        user.id,
        items,
        { from: toLocalISO(today), to: toLocalISO(horizon) },
        `Order shortfall ${toLocalISO(today)}`,
      );
      if (result) {
        setPushed(result);
        toast({ title: "Pushed to shopping", description: `${result.itemCount} item${result.itemCount === 1 ? "" : "s"} on the new list` });
      }
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "pushShoppingFromDoc", orderId, companyId } });
      toast({ title: "Could not push", description: e?.message, variant: "destructive" });
    } finally {
      setPushing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Read the canonical view. UNIONs recipes + buy-and-sell.
        const { data, error } = await (supabase as any)
          .from("order_ingredient_demand")
          .select("inventory_item_id, name, unit, total_quantity, on_hand, shortfall")
          .eq("order_id", orderId);
        if (error) throw error;
        if (!cancelled) setDemand((data || []) as DemandRow[]);
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadShoppingSection", orderId, companyId } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, companyId]);

  const short = demand.filter((d) => Number(d.shortfall || 0) > 0);
  const ok = demand.length - short.length;
  const summary = loading
    ? "Loading..."
    : demand.length === 0
      ? "No ingredient demand"
      : short.length === 0
        ? `All ${demand.length} ingredient${demand.length === 1 ? "" : "s"} in stock`
        : `${short.length} short, ${ok} in stock`;

  return (
    <CollapsibleSection
      id="section-shopping"
      title="Shopping"
      summary={summary}
      icon={ShoppingCart}
      accent="amber"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      highlight={highlight}
    >
      {loading ? (
        <div className="flex items-center justify-center py-6 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading demand...
        </div>
      ) : demand.length === 0 ? (
        <p className="text-sm text-slate-500 py-2">No ingredient demand on this order. Add menu items with recipes to populate.</p>
      ) : (
        <div className="space-y-2">
          {short.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Shortfalls</p>
                {/* ODOC Phase 2: one-tap push of every shortfall on this
                    order to a new shopping list. Mirrors the kitchen
                    stock page's KS-B flow, scoped to this single order. */}
                {canPush && !pushed && (
                  <Button
                    size="sm"
                    onClick={pushToShopping}
                    disabled={pushing}
                    className="h-7 text-xs bg-amber-600 hover:bg-amber-700"
                  >
                    {pushing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <ShoppingCart className="w-3 h-3 mr-1" />}
                    Push to shopping
                  </Button>
                )}
                {pushed && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                    <CheckCircle2 className="w-3 h-3" />
                    Pushed ({pushed.itemCount})
                  </span>
                )}
              </div>
              <ul className="space-y-1">
                {short.map((d) => (
                  <li key={d.inventory_item_id || d.name} className="flex items-center justify-between gap-2 text-sm p-2 rounded border border-amber-200 bg-amber-50">
                    <span className="font-medium text-amber-900 truncate">{d.name}</span>
                    <span className="text-xs text-amber-800 tabular-nums">
                      need {Number(d.shortfall).toFixed(2)} {d.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {ok > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800 mt-3 mb-1.5">In stock</p>
              <ul className="space-y-1">
                {demand.filter((d) => Number(d.shortfall || 0) === 0).map((d) => (
                  <li key={d.inventory_item_id || d.name} className="flex items-center justify-between gap-2 text-sm p-2 rounded border border-emerald-200 bg-emerald-50/60">
                    <span className="inline-flex items-center gap-1.5 text-emerald-900">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span className="truncate">{d.name}</span>
                    </span>
                    <span className="text-xs text-emerald-800 tabular-nums">
                      need {Number(d.total_quantity || 0).toFixed(2)} {d.unit} · have {Number(d.on_hand || 0).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
