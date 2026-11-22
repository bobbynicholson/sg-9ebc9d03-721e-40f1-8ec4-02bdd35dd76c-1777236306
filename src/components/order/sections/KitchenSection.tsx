/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: kitchen section. Three things the kitchen actually needs to
 * see for a given order:
 *
 *   1. Driver pickup time - the deadline that drives prep.
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
import { OrderContributors } from "../OrderContributors";
import { sortByCourse } from "@/lib/menuCourses";
import { dedupeKitchenPrepTasks, formatKitchenPrepTaskType } from "@/lib/kitchen/prepTasks";
import { RecipeDialog } from "./RecipeDialog";
import { SectionSkeleton } from "./SectionSkeleton";
import operationStyles from "../OrderOperations.module.css";
import { HandoverToDriverPanel } from "@/components/kitchen/HandoverToDriverPanel";
import { KitchenMenuItemPreviewDialog, type KitchenMenuItemPreviewData } from "@/components/kitchen/KitchenMenuItemPreviewDialog";
import {
  ChefHat, Loader2, CheckCircle2, Clock, AlertTriangle, Play,
  Utensils, BookOpen, Box, Sparkles, ExternalLink, Image as ImageIcon,
} from "lucide-react";

interface Props {
  orderId: string;
  companyId: string;
  orderNumber?: string | null;
  pickupTime: string | null;
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
  started_at: string | null;
  completed_at: string | null;
  station_id: string | null;
  duration_min: number | null;
  notes: string | null;
  menu_item_name: string | null;
  assigned_chef_id: string | null;
  completed_by: string | null;
  station?: { name: string | null } | null;
}

interface OrderItemRow {
  id: string;
  item_name: string;
  /** What the line includes ("Plate, knife & fork."). */
  description?: string | null;
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
    image_url: string | null;
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
  pending: "bg-slate-100 text-slate-700",
  in_progress: "bg-amber-50 text-amber-900",
  done: "bg-emerald-50 text-emerald-800",
  completed: "bg-emerald-50 text-emerald-800",
  skipped: "bg-slate-100 text-slate-600",
};

function KitchenMenuPhoto({
  imageUrl,
  itemName,
}: {
  imageUrl: string | null | undefined;
  itemName: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!imageUrl || failed) {
    return (
      <div
        aria-hidden="true"
        title={`No photo available for ${itemName}`}
        className="flex size-11 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-slate-500"
      >
        <ImageIcon className="h-4 w-4" />
      </div>
    );
  }

  return (
    <span className="group relative block size-11 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
      <img
        src={imageUrl}
        alt={itemName}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
      />
    </span>
  );
}

