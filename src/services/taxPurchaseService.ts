/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * taxPurchaseService -- track tax-deductible purchases on slips so
 * the catering company has clean numbers to hand their accountant.
 *
 * NOT an accounting tool. We don't classify expenses, we don't post
 * to a chart of accounts, we don't reconcile. We just give the
 * operator one place to:
 *
 *   - Snap or upload a slip from a shop
 *   - Tap each line and mark it deductible (or not -- some baskets
 *     mix business with personal)
 *   - See month / quarter / year totals of the deductible bucket
 *   - Export everything as CSV for the accountant
 *
 * Storage:
 *   - Slip image lives in the `purchase-receipts` Supabase bucket
 *     under {company_id}/{receipt_id}.{ext}
 *   - Metadata in `purchase_receipts` table
 *   - Per-line items in `purchase_receipt_items` table, each with
 *     an is_deductible flag the operator toggles
 *
 * Tenant scope is enforced by RLS on both tables.
 */

import { supabase } from "@/integrations/supabase/client";

export interface PurchaseReceipt {
  id: string;
  company_id: string;
  uploaded_by: string | null;
  vendor: string | null;
  receipt_date: string | null;
  total: number | null;
  currency: string;
  notes: string | null;
  image_path: string | null;
  image_url: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseReceiptItem {
  id: string;
  receipt_id: string;
  description: string;
  amount: number;
  is_deductible: boolean;
  category: string | null;
  notes: string | null;
  created_at: string;
}

export interface ReceiptWithItems extends PurchaseReceipt {
  items: PurchaseReceiptItem[];
  deductibleTotal: number;
  nonDeductibleTotal: number;
}

const BUCKET = "purchase-receipts";

/**
 * Upload a slip image to storage and return the public URL + path.
 * Path shape: {companyId}/{uuid}.{ext} so even if a tenant deletes
 * a receipt row, the storage object can be cleaned up by company.
 */
export async function uploadReceiptImage(args: {
  companyId: string;
  file: File;
}): Promise<{ path: string; url: string } | null> {
  const ext = args.file.name.split(".").pop()?.toLowerCase() || "jpg";
  const fileId = crypto.randomUUID();
  const path = `${args.companyId}/${fileId}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, args.file, { upsert: false, contentType: args.file.type });
  if (error) {
    console.error("uploadReceiptImage error:", error);
    return null;
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function createReceipt(args: {
  companyId: string;
  uploadedBy: string;
  vendor?: string | null;
  receiptDate?: string | null;
  total?: number | null;
  notes?: string | null;
  imagePath?: string | null;
  imageUrl?: string | null;
}): Promise<PurchaseReceipt | null> {
  const { data, error } = await (supabase as any)
    .from("purchase_receipts")
    .insert({
      company_id:    args.companyId,
      uploaded_by:   args.uploadedBy,
      vendor:        args.vendor ?? null,
      receipt_date:  args.receiptDate ?? null,
      total:         args.total ?? null,
      notes:         args.notes ?? null,
      image_path:    args.imagePath ?? null,
      image_url:     args.imageUrl ?? null,
    })
    .select()
    .single();
  if (error) {
    console.error("createReceipt error:", error);
    return null;
  }
  return data as PurchaseReceipt;
}

export async function updateReceipt(args: {
  receiptId: string;
  vendor?: string | null;
  receiptDate?: string | null;
  total?: number | null;
  notes?: string | null;
}): Promise<void> {
  const patch: any = { updated_at: new Date().toISOString() };
  if (args.vendor !== undefined)      patch.vendor = args.vendor;
  if (args.receiptDate !== undefined) patch.receipt_date = args.receiptDate;
  if (args.total !== undefined)       patch.total = args.total;
  if (args.notes !== undefined)       patch.notes = args.notes;
  const { error } = await (supabase as any)
    .from("purchase_receipts")
    .update(patch)
    .eq("id", args.receiptId);
  if (error) throw error;
}

export async function softDeleteReceipt(receiptId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("purchase_receipts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", receiptId);
  if (error) throw error;
}

export async function addItem(args: {
  receiptId: string;
  description: string;
  amount: number;
  isDeductible?: boolean;
  category?: string | null;
  notes?: string | null;
}): Promise<PurchaseReceiptItem | null> {
  const { data, error } = await (supabase as any)
    .from("purchase_receipt_items")
    .insert({
      receipt_id:    args.receiptId,
      description:   args.description,
      amount:        args.amount,
      is_deductible: args.isDeductible ?? true,
      category:      args.category ?? null,
      notes:         args.notes ?? null,
    })
    .select()
    .single();
  if (error) {
    console.error("addItem error:", error);
    return null;
  }
  return data as PurchaseReceiptItem;
}

export async function updateItem(args: {
  itemId: string;
  description?: string;
  amount?: number;
  isDeductible?: boolean;
  category?: string | null;
  notes?: string | null;
}): Promise<void> {
  const patch: any = {};
  if (args.description !== undefined)  patch.description = args.description;
  if (args.amount !== undefined)       patch.amount = args.amount;
  if (args.isDeductible !== undefined) patch.is_deductible = args.isDeductible;
  if (args.category !== undefined)     patch.category = args.category;
  if (args.notes !== undefined)        patch.notes = args.notes;
  const { error } = await (supabase as any)
    .from("purchase_receipt_items")
    .update(patch)
    .eq("id", args.itemId);
  if (error) throw error;
}

export async function deleteItem(itemId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("purchase_receipt_items")
    .delete()
    .eq("id", itemId);
  if (error) throw error;
}

/**
 * List receipts with their items, optionally bounded by a date range.
 * Returns each receipt with deductible / non-deductible subtotals
 * pre-computed for the table view.
 */
export async function listForCompany(args: {
  companyId: string;
  fromDate?: string;
  toDate?: string;
}): Promise<ReceiptWithItems[]> {
  let q = (supabase as any)
    .from("purchase_receipts")
    .select(`
      *,
      items:purchase_receipt_items(*)
    `)
    .eq("company_id", args.companyId)
    .is("deleted_at", null)
    .order("receipt_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (args.fromDate) q = q.gte("receipt_date", args.fromDate);
  if (args.toDate)   q = q.lte("receipt_date", args.toDate);

  const { data, error } = await q;
  if (error) {
    console.error("listForCompany error:", error);
    return [];
  }
  return (data || []).map((r: any) => {
    const items = (r.items || []) as PurchaseReceiptItem[];
    const deductibleTotal = items
      .filter((it) => it.is_deductible)
      .reduce((s, it) => s + Number(it.amount || 0), 0);
    const nonDeductibleTotal = items
      .filter((it) => !it.is_deductible)
      .reduce((s, it) => s + Number(it.amount || 0), 0);
    return { ...r, items, deductibleTotal, nonDeductibleTotal } as ReceiptWithItems;
  });
}

/**
 * Build a CSV the operator can export and forward to their
 * accountant. One row per line item with its deductibility flag.
 */
export function buildCsvExport(receipts: ReceiptWithItems[]): string {
  const header = [
    "Receipt date",
    "Vendor",
    "Receipt total",
    "Item description",
    "Item amount",
    "Deductible",
    "Category",
    "Notes",
    "Receipt notes",
  ];
  const escape = (v: any) => {
    const s = v == null ? "" : String(v);
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const rows: string[] = [header.join(",")];
  for (const r of receipts) {
    if (r.items.length === 0) {
      rows.push([
        r.receipt_date || "",
        r.vendor || "",
        r.total ?? "",
        "(no line items)",
        r.total ?? "",
        "",
        "",
        "",
        r.notes || "",
      ].map(escape).join(","));
      continue;
    }
    for (const it of r.items) {
      rows.push([
        r.receipt_date || "",
        r.vendor || "",
        r.total ?? "",
        it.description,
        it.amount,
        it.is_deductible ? "Yes" : "No",
        it.category || "",
        it.notes || "",
        r.notes || "",
      ].map(escape).join(","));
    }
  }
  return rows.join("\n");
}

/**
 * Quick rollups for the dashboard cards on the page header.
 * Calculated client-side from the already-loaded list so we don't
 * need a separate query.
 */
export interface PurchaseSummary {
  receiptCount: number;
  deductibleTotal: number;
  nonDeductibleTotal: number;
  unfiledCount: number;
}

export function summarise(receipts: ReceiptWithItems[]): PurchaseSummary {
  let deductibleTotal = 0;
  let nonDeductibleTotal = 0;
  let unfiledCount = 0;
  for (const r of receipts) {
    deductibleTotal += r.deductibleTotal;
    nonDeductibleTotal += r.nonDeductibleTotal;
    if (r.items.length === 0) unfiledCount += 1;
  }
  return {
    receiptCount: receipts.length,
    deductibleTotal,
    nonDeductibleTotal,
    unfiledCount,
  };
}
