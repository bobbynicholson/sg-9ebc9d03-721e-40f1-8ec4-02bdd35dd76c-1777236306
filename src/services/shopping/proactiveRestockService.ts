/**
 * proactiveRestockService - shopper-initiated stock top-ups.
 *
 * The rest of the shopping portal buys against ORDER demand: an order
 * lands, the demand outlook flags a shortfall, a shopper adds it to a
 * list and buys it. This service covers the other half - the shopper
 * looking at the shelf, seeing a recurring item run low, and buying it
 * for stock off their own judgement, with NO order attached.
 *
 * Suggestions are par-driven (current_stock <= minimum_stock, the same
 * rule inventoryService.getLowStockItems uses). When a shopper buys, we
 * push the stock straight into inventory_items.current_stock via the
 * canonical inventoryService.receiveStock path (so the movement audit,
 * FIFO batch, and supplier-payable tail all fire exactly as they do for
 * an order-driven receipt - no divergent write path). The optional
 * receipt image is persisted to the `imports` bucket + a
 * purchase_receipts row (admin-visible), and admins get a
 * `stock_replenished` ping so proactive spend is never silent.
 *
 * See memory: project_shopping_proactive_restock.
 */
import { supabase } from "@/integrations/supabase/client";
import { inventoryService } from "@/services/inventoryService";
import { toLocalISO } from "@/lib/localDate";

export interface RestockSuggestion {
  id: string;
  companyId: string;
  itemName: string;
  category: string | null;
  unit: string;
  currentStock: number;
  minimumStock: number;
  costPerUnit: number;
  /** reorder_quantity if set, else the gap to par (minimum - current), floored at a whole unit. */
  suggestedQty: number;
  preferredSupplierId: string | null;
}

export interface RestockPurchaseInput {
  companyId: string;
  performedBy: string;
  itemId: string;
  itemName: string;
  unit: string;
  qty: number;
  /** Unit cost in Rand. When >0 and a supplier is set, receiveStock raises a payable. */
  unitCost: number | null;
  supplierId: string | null;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  notes?: string | null;
  /** Already-uploaded receipt image (page handles the storage upload). */
  receipt?: { path: string; url: string | null } | null;
}

export interface RestockPurchaseResult {
  ok: boolean;
  errors: string[];
}