export function KitchenSection({
  orderId, companyId, orderNumber, pickupTime, eventDate, eventTime,
  defaultOpen, forceOpen, highlight,
}: Props) {
  const { user, userRoles } = useAuth();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const [tasks, setTasks] = useState<PrepTask[]>([]);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [recipeIds, setRecipeIds] = useState<Set<string>>(new Set());
  // Who actually marked each task done (completed_by) -> display name,
  // so the operator can see the KITCHEN did the work (and when), not
  // just that someone flipped a status. Resolved from profiles.
  const [actorNames, setActorNames] = useState<Map<string, string>>(new Map());
  const [equipment, setEquipment] = useState<EquipmentBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<KitchenMenuItemPreviewData | null>(null);
  // ODOC: open inline recipe popover. Keeps the chef in the doc
  // rather than punting them to /admin/menu and losing context.
  const [recipeFor, setRecipeFor] = useState<{ menuItemId: string; itemName: string; quantity: number } | null>(null);

  // ODOC Phase 2: kitchen action gate. Kitchen staff + admins
  // can mark tasks. Other roles see read-only state.
  //
  // FIX: this used to read ONLY the `userRoles` array, which is often
  // empty/late-loading for admins viewing an order doc - so the Start/
  // Complete buttons silently never rendered and the chef/operator saw
  // tasks stuck on "pending" with nothing to click. Build the role set
  // from every signal we have (single role + active_role + the array)
  // so the gate works regardless of which one is populated.
  const canAct = (() => {
    const role = user?.role as UserRole | undefined;
    const activeRole = (user as { active_role?: UserRole } | null)?.active_role;
    const combined = [
      role,
      activeRole,
      ...(Array.isArray(userRoles) ? userRoles : []),
    ].filter(Boolean) as UserRole[];
    if (combined.includes(UserRole.KITCHEN_MANAGER) || combined.includes(UserRole.KITCHEN_STAFF)) return true;
    return canAccessDriverWidgets(combined); // admin / owner / super_admin pass through
  })();

  const handleStart = async (taskId: string) => {
    if (!user?.id) return;
    setActing(taskId);
    // Optimistic: flip the row now instead of waiting for the realtime
    // refetch round-trip (that wait is what felt laggy). Revert on error.
    const prev = tasks.find((t) => t.id === taskId);
    const nowIso = new Date().toISOString();
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, status: "in_progress", started_at: t.started_at ?? nowIso } : t)));
    try {
      await kitchenPrepService.startTask(taskId, user.id);
      toast({ title: "Started", description: "Task in progress" });
    } catch (e: any) {
      if (prev) setTasks((ts) => ts.map((t) => (t.id === taskId ? prev : t)));
      captureException(e, { tags: { route: "/order/[id]", step: "startPrepTask", taskId, orderId, companyId } });
      toast({ title: "Could not start", description: e?.message, variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  const handleComplete = async (taskId: string) => {
    if (!user?.id) return;
    setActing(taskId);
    const prev = tasks.find((t) => t.id === taskId);
    const nowIso = new Date().toISOString();
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, status: "done", completed_at: nowIso, completed_by: user.id } : t)));
    try {
      await kitchenPrepService.completeTask(taskId, user.id);
      toast({ title: "Done", description: "Task marked complete" });
    } catch (e: any) {
      if (prev) setTasks((ts) => ts.map((t) => (t.id === taskId ? prev : t)));
      captureException(e, { tags: { route: "/order/[id]", step: "completePrepTask", taskId, orderId, companyId } });
      toast({ title: "Could not complete", description: e?.message, variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  const handleGeneratePrepPlan = async () => {
    if (!user?.id || generatingPlan) return;
    setGeneratingPlan(true);
    try {
      const result = await kitchenPrepService.ensurePrepTasksForOrder(
        companyId,
        orderId,
        user.id,
        undefined,
        { allowActiveImportedOrder: true },
      );
      if (result.created > 0) {
        const { data } = await (supabase as any)
          .from("kitchen_prep_tasks")
          .select("id, task_type, status, start_at, started_at, completed_at, station_id, duration_min, notes, menu_item_name, assigned_chef_id, completed_by, station:station_id(name)")
          .eq("order_id", orderId)
          .is("deleted_at", null)
          .order("start_at", { ascending: true, nullsFirst: false });
        setTasks(dedupeKitchenPrepTasks((data || []) as PrepTask[]));
        toast({ title: "Prep plan ready", description: `${result.created} task${result.created === 1 ? "" : "s"} created and the kitchen team notified.` });
      } else {
        const description = result.skippedReason === "event_in_past"
          ? "This order's event date is in the past."
          : result.skippedReason === "auto_generate_disabled"
            ? "Automatic prep planning is disabled in Kitchen settings."
            : result.skippedReason === "no_menu_items_or_no_pickup_time"
              ? "Add menu items and a collection or event time first."
              : "No prep tasks could be created for this order.";
        toast({ title: "Prep plan not created", description, variant: "destructive" });
      }
    } catch (e: any) {
      captureException(e, { tags: { route: "/order/[id]", step: "generatePrepPlan", orderId, companyId } });
      toast({ title: "Could not generate prep plan", description: e?.message || "Try again.", variant: "destructive" });
    } finally {
      setGeneratingPlan(false);
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
            .select("id, task_type, status, start_at, started_at, completed_at, station_id, duration_min, notes, menu_item_name, assigned_chef_id, completed_by, station:station_id(name)")
            .eq("order_id", orderId)
            .is("deleted_at", null)
            .order("start_at", { ascending: true, nullsFirst: false }),
          (supabase as any)
            .from("order_items")
            .select("id, item_name, description, quantity, special_instructions, menu_item_id, menu_item:menu_item_id(id, item_name, category, prep_time_minutes, cook_time_minutes, instructions, recipe_name, dietary_tags, allergen_codes, image_url, is_buy_and_sell, fulfilment_type)")
            .eq("order_id", orderId)
            .order("item_name", { ascending: true }),
          (supabase as any)
            .from("equipment_bookings")
            .select("id, quantity, status, booked_from, booked_until, returned_quantity, equipment:equipment_id(id, name, category, requires_cleaning, dishwasher_safe, cleaning_time_dishwasher_minutes, cleaning_time_manual_minutes)")
            .eq("order_id", orderId),
        ]);
        if (cancelled) return;
        const tasksRows = dedupeKitchenPrepTasks((tasksRes.data || []) as PrepTask[]);
        const itemRows = (itemsRes.data || []) as OrderItemRow[];
        const eqRows = (eqRes.data || []) as EquipmentBookingRow[];
        setTasks(tasksRows);
        setItems(itemRows);
        setEquipment(eqRows);
        // Resolve "done by" names so completed tasks show who actually
        // did the work (kitchen chef vs an admin override) + when.
        const actorIds = Array.from(new Set(
          tasksRows.map((t) => t.completed_by).filter((x): x is string => !!x),
        ));
        if (actorIds.length > 0) {
          const { data: profRows } = await (supabase as any)
            .from("profiles")
            .select("id, full_name")
            .in("id", actorIds);
          if (!cancelled) {
            const m = new Map<string, string>();
            for (const p of (profRows || []) as Array<{ id: string; full_name: string | null }>) {
              if (p.full_name) m.set(p.id, p.full_name);
            }
            setActorNames(m);
          }
        } else {
          setActorNames(new Map());
        }
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
            .select("id, task_type, status, start_at, started_at, completed_at, station_id, duration_min, notes, menu_item_name, assigned_chef_id, completed_by, station:station_id(name)")
            .eq("order_id", orderId)
            .is("deleted_at", null)
            .order("start_at", { ascending: true, nullsFirst: false });
          setTasks(dedupeKitchenPrepTasks((data || []) as PrepTask[]));
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
  const orderedItems = useMemo(
    () => sortByCourse(items, (item) => item.menu_item?.category),
    [items],
  );
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

  // pickup_time is the kitchen's day-of-event deadline. collection_time
  // is the separate post-event equipment return.
  const collectionDisplay = pickupTime || eventTime;
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
      <OrderContributors orderId={orderId} area="kitchen" label="Helped by" />
      {collectionLabel && (
        <div className="mb-4 flex items-start gap-3 rounded-lg bg-slate-50 p-4">
          <Clock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-slate-600" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700">Driver collects from kitchen</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-950">{collectionLabel}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <SectionSkeleton rows={4} variant="rows" />
        </div>
      ) : (
        <div className={`${operationStyles.panel} space-y-6`}>
          {/* ----- 1. Menu items to prep ----- */}
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-950">
                <Utensils aria-hidden="true" className="size-4 shrink-0 text-slate-600" /> Menu to prep
              </h3>
              {itemsToPrep > 0 && <p className="text-sm text-slate-600">{itemsToPrep} made from scratch</p>}
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No menu lines on this order.</p>
            ) : (
              <ul className="space-y-2">
                {orderedItems.map((it) => {
                  const mi = it.menu_item;
                  const isBuyAndSell = !!mi?.is_buy_and_sell;
                  const hasRecipe = it.menu_item_id ? recipeIds.has(it.menu_item_id) : false;
                  const totalMinutes = (mi?.prep_time_minutes || 0) + (mi?.cook_time_minutes || 0);
                  const tagBits: string[] = [];
                  if (mi?.category) tagBits.push(mi.category);
                  if (mi?.dietary_tags && mi.dietary_tags.length) tagBits.push(...mi.dietary_tags);
                  const openItemPreview = () => {
                    setPhotoPreview({
                      url: mi?.image_url || null,
                      itemName: it.item_name,
                      quantity: it.quantity,
                      description: it.description || null,
                      category: mi?.category || null,
                      dietaryTags: mi?.dietary_tags || [],
                      allergens: mi?.allergen_codes || [],
                      specialInstructions: it.special_instructions,
                      prepMinutes: mi?.prep_time_minutes ?? null,
                      cookMinutes: mi?.cook_time_minutes ?? null,
                      isBuyAndSell,
                      isOutsourced: mi?.fulfilment_type === "outsourced",
                    });
                  };
                  return (
                    <li
                      key={it.id}
                      className="min-w-0 rounded-lg border border-slate-200 bg-white"
                    >
                      <button
                        type="button"
                        onClick={openItemPreview}
                        aria-label={`Open photo and kitchen details for ${it.item_name}`}
                        title="Open photo and kitchen details"
                        className="flex min-h-11 w-full min-w-0 items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary"
                      >
                        <KitchenMenuPhoto imageUrl={mi?.image_url} itemName={it.item_name} />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-base font-semibold leading-snug text-slate-950">{it.item_name}</span>
                          <span className="mt-0.5 block text-sm tabular-nums text-slate-600">
                            Qty {it.quantity}{isBuyAndSell && " · Buy-and-sell"}{mi?.fulfilment_type === "outsourced" && " · Outsourced"}
                          </span>
                        {it.description && it.description.trim() !== it.item_name.trim() && (
                          <span className="mt-1 block break-words text-sm text-slate-600">{it.description}</span>
                        )}
                        {/* Tag strip - category + dietary + allergens */}
                        {(tagBits.length > 0 || (mi?.allergen_codes && mi.allergen_codes.length > 0)) && (
                          <span className="mt-2 flex flex-wrap gap-1">
                            {tagBits.map((t) => (
                              <span key={t} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                                {t}
                              </span>
                            ))}
                            {mi?.allergen_codes?.map((a) => (
                              <span key={a} className="rounded-md bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900">
                                Allergen: {a}
                              </span>
                            ))}
                          </span>
                        )}
                        {it.special_instructions && (
                          <span className="mt-2 block break-words rounded-md bg-amber-50 px-2 py-1.5 text-sm text-amber-900">
                            <span className="font-semibold">Special instructions: </span>{it.special_instructions}
                          </span>
                        )}
                        {totalMinutes > 0 && !isBuyAndSell && (
                          <span className="mt-2 block text-sm tabular-nums text-slate-600">
                            {mi?.prep_time_minutes ? `Prep ${mi.prep_time_minutes} min` : ""}
                            {mi?.prep_time_minutes && mi?.cook_time_minutes ? " · " : ""}
                            {mi?.cook_time_minutes ? `Cook ${mi.cook_time_minutes} min` : ""}
                          </span>
                        )}
                        </span>
                      </button>
                      {/* Recipe popover. Opens inline so the chef
                          doesn't lose the order doc - shows scaled
                          ingredient quantities and method without
                          navigating away. */}
                      {hasRecipe && !isBuyAndSell && it.menu_item_id && (
                        <div className="border-t border-slate-100 px-3">
                        <button
                          type="button"
                          onClick={() => setRecipeFor({
                            menuItemId: it.menu_item_id!,
                            itemName: it.item_name,
                            quantity: it.quantity,
                          })}
                          className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-md px-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-primary"
                          aria-label={`View recipe for ${it.item_name}`}
                          title="View recipe and ingredients scaled for this order"
                        >
                          <BookOpen aria-hidden="true" className="size-4 shrink-0" />
                          View recipe
                        </button>
                        </div>
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
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-slate-950">
                    <Box aria-hidden="true" className="size-4 shrink-0 text-slate-600" /> Equipment for collection
                  </h3>
                  {equipNeedsClean > 0 && <p className="mt-1 text-sm font-medium text-amber-800">{equipNeedsClean} needs cleaning</p>}
                </div>
                <Link
                  href={withSlug(`/admin/equipment?order=${orderId}`)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Equipment page <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
                </Link>
              </div>

              {equipNeedsCleanList.length > 0 && (
                <div className="mb-3">
                  <h4 className="mb-1 text-sm font-semibold text-slate-800">Cleaning queue</h4>
                  <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 px-3">
                    {equipNeedsCleanList.map((b) => {
                      const eq = b.equipment;
                      const minutes = eq?.dishwasher_safe
                        ? eq?.cleaning_time_dishwasher_minutes || null
                        : eq?.cleaning_time_manual_minutes || null;
                      return (
                        <li key={b.id} className="flex items-start gap-2 py-2.5">
                          <span className="inline-flex min-w-7 shrink-0 items-center justify-center rounded-md bg-amber-50 px-1.5 py-0.5 text-sm font-semibold tabular-nums text-amber-900">
                            {b.quantity || 1}
                          </span>
                          <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                            <span className="min-w-0 break-words font-medium text-slate-900">{eq?.name || "Equipment"}</span>
                            <span className="tabular-nums text-slate-600">
                              {eq?.dishwasher_safe ? "Dishwasher" : "Manual"}
                              {minutes ? ` · ${minutes} min` : ""}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {equipReadyList.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-slate-800">Ready to load</h4>
                  <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 px-3">
                    {equipReadyList.map((b) => {
                      const eq = b.equipment;
                      return (
                        <li key={b.id} className="flex items-start gap-2 py-2.5">
                          <span className="inline-flex min-w-7 shrink-0 items-center justify-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-sm font-semibold tabular-nums text-emerald-800">
                            {b.quantity || 1}
                          </span>
                          <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                            <span className="min-w-0 break-words font-medium text-slate-900">{eq?.name || "Equipment"}</span>
                            {!eq?.requires_cleaning && <span className="text-slate-600">No cleaning needed</span>}
                          </div>
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
            <div className="mb-2 flex items-center gap-2">
              <ChefHat aria-hidden="true" className="size-4 shrink-0 text-slate-600" />
              <h3 className="text-base font-semibold text-slate-950">Prep tasks</h3>
            </div>
            {tasks.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-md bg-amber-50 border border-amber-200">
                <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900">No prep tasks yet</p>
                  <p className="text-xs text-amber-800 mt-0.5">Create the prep plan from this order's menu, then assign, start and complete the work.</p>
                </div>
                </div>
                {canAct && (
                  <Button type="button" onClick={handleGeneratePrepPlan} disabled={generatingPlan} className="h-auto min-h-11 max-w-full whitespace-normal">
                    {generatingPlan ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                    Generate prep plan
                  </Button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 px-3">
                {tasks.map((t) => {
                  const tone = TASK_STATUS_TONES[t.status?.toLowerCase()] || TASK_STATUS_TONES.pending;
                  const doneish = t.status === "done" || t.status === "completed";
                  const inProgress = t.status === "in_progress";
                  const isActing = acting === t.id;
                  return (
                    <li key={t.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 py-3">
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                      {doneish ? (
                        <CheckCircle2 aria-hidden="true" className="mt-1 size-4 shrink-0 text-emerald-700" />
                      ) : (
                        <Clock aria-hidden="true" className="mt-1 size-4 shrink-0 text-slate-600" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="min-w-0 break-words text-base font-medium leading-snug text-slate-900">
                          <span>{formatKitchenPrepTaskType(t.task_type)}</span>
                          {t.menu_item_name && <span className="text-slate-500"> · {t.menu_item_name}</span>}
                        </p>
                        <p className="mt-0.5 text-sm text-slate-600">
                          {t.station?.name && <span>{t.station.name}</span>}
                          {t.start_at && (
                            <span>{t.station?.name ? " · " : ""}{new Date(t.start_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</span>
                          )}
                          {t.duration_min && <span> · {t.duration_min}min</span>}
                        </p>
                        {/* Accountability: who actually marked this done +
                            when, so an admin can see the KITCHEN did the
                            work (or that it was an admin override) rather
                            than just a status flip. */}
                        {doneish && t.completed_at && (
                          <p className="mt-1 text-sm text-emerald-800">
                            Done{t.completed_by && actorNames.get(t.completed_by) ? ` by ${actorNames.get(t.completed_by)}` : ""}
                            {" · "}
                            {new Date(t.completed_at).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                        {inProgress && t.started_at && (
                          <p className="mt-1 text-sm text-amber-800">
                            Started · {new Date(t.started_at).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                      </div>
                      {canAct && !doneish && (
                        <div className={operationStyles.rowActions}>
                          {!inProgress && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleStart(t.id)}
                              disabled={isActing}
                              className="min-h-11"
                            >
                              {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Play className="w-3 h-3 mr-1" />Start</>}
                            </Button>
                          )}
                          <Button
                            type="button"
                            onClick={() => handleComplete(t.id)}
                            disabled={isActing}
                            className="min-h-11"
                          >
                            {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle2 className="w-3 h-3 mr-1" />Done</>}
                          </Button>
                        </div>
                      )}
                      {(!canAct || doneish) && (
                        <span className={`rounded-full px-2 py-0.5 text-sm font-medium capitalize ${tone}`}>{t.status?.replace(/_/g, " ") || "Pending"}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Kitchen -> driver handover. Keep this available to kitchen and
          admin actors on every active order: an order can be cooked and
          ready while its broader status still reads "confirmed", and the
          old status gate hid the only handover control in that case. The
          panel itself shows whether dispatch still needs a driver. */}
      {canAct && (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <h3 className="mb-2 text-base font-semibold text-slate-950">Hand over to driver</h3>
          <HandoverToDriverPanel orderId={orderId} orderNumber={orderNumber || orderId} />
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
      <KitchenMenuItemPreviewDialog item={photoPreview} onOpenChange={(open) => { if (!open) setPhotoPreview(null); }} />
    </CollapsibleSection>
  );
}
