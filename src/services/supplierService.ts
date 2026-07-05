/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * supplierService - the supplier hub. Drives:
 *   - /admin/suppliers          (list page with spend totals)
 *   - /admin/suppliers/[id]     (detail page with purchases + products)
 *   - /admin/shopping           (PO email composition)
 *
 * Two sources of spend signal:
 *   1. purchase_receipts        (slip ledger - has supplier_id FK
 *                                 since the 2026-05 migration. The
 *                                 canonical source.)
 *   2. inventory_transactions   (per-line receive log - has supplier_id
 *                                 FK + qty * unit_cost. Used only as a
 *                                 fallback for tenants who haven't yet
 *                                 adopted the receipts ledger.)
 *
 * SUP-B (2026-05-24): the previous implementation summed BOTH into the
 * same total which double-counted every receipt that wrote both rows.
 * Now we use receipts when present, fall back to transactions only
 * when no receipt exists in the 365d window for that supplier.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Supplier = Tables<"suppliers">;
export type InventoryItemSupplier = Tables<"inventory_item_suppliers">;

export interface SupplierWithStats extends Supplier {
  product_count: number;
  spend_30d: number;
  spend_90d: number;
  spend_365d: number;
  last_purchase_at: string | null;
  active_receipts_count: number;
  // SUP-D: price-creep signal. items_compared = how many of the
  // supplier's items had a baseline 60-120d ago + a recent 30d price.
  // median_pct_change = the per-item median percentage change.
  // Both null when the supplier has no comparable history yet.
  price_items_compared: number;
  price_median_pct_change: number | null;
}

export interface SupplierProduct extends InventoryItemSupplier {
  inventory_items: {
    id: string;
    item_name: string;
    category: string | null;
    unit_of_measure: string | null;
    current_stock: number;
    minimum_stock: number;
  } | null;
}

export interface SupplierReceiptRow {
  id: string;
  receipt_date: string | null;
  vendor: string | null;
  total: number | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
}

export interface SupplierPurchaseSummary {
  total_spend: number;
  receipt_count: number;
  unique_items: number;
  avg_receipt_value: number;
  /** Per-product breakdown sorted by total spend desc. */
  by_item: Array<{
    inventory_item_id: string | null;
    description: string;
    quantity: number;
    spend: number;
  }>;
}

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
};

