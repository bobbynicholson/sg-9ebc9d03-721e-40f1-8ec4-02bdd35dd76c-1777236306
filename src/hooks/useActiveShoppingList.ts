/**
 * useActiveShoppingList - Wave 70.30
 *
 * Returns the current user's active shopping_list with its items,
 * plus mutation helpers (toggle purchased, add item, create new
 * list, complete). One canonical source of truth for everything
 * that wants to read or mutate "the list I'm working on".
 *
 * Resolution order (one-shopper-per-tenant is the dominant case):
 *   1. shopping_lists with shopper_id = current user AND status in
 *      (draft, pending, in_progress, shopping) - most recent
 *   2. shopping_lists with shopper_id IS NULL AND status above --
 *      fallback for lists created by /buy-list before assignment
 *   3. null - no active list yet
 *
 * Auto-refresh on tab focus so a list created on phone surfaces on
 * desktop without manual reload. No polling - the hook is meant
 * for view-level reads, not background tickers.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toLocalISO } from "@/lib/localDate";
import { notificationService } from "@/services/notificationService";
import { UserRole } from "@/types/app";

export interface ActiveListItem {
  id: string;
  shopping_list_id: string;
  item_id: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  purchased: boolean;
  notes: string | null;
  created_at: string | null;
  // SHP2-F (shopping deep audit, SHP2-31): supplier metadata pulled
  // through inventory_items.preferred_supplier_id so the dashboard
  // can group "buy these at PnP" / "buy these at Makro". Null when
  // the row is a freestyle add (no inventory_item linked) or the
  // linked inventory item has no preferred supplier.
  supplier_id: string | null;
  supplier_name: string | null;
  // Shopping persona follow-up 5.4: per-line claim. Lets two shoppers
  // split a list by section without duplicate purchases. NULL = nobody
  // has claimed the line (default for legacy + new lines).
  assigned_shopper_id: string | null;
  /** Display name resolved from the profiles join. NULL when nobody
   *  has claimed the line, or when the assigned profile was deleted
   *  (FK ON DELETE SET NULL). */
  assigned_shopper_name: string | null;
}

export interface ActiveList {
  id: string;
  list_date: string | null;
  status: string;
  title: string | null;
  notes: string | null;
  shopper_id: string | null;
  user_id: string | null;
  estimated_total: number | null;
  actual_total: number | null;
  receipt_url: string | null;
  source: string | null;
  /** True when shopper_id matches the current user. Drives the
   *  "Your list" vs "Team list" framing in nav + dashboard. */
  isYours: boolean;
}

export interface UseActiveShoppingList {
  list: ActiveList | null;
  items: ActiveListItem[];
  loading: boolean;
  error: string | null;
  /** Reload list + items from the server. */
  refresh: () => void;
  /** Toggle the purchased flag on a single item. Optimistic update,
   *  rolls back on failure. */
  togglePurchased: (itemId: string, nextValue: boolean) => Promise<void>;
  /** Add an item to the current list, or start a new list if there
   *  isn't one. Returns the created/updated item. */
  addItem: (input: {
    name: string;
    quantity: number;
    unit?: string | null;
    item_id?: string | null;
    notes?: string | null;
  }) => Promise<ActiveListItem | null>;
  /** Bulk-add items. Creates a new list if none active. Auto-assigns
   *  shopper_id to current user on creation. */
  addItems: (inputs: Array<{
    name: string;
    quantity: number;
    unit?: string | null;
    item_id?: string | null;
    notes?: string | null;
  }>) => Promise<{ listId: string; itemCount: number } | null>;
  /** Mark the entire list complete (records actual_total, sets
   *  status='completed', stamps completed_at). */
  completeList: (actualTotal?: number) => Promise<void>;
  /** SHP2-I: toggle the "out of stock at supplier" tag on an item.
   *  Stored as a notes prefix `[OOS@SupplierName]`. Tapping again
   *  removes the tag (idempotent). */
  flagOutOfStock: (itemId: string, supplierName: string | null) => Promise<void>;
  /** SHP2-H: tick a list row by inventory_item_id resolved from a barcode scan. */
  tickByInventoryItemId: (
    inventoryItemId: string,
  ) => Promise<{ found: boolean; alreadyPurchased: boolean; itemName: string | null }>;
  /** Shopping 5.4: claim a line for the current user. Pass `null` to
   *  release the claim. Optimistic update, rolls back on failure. */
  claimItem: (itemId: string, claim: boolean) => Promise<void>;
}

