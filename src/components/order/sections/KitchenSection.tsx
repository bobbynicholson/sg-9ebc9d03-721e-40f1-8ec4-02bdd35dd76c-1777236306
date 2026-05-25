/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: kitchen section. Three things the kitchen actually needs to
 * see for a given order:
 *
 *   1. Collection / service time - the deadline that drives prep.
 *   2. Menu items to prep - what's on the order, with recipe deep
 *      links per item so the chef can pull the method without
 *      leaving the doc.
 *   3. Equipment to clean and ready - the bookings against this
 *      order, split into "needs cleaning before the driver arrives"
 *      vs "ready to load".
 *
 * Plus the existing prep-tasks list (cascaded from menu_item prep
 * times) with inline Start / Done actions.
 *
 * Everything sub'd realtime so the section stays live as cleaning
 * marks equipment, prep tasks tick over, etc.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { kitchenPrepService } from "@/services/kitchenPrepService";
import { canAccessDriverWidgets } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
import { useTenantHref } from "@/lib/tenantUrl";
import { RecipeDialog } from "./RecipeDialog";
import {
  ChefHat, Loader2, CheckCircle2, Clock, AlertTriangle, Play,
  Utensils, BookOpen, Box, Sparkles, ExternalLink,
} from "lucide-react";

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

interface PrepTask {
  id: string;
  task_type: string;
  status: string;
  start_at: string | null;
  end_at: string | null;
  station_id: string | null;
  duration_minutes: number | null;
  notes: string | null;
  station?: { name: string | null } | null;
  menu_item?: { name: string | null } | null;
}

interface OrderItemRow {
  id: string;
  item_name: string;
  quantity: number;
  special_instructions: string | null;
  menu_item_id: string | null;
  menu_item?: {
    id: string;
    item_name: string | null;
    category: string | null;
    prep_time_minutes: number | null;
    cook_time_minutes: number | null;
    instructions: string | null;
    recipe_name: string | null;
    dietary_tags: string[] | null;
    allergen_codes: string[] | null;
    is_buy_and_sell: boolean | null;
    fulfilment_type: string | null;
  } | null;
}

interface EquipmentBookingRow {
  id: string;
  quantity: number | null;
  status: string | null;
  booked_from: string | null;
  booked_until: string | null;
  returned_quantity: number | null;
  equipment?: {
    id: string;
    name: string | null;
    category: string | null;
    requires_cleaning: boolean | null;
    dishwasher_safe: boolean | null;
    cleaning_time_dishwasher_minutes: number | null;
    cleaning_time_manual_minutes: number | null;
  } | null;
}

const TASK_STATUS_TONES: Record<string, string> = {
  pending: "bg-slate-50 text-slate-700 border-slate-200",
  in_progress: "bg-orange-50 text-orange-700 border-orange-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  skipped: "bg-slate-50 text-slate-500 border-slate-200",
};

