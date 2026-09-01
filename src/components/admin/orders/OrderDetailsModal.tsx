/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ShoppingCart, Calendar, Users, Banknote, Eye, Edit, ChevronRight,
  Clock, CheckCircle2, Package, MapPin, AlertCircle, Save, X, FileText,
  Receipt, Pause, Copy, Star, RefreshCw, MoreHorizontal, Phone,
  MessageCircle, Mail, ArrowRight, Download, Trash2, Play,
  UserPlus,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { useRouter } from "next/router";
import { useToast } from "@/hooks/use-toast";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { supabase } from "@/integrations/supabase/client";
import { emitOrderUpdated, onOrderUpdated } from "@/lib/events/orderEvents";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { formatDate } from "@/lib/formatters";
import { toLocalISO } from "@/lib/localDate";
import { downloadOrderIcs } from "@/lib/orderToIcs";
import { staffOrderHref } from "@/lib/orderUrls";
import {
  deriveOrderIntelligence,
  summariseAutoEmailsByOrder,
  type OrderAutoEmailSummary,
} from "@/lib/orderIntelligence";
import { computeOrderTimeline, type OrderTimeline } from "@/services/order/orderTimeline";
import { computeOrderReadiness, type OrderReadiness } from "@/services/order/orderReadiness";
import { orderService } from "@/services/orderService";
import { syncOrderArtifacts } from "@/services/order/orderSyncService";
import { logPiiAccess } from "@/services/piiAccessLogService";
import { getEquipmentAvailability } from "@/services/equipmentAvailabilityService";
import type { BookingFacts as BookingFactsType } from "@/services/booking/bookingFacts";
import type { AppOrder, MenuItem, EquipmentItem } from "@/types/app";
import { BookingFacts } from "@/components/booking/BookingFacts";
import { TimelineTrack } from "@/components/admin/orders/TimelineTrack";
import { AssignedShiftsPanel } from "@/components/admin/orders/AssignedShiftsPanel";
import { OrderReadinessChip } from "@/components/admin/orders/OrderReadinessChip";
import { OrderTimesStrip } from "@/components/admin/orders/OrderTimesStrip";
import { OrderHistoryTimeline } from "@/components/admin/orders/OrderHistoryTimeline";
import { OrderMessagesTab } from "@/components/admin/orders/OrderMessagesTab";
import { AmendmentsTab } from "@/components/admin/AmendmentsTab";
import { CancellationRequestsTab } from "@/components/admin/CancellationRequestsTab";
import { EquipmentTypeahead, type EquipmentPick } from "@/components/admin/EquipmentTypeahead";
import { MenuItemTypeahead, type MenuItemPick } from "@/components/admin/MenuItemTypeahead";
import { ClientLinkButton } from "@/components/admin/ClientLinkButton";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { OrderNotesThread } from "@/components/admin/OrderNotesThread";
import { OutsourcedFulfilmentPanel } from "@/components/admin/orders/OutsourcedFulfilmentPanel";
import { trackRecentlyViewed } from "@/components/admin/RecentlyViewedWidget";
import {
  STATUS_CONFIG,
  WORKFLOW_STAGES,
  getStageStatus,
  getNextStage,
} from "@/components/admin/orders/statusConfig";

interface Props {
  selectedOrder: AppOrder | null;
  isModalOpen: boolean;
  orders: AppOrder[];
  user: any;
  loadOrders: () => Promise<void> | void;
  /** Raw setters - preserved as props so the modal body can call them
   *  directly without a wrapper layer. The P2-13 Phase C migration
   *  guide called for semantic callbacks (onClose, etc); during
   *  execution we kept the direct setters as well to avoid touching
   *  every call site inside the 1,700-line body. */
  setSelectedOrder: (o: AppOrder | null) => void;
  setIsModalOpen: (open: boolean) => void;
  setCancelDialogOpen: (open: boolean) => void;
  setDuplicateDialogOpen: (open: boolean) => void;
  setDuplicateDate7DayDefault: (d: string) => void;
  setPauseDialogOrderId: (id: string | null) => void;
  withSlug: (href: string) => string;
}

/**
 * Order Details Modal.
 *
 * Six tabs (details / menu / equipment / amendments / cancellations /
 * history), inline edit mode, star rating, status workflow, plus the
 * nested price-adjust confirmation dialog. Reads the parent's
 * selectedOrder + orders array; mutations bubble back up via the
 * loadOrders + onClose + onSelectOrder + onOpen* callbacks.
 *
 * Extracted from inline in src/pages/admin/orders.tsx (P2-13 Phase C,
 * per docs/audits/p2-13-orders-phase-c-migration-guide.md).
 */