const ACTIVE_STATUSES = ["draft", "pending", "in_progress", "shopping", "open"];

export function useActiveShoppingList(): UseActiveShoppingList {
  const { user } = useAuth();
  const companyId = (user as { company_id?: string } | null)?.company_id;
  const userId = (user as { id?: string } | null)?.id;
  // Creator's role decides ownership of a freshly created list (see
  // ensureList): a shopper owns their own run; an admin/owner starts a
  // shared "team list" that any shopper can pick up + gets pinged about.
  const role = (user as { role?: string } | null)?.role;

  const [list, setList] = useState<ActiveList | null>(null);
  const [items, setItems] = useState<ActiveListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId || !userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      // NOTE: shopping_lists has NO deleted_at column. The SHP2-D
      // "soft-delete guard" filtered on a column that was never added by
      // any migration, so every read failed with column-not-found and
      // the active list came back empty - the user saw "No active
      // shopping list" even right after a successful add (the insert
      // only touches columns that exist, so it succeeded). shopping_lists
      // is not soft-deleted, so drop the filter entirely.
      // (shopping_list_items uses removed_at - handled below.)

      // 1. Try lists assigned to the current shopper first.
      const { data: mineRows } = await sb
        .from("shopping_lists")
        .select("*")
        .eq("company_id", companyId)
        .eq("shopper_id", userId)
        .in("status", ACTIVE_STATUSES)
        .order("list_date", { ascending: false })
        .limit(1);

      let row = mineRows?.[0] || null;
      let isYours = !!row;

      // 2. Fallback to unassigned lists (created by /buy-list without
      //    a shopper picked yet).
      if (!row) {
        const { data: unassignedRows } = await sb
          .from("shopping_lists")
          .select("*")
          .eq("company_id", companyId)
          .is("shopper_id", null)
          .in("status", ACTIVE_STATUSES)
          .order("list_date", { ascending: false })
          .limit(1);
        row = unassignedRows?.[0] || null;
        isYours = false;
      }

      if (!row) {
        setList(null);
        setItems([]);
        setError(null);
        return;
      }

      setList({
        id: row.id,
        list_date: row.list_date,
        status: row.status,
        title: row.title,
        notes: row.notes,
        shopper_id: row.shopper_id,
        user_id: row.user_id,
        estimated_total: row.estimated_total ?? null,
        actual_total: row.actual_total ?? null,
        receipt_url: row.receipt_url ?? null,
        source: row.source ?? null,
        isYours,
      });

      // Base item rows. NO PostgREST embeds here: shopping_list_items.
      // item_id was added as a bare uuid column with no REFERENCES
      // clause, so there's no FK for PostgREST to embed inventory_items
      // through - the old nested select 400'd ("could not find a
      // relationship"). We resolve supplier + assigned-shopper names in
      // separate plain lookups below instead.
      const { data: itemRows, error: itemsErr } = await sb
        .from("shopping_list_items")
        .select("*")
        .eq("shopping_list_id", row.id)
        // Soft-delete guard. shopping_list_items uses `removed_at` (with
        // removed_reason) - NOT deleted_at, which doesn't exist on this
        // table and made this read fail with column-not-found.
        .is("removed_at", null)
        .order("purchased", { ascending: true })
        .order("name", { ascending: true });

      if (itemsErr) {
        setError(itemsErr.message || "Could not load list items");
        setItems([]);
      } else {
        const rows = (itemRows || []) as any[];

        // Resolve preferred supplier per linked inventory item (SHP2-F
        // grouping) via two plain queries - no embeds. Freestyle adds
        // (no item_id) just get null supplier and fall into "Other".
        const supplierByItemId = new Map<string, { supplier_id: string | null; supplier_name: string | null }>();
        const itemIds = [...new Set(rows.map(r => r.item_id).filter(Boolean))] as string[];
        if (itemIds.length > 0) {
          const { data: invRows } = await sb
            .from("inventory_items")
            .select("id, preferred_supplier_id")
            .in("id", itemIds);
          const supplierIds = [...new Set((invRows || []).map((r: any) => r.preferred_supplier_id).filter(Boolean))] as string[];
          const nameById = new Map<string, string | null>();
          if (supplierIds.length > 0) {
            const { data: supRows } = await sb
              .from("suppliers")
              .select("id, supplier_name")
              .in("id", supplierIds);
            for (const s of (supRows || []) as any[]) nameById.set(s.id, s.supplier_name ?? null);
          }
          for (const ir of (invRows || []) as any[]) {
            supplierByItemId.set(ir.id, {
              supplier_id: ir.preferred_supplier_id ?? null,
              supplier_name: ir.preferred_supplier_id ? (nameById.get(ir.preferred_supplier_id) ?? null) : null,
            });
          }
        }

        // Resolve claimed-by names (assigned_shopper_id) the same way.
        const assignedNameById = new Map<string, string | null>();
        const assignedIds = [...new Set(rows.map(r => r.assigned_shopper_id).filter(Boolean))] as string[];
        if (assignedIds.length > 0) {
          const { data: profRows } = await sb
            .from("profiles")
            .select("id, full_name")
            .in("id", assignedIds);
          for (const p of (profRows || []) as any[]) assignedNameById.set(p.id, p.full_name ?? null);
        }

        const flat = rows.map((r: any) => ({
          ...r,
          supplier_id: r.item_id ? (supplierByItemId.get(r.item_id)?.supplier_id ?? null) : null,
          supplier_name: r.item_id ? (supplierByItemId.get(r.item_id)?.supplier_name ?? null) : null,
          assigned_shopper_id: r.assigned_shopper_id ?? null,
          assigned_shopper_name: r.assigned_shopper_id ? (assignedNameById.get(r.assigned_shopper_id) ?? null) : null,
        })) as ActiveListItem[];
        setItems(flat);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load active list");
    } finally {
      setLoading(false);
    }
  }, [companyId, userId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  // SHP2-C (shopping deep audit, SHP2-25 / SHP2-26): supabase realtime
  // sub so multi-device usage (desktop for buy-list pickabout + phone
  // in the supermarket) syncs without a tab-focus event. Channel-level
  // filter on shopping_list_id; admin reassignments to the list flip
  // via the shopping_lists sub on the same channel.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeListId = (list as any)?.id ?? null;
  useEffect(() => {
    if (!activeListId) return;
    // Unique suffix per subscription instance. Supabase reuses an
    // existing channel object when the name collides, so a remount
    // (route nav, StrictMode, the list id arriving after first paint)
    // lands on an already-subscribed channel and `.on()` throws
    // "cannot add postgres_changes callbacks after subscribe()" - which
    // bubbles up uncaught and white-screens the page. A random suffix +
    // removeChannel cleanup guarantees a fresh channel every time (same
    // fix the notification service already uses).
    const channel = supabase
      .channel(`shopping-list-${activeListId}-${Math.random().toString(36).slice(2, 10)}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "shopping_list_items", filter: `shopping_list_id=eq.${activeListId}` }, () => { void load(); })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "shopping_lists", filter: `id=eq.${activeListId}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeListId, load]);

  const togglePurchased = useCallback(async (itemId: string, nextValue: boolean) => {
    // SHP2-B (shopping deep audit, SHP2-22): tick must bump inventory.
    // The admin /admin/shopping page already does this; the staff side
    // used to flip a boolean and stop. Net effect was a "vibes-only"
    // dashboard - shopper ticks, nothing downstream knows.
    //
    // We use the in-memory row to find item_id + quantity (no extra
    // SELECT needed). When item_id is null (free-text additions like
    // "extra serviettes" that aren't linked to inventory_items), we
    // skip the stock bump.
    const target = items.find(i => i.id === itemId);

    // Optimistic update for instant feedback.
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, purchased: nextValue } : i));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error: updErr } = await sb
      .from("shopping_list_items")
      .update({ purchased: nextValue })
      .eq("id", itemId);
    if (updErr) {
      // Rollback on failure.
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, purchased: !nextValue } : i));
      setError(updErr.message || "Could not save");
      return;
    }

    // Inventory bump - non-blocking on the user-visible toggle. If
    // this fails, the tick still stuck (the row is updated) and we
    // log a warning rather than rolling back, because the tick is
    // the source of truth and inventory can be reconciled later.
    if (target && target.item_id && Number.isFinite(Number(target.quantity))) {
      const qty = Number(target.quantity);
      const delta = nextValue ? qty : -qty;
      try {
        const { data: invRow, error: readErr } = await sb
          .from("inventory_items")
          .select("current_stock")
          .eq("id", target.item_id)
          .maybeSingle();
        if (readErr || !invRow) {
          console.warn("[useActiveShoppingList] inventory read failed:", readErr);
        } else {
          const newStock = Number(invRow.current_stock || 0) + delta;
          const { error: writeErr } = await sb
            .from("inventory_items")
            .update({ current_stock: newStock, updated_at: new Date().toISOString() })
            .eq("id", target.item_id);
          if (writeErr) {
            console.warn("[useActiveShoppingList] inventory bump failed:", writeErr);
          }
        }
      } catch (e) {
        console.warn("[useActiveShoppingList] inventory bump threw:", e);
      }
    }

    // SHP2-C (SHP2-23): cross-tab signal. Admin /admin/shopping +
    // /admin/inventory + cashflow forecast all want to know. Generic
    // event payload so listeners can decide whether to refetch.
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(new CustomEvent("cateringms:shopping-updated", {
          detail: { itemId, purchased: nextValue, inventoryItemId: target?.item_id ?? null },
        }));
      } catch { /* old browsers without CustomEvent polyfill */ }
    }
  }, [items]);

  // Create a fresh list.
  //
  // Ownership rule: a shopper starting their own run owns it (shopper_id
  // = themselves -> "your list"). An admin/owner/manager who kicks off a
  // run on behalf of the team leaves shopper_id NULL so the list surfaces
  // as the shared "team list" that ANY shopping_staff member picks up via
  // resolution fallback #2. Previously every list was stamped with the
  // creator's id, so an admin-created list was invisible to the actual
  // shoppers - they'd open the dashboard and see "No active shopping list".
  const ensureList = useCallback(async (): Promise<string | null> => {
    if (list) return list.id;
    if (!companyId || !userId) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const isShopper = role === UserRole.SHOPPING_STAFF;
    const shopperId = isShopper ? userId : null;
    const { data: created, error: cErr } = await sb
      .from("shopping_lists")
      .insert([{
        company_id: companyId,
        user_id: userId,
        shopper_id: shopperId,
        list_date: toLocalISO(new Date()),
        status: "in_progress",
        source: "manual",
        title: `Shopping ${toLocalISO(new Date())}`,
      }])
      .select()
      .single();
    if (cErr || !created) {
      setError(cErr?.message || "Could not create list");
      return null;
    }
    // Communication: when an admin/owner starts a team list, ping the
    // shopping team so the assigned shopper isn't left polling the buy
    // list. Self-started shopper runs skip this (they already know).
    // Best-effort - a notification failure must never block list
    // creation. dedup guards against a double-create race re-pinging.
    if (!isShopper) {
      try {
        await notificationService.broadcastNotification({
          companyId,
          type: "shopping_list_created",
          title: "New shopping list ready",
          message: "A shopping run has been started for the team. Open the Buy list to see what's short and tick items as you buy them.",
          targetRoles: [UserRole.SHOPPING_STAFF],
          priority: "normal",
          link: "/team-portal/shopping/dashboard",
          relatedEntityType: "shopping_list",
          relatedEntityId: created.id as string,
          dedup: true,
        });
      } catch (notifyErr) {
        console.warn("[useActiveShoppingList] new-list notification failed:", notifyErr);
      }
    }
    return created.id as string;
  }, [list, companyId, userId, role]);

  const addItem = useCallback(async (input: {
    name: string;
    quantity: number;
    unit?: string | null;
    item_id?: string | null;
    notes?: string | null;
  }): Promise<ActiveListItem | null> => {
    const listId = await ensureList();
    if (!listId) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data, error: iErr } = await sb
      .from("shopping_list_items")
      .insert([{
        shopping_list_id: listId,
        user_id: userId,
        name: input.name,
        quantity: input.quantity,
        unit: input.unit ?? null,
        item_id: input.item_id ?? null,
        notes: input.notes ?? null,
        purchased: false,
      }])
      .select()
      .single();
    if (iErr) {
      setError(iErr.message || "Could not add item");
      return null;
    }
    await load();
    return data as ActiveListItem;
  }, [ensureList, userId, load]);

  const addItems = useCallback(async (inputs: Array<{
    name: string;
    quantity: number;
    unit?: string | null;
    item_id?: string | null;
    notes?: string | null;
  }>): Promise<{ listId: string; itemCount: number } | null> => {
    if (inputs.length === 0) return null;
    const listId = await ensureList();
    if (!listId) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const rows = inputs.map(input => ({
      shopping_list_id: listId,
      user_id: userId,
      name: input.name,
      quantity: input.quantity,
      unit: input.unit ?? null,
      item_id: input.item_id ?? null,
      notes: input.notes ?? null,
      purchased: false,
    }));
    const { error: iErr } = await sb.from("shopping_list_items").insert(rows);
    if (iErr) {
      setError(iErr.message || "Could not add items");
      return null;
    }
    await load();
    return { listId, itemCount: rows.length };
  }, [ensureList, userId, load]);

  const completeList = useCallback(async (actualTotal?: number) => {
    if (!list) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    // shopping_lists has neither completed_at nor updated_at columns
    // (only created_at). Writing them made the UPDATE fail with
    // column-not-found, so a list could never be marked complete. Set
    // only the columns that exist: status (+ actual_total when given).
    const patch: Record<string, unknown> = {
      status: "completed",
    };
    if (typeof actualTotal === "number") patch.actual_total = actualTotal;
    const { error: cErr } = await sb
      .from("shopping_lists")
      .update(patch)
      .eq("id", list.id);
    if (cErr) {
      setError(cErr.message || "Could not complete list");
      return;
    }
    // SHP2-E (shopping deep audit, SHP2-30): when the shopper records
    // an actual spend, write a matching supplier_payables row so the
    // cashflow forecast immediately picks it up instead of waiting on
    // the bookkeeper to type it in by hand. v1 writes a single
    // mixed-supplier payable (supplier_id = null) with a 30-day net
    // due date - the shopping run typically spans multiple suppliers
    // and the receipts page is where per-supplier splits get
    // reconciled later. Notes link back to the list for traceability.
    if (typeof actualTotal === "number" && actualTotal > 0 && companyId) {
      try {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        const amountCents = Math.round(actualTotal * 100);
        const { error: payErr } = await sb
          .from("supplier_payables")
          .insert({
            company_id: companyId,
            supplier_id: null,
            amount_cents: amountCents,
            due_date: toLocalISO(dueDate),
            notes: `Shopping run · list ${list.id.slice(0, 8)} · ${list.title || "shopping list"}`,
            status: "pending",
            created_by: userId ?? null,
          });
        if (payErr) {
          // Don't roll back the list-complete - bookkeeper can still
          // record manually. Just warn so we see this in logs.
          console.warn("[useActiveShoppingList] supplier_payables write failed:", payErr);
        }
      } catch (e) {
        console.warn("[useActiveShoppingList] supplier_payables threw:", e);
      }
    }
    // SHP2-C (SHP2-24): completeList broadcasts so cashflow forecast
    // moves committed -> actual, payables surface refreshes, and
    // admin /admin/shopping "today's run" badge clears. Listeners
    // for cateringms:shopping-updated can act on detail.completed=true.
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(new CustomEvent("cateringms:shopping-updated", {
          detail: { listId: list.id, completed: true, actualTotal: actualTotal ?? null },
        }));
      } catch { /* old browsers without CustomEvent polyfill */ }
    }
    // Communication: close the loop back to the admins/owners so they
    // know the run is done and can verify receipts + close out. Mirrors
    // the "new list ready" ping that goes the other way to shoppers.
    // Best-effort - never block list completion on a notification error.
    if (companyId) {
      try {
        await notificationService.broadcastNotification({
          companyId,
          type: "shopping_completed",
          title: "Shopping completed",
          message: typeof actualTotal === "number" && actualTotal > 0
            ? `${list.title || "A shopping list"} is done - actual spend recorded. Snap the receipt to reconcile.`
            : `${list.title || "A shopping list"} is done. Awaiting a receipt to close it out.`,
          targetRoles: [UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN],
          priority: "normal",
          link: `/admin/shopping?listId=${list.id}`,
          relatedEntityType: "shopping_list",
          relatedEntityId: list.id,
          dedup: true,
        });
      } catch (notifyErr) {
        console.warn("[useActiveShoppingList] completion notification failed:", notifyErr);
      }

      // Communication (the OTHER direction): when a kitchen-shortfall
      // list is done, tell the KITCHEN their ingredients are in so they
      // can start prep. The kitchen pings shopping when short, but
      // nothing closed the loop back - the chef never knew the buy was
      // done. Only fires for kitchen_shortfall lists (a generic ad-hoc
      // shop doesn't concern the kitchen). Best-effort + dedup.
      if (list.source === "kitchen_shortfall") {
        try {
          await notificationService.broadcastNotification({
            companyId,
            type: "shopping_completed",
            title: "Ingredients are in - ready to prep",
            message: "The shopping run for your kitchen shortfall is done. The ingredients are now in stock - you're clear to start prep.",
            targetRoles: [UserRole.KITCHEN_STAFF],
            priority: "normal",
            link: "/team-portal/kitchen/prep-list",
            relatedEntityType: "shopping_list",
            relatedEntityId: list.id,
            dedup: true,
          });
        } catch (notifyErr) {
          console.warn("[useActiveShoppingList] kitchen ready notification failed:", notifyErr);
        }
      }
    }
    await load();
  }, [list, load, userId, companyId]);

  // SHP2-I (shopping deep audit, SHP2-33): toggle "out of stock at
  // this supplier" tag on an item. Stored as a notes prefix
  // `[OOS@SupplierName] ` so the data survives a roundtrip without
  // a schema migration. The admin shopping + receipts pages can
  // parse the tag to surface re-shop tasks later.
  //
  // V1 keeps the existing notes intact - if there's already a body,
  // we prepend the tag. Toggling again removes the tag (idempotent).
  const flagOutOfStock = useCallback(async (
    itemId: string,
    supplierName: string | null,
  ): Promise<void> => {
    const target = items.find((i) => i.id === itemId);
    if (!target) return;
    const supplier = supplierName ?? "Unknown";
    const tag = `[OOS@${supplier}]`;
    const tagRegex = new RegExp(`\\s*\\[OOS@[^\\]]+\\]\\s*`, "g");
    const currentNotes = target.notes ?? "";
    const alreadyFlagged = tagRegex.test(currentNotes);
    tagRegex.lastIndex = 0; // reset state after test()
    let nextNotes: string;
    if (alreadyFlagged) {
      // Remove every OOS tag so the row can be tried again at this
      // (or a different) supplier without piling up stale tags.
      nextNotes = currentNotes.replace(tagRegex, " ").trim();
    } else {
      nextNotes = currentNotes
        ? `${tag} ${currentNotes}`.trim()
        : tag;
    }
    // Optimistic update.
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, notes: nextNotes || null } : i)),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error: updErr } = await sb
      .from("shopping_list_items")
      .update({ notes: nextNotes || null })
      .eq("id", itemId);
    if (updErr) {
      // Rollback on failure.
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, notes: currentNotes || null } : i)),
      );
      setError(updErr.message || "Could not save out-of-stock flag");
      return;
    }
    // Communication: a freshly-flagged out-of-stock item means the run
    // can't fully cover demand - tell the admins/owners so they can
    // re-source or adjust the order. Only on flag-on; clearing the tag
    // is silent. dedup keeps a toggle from re-pinging for the same item.
    if (!alreadyFlagged && companyId) {
      try {
        await notificationService.broadcastNotification({
          companyId,
          type: "shopping_item_out_of_stock",
          title: "Item out of stock",
          message: `${target.name} couldn't be bought at ${supplier}. It may need re-sourcing or an order adjustment.`,
          targetRoles: [UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN],
          priority: "normal",
          link: "/admin/shopping",
          relatedEntityType: "shopping_list_item",
          relatedEntityId: itemId,
          dedup: true,
        });
      } catch (notifyErr) {
        console.warn("[useActiveShoppingList] out-of-stock notification failed:", notifyErr);
      }
    }
  }, [items, companyId]);

  // SHP2-H (shopping deep audit, SHP2-22): tick by inventory_item_id
  // resolved from a barcode scan. Finds the matching shopping_list_items
  // row and flips purchased via togglePurchased so the SHP2-B inventory
  // chain reaction fires identically to a manual row tap.
  const tickByInventoryItemId = useCallback(async (
    inventoryItemId: string,
  ): Promise<{ found: boolean; alreadyPurchased: boolean; itemName: string | null }> => {
    const target = items.find((i) => i.item_id === inventoryItemId);
    if (!target) return { found: false, alreadyPurchased: false, itemName: null };
    if (target.purchased) return { found: true, alreadyPurchased: true, itemName: target.name };
    await togglePurchased(target.id, true);
    return { found: true, alreadyPurchased: false, itemName: target.name };
  }, [items, togglePurchased]);

  // Shopping persona 5.4: claim a line for the current user (or
  // release the claim). Two-shopper days previously had no signal
  // for who was on which row, leading to duplicate purchases at the
  // checkout. Schema landed in 20260521130000; this is the UI write
  // path. Optimistic, rolls back on failure. Setting `claim=false`
  // on a row claimed by someone else does nothing (the UI shouldn't
  // surface the option, but we guard server-side too via RLS).
  const claimItem = useCallback(async (
    itemId: string,
    claim: boolean,
  ): Promise<void> => {
    if (!userId) return;
    const target = items.find((i) => i.id === itemId);
    if (!target) return;
    const nextShopperId = claim ? userId : null;
    const nextShopperName = claim
      ? ((user as { full_name?: string; name?: string } | null)?.full_name
          ?? (user as { full_name?: string; name?: string } | null)?.name
          ?? "You")
      : null;
    // Optimistic update.
    setItems((prev) => prev.map((i) =>
      i.id === itemId
        ? { ...i, assigned_shopper_id: nextShopperId, assigned_shopper_name: nextShopperName }
        : i,
    ));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error: updErr } = await sb
      .from("shopping_list_items")
      .update({ assigned_shopper_id: nextShopperId })
      .eq("id", itemId);
    if (updErr) {
      // Rollback on failure.
      setItems((prev) => prev.map((i) =>
        i.id === itemId
          ? { ...i, assigned_shopper_id: target.assigned_shopper_id, assigned_shopper_name: target.assigned_shopper_name }
          : i,
      ));
      setError(updErr.message || "Could not save claim");
    }
  }, [items, userId, user]);

  return {
    list,
    items,
    loading,
    error,
    refresh: () => { void load(); },
    togglePurchased,
    addItem,
    addItems,
    completeList,
    flagOutOfStock,
    tickByInventoryItemId,
    claimItem,
  };
}
