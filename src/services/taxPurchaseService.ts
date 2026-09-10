/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * taxPurchaseService - track tax-deductible purchases on slips so
 * the catering company has clean numbers to hand their accountant.
 *
 * NOT an accounting tool. We don't classify expenses, we don't post
 * to a chart of accounts, we don't reconcile. We just give the
 * operator one place to:
 *
 *   - Snap or upload a slip from a shop
 *   - Tap each line and mark it deductible (or not - some baskets
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
import { captureException } from "@/lib/observability";

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
  /** TAX-B (tax-purchases deferred, 2026-05-24): FK to
   *  sa_tax_deductibility_rules. Lets the read path render an
   *  override badge when the line's is_deductible disagrees with
   *  rule.deductibility, and powers the VAT input claim split. */
  suggested_rule_id?: string | null;
  /** Joined from sa_tax_deductibility_rules via suggested_rule_id.
   *  NULL when no rule matched at extraction time. */
  rule?: TaxRule | null;
}

/**
 * TAX-B: shallow projection of sa_tax_deductibility_rules. The full
 * rule has match_keywords, example_items, legal_reference etc. - we
 * only need the verdict + VAT claimability on the read path.
 */
export interface TaxRule {
  id: string;
  category_code: string;
  display_name: string;
  deductibility: "deductible" | "partial" | "non_deductible";
  vat_input_claimable: "claimable" | "not_claimable" | "depends";
}

export interface ReceiptWithItems extends PurchaseReceipt {
  items: PurchaseReceiptItem[];
  deductibleTotal: number;
  nonDeductibleTotal: number;
  /** TAX-B: VAT input that can be reclaimed on this slip. Sums the
   *  VAT portion (amount * 15/115) of lines that are both
   *  is_deductible AND have rule.vat_input_claimable = 'claimable'.
   *  Lines with vat_input_claimable = 'depends' are excluded here
   *  to stay conservative; the export still shows them so an
   *  accountant can decide. */
  vatClaimableTotal: number;
  /** TAX-B: lines where the operator marked deductible but the
   *  rule says non_deductible. Surfaced as the amber override
   *  badge. Zero on a clean slip. */
  overrideCount: number;
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
    // TAX-C (task #180, 2026-05-24): tag the silent failure path so
    // an upload that 403s on a bucket-policy regression doesn't
    // disappear into the void.
    captureException(error, { tags: { service: "taxPurchase", area: "uploadReceiptImage", tenant: args.companyId } });
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
    captureException(error, { tags: { service: "taxPurchase", area: "createReceipt", tenant: args.companyId } });
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
    captureException(error, { tags: { service: "taxPurchase", area: "addItem", receiptId: args.receiptId } });
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
  // TAX-B: join the rule via suggested_rule_id so the read path
  // can render the override badge + compute the VAT claim split.
  // sa_tax_deductibility_rules is a small global table (sub-50
  // rows) with RLS that lets every authenticated user read it, so
  // the join is cheap.
  let q = (supabase as any)
    .from("purchase_receipts")
    .select(`
      *,
      items:purchase_receipt_items(
        *,
        rule:sa_tax_deductibility_rules!suggested_rule_id(
          id, category_code, display_name, deductibility, vat_input_claimable
        )
      )
    `)
    .eq("company_id", args.companyId)
    .is("deleted_at", null)
    .order("receipt_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (args.fromDate) q = q.gte("receipt_date", args.fromDate);
  if (args.toDate)   q = q.lte("receipt_date", args.toDate);

  const { data, error } = await q;
  if (error) {
    captureException(error, { tags: { service: "taxPurchase", area: "listForCompany", tenant: args.companyId } });
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
    // TAX-B: VAT input claim. South Africa is 15% VAT (Schedule 1,
    // VAT Act). The VAT portion of a R 100 standard-rated line is
    // R 100 * 15 / 115 = R 13.04. We only count it when the rule
    // says 'claimable' - 'depends' is left to the accountant.
    const vatClaimableTotal = items
      .filter((it) => it.is_deductible && it.rule?.vat_input_claimable === "claimable")
      .reduce((s, it) => s + (Number(it.amount || 0) * 15) / 115, 0);
    const overrideCount = items.filter(
      (it) => it.is_deductible && it.rule?.deductibility === "non_deductible",
    ).length;
    return {
      ...r,
      items,
      deductibleTotal,
      nonDeductibleTotal,
      vatClaimableTotal,
      overrideCount,
    } as ReceiptWithItems;
  });
}