export const supplierService = {
  /**
   * List suppliers for a tenant with rolling spend totals. Computed
   * client-side from inventory_transactions to keep the query simple --
   * the receipts ledger is a secondary source used on the detail page.
   */
  async listForCompany(companyId: string): Promise<SupplierWithStats[]> {
    const { data: suppliers, error: suppErr } = await supabase
      .from("suppliers")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("supplier_name", { ascending: true });
    if (suppErr) {
      // Throw (not return []) so the suppliers page shows its Retry card
      // instead of masking a transient RLS/PostgREST failure as a
      // legitimate "No suppliers yet" empty state.
      console.error("supplierService.listForCompany:", suppErr);
      throw suppErr;
    }

    if (!suppliers || suppliers.length === 0) return [];

    // Pull all transactions in the last 365 days in one shot, then
    // bucket per-supplier client-side. Avoids N round-trips.
    const { data: tx, error: txErr } = await (supabase as any)
      .from("inventory_transactions")
      // inventory_transactions has no performed_at column (buckets use
      // created_at); selecting it 400s the whole query -> every supplier
      // shows zero spend.
      .select("supplier_id, quantity, unit_cost, created_at")
      .eq("company_id", companyId)
      .not("supplier_id", "is", null)
      .gte("created_at", isoDaysAgo(365));
    if (txErr) console.error("[supplierService] inventory_transactions lookup failed:", txErr);

    // And the receipt ledger for completeness.
    const { data: receipts, error: receiptsErr } = await (supabase as any)
      .from("purchase_receipts")
      .select("supplier_id, total, receipt_date, created_at")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .not("supplier_id", "is", null)
      .gte("created_at", isoDaysAgo(365));
    if (receiptsErr) console.error("[supplierService] purchase_receipts lookup failed:", receiptsErr);

    // Item count per supplier (multi-supplier table).
    const { data: linksRaw, error: linksRawErr } = await supabase
      .from("inventory_item_suppliers")
      .select("supplier_id")
      .eq("company_id", companyId);
    if (linksRawErr) console.error("[supplierService] inventory_item_suppliers lookup failed:", linksRawErr);
    const productCount = new Map<string, number>();
    (linksRaw || []).forEach((l: { supplier_id: string | null }) => {
      if (!l.supplier_id) return;
      productCount.set(l.supplier_id, (productCount.get(l.supplier_id) || 0) + 1);
    });

    // SUP-D: per-supplier price-creep summary. Tolerant - if the RPC
    // is missing (older project) or returns empty, every supplier
    // simply shows no chip.
    const creepMap = new Map<string, { items: number; pct: number | null }>();
    try {
      const { data: creepRows, error: creepErr } = await supabase.rpc(
        "supplier_price_creep_summary",
        { p_company_id: companyId },
      );
      if (creepErr) {
        console.warn("[supplierService] price-creep summary unavailable:", creepErr.message);
      } else {
        (creepRows || []).forEach((row) => {
          creepMap.set(row.supplier_id, {
            items: Number(row.items_compared || 0),
            pct: row.median_pct_change == null ? null : Number(row.median_pct_change),
          });
        });
      }
    } catch (e) {
      // RPC missing entirely - silently no-op.
      console.warn("[supplierService] price-creep RPC threw:", e);
    }

    const cutoff30 = new Date(); cutoff30.setDate(cutoff30.getDate() - 30);
    const cutoff90 = new Date(); cutoff90.setDate(cutoff90.getDate() - 90);

    return suppliers.map((s: any) => {
      const sId = s.id;
      let spend30 = 0, spend90 = 0, spend365 = 0;
      let lastAt: string | null = null;
      const rcptRows = (receipts || []).filter((r: any) => r.supplier_id === sId);
      const txRows = (tx || []).filter((t: any) => t.supplier_id === sId);

      // SUP-B audit fix: the previous version summed
      // inventory_transactions AND purchase_receipts into the same
      // total, which double-counted any receipt that wrote both rows.
      // Canonical source is now purchase_receipts (the slip ledger, has
      // supplier_id post-2026-05). Fall back to inventory_transactions
      // only for suppliers/tenants where receipts aren't in use at all
      // - i.e. no receipts in the 365d window. This stops the inflated
      // numbers without losing legacy data.
      const useReceipts = rcptRows.length > 0;
      let activeReceiptsCount = 0;
      if (useReceipts) {
        for (const r of rcptRows) {
          const amt = Number(r.total || 0);
          const at = r.created_at;
          if (!lastAt || at > lastAt) lastAt = at;
          const ad = new Date(at);
          spend365 += amt;
          activeReceiptsCount += 1;
          if (ad >= cutoff90) spend90 += amt;
          if (ad >= cutoff30) spend30 += amt;
        }
      } else {
        for (const t of txRows) {
          const amt = Number(t.quantity || 0) * Number(t.unit_cost || 0);
          const at = t.created_at;
          if (!lastAt || at > lastAt) lastAt = at;
          const ad = new Date(at);
          spend365 += amt;
          if (ad >= cutoff90) spend90 += amt;
          if (ad >= cutoff30) spend30 += amt;
        }
      }
      // Always honour the most-recent transaction timestamp for last
      // buy (even when receipts is canonical, an out-of-band stock-in
      // is still a real purchase signal).
      for (const t of txRows) {
        if (!lastAt || t.created_at > lastAt) lastAt = t.created_at;
      }
      const creep = creepMap.get(sId);
      return {
        ...(s as Supplier),
        product_count: productCount.get(sId) || 0,
        spend_30d: spend30,
        spend_90d: spend90,
        spend_365d: spend365,
        last_purchase_at: lastAt,
        active_receipts_count: activeReceiptsCount,
        price_items_compared: creep?.items || 0,
        price_median_pct_change: creep?.pct ?? null,
      } as SupplierWithStats;
    });
  },

  /**
   * SUP-D: full per-item price history for a supplier. Drives the
   * detail-page sparkline. Cheap - indexed on (supplier_id,
   * recorded_at desc). Returns chronological for easy charting.
   */
  async getPriceHistory(supplierId: string, daysBack = 365): Promise<Array<{
    inventory_item_id: string;
    unit_price: number;
    pack_size: string | null;
    recorded_at: string;
  }>> {
    const fromIso = new Date(Date.now() - daysBack * 86_400_000).toISOString();
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (k: string, v: string) => {
            gte: (k: string, v: string) => {
              order: (k: string, opts: { ascending: boolean }) => Promise<{
                data: Array<{ inventory_item_id: string; unit_price: number; pack_size: string | null; recorded_at: string }> | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    })
      .from("inventory_item_supplier_price_history")
      .select("inventory_item_id, unit_price, pack_size, recorded_at")
      .eq("supplier_id", supplierId)
      .gte("recorded_at", fromIso)
      .order("recorded_at", { ascending: true });
    if (error) { console.error("supplierService.getPriceHistory:", error); return []; }
    return data || [];
  },

  /**
   * Fetch one supplier, explicitly scoped to the tenant. companyId is
   * required so cross-tenant reads are refused in the query itself
   * rather than relying on RLS alone (defence in depth, same contract
   * as listForCompany / getPurchaseSummary / listReceipts).
   */
  async getById(supplierId: string, companyId: string): Promise<Supplier | null> {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .eq("id", supplierId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) { console.error("supplierService.getById:", error); return null; }
    return data as Supplier | null;
  },

  async create(args: {
    companyId: string;
    supplier_name: string;
    email?: string | null;
    phone?: string | null;
    contact_person?: string | null;
    // SUP-B: column is int in the schema (days). Callers must coerce.
    payment_terms?: number | null;
    // SUP-C: free-text annotation (COD / Net-30 EOM / on account).
    payment_terms_note?: string | null;
    payment_method?: string | null;
    preferred_contact_method?: string | null;
    website?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    postal_code?: string | null;
    supplier_categories?: string[];
    notes?: string | null;
    // SUP-C: SARS VAT registration number.
    vat_number?: string | null;
    // SUP-C: fields the team-portal/shopping/suppliers page captures.
    // Centralising here so both surfaces write the same way.
    account_number?: string | null;
    rating?: number | null;
    emergency_contact?: string | null;
    is_active?: boolean;
  }): Promise<Supplier | null> {
    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        company_id: args.companyId,
        supplier_name: args.supplier_name,
        email: args.email ?? null,
        phone: args.phone ?? null,
        contact_person: args.contact_person ?? null,
        payment_terms: args.payment_terms ?? null,
        payment_terms_note: args.payment_terms_note ?? null,
        payment_method: args.payment_method ?? null,
        preferred_contact_method: args.preferred_contact_method ?? "email",
        website: args.website ?? null,
        address_line1: args.address_line1 ?? null,
        address_line2: args.address_line2 ?? null,
        city: args.city ?? null,
        postal_code: args.postal_code ?? null,
        supplier_categories: args.supplier_categories ?? [],
        notes: args.notes ?? null,
        vat_number: args.vat_number ?? null,
        account_number: args.account_number ?? null,
        rating: args.rating ?? null,
        emergency_contact: args.emergency_contact ?? null,
        is_active: args.is_active ?? true,
        active: args.is_active ?? true,
      })
      .select()
      .single();
    // Throw (don't swallow -> null) so the caller's try/catch fires. The
    // suppliers page awaited this and always toasted "Supplier added" even
    // when the insert was rejected by RLS/constraint, silently losing the
    // row. update()/softDelete() already throw; match them.
    if (error) { console.error("supplierService.create:", error); throw error; }
    return data as Supplier;
  },

  /**
   * SUP-C: bulk insert from CSV. Returns per-row outcomes so the
   * import dialog can show "added 14, skipped 3 duplicates, 1 error".
   * De-dupes against existing supplier_name (case-insensitive) within
   * the tenant.
   */
  async bulkCreate(args: {
    companyId: string;
    rows: Array<{
      supplier_name: string;
      contact_person?: string | null;
      email?: string | null;
      phone?: string | null;
      vat_number?: string | null;
      payment_terms?: number | null;
      payment_terms_note?: string | null;
      supplier_categories?: string[];
    }>;
  }): Promise<{
    inserted: number;
    skipped: number;
    errors: Array<{ row: number; supplier_name: string; reason: string }>;
  }> {
    // Pull existing names once for cheap dedupe.
    const { data: existing } = await supabase
      .from("suppliers")
      .select("supplier_name")
      .eq("company_id", args.companyId)
      .is("deleted_at", null);
    const existingSet = new Set(
      ((existing || []) as Array<{ supplier_name: string }>)
        .map((r) => (r.supplier_name || "").toLowerCase().trim()),
    );

    let inserted = 0, skipped = 0;
    const errors: Array<{ row: number; supplier_name: string; reason: string }> = [];

    for (let i = 0; i < args.rows.length; i += 1) {
      const r = args.rows[i];
      const nm = (r.supplier_name || "").trim();
      if (!nm) {
        errors.push({ row: i + 1, supplier_name: "(blank)", reason: "Missing name" });
        continue;
      }
      if (existingSet.has(nm.toLowerCase())) {
        skipped += 1;
        continue;
      }
      const { error } = await supabase.from("suppliers").insert({
        company_id: args.companyId,
        supplier_name: nm,
        contact_person: r.contact_person?.trim() || null,
        email: r.email?.trim() || null,
        phone: r.phone?.trim() || null,
        vat_number: r.vat_number?.trim() || null,
        payment_terms: r.payment_terms ?? null,
        payment_terms_note: r.payment_terms_note?.trim() || null,
        supplier_categories: r.supplier_categories ?? [],
        preferred_contact_method: "email",
        is_active: true,
        active: true,
      });
      if (error) {
        errors.push({ row: i + 1, supplier_name: nm, reason: error.message });
      } else {
        inserted += 1;
        existingSet.add(nm.toLowerCase());
      }
    }
    return { inserted, skipped, errors };
  },

  /**
   * SUP-C: merge source supplier into target. Calls the
   * SECURITY DEFINER RPC merge_suppliers which walks the FK graph
   * across equipment, hire orders, payables, inventory_item_suppliers,
   * purchase_receipts, inventory_transactions. Soft-deletes the source
   * and writes an audit_logs row.
   */
  async mergeInto(args: {
    targetId: string;
    sourceId: string;
  }): Promise<Record<string, number>> {
    const { data, error } = await (supabase.rpc as any)("merge_suppliers", {
      p_target_id: args.targetId,
      p_source_id: args.sourceId,
    });
    if (error) throw error;
    return (data || {}) as Record<string, number>;
  },

  async update(supplierId: string, patch: Partial<Supplier>): Promise<void> {
    const { error } = await supabase
      .from("suppliers")
      .update({ ...patch, updated_at: new Date().toISOString() } as any)
      .eq("id", supplierId);
    if (error) throw error;
  },

  async softDelete(supplierId: string): Promise<void> {
    const { error } = await supabase
      .from("suppliers")
      .update({ deleted_at: new Date().toISOString(), is_active: false } as any)
      .eq("id", supplierId);
    if (error) throw error;
  },

  /**
   * SUP-B: count referencing rows so the delete confirm can warn the
   * operator before silently nulling FKs. All five referencing tables
   * use ON DELETE SET NULL or similar, but the operator deserves to
   * see what's about to lose its link.
   *
   * Cheap: each is a HEAD count query, fired in parallel.
   */
  async countReferences(supplierId: string): Promise<{
    equipment_owned: number;
    equipment_preferred_hire: number;
    open_hire_orders: number;
    open_payables: number;
    linked_items: number;
    preferred_items: number;
  }> {
    const heads = async (tbl: string, col: string, extra?: (q: any) => any) => {
      let q = (supabase as any).from(tbl).select("id", { head: true, count: "exact" }).eq(col, supplierId);
      if (extra) q = extra(q);
      const { count } = await q;
      return Number(count || 0);
    };
    const [eqOwned, eqPref, hire, payable, links, preferred] = await Promise.all([
      heads("equipment", "supplier_of_record_id"),
      heads("equipment", "preferred_hire_supplier_id"),
      heads("equipment_hire_orders", "supplier_id", (q: any) => q.in("status", ["draft", "confirmed", "picked_up"])),
      heads("supplier_payables", "supplier_id", (q: any) => q.eq("status", "pending")),
      heads("inventory_item_suppliers", "supplier_id"),
      heads("inventory_item_suppliers", "supplier_id", (q: any) => q.eq("is_preferred", true)),
    ]);
    return {
      equipment_owned: eqOwned,
      equipment_preferred_hire: eqPref,
      open_hire_orders: hire,
      open_payables: payable,
      linked_items: links,
      preferred_items: preferred,
    };
  },

  /** All inventory items linked to this supplier, with the join row's
   *  per-supplier price + lead time. */
  async listProducts(supplierId: string): Promise<SupplierProduct[]> {
    const { data, error } = await (supabase as any)
      .from("inventory_item_suppliers")
      .select(`
        *,
        inventory_items(id, item_name, category, unit_of_measure, current_stock, minimum_stock)
      `)
      .eq("supplier_id", supplierId)
      .order("is_preferred", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) { console.error("supplierService.listProducts:", error); return []; }
    return (data || []) as SupplierProduct[];
  },

  async linkProduct(args: {
    companyId: string;
    inventoryItemId: string;
    supplierId: string;
    unit_price?: number | null;
    pack_size?: string | null;
    lead_time_days?: number | null;
    is_preferred?: boolean;
    notes?: string | null;
  }): Promise<void> {
    const { error } = await supabase
      .from("inventory_item_suppliers")
      .upsert({
        company_id: args.companyId,
        inventory_item_id: args.inventoryItemId,
        supplier_id: args.supplierId,
        unit_price: args.unit_price ?? null,
        pack_size: args.pack_size ?? null,
        lead_time_days: args.lead_time_days ?? null,
        is_preferred: args.is_preferred ?? false,
        notes: args.notes ?? null,
      } as any, { onConflict: "inventory_item_id,supplier_id" });
    if (error) throw error;
  },

  async unlinkProduct(linkId: string): Promise<void> {
    const { error } = await supabase
      .from("inventory_item_suppliers")
      .delete()
      .eq("id", linkId);
    if (error) throw error;
  },

  /** Rolling purchase summary for a supplier between two ISO dates. */
  async getPurchaseSummary(args: {
    supplierId: string;
    companyId: string;
    fromIso: string;
    toIso: string;
  }): Promise<SupplierPurchaseSummary> {
    const [txRes, rcptRes, itemsRes] = await Promise.all([
      (supabase as any)
        .from("inventory_transactions")
        .select(`
          id, quantity, unit_cost, inventory_item_id, created_at,
          inventory_items(item_name)
        `)
        .eq("company_id", args.companyId)
        .eq("supplier_id", args.supplierId)
        .gte("created_at", args.fromIso)
        .lte("created_at", args.toIso),
      (supabase as any)
        .from("purchase_receipts")
        .select(`
          id, total, receipt_date, created_at,
          items:purchase_receipt_items(
            id, description, amount, quantity, inventory_item_id,
            inventory_items(item_name)
          )
        `)
        .eq("company_id", args.companyId)
        .eq("supplier_id", args.supplierId)
        .is("deleted_at", null)
        .gte("created_at", args.fromIso)
        .lte("created_at", args.toIso),
      Promise.resolve(null),
    ]);

    const tx = (txRes.data || []) as any[];
    const rcpts = (rcptRes.data || []) as any[];

    const byItem = new Map<string, { description: string; quantity: number; spend: number; inventory_item_id: string | null }>();

    let totalSpend = 0;
    const receiptCount = rcpts.length;

    for (const t of tx) {
      const amt = Number(t.quantity || 0) * Number(t.unit_cost || 0);
      totalSpend += amt;
      const key = t.inventory_item_id || `_unmapped_${t.id}`;
      const desc = t.inventory_items?.item_name || "(unmapped item)";
      const cur = byItem.get(key) || { description: desc, quantity: 0, spend: 0, inventory_item_id: t.inventory_item_id };
      cur.quantity += Number(t.quantity || 0);
      cur.spend += amt;
      byItem.set(key, cur);
    }

    for (const r of rcpts) {
      totalSpend += Number(r.total || 0);
      for (const it of (r.items || [])) {
        const key = it.inventory_item_id || `_unmapped_${it.id}`;
        const desc = it.inventory_items?.item_name || it.description || "(no description)";
        const cur = byItem.get(key) || { description: desc, quantity: 0, spend: 0, inventory_item_id: it.inventory_item_id };
        cur.quantity += Number(it.quantity || 0);
        cur.spend += Number(it.amount || 0);
        byItem.set(key, cur);
      }
    }

    const by_item = Array.from(byItem.values()).sort((a, b) => b.spend - a.spend);

    return {
      total_spend: totalSpend,
      receipt_count: receiptCount,
      unique_items: by_item.length,
      avg_receipt_value: receiptCount > 0 ? Number(rcpts.reduce((s, r) => s + Number(r.total || 0), 0)) / receiptCount : 0,
      by_item,
    };
  },

  async listReceipts(args: {
    supplierId: string;
    companyId: string;
    fromIso?: string;
    toIso?: string;
  }): Promise<SupplierReceiptRow[]> {
    let q = (supabase as any)
      .from("purchase_receipts")
      .select("id, vendor, receipt_date, total, notes, image_url, created_at")
      .eq("company_id", args.companyId)
      .eq("supplier_id", args.supplierId)
      .is("deleted_at", null);
    if (args.fromIso) q = q.gte("created_at", args.fromIso);
    if (args.toIso)   q = q.lte("created_at", args.toIso);
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) { console.error("supplierService.listReceipts:", error); return []; }
    return (data || []) as SupplierReceiptRow[];
  },
};
