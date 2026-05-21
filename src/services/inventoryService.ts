/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { toLocalISO } from "@/lib/localDate";

export type Inventory = Tables<"inventory_items">;

export const inventoryService = {
  async getInventory(companyId: string): Promise<Inventory[]> {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("item_name");

    if (error) {
      console.error("Error fetching inventory:", error);
      return [];
    }

    return data || [];
  },

  /**
   * Inventory visible to a specific branch.
   *
   * Returns the union of:
   *   * items pinned to this region (region_id = regionId)
   *   * items flagged as shared (is_shared = true) - the company-wide
   *     pool, available to every branch
   *
   * Pass regionId = null for company-wide views (returns everything).
   * Used by the kitchen prep + shopping list flows so a CPT prep run
   * doesn't draw down JHB-pinned stock by accident.
   */
  async getInventoryForRegion(
    companyId: string,
    regionId: string | null,
  ): Promise<Inventory[]> {
    let query = supabase
      .from("inventory_items")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (regionId) {
      // PostgREST `or` filter: region_id matches OR is_shared = true.
      query = query.or(`region_id.eq.${regionId},is_shared.eq.true`);
    }

    const { data, error } = await query.order("item_name");
    if (error) {
      console.error("Error fetching region inventory:", error);
      return [];
    }
    return data || [];
  },

  /**
   * Cost-stripped getter for surfaces that should never see rand values
   * (kitchen tablet today, possibly other operator surfaces in future).
   * Mirrors the listStaffPublic / listStaffWithRates split from Phase 5
   * so the visibility seal is consistent across the app.
   */
  async getInventoryPublic(companyId: string): Promise<Inventory[]> {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("id, company_id, item_name, category, sku, unit_of_measure, current_stock, minimum_stock, maximum_stock, reorder_quantity, storage_location, storage_instructions, is_perishable, shelf_life_days, region_id, created_at, updated_at, deleted_at, preferred_supplier_id, description")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("item_name");

    if (error) {
      console.error("Error fetching public inventory:", error);
      return [];
    }
    return (data || []) as Inventory[];
  },

  /**
   * Returns the set of inventory_item_ids that are referenced by at least
   * one recipe ingredient for this company. Used by the kitchen stock
   * filter "Used in recipes" so chefs see only what their dishes need.
   */
  async getInventoryIdsUsedInRecipes(companyId: string): Promise<Set<string>> {
    const { data, error } = await supabase
      .from("recipe_ingredients")
      .select("inventory_item_id, recipes!inner ( company_id )")
      .eq("recipes.company_id", companyId)
      .not("inventory_item_id", "is", null);
    if (error) {
      console.warn("getInventoryIdsUsedInRecipes failed:", error);
      return new Set();
    }
    const s = new Set<string>();
    for (const r of (data || []) as any[]) {
      if (r.inventory_item_id) s.add(r.inventory_item_id);
    }
    return s;
  },

  async getInventoryItem(itemId: string): Promise<Inventory | null> {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("id", itemId)
      .single();

    if (error) {
      console.error("Error fetching inventory item:", error);
      return null;
    }

    return data;
  },

  async createInventoryItem(item: Partial<Inventory>): Promise<Inventory | null> {
    const { data, error } = await supabase
      .from("inventory_items")
      .insert([item] as any)
      .select()
      .single();

    if (error) {
      console.error("Error creating inventory item:", error);
      throw error;
    }

    return data;
  },

  async updateInventoryItem(itemId: string, updates: Partial<Inventory>): Promise<Inventory | null> {
    const { data, error } = await supabase
      .from("inventory_items")
      .update(updates)
      .eq("id", itemId)
      .select()
      .single();

    if (error) {
      console.error("Error updating inventory item:", error);
      throw error;
    }

    return data;
  },

  async deleteInventoryItem(itemId: string): Promise<boolean> {
    const { error } = await supabase
      .from("inventory_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", itemId);

    if (error) {
      console.error("Error deleting inventory item:", error);
      throw error;
    }

    return true;
  },

  /**
   * Update current_stock and write an audit row to inventory_transactions.
   * `transactionType` defaults to "adjustment" but should be one of the proper
   * enum values (adjustment | usage | waste | transfer | return) so the
   * movement history reads truthfully. Quantity stored is the delta.
   */
  async adjustStock(
    itemId: string,
    newStock: number,
    performedBy: string,
    notes?: string,
    transactionType: "adjustment" | "usage" | "waste" | "transfer" | "return" = "adjustment",
  ): Promise<Inventory | null> {
    const current = await this.getInventoryItem(itemId);
    if (!current) throw new Error("Inventory item not found");

    const previous = Number(current.current_stock || 0);
    const delta = Number(newStock) - previous;

    const { data, error } = await supabase
      .from("inventory_items")
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq("id", itemId)
      .select()
      .single();

    if (error) {
      console.error("Error adjusting stock:", error);
      throw error;
    }

    // FIFO batch consumption on outflows. Skipped silently when no batches
    // exist for legacy items, so this never blocks the user.
    if (delta < 0 && transactionType !== "adjustment") {
      await this._consumeFromBatches(itemId, Math.abs(delta));
    }

    if (delta !== 0) {
      await supabase.from("inventory_transactions").insert([{
        company_id: current.company_id,
        inventory_item_id: itemId,
        transaction_type: transactionType,
        quantity: delta,
        performed_by: performedBy,
        notes: notes ?? `Manual ${transactionType} from ${previous} to ${newStock}`,
      }]);
    }

    // Cleaning persona follow-up (docs/personas/cleaning.md 5.3):
    // when an outflow drops stock from above-par to at-or-below-par,
    // ping the shopping team. The page-level "low stock" filter is
    // reactive (chef has to check); this is the proactive signal.
    // Only fires on the FIRST crossing per direction so re-saving
    // usage on an already-low item doesn't spam admins. Dedup window
    // is 24h on the same item to be defensive against multiple
    // consume cycles in one shift.
    try {
      const minStock = Number((current as any).minimum_stock || 0);
      const crossedBelowPar =
        delta < 0 && previous > minStock && newStock <= minStock && minStock > 0;
      if (crossedBelowPar && current.company_id) {
        const { notificationService } = await import("@/services/notificationService");
        const itemName = (current as any).item_name || "Item";
        const unit = (current as any).unit_of_measure || "";
        await notificationService.broadcastNotification({
          companyId: current.company_id,
          targetRoles: ["company_admin", "admin", "owner", "shopping_staff"] as any,
          title: `Low stock: ${itemName}`,
          message: `${itemName} dropped to ${newStock} ${unit} (par ${minStock}). Restock soon.`,
          type: "stock_low" as any,
          priority: newStock <= 0 ? "high" : "normal",
          link: "/admin/inventory",
          relatedEntityType: "inventory_item",
          relatedEntityId: itemId,
          dedup: true,
          dedupWindowMinutes: 60 * 24,
        });
      }
    } catch (notifErr) {
      // Non-fatal: stock row already saved.
      console.warn("[inventoryService.adjustStock] stock_low notify failed:", notifErr);
    }

    return data;
  },

  /**
   * FIFO consumption helper. Walks active batches for an item ordered by
   * received_date ASC and decrements each batch's remaining quantity until
   * the requested amount is fulfilled. Best effort - if there's not enough
   * tracked in batches, we just consume what's available and let the caller's
   * inventory_items.current_stock update absorb the rest. Means batches and
   * current_stock can drift on legacy items, but new items stay accurate.
   */
  async _consumeFromBatches(itemId: string, qty: number): Promise<void> {
    if (qty <= 0) return;
    const { data: batches, error } = await supabase
      .from("inventory_batches")
      .select("id, quantity")
      .eq("inventory_item_id", itemId)
      .is("deleted_at", null)
      .gt("quantity", 0)
      .order("received_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      console.warn("Could not load batches for FIFO consumption:", error);
      return;
    }
    if (!batches || batches.length === 0) return;

    let remaining = qty;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const inBatch = Number(batch.quantity || 0);
      const take = Math.min(inBatch, remaining);
      const newQty = inBatch - take;
      const updates: any = { quantity: newQty };
      if (newQty <= 0) updates.status = "depleted";
      const { error: updErr } = await supabase
        .from("inventory_batches")
        .update(updates)
        .eq("id", batch.id);
      if (updErr) {
        console.warn(`Could not update batch ${batch.id}:`, updErr);
        break;
      }
      remaining -= take;
    }
  },

  /**
   * Restore a soft-deleted inventory item (powers the Undo on Delete toast).
   */
  async restoreInventoryItem(itemId: string): Promise<boolean> {
    const { error } = await supabase
      .from("inventory_items")
      .update({ deleted_at: null })
      .eq("id", itemId);
    if (error) {
      console.error("Error restoring inventory item:", error);
      throw error;
    }
    return true;
  },

  /**
   * Inventory list with the preferred supplier name joined in.
   * Use this on the admin inventory page so the supplier column shows real
   * names instead of a placeholder.
   */
  async getInventoryWithSuppliers(companyId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*, suppliers:preferred_supplier_id(supplier_name)")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("item_name");
    if (error) {
      console.error("Error fetching inventory with suppliers:", error);
      return [];
    }
    return data || [];
  },

  /**
   * Which recipes reference this inventory item.
   * Used by the row-expand drawer to show "this item is in N recipes".
   */
  async getRecipesUsingItem(itemId: string): Promise<Array<{ recipe_id: string; recipe_name: string; quantity: number; unit: string }>> {
    const { data, error } = await supabase
      .from("recipe_ingredients")
      .select("quantity, unit, recipes:recipe_id(id, recipe_name)")
      .eq("inventory_item_id", itemId);
    if (error) {
      console.error("Error fetching recipes for item:", error);
      return [];
    }
    return (data || []).map((row: any) => ({
      recipe_id: row.recipes?.id ?? "",
      recipe_name: row.recipes?.recipe_name ?? "Unnamed recipe",
      quantity: Number(row.quantity ?? 0),
      unit: row.unit ?? "unit",
    })).filter((r: any) => r.recipe_id);
  },

  /**
   * Last N inventory_transactions for a single item, newest first.
   * Used by the row-expand drawer to show movement history.
   */
  async getMovementsForItem(itemId: string, limit = 10): Promise<any[]> {
    const { data, error } = await supabase
      .from("inventory_transactions")
      .select("id, transaction_type, quantity, notes, performed_by, created_at")
      .eq("inventory_item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("Error fetching movements for item:", error);
      return [];
    }
    return data || [];
  },

  /**
   * Most recent inventory_transaction for the company. Powers the
   * "Last activity" stat card - a recency signal for the team.
   */
  async getLastActivity(companyId: string): Promise<{ created_at: string; transaction_type: string; item_name?: string } | null> {
    const { data, error } = await supabase
      .from("inventory_transactions")
      .select("created_at, transaction_type, inventory_items:inventory_item_id(item_name)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("Error fetching last activity:", error);
      return null;
    }
    if (!data) return null;
    return {
      created_at: data.created_at,
      transaction_type: data.transaction_type,
      item_name: (data as any).inventory_items?.item_name,
    };
  },

  /**
   * Active suppliers for this company. Used by the Receive flow's
   * supplier picker.
   */
  async getSuppliersForCompany(companyId: string): Promise<Array<{ id: string; supplier_name: string }>> {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id, supplier_name, active, is_active, deleted_at")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("supplier_name");
    if (error) {
      console.error("Error fetching suppliers:", error);
      return [];
    }
    return (data || [])
      .filter((s: any) => s.active !== false && s.is_active !== false)
      .map((s: any) => ({ id: s.id, supplier_name: s.supplier_name }));
  },

  /**
   * Bulk receive stock from a supplier delivery. Each line bumps an item's
   * current_stock and writes a transaction row with type='adjustment',
   * supplier_id, reference_number=invoice. Optionally updates cost_per_unit
   * to the new unit cost so finance reports stay current.
   */
  async receiveStock(payload: {
    companyId: string;
    supplierId: string | null;
    invoiceNumber: string;
    receivedDate: string;
    performedBy: string;
    notes?: string;
    lines: Array<{
      itemId: string;
      qty: number;
      unitCost?: number | null;
      batchNumber?: string;
      expiryDate?: string;
    }>;
  }): Promise<{ received: number; errors: string[] }> {
    const errors: string[] = [];
    let received = 0;

    for (const line of payload.lines) {
      try {
        const item = await this.getInventoryItem(line.itemId);
        if (!item) { errors.push(`Item not found: ${line.itemId}`); continue; }

        const previous = Number(item.current_stock || 0);
        const qty = Number(line.qty) || 0;
        if (qty <= 0) { continue; }
        const newStock = previous + qty;

        const updates: any = {
          current_stock: newStock,
          updated_at: new Date().toISOString(),
        };
        if (line.unitCost != null && line.unitCost > 0) {
          updates.cost_per_unit = line.unitCost;
        }

        const { error: updErr } = await supabase
          .from("inventory_items")
          .update(updates)
          .eq("id", line.itemId);
        if (updErr) { errors.push(`${item.item_name}: ${updErr.message}`); continue; }

        const noteParts: string[] = [`Received ${qty} ${item.unit_of_measure}`];
        if (line.batchNumber) noteParts.push(`batch ${line.batchNumber}`);
        if (line.expiryDate) noteParts.push(`expires ${line.expiryDate}`);
        if (payload.notes) noteParts.push(payload.notes);

        await supabase.from("inventory_transactions").insert([{
          company_id: payload.companyId,
          inventory_item_id: line.itemId,
          transaction_type: "adjustment",
          quantity: qty,
          unit_cost: line.unitCost ?? null,
          performed_by: payload.performedBy,
          supplier_id: payload.supplierId,
          reference_number: payload.invoiceNumber || null,
          notes: noteParts.join(" · "),
        }]);

        // Phase 4: also create a batch row so FIFO + expiry tracking work.
        await supabase.from("inventory_batches").insert([{
          company_id: payload.companyId,
          inventory_item_id: line.itemId,
          batch_number: line.batchNumber || null,
          received_date: payload.receivedDate || toLocalISO(new Date()),
          expiry_date: line.expiryDate || null,
          quantity: qty,
          initial_quantity: qty,
          unit_cost: line.unitCost ?? null,
          supplier_id: payload.supplierId,
          reference_number: payload.invoiceNumber || null,
          notes: payload.notes || null,
          status: "active",
        }]);

        received += 1;
      } catch (e: any) {
        errors.push(e?.message ?? "Unknown error");
      }
    }

    // Shopping persona follow-up (shopping.md 5.3): auto-create a
    // supplier_payables row for the receipt total when:
    //   - supplierId is set (we know who to pay)
    //   - at least one line has a unitCost (we know how much)
    //   - the receipt total > 0 after multiplication
    // Due date = receivedDate + suppliers.payment_terms days when
    // available; otherwise 30 days as a sensible default.
    //
    // Best-effort: a payables-insert failure logs but doesn't roll
    // back the stock-receive. The stock IS in the building; the
    // accounting tail can catch up via /admin/payables manual entry.
    //
    // Idempotent guard: we look for an existing payable with the
    // same supplier + invoice_ref before inserting, so resending the
    // same receipt doesn't double-bill.
    try {
      if (payload.supplierId && received > 0) {
        const totalRand = payload.lines.reduce((acc, line) => {
          const qty = Number(line.qty) || 0;
          const cost = Number(line.unitCost ?? 0) || 0;
          return acc + (qty > 0 && cost > 0 ? qty * cost : 0);
        }, 0);
        if (totalRand > 0) {
          // Dedup probe on (supplier, invoice_ref). Plain invoice
          // refs can collide across suppliers so we scope by both.
          // Cast to any: supplier_payables isn't in the generated
          // Supabase types yet (table exists on the DB but the
          // codegen lags). Standard pattern in this codebase.
          if (payload.invoiceNumber) {
            const { data: existing } = await (supabase as any)
              .from("supplier_payables")
              .select("id")
              .eq("company_id", payload.companyId)
              .eq("supplier_id", payload.supplierId)
              .eq("invoice_ref", payload.invoiceNumber)
              .is("deleted_at", null)
              .limit(1)
              .maybeSingle();
            if (existing) {
              // Already raised - skip silently. Avoids double-billing
              // if a receipt is committed twice (rare but possible
              // when the reconcile drawer is closed mid-flow).
              return { received, errors };
            }
          }
          // Resolve payment_terms (days). Fallback to 30.
          let dueDate: string;
          try {
            const { data: supplier } = await supabase
              .from("suppliers")
              .select("payment_terms")
              .eq("id", payload.supplierId)
              .maybeSingle();
            const days = Number((supplier as any)?.payment_terms ?? 30);
            const d = new Date(payload.receivedDate || new Date().toISOString());
            d.setDate(d.getDate() + days);
            dueDate = d.toISOString().slice(0, 10);
          } catch {
            dueDate = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
          }
          const { error: payErr } = await (supabase as any)
            .from("supplier_payables")
            .insert([{
              company_id: payload.companyId,
              supplier_id: payload.supplierId,
              amount_cents: Math.round(totalRand * 100),
              due_date: dueDate,
              invoice_ref: payload.invoiceNumber || null,
              status: "pending",
              notes: `Auto-raised from stock receipt (${received} line${received === 1 ? "" : "s"}).${payload.notes ? ` ${payload.notes}` : ""}`,
              created_by: payload.performedBy,
            }]);
          if (payErr) {
            console.warn("[inventoryService.receiveStock] auto-payable insert failed:", payErr);
          }
        }
      }
    } catch (payErr) {
      console.warn("[inventoryService.receiveStock] auto-payable wrap crashed:", payErr);
    }

    return { received, errors };
  },

  /**
   * Bulk cycle count. Each entry sets an item's current_stock to the counted
   * value and writes an "adjustment" transaction with the variance as quantity
   * (positive = found extra, negative = found short). Items with zero variance
   * still post a zero-qty entry so the count is recorded.
   */
  async cycleCount(payload: {
    companyId: string;
    performedBy: string;
    countedAt: string;
    notes?: string;
    entries: Array<{ itemId: string; counted: number }>;
  }): Promise<{ posted: number; errors: string[] }> {
    const errors: string[] = [];
    let posted = 0;

    for (const entry of payload.entries) {
      try {
        const item = await this.getInventoryItem(entry.itemId);
        if (!item) { errors.push(`Item not found: ${entry.itemId}`); continue; }

        const previous = Number(item.current_stock || 0);
        const counted = Number(entry.counted) || 0;
        const variance = counted - previous;

        const { error: updErr } = await supabase
          .from("inventory_items")
          .update({ current_stock: counted, updated_at: new Date().toISOString() })
          .eq("id", entry.itemId);
        if (updErr) { errors.push(`${item.item_name}: ${updErr.message}`); continue; }

        await supabase.from("inventory_transactions").insert([{
          company_id: payload.companyId,
          inventory_item_id: entry.itemId,
          transaction_type: "adjustment",
          quantity: variance,
          performed_by: payload.performedBy,
          notes: `Cycle count ${payload.countedAt}${payload.notes ? " · " + payload.notes : ""}${variance === 0 ? " · no variance" : ""}`,
        }]);

        posted += 1;
      } catch (e: any) {
        errors.push(e?.message ?? "Unknown error");
      }
    }

    return { posted, errors };
  },

  /**
   * Write off stock with a specific waste reason. Reduces current_stock and
   * writes a transaction with type='waste'. The reason goes into notes so
   * the audit log preserves intent (spoilage vs breakage vs theft).
   */
  async writeOff(payload: {
    itemId: string;
    qty: number;
    reason: string;
    notes?: string;
    performedBy: string;
  }): Promise<Inventory | null> {
    const item = await this.getInventoryItem(payload.itemId);
    if (!item) throw new Error("Inventory item not found");

    const previous = Number(item.current_stock || 0);
    const qty = Math.abs(Number(payload.qty) || 0);
    if (qty === 0) throw new Error("Quantity must be greater than zero.");
    const newStock = Math.max(0, previous - qty);

    const { data, error } = await supabase
      .from("inventory_items")
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq("id", payload.itemId)
      .select()
      .single();
    if (error) {
      console.error("Error writing off stock:", error);
      throw error;
    }

    const composedNote = `${payload.reason}${payload.notes ? " · " + payload.notes : ""}`;
    await supabase.from("inventory_transactions").insert([{
      company_id: item.company_id,
      inventory_item_id: payload.itemId,
      transaction_type: "waste",
      quantity: -qty,
      performed_by: payload.performedBy,
      notes: composedNote,
    }]);

    // FIFO consume from batches (best effort)
    await this._consumeFromBatches(payload.itemId, qty);

    return data;
  },

  // ── Phase 4: batches, settings, cost history ────────────────────

  /**
   * Active batches for an item, oldest first. Powers the "Batches on hand"
   * section of the row drawer. Includes supplier name via a left join so the
   * UI shows where each batch came from.
   */
  async getBatchesForItem(itemId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("inventory_batches")
      .select("id, batch_number, received_date, expiry_date, quantity, initial_quantity, unit_cost, status, reference_number, suppliers:supplier_id(supplier_name)")
      .eq("inventory_item_id", itemId)
      .is("deleted_at", null)
      .gt("quantity", 0)
      .order("received_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Error fetching batches:", error);
      return [];
    }
    return data || [];
  },

  /**
   * Items with at least one batch expiring within `withinDays` days. Used by
   * the Expiring tab and the "Expiring soon" stat card so we surface real
   * expiry, not just the perishable flag.
   */
  async getExpiringBatches(companyId: string, withinDays: number): Promise<any[]> {
    const today = new Date();
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + withinDays);
    const { data, error } = await supabase
      .from("inventory_batches")
      .select("id, inventory_item_id, batch_number, received_date, expiry_date, quantity, inventory_items:inventory_item_id(item_name, category, unit_of_measure)")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gt("quantity", 0)
      .not("expiry_date", "is", null)
      .lte("expiry_date", cutoff.toISOString().slice(0, 10))
      .order("expiry_date", { ascending: true });
    if (error) {
      console.error("Error fetching expiring batches:", error);
      return [];
    }
    return data || [];
  },

  /**
   * Cost history for the item - last 90 days of transactions where unit_cost
   * was logged. Powers the sparkline on the row drawer.
   */
  async getCostHistoryForItem(itemId: string, days = 90): Promise<Array<{ date: string; unit_cost: number }>> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { data, error } = await supabase
      .from("inventory_transactions")
      .select("created_at, unit_cost")
      .eq("inventory_item_id", itemId)
      .gte("created_at", since.toISOString())
      .not("unit_cost", "is", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.warn("Error fetching cost history:", error);
      return [];
    }
    return (data || [])
      .filter((r: any) => Number(r.unit_cost) > 0)
      .map((r: any) => ({ date: r.created_at, unit_cost: Number(r.unit_cost) }));
  },

  /**
   * Inventory-level company settings. Falls back to defaults when the
   * column is empty so callers always get a usable shape.
   */
  async getCompanyInventorySettings(companyId: string): Promise<{
    expiryWarnings: Record<string, number>;
    reorderBufferPercent: number;
  }> {
    const defaults = { expiryWarnings: { Default: 30 }, reorderBufferPercent: 0 };
    const { data, error } = await supabase
      .from("companies")
      .select("inventory_settings")
      .eq("id", companyId)
      .maybeSingle();
    if (error || !data) return defaults;
    const raw = (data as any).inventory_settings || {};
    return {
      expiryWarnings: raw.expiry_warnings || defaults.expiryWarnings,
      reorderBufferPercent: Number(raw.reorder_buffer_percent ?? 0),
    };
  },

  async updateCompanyInventorySettings(
    companyId: string,
    settings: { expiryWarnings: Record<string, number>; reorderBufferPercent: number },
  ): Promise<boolean> {
    const payload = {
      expiry_warnings: settings.expiryWarnings,
      reorder_buffer_percent: settings.reorderBufferPercent,
    };
    const { error } = await supabase
      .from("companies")
      .update({ inventory_settings: payload })
      .eq("id", companyId);
    if (error) {
      console.error("Error saving inventory settings:", error);
      throw error;
    }
    return true;
  },

  /**
   * Bulk soft-delete. Returns counts so the UI can toast a single summary.
   */
  async bulkDelete(itemIds: string[]): Promise<{ deleted: number; errors: string[] }> {
    if (itemIds.length === 0) return { deleted: 0, errors: [] };
    const { error, count } = await supabase
      .from("inventory_items")
      .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
      .in("id", itemIds);
    if (error) {
      console.error("Bulk delete error:", error);
      return { deleted: 0, errors: [error.message] };
    }
    return { deleted: count ?? itemIds.length, errors: [] };
  },

  /**
   * Bulk reassign preferred supplier across many items at once.
   */
  async bulkReassignSupplier(itemIds: string[], supplierId: string | null): Promise<{ updated: number; errors: string[] }> {
    if (itemIds.length === 0) return { updated: 0, errors: [] };
    const { error, count } = await supabase
      .from("inventory_items")
      .update({ preferred_supplier_id: supplierId, updated_at: new Date().toISOString() }, { count: "exact" })
      .in("id", itemIds);
    if (error) {
      console.error("Bulk reassign supplier error:", error);
      return { updated: 0, errors: [error.message] };
    }
    return { updated: count ?? itemIds.length, errors: [] };
  },

  /**
   * Bulk recategorise items.
   */
  async bulkReassignCategory(itemIds: string[], category: string): Promise<{ updated: number; errors: string[] }> {
    if (itemIds.length === 0) return { updated: 0, errors: [] };
    const { error, count } = await supabase
      .from("inventory_items")
      .update({ category, updated_at: new Date().toISOString() }, { count: "exact" })
      .in("id", itemIds);
    if (error) {
      console.error("Bulk reassign category error:", error);
      return { updated: 0, errors: [error.message] };
    }
    return { updated: count ?? itemIds.length, errors: [] };
  },

  async getLowStockItems(companyId: string): Promise<Inventory[]> {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("item_name");

    if (error) {
      console.error("Error fetching low stock items:", error);
      return [];
    }

    // Tightened rule: only rows that have a non-zero minimum and are
    // at-or-under that minimum count as low. The earlier rule
    // (`current <= minimum`) flagged every 0/0 seed row - on a fresh
    // tenant 47% of items came back "low" simply because they hadn't
    // been topped up yet. Operators tuned the alert out as crying
    // wolf. Now we require a meaningful minimum, OR a real negative
    // balance (current_stock < 0 - legitimately low).
    return (data || []).filter((i: any) => {
      const cur = Number(i.current_stock || 0);
      const min = Number(i.minimum_stock || 0);
      if (min > 0) return cur <= min;
      return cur < 0;
    });
  },
};