/**
 * Build a CSV the operator can export and forward to their
 * accountant. One row per line item with its deductibility flag.
 */
export function buildCsvExport(receipts: ReceiptWithItems[]): string {
  // TAX-B: added VAT input, rule verdict, and an Override flag so
  // the accountant can spot deductible-marked lines whose rule says
  // non_deductible. Also added the UTF-8 BOM (﻿) at write-time
  // on the page so Excel-ZA renders R + diacritics correctly.
  const header = [
    "Receipt date",
    "Vendor",
    "Receipt total",
    "Item description",
    "Item amount",
    "Deductible",
    "Rule verdict",
    "VAT input claimable",
    "VAT (R)",
    "Override of non-deductible rule",
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
        "",
        "",
        "",
        "",
        r.notes || "",
      ].map(escape).join(","));
      continue;
    }
    for (const it of r.items) {
      const ruleVerdict = it.rule?.deductibility || "";
      const ruleVat = it.rule?.vat_input_claimable || "";
      const vatRand =
        it.is_deductible && ruleVat === "claimable"
          ? ((Number(it.amount) || 0) * 15 / 115).toFixed(2)
          : "";
      const isOverride =
        it.is_deductible && it.rule?.deductibility === "non_deductible";
      rows.push([
        r.receipt_date || "",
        r.vendor || "",
        r.total ?? "",
        it.description,
        it.amount,
        it.is_deductible ? "Yes" : "No",
        ruleVerdict,
        ruleVat,
        vatRand,
        isOverride ? "Yes" : "",
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
  /** TAX-B: VAT input claimable across all receipts. Sum of each
   *  receipt's vatClaimableTotal. */
  vatClaimableTotal: number;
  /** TAX-B: count of lines where is_deductible disagrees with the
   *  rule's non_deductible verdict. Drives the SARS-readiness card
   *  and the per-row badge. */
  overrideCount: number;
  /** TAX-B: count of receipts where the lines don't reconcile to
   *  the printed slip total (drift > 5% AND > R 1). Drives the
   *  page-level mismatch banner. */
  mismatchCount: number;
}

export function summarise(receipts: ReceiptWithItems[]): PurchaseSummary {
  let deductibleTotal = 0;
  let nonDeductibleTotal = 0;
  let unfiledCount = 0;
  let vatClaimableTotal = 0;
  let overrideCount = 0;
  let mismatchCount = 0;
  for (const r of receipts) {
    deductibleTotal += r.deductibleTotal;
    nonDeductibleTotal += r.nonDeductibleTotal;
    vatClaimableTotal += r.vatClaimableTotal || 0;
    overrideCount += r.overrideCount || 0;
    if (r.items.length === 0) unfiledCount += 1;
    // Same drift rule the per-slip chip uses on the page.
    const itemsTotal = r.deductibleTotal + r.nonDeductibleTotal;
    const slipTotal = Number(r.total ?? 0);
    if (slipTotal > 0) {
      const drift = Math.abs(itemsTotal - slipTotal);
      if (drift > slipTotal * 0.05 && drift > 1) mismatchCount += 1;
    }
  }
  return {
    receiptCount: receipts.length,
    deductibleTotal,
    nonDeductibleTotal,
    unfiledCount,
    vatClaimableTotal,
    overrideCount,
    mismatchCount,
  };
}

/**
 * TAX-B: SA tax-year range. Tax year runs 1 March - end February.
 * On 24 May 2026 the current tax year is 2026/2027, starting
 * 1 March 2026. In Jan-Feb the current tax year started the
 * previous calendar year.
 */
export function saTaxYearRange(now: Date = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  const startYear = m >= 2 ? y : y - 1;
  const from = new Date(startYear, 2, 1);
  const to = new Date(startYear + 1, 1, 28);
  // ISO yyyy-mm-dd via local fields (matches toLocalISO shape).
  const fmt = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };
  return { from: fmt(from), to: fmt(to) };
}

/**
 * TAX-B: month buckets for the sparkline. Returns the last N months
 * (oldest first) keyed by 'YYYY-MM', with the deductible total per
 * month. Months with no receipts get 0 so the sparkline still has
 * the right number of bars.
 */
export function monthlyDeductibleSparkline(
  receipts: ReceiptWithItems[],
  monthsBack: number = 6,
): Array<{ key: string; label: string; total: number }> {
  const out: Array<{ key: string; label: string; total: number }> = [];
  const now = new Date();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    out.push({
      key: `${yyyy}-${mm}`,
      label: d.toLocaleDateString("en-ZA", { month: "short" }),
      total: 0,
    });
  }
  const idx = new Map(out.map((b, i) => [b.key, i] as const));
  for (const r of receipts) {
    if (!r.receipt_date) continue;
    const key = r.receipt_date.slice(0, 7);
    const i = idx.get(key);
    if (i == null) continue;
    out[i].total += r.deductibleTotal;
  }
  return out;
}