export function OrderDetailsModal({
  selectedOrder,
  isModalOpen,
  orders,
  user,
  loadOrders,
  setSelectedOrder,
  setIsModalOpen,
  setCancelDialogOpen,
  setDuplicateDialogOpen,
  setDuplicateDate7DayDefault,
  setPauseDialogOrderId,
  withSlug,
}: Props) {
  const { toast } = useToast();
  const router = useRouter();
  // In-app confirm dialog (replaces window.confirm, which is bare OS
  // chrome and is suppressed in some embedded webviews). confirmDialog
  // is rendered alongside the modal at the bottom of the return.
  const { confirm, confirmDialog } = useConfirmDialog();
  const companyId = (user as any)?.company_id || null;
  const tenantCurrency = useTenantCurrency(companyId);
  const C = tenantCurrency.symbol;
const [editedOrder, setEditedOrder] = useState<AppOrder | null>(null);
const [saving, setSaving] = useState(false);

// Wave 70.42 - conductor view facts. Fetched from the role-
// scoped API endpoint when the modal opens for an order.
// Refetches on cateringms:order-updated so the cross-role
// panels stay in sync when other surfaces mutate things
// (driver assigned via dispatch, prep tasks generated, etc).
const [bookingFacts, setBookingFacts] = useState<BookingFactsType | null>(null);
useEffect(() => {
  if (!selectedOrder?.id || !isModalOpen) { setBookingFacts(null); return; }
  let cancelled = false;
  const load = async () => {
    try {
      const r = await fetch(`/api/bookings/${selectedOrder.id}/facts`, { credentials: "include" });
      if (!r.ok) return;
      const data = await r.json();
      if (cancelled) return;
      if (data?.facts) setBookingFacts(data.facts as BookingFactsType);
    } catch { /* non-blocking */ }
  };
  void load();
  // Refetch on cross-page mutation events. Per-order filter so
  // we don't spam refetches when other orders update.
  const off = onOrderUpdated(() => { void load(); }, { orderId: selectedOrder.id });
  return () => { cancelled = true; off(); };
}, [selectedOrder?.id, isModalOpen]);
// "Hey, the price won't scale automatically" confirmation when
// guest_count is being changed in edit mode.
const [priceAdjustOpen, setPriceAdjustOpen] = useState(false);

// Wave 70.34 - moved from parent-level state. Click Edit /
// click a rating star used to setState at parent, which
// re-rendered the page and remounted this nested component,
// wiping all internal state and flashing the UI. Keeping these
// local means the parent stays still when only the modal needs
// to update.
const [editMode, setEditMode] = useState(false);
const [orderRating, setOrderRating] = useState<number | null>(null);
const [ratingBusy, setRatingBusy] = useState(false);

// Rating fetch + setter (Phase 18 #10). Audit_logs is the
// source-of-truth ledger for per-order ratings - latest entry
// wins. Reads on modal open, writes optimistically with rollback.
useEffect(() => {
  if (!selectedOrder?.id || !isModalOpen) { setOrderRating(null); return; }
  let cancelled = false;
  (async () => {
    try {
      const { data } = await (supabase as any)
        .from("audit_logs")
        .select("details, created_at")
        .eq("entity_type", "order")
        .eq("entity_id", selectedOrder.id)
        .eq("action", "order_rating_set")
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      const r = Number((data?.[0] as any)?.details?.rating);
      setOrderRating(Number.isFinite(r) && r >= 1 && r <= 5 ? r : null);
    } catch { /* non-blocking */ }
  })();
  return () => { cancelled = true; };
}, [selectedOrder?.id, isModalOpen]);

const setQuickRating = async (rating: number) => {
  if (!selectedOrder?.id || ratingBusy) return;
  if (rating === orderRating) return;
  setRatingBusy(true);
  const prev = orderRating;
  setOrderRating(rating); // optimistic
  try {
    const { error } = await (supabase as any).from("audit_logs").insert({
      entity_type: "order",
      entity_id: selectedOrder.id,
      action: "order_rating_set",
      company_id: (selectedOrder as any).company_id || null,
      user_id: (user as any)?.id || null,
      details: {
        rating,
        author_name: (user as any)?.full_name || (user as any)?.email || null,
        order_number: (selectedOrder as any).order_number || null,
      },
    });
    if (error) throw error;
    toast({ title: "Rating saved", description: `Recorded ${rating} star${rating === 1 ? "" : "s"} for this order.` });
  } catch (e: any) {
    setOrderRating(prev); // rollback
    toast({ title: "Couldn't save rating", description: dbErrorMessage(e, { entity: "rating" }), variant: "destructive" });
  } finally {
    setRatingBusy(false);
  }
};
// Joined data the dashboard's getAllOrders fetch returns alongside
// the order row but the type doesn't expose. We also fetch
// order_items directly when the modal opens as a belt-and-braces
// fallback - the parent join can come back empty in some race
// conditions or when the row was loaded via a different code path.
const [fetchedItems, setFetchedItems] = useState<any[] | null>(null);
const orderItemsRaw: any[] = useMemo(() => {
  if (!selectedOrder) return [];
  // Prefer fresh fetched items when present, fall back to whatever
  // the parent join returned.
  if (Array.isArray(fetchedItems) && fetchedItems.length > 0) return fetchedItems;
  const a = (selectedOrder as any).order_items;
  return Array.isArray(a) ? a : [];
}, [selectedOrder, fetchedItems]);
// Equipment bookings + status history aren't joined in getAllOrders --
// fetch them on demand when the modal opens.
const [equipmentBookings, setEquipmentBookings] = useState<any[]>([]);
const [equipmentLoading, setEquipmentLoading] = useState(false);
// Equipment that's on the linked quote but has no equipment_bookings row
// (older orders / orders whose creation cascade didn't mint bookings).
// Shown read-only as a fallback so the tab is never blank when the quote
// actually carried equipment.
const [quoteEquipmentFallback, setQuoteEquipmentFallback] = useState<any[]>([]);
// Live menu_items name -> category map. Lets the Menu Items tab show the
// true category ("Salads") for order_items that aren't linked to a
// menu_item (menu_item_id null) and whose stored description is the old
// collapsed value ("appetizer"). Keyed by lowercased item_name.
const [menuCategoryByName, setMenuCategoryByName] = useState<Map<string, string>>(new Map());
// Inline "add equipment" form state for edit mode.
const [eqSearch, setEqSearch] = useState("");
const [eqPick, setEqPick] = useState<EquipmentPick | null>(null);
const [eqQty, setEqQty] = useState<string>("1");
const [eqAdding, setEqAdding] = useState(false);
const [eqRemoving, setEqRemoving] = useState<string | null>(null);

const reloadEquipment = async () => {
  if (!selectedOrder?.id) return;
  // Wave 30.2 part 2: was asking for equipment(name, daily_rate)
  // but equipment has no daily_rate column (it's rental_price).
  // PostgREST returned 400 on the embed and the whole booking
  // list silently came back null. Same fix on the on-mount fetch
  // below.
  const { data, error } = await supabase
    .from("equipment_bookings")
    .select("id, equipment_id, quantity, status, booked_from, booked_until, returned_quantity, equipment:equipment!equipment_bookings_equipment_id_fkey(name, rental_price)")
    .eq("order_id", selectedOrder.id);
  if (error) {
    console.error("[admin/orders] equipment_bookings reload failed:", error);
  }
  setEquipmentBookings(data || []);
};

const handleAddEquipment = async () => {
  if (!selectedOrder?.id || !eqPick) return;
  const qty = Math.max(1, parseInt(eqQty, 10) || 1);
  // Default booking window to event_date - 1 day through event_date + 1 day
  // (typical pickup-then-return overnight). Operator can refine later.
  const eventDate = (selectedOrder as any).event_date;
  let bookedFrom: string | null = null;
  let bookedUntil: string | null = null;
  if (eventDate) {
    const d = new Date(eventDate);
    const from = new Date(d); from.setDate(from.getDate() - 1);
    const until = new Date(d); until.setDate(until.getDate() + 1);
    bookedFrom = toLocalISO(from);
    bookedUntil = toLocalISO(until);
  }
  // Phase 8 #7: pre-flight double-booking check. Pulls live
  // availability for this equipment around the event date so
  // the operator gets a confirm prompt naming the conflicting
  // orders before we land another booking on top. Excludes the
  // current order so adding an item to an order it's already
  // partly on doesn't trip the warning against itself.
  if (eventDate && (selectedOrder as any).company_id) {
    try {
      const avail = await getEquipmentAvailability(
        (selectedOrder as any).company_id,
        eqPick.id,
        String(eventDate),
        { excludeOrderId: selectedOrder.id },
      );
      const wouldShortfall = avail.owned > 0 && (avail.reserved + qty) > avail.owned;
      if (wouldShortfall || avail.conflicts.length > 0) {
        const conflictNames = avail.conflicts
          .slice(0, 3)
          .map((c) => `${c.client_name || "another order"} (${c.event_date})`)
          .join("; ");
        const more = avail.conflicts.length > 3 ? ` and ${avail.conflicts.length - 3} more` : "";
        const msg = wouldShortfall
          ? `Booking ${qty} of ${eqPick.name} on ${eventDate} would put you ${(avail.reserved + qty) - avail.owned} short. Already reserved against: ${conflictNames}${more}.`
          : `${eqPick.name} is already booked on ${eventDate} against: ${conflictNames}${more}.`;
        const proceed = await confirm({
          title: wouldShortfall ? "Not enough stock" : "Already booked",
          description: `${msg}\n\nDouble-book anyway?`,
          confirmLabel: "Double-book",
          cancelLabel: "Cancel",
          destructive: true,
        });
        if (!proceed) return;
      }
    } catch {
      // Best-effort - a check failure shouldn't block the booking.
    }
  }
  setEqAdding(true);
  try {
    const { error } = await supabase.from("equipment_bookings").insert({
      order_id: selectedOrder.id,
      company_id: (selectedOrder as any).company_id,
      equipment_id: eqPick.id,
      quantity: qty,
      status: "booked",
      booked_from: bookedFrom,
      booked_until: bookedUntil,
    } as any);
    if (error) throw error;
    toast({ title: "Equipment added", description: `${qty} x ${eqPick.name} booked.` });
    setEqSearch(""); setEqPick(null); setEqQty("1");
    await reloadEquipment();
    await syncAndRefresh();
  } catch (e: any) {
    toast({ title: "Could not add equipment", description: dbErrorMessage(e, { entity: "equipment item" }), variant: "destructive" });
  } finally {
    setEqAdding(false);
  }
};

const handleRemoveEquipment = async (bookingId: string) => {
  setEqRemoving(bookingId);
  try {
    const { error } = await supabase.from("equipment_bookings").delete().eq("id", bookingId);
    if (error) throw error;
    toast({ title: "Equipment removed" });
    await reloadEquipment();
    await syncAndRefresh();
  } catch (e: any) {
    toast({ title: "Could not remove equipment", description: dbErrorMessage(e, { entity: "equipment item" }), variant: "destructive" });
  } finally {
    setEqRemoving(null);
  }
};

// Recompute totals + push to quote + invoice + reflect in modal
// header. Called after every inline item / equipment add or remove.
const syncAndRefresh = async () => {
  if (!selectedOrder?.id) return;
  const sync = await syncOrderArtifacts(selectedOrder.id);
  if (!sync.ok) return;
  const merged: any = {
    ...selectedOrder,
    subtotal: sync.subtotal,
    tax_amount: sync.tax_amount,
    total_amount: sync.total_amount,
  };
  setSelectedOrder(merged);
  setEditedOrder({ ...editedOrder, ...merged } as any);
};

// Inline "add menu item" form state (mirrors the equipment one).
// Item-level price comes from the catalog's pricePerPerson field;
// operator can override quantity + price-per-line on add.
const [miSearch, setMiSearch] = useState("");
const [miPick, setMiPick] = useState<MenuItemPick | null>(null);
const [miQty, setMiQty] = useState<string>("1");
const [miUnitPrice, setMiUnitPrice] = useState<string>("");
const [miAdding, setMiAdding] = useState(false);
const [miRemoving, setMiRemoving] = useState<string | null>(null);

const reloadOrderItems = async () => {
  if (!selectedOrder?.id) return;
  const { data, error } = await supabase
    .from("order_items")
    .select("id, item_name, description, quantity, unit_price, line_total, special_instructions, created_at")
    .eq("order_id", selectedOrder.id)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[admin/orders] order_items reload failed:", error);
  }
  setFetchedItems(data || []);
};

const handleAddMenuItem = async () => {
  if (!selectedOrder?.id || !miPick) return;
  const qty = Math.max(1, parseInt(miQty, 10) || 1);
  const unit = Number(miUnitPrice) > 0 ? Number(miUnitPrice) : Number(miPick.pricePerPerson) || 0;
  setMiAdding(true);
  try {
    const { error } = await supabase.from("order_items").insert({
      order_id: selectedOrder.id,
      menu_item_id: miPick.id,
      item_name: miPick.name,
      description: miPick.description || null,
      quantity: qty,
      unit_price: unit,
      line_total: qty * unit,
    } as any);
    if (error) throw error;
    toast({ title: "Item added", description: `${qty} x ${miPick.name} added.` });
    setMiSearch(""); setMiPick(null); setMiQty("1"); setMiUnitPrice("");
    await reloadOrderItems();
    await syncAndRefresh();
  } catch (e: any) {
    toast({ title: "Could not add item", description: dbErrorMessage(e, { entity: "menu item" }), variant: "destructive" });
  } finally {
    setMiAdding(false);
  }
};

