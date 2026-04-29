/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

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
      .insert([item])
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

    return data;
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
   * "Last activity" stat card -- a recency signal for the team.
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

        received += 1;
      } catch (e: any) {
        errors.push(e?.message ?? "Unknown error");
      }
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

    return data;
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

    return (data || []).filter(
      (i: any) => Number(i.current_stock || 0) <= Number(i.minimum_stock || 0),
    );
  },
};