/**
 * TAX-B: detect calendar weeks with zero slips logged in a tenant
 * that normally posts weekly. The "normal" baseline is the median
 * weekly slip count across the input range. Weeks below the
 * threshold are flagged so an accountant can ask "where are the
 * slips for that week?".
 *
 * Returns at most the 4 most recent zero-or-low weeks within the
 * input range. Returns [] when there isn't enough data to set a
 * baseline (< 6 weeks of history).
 */
export function detectMissingSlipWeeks(
  receipts: ReceiptWithItems[],
): Array<{ weekStart: string; slipCount: number; expected: number }> {
  if (receipts.length < 6) return [];
  // Bucket by ISO-week start (Monday). Use receipt_date.
  const buckets = new Map<string, number>();
  let earliest: Date | null = null;
  let latest: Date | null = null;
  for (const r of receipts) {
    if (!r.receipt_date) continue;
    const d = new Date(r.receipt_date + "T12:00:00");
    if (Number.isNaN(d.getTime())) continue;
    if (!earliest || d < earliest) earliest = d;
    if (!latest || d > latest) latest = d;
    const dow = d.getDay(); // 0 = Sun
    const offset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(d);
    monday.setDate(d.getDate() + offset);
    const key = monday.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  if (!earliest || !latest) return [];
  const weekCount = Math.ceil(((latest.getTime() - earliest.getTime()) / 86_400_000) / 7) + 1;
  if (weekCount < 6) return [];
  // Walk weeks from earliest -> latest filling in zeros so a quiet
  // week shows up as a bucket.
  const weeklyCounts: Array<{ weekStart: string; count: number }> = [];
  const cursor = new Date(earliest);
  const cursorDow = cursor.getDay();
  cursor.setDate(cursor.getDate() + (cursorDow === 0 ? -6 : 1 - cursorDow));
  while (cursor <= latest) {
    const key = cursor.toISOString().slice(0, 10);
    weeklyCounts.push({ weekStart: key, count: buckets.get(key) || 0 });
    cursor.setDate(cursor.getDate() + 7);
  }
  // Median of non-zero weeks gives the "normal" rhythm.
  const nonZero = weeklyCounts.map((w) => w.count).filter((c) => c > 0).sort((a, b) => a - b);
  if (nonZero.length < 4) return [];
  const median = nonZero[Math.floor(nonZero.length / 2)];
  const threshold = Math.max(1, Math.floor(median / 2));
  return weeklyCounts
    .filter((w) => w.count < threshold)
    .slice(-4)
    .map((w) => ({ weekStart: w.weekStart, slipCount: w.count, expected: median }));
}