const handleRemoveMenuItem = async (itemId: string) => {
  setMiRemoving(itemId);
  try {
    const { error } = await supabase.from("order_items").delete().eq("id", itemId);
    if (error) throw error;
    toast({ title: "Item removed" });
    await reloadOrderItems();
    await syncAndRefresh();
  } catch (e: any) {
    toast({ title: "Could not remove item", description: dbErrorMessage(e, { entity: "menu item" }), variant: "destructive" });
  } finally {
    setMiRemoving(null);
  }
};

// Direct fetch of order_items so the modal never shows the empty
// state when items actually exist for this order in the db.
useEffect(() => {
  if (!selectedOrder?.id) { setFetchedItems(null); return; }
  let cancelled = false;
  (async () => {
    try {
      // Pull the order_items + the linked menu_item's category. The
      // category column on menu_items is the source of truth - the
      // description column on order_items was historically populated
      // from a tighter enum that collapsed 'salad' / 'starter' into
      // 'appetizer' (Wave 30.3 bug). Render below prefers the joined
      // menu_items.category when present, falling back to description
      // for free-text rows that aren't linked to a menu item.
      const { data, error } = await supabase
        .from("order_items")
        .select(`
          id, item_name, description, quantity, unit_price, line_total, special_instructions, created_at,
          menu_item:menu_items!order_items_menu_item_id_fkey(category)
        `)
        .eq("order_id", selectedOrder.id)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("[admin/orders] order_items fetch failed:", error);
      }
      if (!cancelled) setFetchedItems(data || []);
    } catch (err) {
      console.warn("[orders] order_items fetch failed", err);
      if (!cancelled) setFetchedItems([]);
    }
  })();
  return () => { cancelled = true; };
}, [selectedOrder?.id]);

useEffect(() => {
  if (selectedOrder) {
    setEditedOrder(selectedOrder);
  }
}, [selectedOrder]);

// Load the company's menu catalog (name -> category) so the Menu Items
// tab can recover the real category for unlinked/legacy lines.
useEffect(() => {
  const companyId = (selectedOrder as any)?.company_id;
  if (!companyId) { setMenuCategoryByName(new Map()); return; }
  let cancelled = false;
  (async () => {
    try {
      const { data, error } = await supabase
        .from("menu_items")
        .select("item_name, category")
        .eq("company_id", companyId);
      if (error) { console.warn("[orders] menu category map fetch failed:", error); return; }
      if (cancelled) return;
      const m = new Map<string, string>();
      for (const r of (data || []) as Array<{ item_name: string | null; category: string | null }>) {
        const key = String(r.item_name || "").toLowerCase().trim();
        if (key && r.category) m.set(key, String(r.category));
      }
      setMenuCategoryByName(m);
    } catch (e) {
      console.warn("[orders] menu category map fetch crashed:", e);
    }
  })();
  return () => { cancelled = true; };
}, [(selectedOrder as any)?.company_id]);