export function KitchenSection({
  orderId, companyId, collectionTime, eventDate, eventTime,
  defaultOpen, forceOpen, highlight,
}: Props) {
  const { user, userRoles } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const [tasks, setTasks] = useState<PrepTask[]>([]);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [recipeIds, setRecipeIds] = useState<Set<string>>(new Set());
  const [equipment, setEquipment] = useState<EquipmentBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  // ODOC: open inline recipe popover. Keeps the chef in the doc
  // rather than punting them to /admin/menu and losing context.
  const [recipeFor, setRecipeFor] = useState<{ menuItemId: string; itemName: string; quantity: number } | null>(null);

  // ODOC Phase 2: kitchen action gate. Kitchen staff + admins
  // can mark tasks. Other roles see read-only state.
  const canAct = (() => {
    const roles = Array.isArray(userRoles) ? userRoles : [];
    const role = user?.role as UserRole | undefined;
    if (role === UserRole.KITCHEN_STAFF) return true;
    if (roles.includes(UserRole.KITCHEN_STAFF)) return true;
    return canAccessDriverWidgets(roles); // admin / owner / super_admin pass through
  })();

  const handleStart = async (taskId: string) => {
    if (!user?.id) return;
    setActing(taskId);
    try {
      await kitchenPrepService.startTask(taskId, user.id);
      toast({ title: "Started", description: "Task in progress" });
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "startPrepTask", taskId, orderId, companyId } });
      toast({ title: "Could not start", description: e?.message, variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  const handleComplete = async (taskId: string) => {
    if (!user?.id) return;
    setActing(taskId);
    try {
      await kitchenPrepService.completeTask(taskId, user.id);
      toast({ title: "Done", description: "Task marked complete" });
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "completePrepTask", taskId, orderId, companyId } });
      toast({ title: "Could not complete", description: e?.message, variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  // ODOC: parallel load - prep tasks, order items (with menu_item
  // join), and equipment bookings. Recipes are pulled in a second
  // step keyed by menu_item_id so we can decorate items that have
  // an actual recipe row with a "Recipe" deep link.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [tasksRes, itemsRes, eqRes] = await Promise.all([
          (supabase as any)
            .from("kitchen_prep_tasks")
            .select("id, task_type, status, start_at, end_at, station_id, duration_minutes, notes, station:station_id(name), menu_item:menu_item_id(name)")
            .eq("order_id", orderId)
            .order("start_at", { ascending: true, nullsFirst: false }),
          (supabase as any)
            .from("order_items")
            .select("id, item_name, quantity, special_instructions, menu_item_id, menu_item:menu_item_id(id, item_name, category, prep_time_minutes, cook_time_minutes, instructions, recipe_name, dietary_tags, allergen_codes, is_buy_and_sell, fulfilment_type)")
            .eq("order_id", orderId)
            .order("item_name", { ascending: true }),
          (supabase as any)
            .from("equipment_bookings")
            .select("id, quantity, status, booked_from, booked_until, returned_quantity, equipment:equipment_id(id, name, category, requires_cleaning, dishwasher_safe, cleaning_time_dishwasher_minutes, cleaning_time_manual_minutes)")
            .eq("order_id", orderId),
        ]);
        if (cancelled) return;
        const tasksRows = (tasksRes.data || []) as PrepTask[];
        const itemRows = (itemsRes.data || []) as OrderItemRow[];
        const eqRows = (eqRes.data || []) as EquipmentBookingRow[];
        setTasks(tasksRows);
        setItems(itemRows);
        setEquipment(eqRows);
        // Second hop: which menu_items have a recipe row? Avoids
        // false-positive "Recipe" links on items that have a
        // recipe_name typed but no actual recipe stored.
        const menuIds = Array.from(new Set(itemRows.map((r) => r.menu_item_id).filter((x): x is string => !!x)));
        if (menuIds.length > 0) {
          const { data: recipeRows } = await (supabase as any)
            .from("recipes")
            .select("menu_item_id")
            .in("menu_item_id", menuIds);
          if (!cancelled) {
            setRecipeIds(new Set((recipeRows || []).map((r: any) => r.menu_item_id)));
          }
        } else {
          setRecipeIds(new Set());
        }
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadKitchenSection", orderId, companyId } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, companyId]);

  // Realtime - prep tasks tick over as kitchen marks them; equipment
  // bookings flip status as cleaning ticks items off. Cheap, debounce
  // not needed at this row count.
  useEffect(() => {
    if (!orderId) return;
    const ch = supabase
      .channel(`order-doc-kitchen:${orderId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "kitchen_prep_tasks", filter: `order_id=eq.${orderId}` },
        async () => {
          const { data } = await (supabase as any)
            .from("kitchen_prep_tasks")
            .select("id, task_type, status, start_at, end_at, station_id, duration_minutes, notes, station:station_id(name), menu_item:menu_item_id(name)")
            .eq("order_id", orderId)
            .order("start_at", { ascending: true, nullsFirst: false });
          setTasks((data || []) as PrepTask[]);
        },
      )
      .on("postgres_changes",
        { event: "*", schema: "public", table: "equipment_bookings", filter: `order_id=eq.${orderId}` },
        async () => {
          const { data } = await (supabase as any)
            .from("equipment_bookings")
            .select("id, quantity, status, booked_from, booked_until, returned_quantity, equipment:equipment_id(id, name, category, requires_cleaning, dishwasher_safe, cleaning_time_dishwasher_minutes, cleaning_time_manual_minutes)")
            .eq("order_id", orderId);
          setEquipment((data || []) as EquipmentBookingRow[]);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId]);

  const done = tasks.filter((t) => t.status === "done" || t.status === "completed").length;
  const itemsToPrep = items.filter((i) => !i.menu_item?.is_buy_and_sell).length;
  const equipNeedsClean = equipment.filter((b) => b.equipment?.requires_cleaning && (b.status === "pending" || b.status === "booked" || !b.status)).length;
  const summary = loading
    ? "Loading..."
    : tasks.length === 0 && items.length === 0
      ? "Nothing to prep yet"
      : [
          items.length > 0 ? `${items.length} menu line${items.length === 1 ? "" : "s"}` : null,
          tasks.length > 0 ? `${done}/${tasks.length} prep tasks done` : null,
          equipment.length > 0 ? `${equipment.length} equipment line${equipment.length === 1 ? "" : "s"}` : null,
        ].filter(Boolean).join(" · ");

  // Collection time intel - the kitchen's single most important number
  const collectionDisplay = collectionTime || eventTime;
  const collectionLabel = collectionDisplay
    ? `${collectionDisplay.slice(0, 5)} on ${new Date(eventDate).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}`
    : null;

  // Equipment split - cleaning queue vs ready to load. "Ready" is
  // anything that doesn't need cleaning OR whose booking is already
  // marked "cleaned"/"ready". Anything else lives in the cleaning
  // queue until the cleaner ticks it off.
  const equipNeedsCleanList = useMemo(
    () => equipment.filter((b) => b.equipment?.requires_cleaning && !(b.status === "cleaned" || b.status === "ready" || b.status === "loaded" || b.status === "delivered")),
    [equipment],
  );
  const equipReadyList = useMemo(
    () => equipment.filter((b) => !b.equipment?.requires_cleaning || b.status === "cleaned" || b.status === "ready" || b.status === "loaded" || b.status === "delivered"),
    [equipment],
  );

  return (
    <CollapsibleSection
      id="section-kitchen"
      title="Kitchen"
      summary={summary}
      icon={ChefHat}
      accent="orange"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
      highlight={highlight}
    >
      {collectionLabel && (
        <div className="flex items-start gap-2 mb-4 p-3 rounded-md bg-orange-50/80 border border-orange-200">
          <Clock className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs uppercase tracking-wider text-orange-800 font-semibold">Collection / service time</p>
            <p className="text-sm font-semibold text-orange-900">{collectionLabel}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading kitchen brief...
        </div>
      ) : (
        <div className="space-y-5">
          {/* ----- 1. Menu items to prep ----- */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Utensils className="w-3.5 h-3.5 text-orange-700" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-orange-800">
                Menu to prep {itemsToPrep > 0 && <span className="ml-1 text-orange-600">({itemsToPrep} make-from-scratch)</span>}
              </h3>
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No menu lines on this order.</p>
            ) : (
              <ul className="space-y-1.5">
                {items.map((it) => {
                  const mi = it.menu_item;
                  const isBuyAndSell = !!mi?.is_buy_and_sell;
                  const hasRecipe = it.menu_item_id ? recipeIds.has(it.menu_item_id) : false;
                  const totalMinutes = (mi?.prep_time_minutes || 0) + (mi?.cook_time_minutes || 0);
                  const tagBits: string[] = [];
                  if (mi?.category) tagBits.push(mi.category);
                  if (mi?.dietary_tags && mi.dietary_tags.length) tagBits.push(...mi.dietary_tags);
                  return (
                    <li
                      key={it.id}
                      className={`flex items-start gap-2 p-2.5 rounded-md border ${isBuyAndSell ? "bg-slate-50 border-slate-200" : "bg-white border-orange-200"}`}
                    >
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-100 text-orange-800 text-xs font-bold tabular-nums flex-shrink-0">
                        {it.quantity}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          {it.item_name}
                          {isBuyAndSell && (
                            <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">Buy-and-sell</span>
                          )}
                          {mi?.fulfilment_type === "outsourced" && (
                            <span className="ml-2 text-[10px] uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5">Outsourced</span>
                          )}
                        </p>
                        {/* Tag strip - category + dietary + allergens */}
                        {(tagBits.length > 0 || (mi?.allergen_codes && mi.allergen_codes.length > 0)) && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {tagBits.map((t) => (
                              <span key={t} className="text-[10px] text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                                {t}
                              </span>
                            ))}
                            {mi?.allergen_codes?.map((a) => (
                              <span key={a} className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                                Allergen: {a}
                              </span>
                            ))}
                          </div>
                        )}
                        {it.special_instructions && (
                          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-1.5 mt-1.5">
                            <span className="font-semibold">Special: </span>{it.special_instructions}
                          </p>
                        )}
                        {totalMinutes > 0 && !isBuyAndSell && (
                          <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                            {mi?.prep_time_minutes ? `Prep ${mi.prep_time_minutes}min` : ""}
                            {mi?.prep_time_minutes && mi?.cook_time_minutes ? " · " : ""}
                            {mi?.cook_time_minutes ? `Cook ${mi.cook_time_minutes}min` : ""}
                          </p>
                        )}
                      </div>
                      {/* Recipe popover. Opens inline so the chef
                          doesn't lose the order doc - shows scaled
                          ingredient quantities and method without
                          navigating away. */}
                      {hasRecipe && !isBuyAndSell && it.menu_item_id && (
                        <button
                          type="button"
                          onClick={() => setRecipeFor({
                            menuItemId: it.menu_item_id!,
                            itemName: it.item_name,
                            quantity: it.quantity,
                          })}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-orange-300 text-orange-800 hover:bg-orange-50 flex-shrink-0"
                          title="View recipe and ingredients scaled for this order"
                        >
                          <BookOpen className="w-3 h-3" />
                          Recipe
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ----- 2. Equipment to ready ----- */}
          {equipment.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Box className="w-3.5 h-3.5 text-orange-700" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-orange-800">
                    Equipment for collection
                    {equipNeedsClean > 0 && (
                      <span className="ml-2 text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5 normal-case tracking-normal font-normal">
                        {equipNeedsClean} needs cleaning
                      </span>
                    )}
                  </h3>
                </div>
                <Link
                  href={withSlug(`/admin/equipment?order=${orderId}`)}
                  className="text-[11px] text-orange-700 hover:underline inline-flex items-center gap-1"
                >
                  Equipment page <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              {equipNeedsCleanList.length > 0 && (
                <div className="mb-2">
                  <p className="text-[11px] uppercase tracking-wider text-rose-700 mb-1">Cleaning queue</p>
                  <ul className="space-y-1">
                    {equipNeedsCleanList.map((b) => {
                      const eq = b.equipment;
                      const minutes = eq?.dishwasher_safe
                        ? eq?.cleaning_time_dishwasher_minutes || null
                        : eq?.cleaning_time_manual_minutes || null;
                      return (
                        <li key={b.id} className="flex items-center gap-2 p-2 rounded border border-rose-200 bg-rose-50">
                          <Sparkles className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
                          <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 rounded-full bg-white border border-rose-200 text-rose-800 text-[10px] font-bold tabular-nums px-1.5 flex-shrink-0">
                            {b.quantity || 1}
                          </span>
                          <span className="text-sm font-medium text-rose-900 truncate flex-1">{eq?.name || "Equipment"}</span>
                          <span className="text-[11px] text-rose-700 tabular-nums flex-shrink-0">
                            {eq?.dishwasher_safe ? "Dishwasher" : "Manual"}
                            {minutes ? ` · ${minutes}min` : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {equipReadyList.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-emerald-700 mb-1">Ready to load</p>
                  <ul className="space-y-1">
                    {equipReadyList.map((b) => {
                      const eq = b.equipment;
                      return (
                        <li key={b.id} className="flex items-center gap-2 p-2 rounded border border-emerald-200 bg-emerald-50/70">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                          <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 rounded-full bg-white border border-emerald-200 text-emerald-800 text-[10px] font-bold tabular-nums px-1.5 flex-shrink-0">
                            {b.quantity || 1}
                          </span>
                          <span className="text-sm text-emerald-900 truncate flex-1">{eq?.name || "Equipment"}</span>
                          {!eq?.requires_cleaning && (
                            <span className="text-[10px] uppercase tracking-wider text-emerald-700">No clean needed</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ----- 3. Prep tasks ----- */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ChefHat className="w-3.5 h-3.5 text-orange-700" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-orange-800">Prep tasks</h3>
            </div>
            {tasks.length === 0 ? (
              <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900">No prep tasks yet</p>
                  <p className="text-xs text-amber-800 mt-0.5">Prep tasks auto-cascade once the order is confirmed. If they're still missing, kitchen settings may need attention.</p>
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {tasks.map((t) => {
                  const tone = TASK_STATUS_TONES[t.status?.toLowerCase()] || TASK_STATUS_TONES.pending;
                  const doneish = t.status === "done" || t.status === "completed";
                  const inProgress = t.status === "in_progress";
                  const isActing = acting === t.id;
                  return (
                    <li key={t.id} className={`flex items-center gap-3 p-2.5 rounded-md border ${tone}`}>
                      {doneish ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          <span className="capitalize">{t.task_type}</span>
                          {t.menu_item?.name && <span className="text-slate-500"> · {t.menu_item.name}</span>}
                        </p>
                        <p className="text-xs text-slate-500">
                          {t.station?.name && <span>{t.station.name}</span>}
                          {t.start_at && (
                            <span>{t.station?.name ? " · " : ""}{new Date(t.start_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</span>
                          )}
                          {t.duration_minutes && <span> · {t.duration_minutes}min</span>}
                        </p>
                      </div>
                      {canAct && !doneish && (
                        <div className="flex items-center gap-1">
                          {!inProgress && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStart(t.id)}
                              disabled={isActing}
                              className="h-7 text-xs"
                            >
                              {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Play className="w-3 h-3 mr-1" />Start</>}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => handleComplete(t.id)}
                            disabled={isActing}
                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                          >
                            {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle2 className="w-3 h-3 mr-1" />Done</>}
                          </Button>
                        </div>
                      )}
                      {(!canAct || doneish) && (
                        <span className="text-[10px] uppercase tracking-wider text-slate-600">{t.status}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ODOC: inline recipe viewer - opened from per-item Recipe
          buttons in the menu list above. */}
      <RecipeDialog
        open={!!recipeFor}
        onOpenChange={(open) => { if (!open) setRecipeFor(null); }}
        menuItemId={recipeFor?.menuItemId || null}
        itemName={recipeFor?.itemName || ""}
        orderQuantity={recipeFor?.quantity || 1}
      />
    </CollapsibleSection>
  );
}
