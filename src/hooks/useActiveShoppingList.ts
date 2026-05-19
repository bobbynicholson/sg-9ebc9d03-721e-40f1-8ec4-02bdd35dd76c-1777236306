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
}

const ACTIVE_STATUSES = ["draft", "pending", "in_progress", "shopping", "open"];

export function useActiveShoppingList(): UseActiveShoppingList {
  const { user } = useAuth();
  const companyId = (user as { company_id?: string } | null)?.company_id;
  const userId = (user as { id?: string } | null)?.id;

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

      // SHP2-D (shopping deep audit, SHP2-14): soft-delete guard on
      // shopping_lists reads. driver_shifts has this; shopping did not.
      // A soft-deleted list could ghost into the user's "active list".

      // 1. Try lists assigned to the current shopper first.
      const { data: mineRows } = await sb
        .from("shopping_lists")
        .select("*")
        .eq("company_id", companyId)
        .eq("shopper_id", userId)
        .is("deleted_at", null)
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
          .is("deleted_at", null)
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

      // SHP2-F (SHP2-31): pull the linked inventory_item's preferred
      // supplier so the dashboard can group "buy at PnP" vs "buy at
      // Makro". One round trip - the select reaches through item_id
      // -> inventory_items -> suppliers via the standard FK joins.
      // Items without an inventory link (freestyle adds) get null
      // supplier and fall into an "Other" group.
      const { data: itemRows, error: itemsErr } = await sb
        .from("shopping_list_items")
        .select(`
          *,
          inventory_items:item_id (
            preferred_supplier_id,
            suppliers:preferred_supplier_id ( supplier_name )
          )
        `)
        .eq("shopping_list_id", row.id)
        // SHP2-D (SHP2-15): same soft-delete guard on items.
        .is("deleted_at", null)
        .order("purchased", { ascending: true })
        .order("name", { ascending: true });

      if (itemsErr) {
        setError(itemsErr.message || "Could not load list items");
        setItems([]);
      } else {
        // Flatten the join into supplier_id / supplier_name on the
        // ActiveListItem shape. Keeps the consumer code simple.
        const flat = (itemRows || []).map((r: any) => ({
          ...r,
          supplier_id: r.inventory_items?.preferred_supplier_id ?? null,
          supplier_name: r.inventory_items?.suppliers?.supplier_name ?? null,
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
    const sub = supabase
      .channel(`shopping-list-${activeListId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "shopping_list_items", filter: `shopping_list_id=eq.${activeListId}` }, () => { void load(); })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "shopping_lists", filter: `id=eq.${activeListId}` }, () => { void load(); })
      .subscribe();
    return () => { void sub.unsubscribe(); };
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

  // Create a fresh list, auto-assigning shopper_id to current user.
  const ensureList = useCallback(async (): Promise<string | null> => {
    if (list) return list.id;
    if (!companyId || !userId) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: created, error: cErr } = await sb
      .from("shopping_lists")
      .insert([{
        company_id: companyId,
        user_id: userId,
        shopper_id: userId,
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
    return created.id as string;
  }, [list, companyId, userId]);

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
    const patch: Record<string, unknown> = {
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
    }
  }, [items]);

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
  };
}