useEffect(() => {
  if (!selectedOrder?.id) return;
  let cancelled = false;
  (async () => {
    setEquipmentLoading(true);
    try {
      const { data, error } = await supabase
        .from("equipment_bookings")
        .select("id, equipment_id, quantity, status, booked_from, booked_until, returned_quantity, equipment:equipment!equipment_bookings_equipment_id_fkey(name, rental_price)")
        .eq("order_id", selectedOrder.id);
      if (error) {
        console.error("[admin/orders] equipment_bookings fetch failed:", error);
      }
      if (!cancelled) setEquipmentBookings(data || []);

      // Fallback: when no bookings exist but the order came from a quote
      // that carried equipment (older orders, or a creation cascade that
      // didn't mint bookings), read the quote's equipment_items so the
      // tab shows what was actually ordered instead of "no equipment".
      const quoteId = (selectedOrder as any).quote_id;
      if (!cancelled && (!data || data.length === 0) && quoteId) {
        const { data: q } = await supabase
          .from("quotes")
          .select("equipment_items")
          .eq("id", quoteId)
          .maybeSingle();
        const raw = (q as any)?.equipment_items;
        const parsed = Array.isArray(raw)
          ? raw
          : typeof raw === "string"
            ? (() => { try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; } })()
            : [];
        if (!cancelled) {
          setQuoteEquipmentFallback(
            parsed.filter((e: any) => (e?.equipment_id || e?.id) && Number(e?.quantity || 0) > 0),
          );
        }
      } else if (!cancelled) {
        setQuoteEquipmentFallback([]);
      }
    } catch (err) {
      console.warn("[orders] equipment bookings fetch failed", err);
    } finally {
      if (!cancelled) setEquipmentLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, [selectedOrder?.id]);

if (!selectedOrder || !editedOrder) return null;

// Amendments are usually small (venue change, time tweak, +/- a
// few guests). When guest_count is changing we pop a quick info
// dialog that says "the total stays the same, fix the price on
// the quote if it needs changing". Stops the operator quietly
// expecting the price to scale.
const oldGuestCount = Number((selectedOrder as any).guest_count || 0);
const newGuestCount = Number((editedOrder as any).guest_count || 0);
const oldTotal = Number((selectedOrder as any).total_amount || 0);

const handleSave = async () => {
  if (
    oldGuestCount > 0 &&
    newGuestCount > 0 &&
    oldGuestCount !== newGuestCount &&
    oldTotal > 0
  ) {
    setPriceAdjustOpen(true);
    return;
  }
  await persistSave();
};

// Ratio + projected scaled total used by the dialog and the save
// path. When items exist, scale each item.quantity by the ratio
// and let the sync service recompute the total from the new
// line totals (preserves the operator's per-unit prices). When
// no items exist, scale the order's total_amount directly.
const guestRatio =
  oldGuestCount > 0 && newGuestCount > 0 ? newGuestCount / oldGuestCount : 1;
const projectedTotal = Number((oldTotal * guestRatio).toFixed(2));
// Threshold for "this is a big change, go fix it on the quote"
// vs "small amendment, scale inline". 20% is the soft line --
// a 5% move (200 -> 190) is fine here, a 50% move (200 -> 100)
// gets routed to the quote where prices can also be re-thought.
const guestDeltaPct =
  oldGuestCount > 0 ? Math.abs(newGuestCount - oldGuestCount) / oldGuestCount : 0;
const isBigGuestChange = guestDeltaPct > 0.20;

const persistSave = async () => {
  setSaving(true);
  try {
    const guestChanged = oldGuestCount !== newGuestCount && oldGuestCount > 0 && newGuestCount > 0;

    // Scale path A: items exist, multiply each item.quantity by
    // the ratio (round to integer, recompute line_total). Sync
    // will pick up the new line_totals and write a new subtotal.
    if (guestChanged && orderItemsRaw.length > 0) {
      await Promise.all(orderItemsRaw.map((it: any) => {
        const newQty = Math.max(1, Math.round(Number(it.quantity || 0) * guestRatio));
        const unit = Number(it.unit_price || 0);
        return supabase.from("order_items").update({
          quantity: newQty,
          line_total: Number((newQty * unit).toFixed(2)),
        } as any).eq("id", it.id);
      }));
    }

    // Scale path B: flat-price order, scale total_amount directly.
    // Written before the syncOrderArtifacts call so the sync's
    // preserve-existing branch picks it up.
    if (guestChanged && orderItemsRaw.length === 0 && projectedTotal > 0) {
      await supabase.from("orders").update({
        subtotal: projectedTotal,
        total_amount: projectedTotal,
        tax_amount: 0,
      } as any).eq("id", editedOrder.id);
    }

    // Wave 31: split status changes off from the rest of the
    // edit. orderService.updateOrder is a raw .from("orders").update
    // - it bypasses orderWorkflow.updateOrderStatus, which means
    // ALL the cascades (transition validation, kitchen prep
    // re-plan on confirmation, auto-invoice on confirm, after-
    // sales scheduling on completion, POD-missing check on
    // delivered, status email + dispatch broadcast triggers, the
    // order_status_history audit row) silently don't fire when
    // the operator changes status via the Edit modal. Now: when
    // the status field actually changed, route THAT through
    // updateOrderStatus first; everything else (name, venue,
    // guest count, notes, discount) goes through the raw update
    // as before. updateOrderStatus is idempotent on no-op flips
    // so passing the same status is safe.
    const statusChanged =
      typeof editedOrder.status === "string" &&
      editedOrder.status !== (selectedOrder as any)?.status;
    if (statusChanged) {
      const { updateOrderStatus } = await import("@/services/order/orderWorkflow");
      const stRes: any = await updateOrderStatus(
        editedOrder.id,
        String(editedOrder.status),
        user?.id,
      );
      if (stRes && stRes.success === false) {
        throw new Error(stRes.error || "Status change rejected");
      }
    }

    const result: any = await orderService.updateOrder(editedOrder.id, {
      client_name: editedOrder.client_name,
      venue_address: editedOrder.venue_address,
      guest_count: editedOrder.guest_count,
      event_date: editedOrder.event_date,
      // Wave 31: omit status here - the dispatch above owns the
      // status transition + cascades. Passing it again would
      // raw-update over the orderWorkflow stamp.
      internal_notes: (editedOrder as any).internal_notes,
      // Phase 14 #5: discount carries through to the orders
      // row + downstream invoice via the syncOrderArtifacts
      // call below. null = clear the discount.
      discount_amount: (editedOrder as any).discount_amount ?? null,
      // Wave 66.3 - operational times are now editable inline.
      // Empty string from the time input means "cleared"; persist
      // as null so kitchenPrepService falls back to its event_date
      // default rather than a zero-length string.
      event_time: ((editedOrder as any).event_time || null) || null,
      setup_time: ((editedOrder as any).setup_time || null) || null,
      pickup_time: ((editedOrder as any).pickup_time || null) || null,
    } as any);
    if (result && result.success === false) {
      throw new Error(result.error || "Update failed");
    }

    // Quote + invoice mirror so all three artifacts stay in sync.
    const sync = await syncOrderArtifacts(editedOrder.id);

    toast({
      title: "Order Updated",
      description: sync.ok
        ? `Saved. Quote${sync.quote_id ? "" : " (none)"} and invoice${sync.invoice_id ? "" : " (none)"} synced.`
        : "Saved, but the quote/invoice sync hit an issue. Check the totals.",
    });

    const merged: any = {
      ...selectedOrder,
      ...editedOrder,
      ...(result?.data || {}),
      subtotal: sync.subtotal,
      tax_amount: sync.tax_amount,
      total_amount: sync.total_amount,
    };
    setSelectedOrder(merged);
    setEditedOrder(merged);
    setEditMode(false);
    setPriceAdjustOpen(false);
    loadOrders();
    // Wave 70.37 / 70.40 - broadcast via the shared helper so
    // all listening surfaces (calendar, invoices, dashboard
    // widgets) refetch automatically. See src/lib/events/
    // orderEvents.ts for the listener pattern.
    emitOrderUpdated(editedOrder.id, "admin/orders:save");
  } catch (error: any) {
    toast({
      title: "Error",
      description: dbErrorMessage(error, { entity: "order", fallback: "Failed to update order. Please try again." }),
      variant: "destructive",
    });
  } finally {
    setSaving(false);
  }
};

return (
  <>
  <Dialog
    open={isModalOpen}
    onOpenChange={async (o) => {
      // Wave 55 - unsaved-changes guard. Pre-Wave-55 a click
      // outside the modal in editMode silently discarded any
      // typed changes (5 minutes of internal notes lost on a
      // misclick). Now: confirm before closing if editMode is on.
      // The modal's open state is controlled by isModalOpen, so
      // returning early (without calling setIsModalOpen(false))
      // keeps it open while the confirm dialog is up.
      if (!o && editMode) {
        const ok = await confirm({
          title: "Discard unsaved edits?",
          description: "You have unsaved edits on this order. Close and discard them?",
          confirmLabel: "Discard & close",
          cancelLabel: "Keep editing",
          destructive: true,
        });
        if (!ok) return;
        setEditMode(false);
      }
      setIsModalOpen(o);
      // Wave 28.8: when the drawer closes, strip ?orderId from the
      // URL so a refresh doesn't bounce it open again. Keeps any
      // unrelated query params intact (filter, sort, etc.).
      if (!o && router.isReady && router.query.orderId) {
        const { orderId: _drop, ...rest } = router.query;
        router.replace(
          { pathname: router.pathname, query: rest },
          undefined,
          { shallow: true, scroll: false },
        );
      }
    }}
  >
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      {/* Wave 64.3 - header redesign. Audit (full UI team) found
          the old layout fought itself: a 4xl dialog was split
          flex-justify-between, leaving the left side ~250px to
          hold 9 stacked chips. They wrapped into a vertical
          column instead of the intended horizontal strip. Six
          chip hues (blue/green/emerald/amber/yellow/slate) broke
          the Wave 56 3-tone semantic. Pause appeared twice.
          "Order Details" / DialogTitle / "View order details"
          said the same thing three times.
          Now: 3 stacked full-width rows. Row 1 = identity (ORD +
          status pill + subtitle) and primary action (Edit + a
          "More" overflow menu collecting Pause, Duplicate, Kitchen
          ticket, Calendar, Cancel). Row 2 = uniform slate
          quick-link toolbar (Quote, Client view, Copy link,
          Invoice). Row 3 = contact strip with Lucide icons, only
          when client_phone / client_email present. RATE hides
          unless status is completed (post-event quality lives
          with the closure, not the navigation strip). */}
      <DialogHeader className="space-y-3">
        <DialogTitle className="sr-only">
          {(selectedOrder as any)?.order_number
            ? `Order ${(selectedOrder as any).order_number}`
            : "Order details"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {editMode ? "Editing order" : "Viewing order"}
        </DialogDescription>

        {/* Row 1: identity + primary action */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {(selectedOrder as any)?.order_number && (
                <button
                  type="button"
                  onClick={async () => {
                    const num = String((selectedOrder as any).order_number);
                    try {
                      await navigator.clipboard.writeText(num);
                      toast({ title: "Copied", description: `${num} on clipboard.` });
                    } catch {
                      toast({ title: "Copy failed", description: "Browser blocked clipboard access.", variant: "destructive" });
                    }
                  }}
                  className="inline-flex items-center gap-1.5 font-mono text-base font-semibold text-slate-900 bg-slate-100 border border-slate-200 rounded-md px-2.5 py-1 hover:bg-slate-200 transition"
                  title="Copy order number"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  {(selectedOrder as any).order_number}
                </button>
              )}
              {selectedOrder && (() => {
                const s = String((selectedOrder as any).status || "");
                // Wave 56 3-tone semantic. Amber = waiting on
                // the operator. Blue = active / in motion. Slate
                // = closed. Rose = alert.
                const cls =
                  s === "pending" ? "bg-amber-50 text-amber-800 border-amber-200" :
                  s === "cancelled" ? "bg-rose-50 text-rose-800 border-rose-200" :
                  ["delivered", "completed"].includes(s) ? "bg-slate-100 text-slate-700 border-slate-200" :
                  "bg-blue-50 text-blue-800 border-blue-200";
                const label =
                  s === "preparing" ? "In prep" :
                  s === "in_transit" ? "In transit" :
                  s ? s[0].toUpperCase() + s.slice(1) : "";
                return (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
                    {label}
                  </span>
                );
              })()}
              {/* Post-event rating chip. Only shows once the order
                  reaches delivered/completed - on a confirmed
                  booking three weeks out a star widget is noise. */}
              {selectedOrder && ["delivered", "completed"].includes(String((selectedOrder as any).status)) && (
                <div
                  role="radiogroup"
                  aria-label="Order rating"
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-full px-2 py-0.5"
                  title={orderRating ? `Rated ${orderRating}/5. Tap a star to change.` : "Rate this order"}
                >
                  {[1, 2, 3, 4, 5].map((n) => {
                    const filled = orderRating != null && n <= orderRating;
                    return (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={orderRating === n}
                        onClick={() => setQuickRating(n)}
                        disabled={ratingBusy}
                        className="hover:scale-110 transition-transform disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 rounded-sm"
                        aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
                      >
                        <Star className={`w-3.5 h-3.5 ${filled ? "fill-amber-500 text-amber-500" : "text-slate-300"}`} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {selectedOrder && (
              <p className="text-sm text-slate-600 mt-1.5 truncate">
                {(selectedOrder as any).client_name || "Client"}
                {(selectedOrder as any).event_date && (
                  <> &middot; {formatDate((selectedOrder as any).event_date)}</>
                )}
              </p>
            )}
          </div>

          {!editMode ? (
            <div className="flex items-center gap-2 shrink-0">
              <Button onClick={() => setEditMode(true)} size="sm">
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="px-2" aria-label="More actions">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {selectedOrder && ["confirmed", "preparing", "ready"].includes(String((selectedOrder as any).status)) && (
                    <DropdownMenuItem
                      onClick={() => setPauseDialogOrderId(selectedOrder.id)}
                      className="text-blue-700 focus:text-blue-800"
                    >
                      <Pause className="w-4 h-4 mr-2" />
                      Pause order
                    </DropdownMenuItem>
                  )}
                  {selectedOrder && (selectedOrder as any).status === "paused" && (
                    <DropdownMenuItem
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Resume this order?",
                          description: "Pre-event reminders and kitchen prep tasks will be restored.",
                          confirmLabel: "Resume order",
                        });
                        if (!ok) return;
                        try {
                          const res = await fetch(`/api/orders/${selectedOrder.id}/resume`, { method: "POST" });
                          const json = await res.json().catch(() => ({}));
                          if (!res.ok) { toast({ title: "Resume failed", description: json?.error, variant: "destructive" }); return; }
                          toast({ title: "Order resumed", description: `Back to ${json.order?.status}. Reminders + prep restored.` });
                          await loadOrders();
                          setSelectedOrder(json.order);
                          setEditedOrder(json.order);
                          // Wave 70.40 - broadcast for cross-page listeners.
                          emitOrderUpdated(selectedOrder.id, "admin/orders:resume", ["status", "prep"]);
                        } catch (e: any) {
                          toast({ title: "Resume failed", description: dbErrorMessage(e, { entity: "order" }), variant: "destructive" });
                        }
                      }}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Resume order
                    </DropdownMenuItem>
                  )}
                  {selectedOrder && (
                    <DropdownMenuItem
                      onClick={() => {
                        // The dialog reads `defaultDate` on open
                        // and snaps its own input to it; seeding
                        // here keeps the +7d operator convention.
                        setDuplicateDate7DayDefault((() => {
                          const d = new Date();
                          d.setDate(d.getDate() + 7);
                          return toLocalISO(d);
                        })());
                        setDuplicateDialogOpen(true);
                      }}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                  )}
                  {selectedOrder && (
                    <DropdownMenuItem asChild>
                      <Link href={withSlug(`${staffOrderHref(selectedOrder.id, "kitchen_staff")}&print=1#section-kitchen`)} target="_blank">
                        <FileText className="w-4 h-4 mr-2" />
                        Print order document
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {selectedOrder && (
                    <DropdownMenuItem onClick={() => downloadOrderIcs(selectedOrder as any)}>
                      <Calendar className="w-4 h-4 mr-2" />
                      Add to calendar
                    </DropdownMenuItem>
                  )}
                  {selectedOrder && (selectedOrder as any).status !== "cancelled" && (
                    <>
                      <DropdownMenuSeparator />
                      {/* TIGHTEN I.122: this single entry opens the
                          unified Cancel / Purge dialog. The label
                          covers both because the dialog itself is the
                          mode picker - cancel for real cancellations,
                          purge for test data / mistakes. */}
                      <DropdownMenuItem
                        onClick={() => {
                          setIsModalOpen(false);
                          setCancelDialogOpen(true);
                        }}
                        className="text-rose-700 focus:text-rose-800 focus:bg-rose-50"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Cancel or remove order
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="flex gap-2 shrink-0">
              {selectedOrder && (selectedOrder as any).status !== "cancelled" && (
                <Button
                  onClick={() => {
                    setEditedOrder(selectedOrder);
                    setEditMode(false);
                    setIsModalOpen(false);
                    setCancelDialogOpen(true);
                  }}
                  variant="outline"
                  size="sm"
                  className="text-rose-700 border-rose-200 hover:bg-rose-50"
                  title="Open the cancel-or-remove dialog. Cancel = real cancellation with refund per policy. Remove = permanent delete for test data."
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Cancel or remove
                </Button>
              )}
              <Button
                onClick={() => {
                  setEditedOrder(selectedOrder);
                  setEditMode(false);
                }}
                variant="outline"
                size="sm"
              >
                <X className="w-4 h-4 mr-2" />
                Discard
              </Button>
              <Button onClick={handleSave} disabled={saving} size="sm">
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Row 2: navigation toolbar - uniform slate chips so the
            operator scans them as "go look at this" rather than
            six competing CTAs. */}
        {selectedOrder && (
          <div className="flex flex-wrap gap-1.5">
            {(selectedOrder as any).quote_id && (() => {
              const tok = (selectedOrder as any).quote?.public_token;
              const href = tok
                ? `/q/${tok}`
                : withSlug(`/admin/quotes/${(selectedOrder as any).quote_id}`);
              return (
                <Link
                  href={href}
                  target={tok ? "_blank" : undefined}
                  rel={tok ? "noopener noreferrer" : undefined}
                  onClick={() => setIsModalOpen(false)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50 hover:text-slate-900 transition"
                  title={tok ? "Open the polished client view of this quote" : "Open the source quote"}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Quote
                </Link>
              );
            })()}
            <button
              type="button"
              onClick={async () => {
                try {
                  const r = await fetch(`/api/orders/${(selectedOrder as any).id}/preview-as-client`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                  });
                  const j = await r.json();
                  if (!r.ok) throw new Error(j.error || "Could not generate preview link");
                  window.open(j.url, "_blank", "noopener,noreferrer");
                } catch (e: any) {
                  toast({
                    title: "Couldn't open preview",
                    description: dbErrorMessage(e, { entity: "preview link" }),
                    variant: "destructive",
                  });
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50 hover:text-slate-900 transition"
              title="Open the page the client sees in a new tab"
            >
              <Eye className="w-3.5 h-3.5" />
              Client view
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const r = await fetch(`/api/orders/${(selectedOrder as any).id}/preview-as-client`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                  });
                  const j = await r.json();
                  if (!r.ok) throw new Error(j.error || "Could not mint link");
                  await navigator.clipboard.writeText(String(j.url));
                  toast({ title: "Client link copied", description: "Paste it into your WhatsApp or email." });
                } catch (e: any) {
                  toast({
                    title: "Couldn't copy link",
                    description: dbErrorMessage(e, { entity: "client link" }),
                    variant: "destructive",
                  });
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50 hover:text-slate-900 transition"
              title="Copy a tokenised client-view link"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy link
            </button>
            <Link
              href={withSlug(`/admin/invoices?orderId=${selectedOrder.id}`)}
              onClick={() => setIsModalOpen(false)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50 hover:text-slate-900 transition"
              title="Open the invoice list filtered to this order"
            >
              <Receipt className="w-3.5 h-3.5" />
              Invoice
            </Link>
            <Link
              href={withSlug(`${staffOrderHref(selectedOrder.id, "admin")}#section-waiter`)}
              onClick={() => setIsModalOpen(false)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 hover:bg-amber-100 transition"
              title="Open the order Service team section to assign or remove waiters"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Assign waiter
            </Link>
          </div>
        )}

        {/* Row 3: contact strip. WhatsApp keeps its brand-green
            accent because operators scan for it specifically;
            Call + Email stay slate so the row reads cleanly. */}
        {selectedOrder && ((selectedOrder as any).client_phone || (selectedOrder as any).client_email) && (
          <div className="flex flex-wrap gap-1.5">
            {(selectedOrder as any).client_phone && (
              <>
                <a
                  href={`tel:${String((selectedOrder as any).client_phone).replace(/[^+\d]/g, "")}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50 hover:text-slate-900 transition"
                  title={`Call ${(selectedOrder as any).client_phone}`}
                >
                  <Phone className="w-3.5 h-3.5" />
                  Call {(selectedOrder as any).client_phone}
                </a>
                <a
                  href={`https://wa.me/${String((selectedOrder as any).client_phone).replace(/[^\d]/g, "")}?text=${encodeURIComponent(`Hi ${((selectedOrder as any).client_name || "there").split(" ")[0]}, regarding your booking ${(selectedOrder as any).order_number || ""}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded-md px-2 py-1 hover:bg-brand-primary/15 transition"
                  title="Open WhatsApp pre-filled"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </a>
              </>
            )}
            {(selectedOrder as any).client_email && (
              <a
                href={`mailto:${(selectedOrder as any).client_email}?subject=${encodeURIComponent(`Booking ${(selectedOrder as any).order_number || "your order"}`)}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50 hover:text-slate-900 transition"
                title={`Email ${(selectedOrder as any).client_email}`}
              >
                <Mail className="w-3.5 h-3.5" />
                Email
              </a>
            )}
          </div>
        )}
      </DialogHeader>

      {/* Wave 70.42 - conductor view. Bobby's brief: the owner
          is NOT just a bookkeeper. They need kitchen / driver /
          staff / cleaning / shopping status at a glance, not
          click through five tabs. <BookingFacts variant="admin">
          renders a 5-panel cross-role status grid + money
          summary above the tabbed detail below. Facts come from
          the role-scoped /api/bookings/[id]/facts endpoint and
          refetch on cateringms:order-updated so the panels stay
          live when other surfaces mutate things. */}
      {bookingFacts && bookingFacts.role === "admin" && (
        <div className="mb-4">
          <BookingFacts facts={bookingFacts} />
        </div>
      )}

      {/* ODOC H.3: edit-in-quote notice. Tells the operator that
          field edits (menu, guest count, event date, venue, pricing)
          live on the source quote, not here. The modal stays for
          actions (status flip / record payment / amendments /
          cancellations / messages). Read-only field display kept
          for quick reference; the source of truth is the doc at
          /order/[id]. */}
      {selectedOrder && (selectedOrder as any).quote_id && (
        <div className="mb-4 flex items-start gap-3 p-3 rounded-lg border-2 border-blue-300 bg-blue-50">
          <div className="text-blue-700 flex-shrink-0 mt-0.5">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-blue-800 font-semibold">Where to make changes</p>
            <p className="text-sm font-medium text-blue-900 mt-0.5">
              Status, payments, amendments and messages are handled right here. To change the booking itself - menu, guest count, event date, venue or pricing - edit the source quote and the changes mirror back automatically.
            </p>
          </div>
          <Link
            href={withSlug(`/admin/quotes/${(selectedOrder as any).quote_id}`)}
            onClick={() => setIsModalOpen(false)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex-shrink-0"
          >
            <FileText className="w-3.5 h-3.5" />
            Edit quote
          </Link>
        </div>
      )}

      {/* Wave 54.3 - controlled Tabs that honour ?tab= query
          param. The readiness chip's "Fix it" deep-links append
          tab=menu / tab=equipment / etc; pre-Wave-54 the modal
          hardcoded defaultValue="details" and silently ignored
          the param, so the operator clicked "Fix it" on a missing
          menu and landed on Details. _activeTab below pulls from
          router and falls back to "details". */}
      <Tabs
        value={(() => {
          const t = typeof router.query.tab === "string" ? router.query.tab : "";
          return ["details","menu","equipment","amendments","cancellations","history"].includes(t)
            ? t
            : "details";
        })()}
        onValueChange={(v) => {
          const next = { ...router.query, tab: v };
          if (v === "details") delete (next as any).tab;
          router.replace({ pathname: router.pathname, query: next }, undefined, { shallow: true, scroll: false });
        }}
        className="mt-6"
      >
        {/* 7 tabs in grid-cols-7 clipped + overlapped the labels ("Menu
            Items", "Cancellations") at phone width. Scroll horizontally on
            mobile (tabs keep full labels, shrink-0), grid from sm up. */}
        <TabsList className="flex w-full justify-start overflow-x-auto [&>*]:shrink-0 sm:grid sm:grid-cols-7">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="menu">Menu Items</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="amendments">Amendments</TabsTrigger>
          <TabsTrigger value="cancellations">Cancellations</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Client Name</Label>
              <Input
                value={editedOrder.client_name}
                onChange={(e) => setEditedOrder({ ...editedOrder, client_name: e.target.value })}
                disabled={!editMode}
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={editedOrder.status}
                onValueChange={(value) => setEditedOrder({ ...editedOrder, status: value as any })}
                disabled={!editMode || editedOrder.status === "paused"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="preparing">In Prep</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="in_transit">In Transit</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              {/* Wave 64.3 - Pause/Resume CTAs removed from
                  under the Status field; they now live in the
                  header overflow menu (single source of truth)
                  so the operator doesn't see "Pause order" twice
                  in the same modal. The paused-reason context
                  stays here because it's status metadata, not an
                  action. */}
              {editedOrder.status === "paused" && (
                <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5 mt-1">
                  Paused{(editedOrder as any).paused_reason_category ? ` · ${String((editedOrder as any).paused_reason_category).replace(/_/g, " ")}` : ""}
                  {(editedOrder as any).paused_reason ? `: ${(editedOrder as any).paused_reason}` : ""}
                  {(editedOrder as any).paused_expected_resume_date ? ` (expected resume: ${(editedOrder as any).paused_expected_resume_date})` : ""}
                </p>
              )}
            </div>

            <div className="space-y-2 col-span-2">
              <Label>Venue Address</Label>
              <Input
                value={editedOrder.venue_address || ""}
                onChange={(e) => setEditedOrder({ ...editedOrder, venue_address: e.target.value })}
                disabled={!editMode}
              />
            </div>

            <div className="space-y-2">
              <Label>Event Date</Label>
              <Input
                type="date"
                value={editedOrder.event_date}
                onChange={(e) => setEditedOrder({ ...editedOrder, event_date: e.target.value })}
                disabled={!editMode}
              />
            </div>

            <div className="space-y-2">
              <Label>Guest Count</Label>
              <Input
                type="number"
                value={editedOrder.guest_count}
                onChange={(e) => setEditedOrder({ ...editedOrder, guest_count: parseInt(e.target.value) || 0 })}
                disabled={!editMode}
              />
            </div>

            {/* Wave 66.3 - operational times block. Pre-Wave-66.3
                event_time, setup_time and pickup_time existed on
                the orders row, were read by kitchenPrepService to
                backplan prep tasks, and were surfaced on the
                kitchen ticket + driver dashboard - but they had
                no admin editor anywhere. The readiness chip's
                "Pickup time missing - Fix it" link sent the
                operator to this modal where the field wasn't
                rendered. Now: three time inputs grouped under a
                clear header so the operator can set start-of-day
                pickup, on-site setup, and event start in one
                place. handleSave below now persists all three. */}
            <div id="op-times" className="space-y-2 col-span-2 pt-2 border-t border-slate-200">
              <Label className="text-xs uppercase tracking-wide text-slate-500">Operational times</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Event start</Label>
                  <Input
                    type="time"
                    value={(editedOrder as any).event_time || ""}
                    onChange={(e) => setEditedOrder({ ...editedOrder, event_time: e.target.value } as any)}
                    disabled={!editMode}
                  />
                  <p className="text-[10px] text-slate-500">When guests arrive.</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Setup time</Label>
                  <Input
                    type="time"
                    value={(editedOrder as any).setup_time || ""}
                    onChange={(e) => setEditedOrder({ ...editedOrder, setup_time: e.target.value } as any)}
                    disabled={!editMode}
                  />
                  <p className="text-[10px] text-slate-500">When the crew arrives at the venue to set up.</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600">Pickup from kitchen</Label>
                  <Input
                    type="time"
                    value={(editedOrder as any).pickup_time || ""}
                    onChange={(e) => setEditedOrder({ ...editedOrder, pickup_time: e.target.value } as any)}
                    disabled={!editMode}
                  />
                  <p className="text-[10px] text-slate-500">When the driver leaves the kitchen with the order. Drives prep backplanning.</p>
                </div>
              </div>
            </div>

            <div className="space-y-2 col-span-2">
              <Label>Internal notes (admin only)</Label>
              <Textarea
                value={(editedOrder as any).internal_notes || ""}
                onChange={(e) => setEditedOrder({ ...editedOrder, internal_notes: e.target.value } as any)}
                disabled={!editMode}
                rows={3}
                placeholder="Internal notes for the team. Not shown to the client."
              />
            </div>

            {/* Wave 67 Phase D - outsourced fulfilment panel.
                Lists every outsource_assignments row for this
                order with inline actions: send request via
                mailto/wa.me, copy magic-link, mark accepted on
                their behalf, advance status, cancel. */}
            {selectedOrder?.id && (
              <OutsourcedFulfilmentPanel
                orderId={selectedOrder.id}
                orderNumber={(selectedOrder as any).order_number || null}
                companyId={(selectedOrder as any).company_id || ""}
                eventDate={(selectedOrder as any).event_date || null}
                eventTime={(selectedOrder as any).event_time || null}
                clientName={(selectedOrder as any).client_name || null}
                venueAddress={(selectedOrder as any).venue_address || null}
                guestCount={(selectedOrder as any).guest_count ?? null}
              />
            )}

            {/* Phase 9 #6: chronological notes thread. The
                single-string internal_notes above is the
                'sticky note' on the order; this thread is
                'who said what when' so context survives shift
                changes. Backed by audit_logs so it inherits
                the existing RLS + shows up in /admin/audit-logs. */}
            <div className="col-span-2">
              {selectedOrder?.id && (
                <OrderNotesThread
                  orderId={selectedOrder.id}
                  companyId={(selectedOrder as any).company_id || null}
                />
              )}
            </div>

            {(selectedOrder as any).special_instructions && (
              <div className="space-y-2 col-span-2">
                <Label>Client special instructions</Label>
                <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 whitespace-pre-wrap">
                  {(selectedOrder as any).special_instructions}
                </p>
              </div>
            )}

            {/* Money summary - read-only at-a-glance for the team. */}
            <div className="col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2 pt-3 border-t border-slate-200">
              <div>
                <Label className="text-xs">Subtotal</Label>
                <p className="text-sm font-semibold text-slate-900 mt-1 tabular-nums">
                  {C}{Number((selectedOrder as any).subtotal || 0).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
                </p>
              </div>
              {/* Phase 14 #5: discount field. Editable inline so
                  a sales rep can apply a once-off discount or
                  goodwill credit without rebuilding the quote.
                  orderSyncService picks discount_amount up on
                  the next save and reflects it on the invoice. */}
              <div>
                <Label className="text-xs">Discount</Label>
                {editMode ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={(editedOrder as any).discount_amount ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setEditedOrder({
                        ...editedOrder,
                        discount_amount: raw === "" ? null : Number(raw),
                      } as any);
                    }}
                    placeholder="0.00"
                    className="mt-1 h-8 text-sm tabular-nums"
                  />
                ) : (
                  <p className="text-sm font-semibold text-amber-700 mt-1 tabular-nums">
                    {Number((selectedOrder as any).discount_amount || 0) > 0
                      ? `−${C}${Number((selectedOrder as any).discount_amount).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`
                      : "-"}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">Tax</Label>
                <p className="text-sm font-semibold text-slate-900 mt-1 tabular-nums">
                  {C}{Number((selectedOrder as any).tax_amount || (selectedOrder as any).tax || 0).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <Label className="text-xs">Total</Label>
                <p className="text-base font-bold text-brand-primary mt-1 tabular-nums">
                  {C}{Number((selectedOrder as any).total_amount || 0).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {/* Wave 67.2 - COGS strip with outsource fees. Pulls
                quoted_cost (or actual_cost when invoiced) for
                every non-cancelled outsource_assignments row on
                this order, breaks out gross margin vs net
                margin so the operator sees what the event is
                actually earning after paying external providers.
                Self-hides when no outsource assignments exist. */}
            {(() => {
              const outsourceList = ((selectedOrder as any).__outsourceAssignments || []) as Array<{ status: string; quoted_cost?: number | string | null; actual_cost?: number | string | null }>;
              const live = outsourceList.filter((a) => a.status !== "cancelled");
              if (live.length === 0) return null;
              const outsourceTotal = live.reduce((sum, a) => {
                const c = a.actual_cost != null ? Number(a.actual_cost) : Number(a.quoted_cost || 0);
                return sum + (Number.isFinite(c) ? c : 0);
              }, 0);
              const orderTotal = Number((selectedOrder as any).total_amount || 0);
              const netMargin = orderTotal - outsourceTotal;
              const marginPct = orderTotal > 0 ? (netMargin / orderTotal) * 100 : 0;
              return (
                <div className="col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2 pt-3 border-t border-slate-200">
                  <div>
                    <Label className="text-xs flex items-center gap-1.5">
                      Outsource fees
                      <span className="text-[10px] text-slate-400 uppercase tracking-wide">COGS</span>
                    </Label>
                    <p className="text-sm font-semibold text-rose-700 mt-1 tabular-nums">
                      −{C}{outsourceTotal.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {live.length} provider{live.length === 1 ? "" : "s"} engaged
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs">Net after outsource</Label>
                    <p className={`text-sm font-semibold mt-1 tabular-nums ${netMargin >= 0 ? "text-brand-primary" : "text-rose-700"}`}>
                      {C}{netMargin.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs">Margin</Label>
                    <p className={`text-sm font-semibold mt-1 tabular-nums ${marginPct >= 30 ? "text-brand-primary" : marginPct >= 15 ? "text-amber-700" : "text-rose-700"}`}>
                      {marginPct.toFixed(1)}%
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Dispatch summary - vehicle + 2-driver flag. Internal
                only, never goes near the client portal. The vehicle
                is auto-booked when a driver is assigned and can be
                overridden from the Dispatch Queue. */}
            <div className="col-span-2 mt-2 pt-3 border-t border-slate-200">
              <Label className="text-xs flex items-center gap-1.5">
                Dispatch
                <span className="text-[10px] text-slate-400 uppercase tracking-wide">internal</span>
              </Label>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                    Vehicle
                  </p>
                  {(selectedOrder as any).assigned_vehicle ? (() => {
                    const v = (selectedOrder as any).assigned_vehicle;
                    return (
                      <>
                        <p className="font-semibold text-slate-900">
                          {v.nickname ? `${v.nickname} ` : ""}
                          <span className="font-mono text-slate-500">{v.plate}</span>
                        </p>
                        <p className="text-slate-600 mt-0.5 flex flex-wrap items-center gap-1.5">
                          {v.refrigerated && <span className="inline-flex items-center gap-0.5 text-blue-700"><MapPin className="w-3 h-3" />Refrigerated</span>}
                          {v.has_warmer && <span className="inline-flex items-center gap-0.5 text-orange-700"><Package className="w-3 h-3" />Warmer</span>}
                          {v.max_pax_served != null && <span>Rated {v.max_pax_served} guests</span>}
                          {v.capacity_kg != null && <span>{v.capacity_kg}kg</span>}
                          {v.owner_kind === "driver" && <span className="inline-flex items-center gap-0.5 text-amber-700">Driver-owned</span>}
                        </p>
                      </>
                    );
                  })() : (
                    <p className="text-slate-500 italic">
                      No vehicle booked yet. Assigning a driver will auto-book the best fit.
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                    Crew
                  </p>
                  <p className="font-semibold text-slate-900">
                    {(selectedOrder as any).requires_two_drivers ? "Two drivers needed" : "One driver"}
                  </p>
                  <p className="text-slate-600 mt-0.5">
                    {(selectedOrder as any).requires_two_drivers
                      ? "Vehicle, guest count or waiter service flagged this run for a co-driver."
                      : "Solo run, no co-driver required."}
                  </p>
                  {(selectedOrder as any).secondary_driver_id && (
                    <p className="mt-1 text-brand-primary">Secondary driver assigned.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="menu" className="space-y-4 mt-4">
          {/* Menu lines come from the order_items joined table.
              Inline add / remove in edit mode mirrors the Equipment
              tab. Heads up: the order's total_amount column is set
              at quote-acceptance time and isn't auto-recalculated
              when you tweak items here. If you change the value
              significantly, also bump it via Edit > Details so the
              invoice + dashboard stay in sync. */}
          <div className="space-y-3">
            {/* Inline add form (edit mode only) */}
            {editMode && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                <Label className="text-xs font-semibold text-blue-900">Add menu item to this order</Label>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                  <MenuItemTypeahead
                    companyId={(selectedOrder as any)?.company_id}
                    value={miSearch}
                    onChange={setMiSearch}
                    onPick={(p) => {
                      setMiPick(p);
                      setMiSearch(p.name);
                      setMiUnitPrice(p.pricePerPerson ? String(p.pricePerPerson) : "");
                    }}
                  />
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Qty</Label>
                    <Input
                      type="number"
                      min={1}
                      className="w-20 bg-white"
                      value={miQty}
                      onChange={(e) => setMiQty(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Unit price (R)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      className="w-28 bg-white"
                      placeholder={miPick?.pricePerPerson ? String(miPick.pricePerPerson) : "0"}
                      value={miUnitPrice}
                      onChange={(e) => setMiUnitPrice(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAddMenuItem}
                    disabled={miAdding || !miPick}
                    className="self-end"
                  >
                    {miAdding ? "Adding..." : "Add"}
                  </Button>
                </div>
                {miPick && (
                  <p className="text-xs text-slate-600">
                    Selected: <strong>{miPick.name}</strong> ({miPick.category})
                    {miPick.pricePerPerson ? ` · ${C}${Number(miPick.pricePerPerson).toLocaleString("en-ZA")} / person` : ""}
                  </p>
                )}
              </div>
            )}

            {orderItemsRaw.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No menu items on this order yet.</p>
                <p className="text-xs mt-1">
                  {editMode
                    ? "Use the search above to add items."
                    : "Click Edit on this order to add items."}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left px-3 py-2">Item</th>
                      <th className="text-right px-3 py-2 w-16">Qty</th>
                      <th className="text-right px-3 py-2 w-28">Unit price</th>
                      <th className="text-right px-3 py-2 w-28">Line total</th>
                      {editMode && <th className="px-3 py-2 w-12" />}
                    </tr>
                  </thead>
                  <tbody>
                    {orderItemsRaw.map((it: any) => {
                      // Prefer the live menu_items.category (source
                      // of truth) over the stored description column.
                      // Pre-Wave-30.3 quote lines collapsed 'salad'
                      // and 'starter' into 'appetizer' and persisted
                      // that to order_items.description; using the
                      // joined category corrects the display without
                      // a data backfill.
                      // Source-of-truth order: the joined menu_item
                      // category, then a name-match against the live menu
                      // catalog (recovers the real category for legacy
                      // lines with no menu_item_id), then the stored
                      // description (which may hold the old collapsed
                      // "appetizer" value) as a last resort.
                      const nameKey = String(it.item_name || "").toLowerCase().trim();
                      const liveCategory = it.menu_item?.category
                        ? String(it.menu_item.category).toLowerCase()
                        : (nameKey && menuCategoryByName.has(nameKey)
                            ? String(menuCategoryByName.get(nameKey)).toLowerCase()
                            : null);
                      const categoryLabel = liveCategory || it.description || null;
                      return (
                      <tr key={it.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{it.item_name || "(unnamed)"}</div>
                          {categoryLabel && (
                            <div className="text-xs text-slate-500 mt-0.5">{categoryLabel}</div>
                          )}
                          {it.special_instructions && (
                            <div className="text-xs text-amber-700 mt-0.5">Note: {it.special_instructions}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{it.quantity ?? "-"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {C}{Number(it.unit_price || 0).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {C}{Number(it.line_total || (Number(it.quantity || 0) * Number(it.unit_price || 0))).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}
                        </td>
                        {editMode && (
                          <td className="px-3 py-2 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 h-7 w-7 p-0"
                              onClick={() => handleRemoveMenuItem(it.id)}
                              disabled={miRemoving === it.id}
                              title="Remove from order"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        )}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!editMode && orderItemsRaw.length > 0 && (
              <div className="text-xs text-slate-500 pt-1">
                Originating quote owns the totals. Tweak items here for last-minute adjustments and update Details &gt; Total to keep the invoice in sync.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="equipment" className="space-y-4 mt-4">
          {/* Equipment is tracked as bookings against the order_id, not
              as JSON on the order row. We fetch on modal open and let
              the operator add / remove inline when the modal is in
              edit mode. Booking window defaults to event_date +/- 1
              day; tweak via the Equipment page if you need exact
              pickup / return times. */}
          <div className="space-y-3">
            {/* Inline add form (edit mode only) */}
            {editMode && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                <Label className="text-xs font-semibold text-blue-900">Add equipment to this order</Label>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
                  <EquipmentTypeahead
                    companyId={(selectedOrder as any)?.company_id}
                    value={eqSearch}
                    onChange={setEqSearch}
                    onPick={(p) => { setEqPick(p); setEqSearch(p.name); }}
                  />
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-600">Qty</Label>
                    <Input
                      type="number"
                      min={1}
                      className="w-20 bg-white"
                      value={eqQty}
                      onChange={(e) => setEqQty(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAddEquipment}
                    disabled={eqAdding || !eqPick}
                    className="self-end"
                  >
                    {eqAdding ? "Adding..." : "Add"}
                  </Button>
                </div>
                {eqPick && (
                  <p className="text-xs text-slate-600">
                    Selected: <strong>{eqPick.name}</strong>
                    {eqPick.availableQuantity !== null ? ` · ${eqPick.availableQuantity} available` : ""}
                    {eqPick.rentalPrice ? ` · ${C}${Number(eqPick.rentalPrice).toLocaleString("en-ZA")} / day` : ""}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  Booking window auto-defaults to the day before through the day after the event. Refine on the Equipment page if needed.
                </p>
              </div>
            )}

            {equipmentLoading ? (
              <div className="text-center py-8 text-slate-400">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2" />
                <p className="text-sm">Loading equipment...</p>
              </div>
            ) : equipmentBookings.length === 0 && quoteEquipmentFallback.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/40 overflow-hidden">
                <div className="px-3 py-2 text-xs text-amber-800 bg-amber-100/60 border-b border-amber-200">
                  On the quote but not yet booked - no equipment_bookings exist for this order.
                  {editMode ? " Re-add via search above to create bookings." : " Click Edit to book these."}
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left px-3 py-2">Equipment</th>
                      <th className="text-right px-3 py-2 w-16">Qty</th>
                      <th className="text-left px-3 py-2">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quoteEquipmentFallback.map((e: any, i: number) => (
                      <tr key={e.equipment_id || e.id || i} className="border-t border-amber-100">
                        <td className="px-3 py-2 font-medium text-slate-900">{e.name || "(unnamed)"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{e.quantity ?? "-"}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">From quote</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : equipmentBookings.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No equipment booked for this order.</p>
                <p className="text-xs mt-1">
                  {editMode
                    ? "Use the search above to add items."
                    : "Click Edit on this order to add equipment."}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left px-3 py-2">Equipment</th>
                      <th className="text-right px-3 py-2 w-16">Qty</th>
                      <th className="text-left px-3 py-2 w-32">Status</th>
                      <th className="text-left px-3 py-2 w-44">Booked window</th>
                      {editMode && <th className="px-3 py-2 w-12" />}
                    </tr>
                  </thead>
                  <tbody>
                    {equipmentBookings.map((b: any) => {
                      const eqName = (b.equipment && (Array.isArray(b.equipment) ? b.equipment[0]?.name : b.equipment.name)) || "(equipment)";
                      const window = b.booked_from && b.booked_until
                        ? `${new Date(b.booked_from).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} → ${new Date(b.booked_until).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}`
                        : "-";
                      return (
                        <tr key={b.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-medium text-slate-900">{eqName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{b.quantity ?? "-"}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="capitalize">{b.status || "booked"}</Badge>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600">{window}</td>
                          {editMode && (
                            <td className="px-3 py-2 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 h-7 w-7 p-0"
                                onClick={() => handleRemoveEquipment(b.id)}
                                disabled={eqRemoving === b.id}
                                title="Remove from order"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer link out - for the rare case where the operator
                needs the full equipment management surface (catalog
                edits, exact times, returns workflow, damage reports). */}
            {!editMode && equipmentBookings.length > 0 && (
              <div className="text-xs text-slate-500 pt-1">
                Need to manage availability, returns or damages? Go to{" "}
                <Link
                  href={withSlug("/admin/equipment")}
                  onClick={() => setIsModalOpen(false)}
                  className="text-blue-700 hover:underline"
                >
                  Equipment
                </Link>
                .
              </div>
            )}
          </div>
        </TabsContent>

        {/* CLI-J (CLI-31): per-order client <-> caterer chat. Same
            OrderClientChatPanel the client uses, scoped to this
            order with sender_role="admin". OrderMessagesTab resolves
            the client's auth.users id so the outbound notification
            on staff sends targets the owning client directly. */}
        <TabsContent value="messages" className="space-y-4 mt-4">
          <OrderMessagesTab
            orderId={editedOrder.id}
            companyId={companyId}
            adminUserId={(user as any)?.id || null}
            clientId={(editedOrder as any).client_id || null}
            orderLabel={(editedOrder as any).order_number || editedOrder.event_name || null}
          />
        </TabsContent>

        <TabsContent value="amendments" className="space-y-4 mt-4">
          <AmendmentsTab
            orderId={editedOrder.id}
            currentOrder={editedOrder as any}
            onActioned={() => {
              // Re-pull the order after an approval since the diff
              // is now applied - the modal's currentOrder is stale.
              setSelectedOrder({ ...selectedOrder } as any);
            }}
          />
        </TabsContent>

        <TabsContent value="cancellations" className="space-y-4 mt-4">
          <CancellationRequestsTab
            orderId={editedOrder.id}
            companyId={(editedOrder as any).company_id ?? null}
            onActioned={() => {
              setIsModalOpen(false);
              loadOrders();
            }}
          />
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-4">
          <OrderHistoryTimeline orderId={editedOrder.id} orders={orders} />
        </TabsContent>
      </Tabs>
    </DialogContent>

    {/* Price-doesn't-scale confirmation. Pops when guest_count
        changes on Save - nudges the operator that price changes
        are a quote-level edit, not an order-level amendment. */}
    <Dialog open={priceAdjustOpen} onOpenChange={setPriceAdjustOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className={`w-5 h-5 ${isBigGuestChange ? "text-rose-600" : "text-amber-600"}`} />
            {isBigGuestChange ? "Big change. Update the quote" : "Confirm guest count change"}
          </DialogTitle>
          <DialogDescription>
            Guest count: <strong>{oldGuestCount}</strong> → <strong>{newGuestCount}</strong>
            {guestRatio !== 1 ? ` (${guestRatio < 1 ? "−" : "+"}${Math.round(guestDeltaPct * 100)}%)` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {isBigGuestChange ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 space-y-2">
              <p className="text-rose-900">
                A change of this size usually needs a re-think on price too (volume discount, menu mix, equipment, delivery fee). The cleanest path is to amend the <strong>quote / invoice</strong> directly so all the client-facing copy and totals stay aligned.
              </p>
              <p className="text-rose-900/80 text-xs">
                Inline order amendments are designed for small tweaks only.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-brand-primary/20 bg-brand-primary/10 p-3 space-y-2">
              <p className="text-brand-primary">
                Items + total will scale to the new guest count using the <strong>current per-unit prices</strong>.
              </p>
              <div className="flex items-center justify-between text-xs text-brand-primary/80 pt-1 border-t border-brand-primary/20">
                <span>Current total</span>
                <span className="tabular-nums">{C}{Number(oldTotal).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex items-center justify-between text-brand-primary font-semibold">
                <span>New total</span>
                <span className="tabular-nums">{C}{Number(projectedTotal).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}</span>
              </div>
              <p className="text-brand-primary/80 text-xs pt-1">
                To change the per-unit prices (e.g., volume discount, menu upgrade), update the source quote.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 justify-end mt-4">
          <Button
            variant="outline"
            onClick={() => setPriceAdjustOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          {/* On big changes, the quote link is the recommended
              path so it gets the primary styling. The "scale
              anyway" stays available for the rare case the
              operator knows what they're doing. */}
          {isBigGuestChange ? (
            <>
              <Button
                variant="outline"
                onClick={persistSave}
                disabled={saving}
                className="text-slate-700"
              >
                {saving ? "Scaling..." : "Scale inline anyway"}
              </Button>
              {(selectedOrder as any)?.quote_id && (
                <Button
                  onClick={() => {
                    setPriceAdjustOpen(false);
                    setIsModalOpen(false);
                    window.location.href = withSlug(`/admin/quotes/${(selectedOrder as any).quote_id}`);
                  }}
                  disabled={saving}
                >
                  Update quote / invoice
                </Button>
              )}
            </>
          ) : (
            <>
              {(selectedOrder as any)?.quote_id && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setPriceAdjustOpen(false);
                    setIsModalOpen(false);
                    window.location.href = withSlug(`/admin/quotes/${(selectedOrder as any).quote_id}`);
                  }}
                  disabled={saving}
                >
                  Update quote/invoice instead
                </Button>
              )}
              {/* Exact cents + dot-decimal like formatZAR (Callum 2026-07-08), no rounding. */}
              <Button onClick={persistSave} disabled={saving}>
                {saving ? "Saving..." : `Save + scale to ${C}${new Intl.NumberFormat("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(Number(projectedTotal)).map((p) => (p.type === "group" ? " " : p.type === "decimal" ? "." : p.value)).join("")}`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  </Dialog>
  {confirmDialog}
  </>
);
}