export const proactiveRestockService = {
  /**
   * Par-driven restock suggestions: every non-deleted item at or below
   * a meaningful minimum. Mirrors inventoryService.getLowStockItems'
   * rule (min > 0 && current <= min, OR a negative balance) so the
   * "low" definition stays identical everywhere.
   */
  async getSuggestions(companyId: string): Promise<RestockSuggestion[]> {
    if (!companyId) return [];
    const items = await inventoryService.getLowStockItems(companyId);
    return items.map((i: any) => {
      const current = Number(i.current_stock || 0);
      const minimum = Number(i.minimum_stock || 0);
      const reorder = Number(i.reorder_quantity || 0);
      const gapToPar = Math.max(0, Math.ceil(minimum - current));
      const suggestedQty = reorder > 0 ? reorder : Math.max(1, gapToPar);
      return {
        id: i.id,
        companyId: i.company_id,
        itemName: i.item_name || "Unnamed item",
        category: i.category ?? null,
        unit: i.unit_of_measure || "unit",
        currentStock: current,
        minimumStock: minimum,
        costPerUnit: Number(i.cost_per_unit || 0),
        suggestedQty,
        preferredSupplierId: i.preferred_supplier_id ?? null,
      };
    });
  },

  /**
   * Execute a proactive buy. Bumps stock directly (receiveStock),
   * persists the receipt if one was attached, and notifies admins.
   * Every side-effect past the stock write is best-effort so a
   * notification / receipt hiccup never loses the stock the shopper
   * physically bought.
   */
  async purchase(input: RestockPurchaseInput): Promise<RestockPurchaseResult> {
    const qty = Number(input.qty) || 0;
    if (qty <= 0) return { ok: false, errors: ["Enter a quantity greater than zero."] };

    const today = toLocalISO(new Date());

    // 1. Canonical stock write. This is the same path an order-driven
    //    receipt uses, so inventory_items.current_stock, the movement
    //    audit, the FIFO batch, and the supplier payable all stay
    //    consistent with every other surface.
    const result = await inventoryService.receiveStock({
      companyId: input.companyId,
      supplierId: input.supplierId,
      invoiceNumber: input.invoiceNumber || "",
      receivedDate: today,
      performedBy: input.performedBy,
      notes: `Proactive restock${input.notes ? ` - ${input.notes}` : ""}`,
      lines: [{
        itemId: input.itemId,
        qty,
        unitCost: input.unitCost && input.unitCost > 0 ? input.unitCost : null,
      }],
    });

    if (result.received === 0) {
      return { ok: false, errors: result.errors.length ? result.errors : ["Could not add stock."] };
    }

    const total = input.unitCost && input.unitCost > 0 ? qty * input.unitCost : 0;

    // 2. Persist the receipt (best-effort, admin-visible). scan_status
    //    'manual' = a human keyed the total, no AI scan involved.
    if (input.receipt?.path) {
      try {
        await (supabase as any).from("purchase_receipts").insert([{
          company_id: input.companyId,
          supplier_id: input.supplierId,
          vendor: input.supplierName || null,
          receipt_date: today,
          total: total > 0 ? total : null,
          image_path: input.receipt.path,
          image_url: input.receipt.url,
          uploaded_by: input.performedBy,
          order_id: null,
          scan_status: "manual",
          notes: `Proactive restock of ${input.itemName} (${qty} ${input.unit}).${input.notes ? ` ${input.notes}` : ""}`,
        }]);
      } catch (receiptErr) {
        console.warn("[proactiveRestockService.purchase] receipt persist failed:", receiptErr);
      }
    }

    // 3. Notify admins so proactive spend is visible. Best-effort,
    //    de-duped per item over a short window so a shopper correcting
    //    a qty twice doesn't double-ping.
    try {
      const { notificationService } = await import("@/services/notificationService");
      const totalStr = total > 0
        ? ` (R${(Math.round(total * 100) / 100).toFixed(2)})`
        : "";
      await notificationService.broadcastNotification({
        companyId: input.companyId,
        targetRoles: ["company_admin", "admin", "owner"] as any,
        title: `Stock topped up: ${input.itemName}`,
        message: `A shopper bought ${qty} ${input.unit} of ${input.itemName}${totalStr} to restock a low item.`,
        type: "stock_replenished" as any,
        priority: "normal",
        link: "/admin/inventory",
        relatedEntityType: "inventory_item",
        relatedEntityId: input.itemId,
        dedup: true,
        dedupWindowMinutes: 30,
      });
    } catch (notifErr) {
      console.warn("[proactiveRestockService.purchase] restock notify failed:", notifErr);
    }

    return { ok: true, errors: result.errors };
  },

  /**
   * Upload a restock receipt image to the shared `imports` bucket.
   * Path convention matches the receipt-import pipeline:
   *   {companyId}/restock/{timestamp-ish}.{ext}
   * Returns null on failure so the buy can still proceed receipt-less.
   */
  async uploadReceipt(
    companyId: string,
    file: File,
  ): Promise<{ path: string; url: string | null } | null> {
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      // Client-side, no randomUUID import: file size + a sanitised base
      // name is unique enough within a company/restock folder and keeps
      // this dependency-free.
      const base = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/gi, "_").slice(0, 40) || "receipt";
      const path = `${companyId}/restock/${file.size}-${base}.${ext}`;
      const { error } = await supabase.storage.from("imports").upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });
      if (error) {
        console.warn("[proactiveRestockService.uploadReceipt] upload failed:", error);
        return null;
      }
      const { data } = supabase.storage.from("imports").getPublicUrl(path);
      return { path, url: data?.publicUrl ?? null };
    } catch (e) {
      console.warn("[proactiveRestockService.uploadReceipt] crashed:", e);
      return null;
    }
  },
};
