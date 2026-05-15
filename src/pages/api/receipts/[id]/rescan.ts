/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/receipts/[id]/rescan
 *
 * Re-runs the AI vision extractor against the image already attached
 * to a purchase_receipts row. Returns the extraction (line items +
 * tax-rule classification per line) without persisting; the client
 * opens the Reconcile drawer with the result and the operator
 * confirms before items get inserted.
 *
 * Use case: slips logged via the legacy 'Add slip' form on
 * /admin/tax-purchases (which doesn't run AI) -- this lets the owner
 * fast-forward those onto the new pipeline without delete + re-upload.
 *
 * Tenant-scoped via session. Caller-role allowlist matches the upload
 * handler.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { extractReceiptViaAI } from "@/lib/importAi";
import { getReceiptScanQuota } from "@/lib/receiptScanQuota";

const ALLOWED_CALLER_ROLES = new Set([
  "super_admin", "company_admin", "admin", "owner", "shopping_staff", "shopping",
]);

/**
 * The slip image lives in one of two buckets depending on which path
 * created the receipt:
 *   - 'purchase-receipts' for slips added via the legacy form
 *   - 'imports' for slips uploaded via the AI scanner pipeline
 * Try both, return the first that resolves.
 */
async function downloadSlipImage(supabase: any, imagePath: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const buckets = ["purchase-receipts", "imports"];
  for (const bucket of buckets) {
    try {
      const { data, error: error2 } = await supabase.storage.from(bucket).download(imagePath);
      if (error2) {
        console.error("[receipts/[id]/rescan] supabase op failed:", error2);
      }
      if (data) {
        const mime = (data as Blob).type || guessMimeFromPath(imagePath);
        const arrayBuf = await (data as Blob).arrayBuffer();
        return { bytes: Buffer.from(arrayBuf), mime };
      }
    } catch { /* try next bucket */ }
  }
  return null;
}

function guessMimeFromPath(p: string): string {
  const ext = (p.split(".").pop() || "").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile, error: profileErr } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .single();
    if (profileErr) {
      console.error("[receipts/[id]/rescan] profiles fetch failed:", profileErr);
    }
    const role = (profile?.active_role || profile?.role || "") as string;
    if (!ALLOWED_CALLER_ROLES.has(role)) {
      return res.status(403).json({ error: "Only owners / admins can rescan receipts" });
    }
    const companyId = profile?.company_id as string | null;
    if (!companyId) return res.status(403).json({ error: "Account is not linked to a company" });

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "AI is not configured -- set ANTHROPIC_API_KEY on the server." });
    }

    const receiptId = String(req.query.id || "");
    if (!receiptId) return res.status(400).json({ error: "Missing receipt id" });

    const supabase: any = getServiceSupabase();

    // Tenant-check: receipt must belong to this company.
    const { data: receipt, error: rcptErr } = await supabase
      .from("purchase_receipts")
      .select("id, company_id, image_path, vendor, receipt_date, total")
      .eq("id", receiptId)
      .maybeSingle();
    if (rcptErr || !receipt) return res.status(404).json({ error: "Receipt not found" });
    if (receipt.company_id !== companyId) return res.status(403).json({ error: "Cross-tenant access denied" });
    if (!receipt.image_path) {
      return res.status(400).json({ error: "This slip has no image attached -- can't rescan." });
    }

    const img = await downloadSlipImage(supabase, receipt.image_path);
    if (!img) {
      return res.status(404).json({ error: "Slip image is missing from storage." });
    }

    // Skip the AI re-extraction entirely if we already have draft
    // items waiting on this receipt -- e.g. operator scanned, closed
    // the drawer, came back. We return the persisted drafts as if
    // the AI just produced them. Saves Anthropic spend + matches
    // exactly what the operator was last looking at.
    const { data: existingDrafts, error: existingDraftsErr } = await supabase
      .from("purchase_receipt_items")
      .select(
        "id, description, amount, is_deductible, category, suggested_rule_id, inventory_item_id, quantity, unit_of_measure, unit_price, is_draft"
      )
      .eq("receipt_id", receiptId)
      .order("created_at", { ascending: true });
    if (existingDraftsErr) {
      console.error("[receipts/[id]/rescan] purchase_receipt_items fetch failed:", existingDraftsErr);
    }

    if ((existingDrafts || []).length > 0) {
      // Return drafts in the same shape extractReceiptViaAI emits,
      // wrapped in a minimal extraction envelope so the drawer
      // doesn't care whether it came from AI or DB.
      const lineItems = (existingDrafts as any[]).map((it) => ({
        description: it.description || "",
        quantity: it.quantity ?? null,
        unit: it.unit_of_measure ?? null,
        unit_price: it.unit_price ?? null,
        line_total: it.amount ?? null,
        tax_category_code: null, // resolved client-side via suggested_rule_id
        is_deductible: it.is_deductible ?? null,
        match_confidence: null,
        // Carryover for the drawer: pre-filled mappings from prior save.
        existing_item_id: it.id,
        existing_inventory_item_id: it.inventory_item_id,
        existing_suggested_rule_id: it.suggested_rule_id,
        existing_is_draft: !!it.is_draft,
      }));
      return res.status(200).json({
        ok: true,
        from_cache: true,
        extraction: {
          supplier_name: receipt.vendor,
          supplier_vat_number: null,
          receipt_date: receipt.receipt_date,
          receipt_number: null,
          currency: "ZAR",
          subtotal: null,
          vat: null,
          total: receipt.total,
          payment_method: null,
          line_items: lineItems,
          warnings: [],
        },
        receipt: {
          id: receipt.id,
          vendor: receipt.vendor,
          receipt_date: receipt.receipt_date,
          total: receipt.total,
          image_path: receipt.image_path,
        },
        ai: { tokens_in: 0, tokens_out: 0 },
        debug: { from_cache: true, line_count: lineItems.length },
      });
    }

    // Quota gate: a fresh AI call counts toward the tenant's monthly
    // scan budget. Rescans that hit the draft cache (handled above)
    // are free and don't reach this branch. We surface the remaining
    // quota in the error so the toast can tell the operator how long
    // until the cap resets.
    const quota = await getReceiptScanQuota(supabase, companyId);
    if (quota.exceeded) {
      return res.status(429).json({
        error:
          `Monthly AI scan limit reached (${quota.used} of ${quota.limit}). ` +
          `Resets at the start of next calendar month.`,
        quota,
      });
    }

    // Load active SARS rules for the classifier prompt.
    const { data: rulesData, error: rulesDataErr } = await supabase
      .from("sa_tax_deductibility_rules")
      .select("id, category_code, display_name, group_label, deductibility, match_keywords")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    if (rulesDataErr) {
      console.error("[receipts/[id]/rescan] sa_tax_deductibility_rules fetch failed:", rulesDataErr);
    }
    const taxRules = (rulesData || []) as Array<any>;

    const { extraction, tokens_in, tokens_out } = await extractReceiptViaAI({
      imageBase64: img.bytes.toString("base64"),
      imageMime: img.mime,
      taxRules,
    });

    // Memory layer: pre-fill inventory_item_id + suggested_rule_id from
    // the operator's previous {vendor, description} choices. We
    // normalise both sides (lower + collapse whitespace) so a casing
    // drift on the slip doesn't break the lookup. Only applies when
    // the receipt has a vendor; pre-vendor extractions skip this step.
    const vendorNorm = normaliseForMemory(receipt.vendor || extraction.supplier_name || "");
    const memoryByDesc = new Map<string, { inventory_item_id: string | null; suggested_rule_id: string | null; unit_of_measure: string | null }>();
    if (vendorNorm) {
      const { data: memoryRows } = await supabase
        .from("purchase_line_memory")
        .select("description_norm, inventory_item_id, suggested_rule_id, unit_of_measure")
        .eq("company_id", companyId)
        .eq("vendor_norm", vendorNorm);
      for (const row of (memoryRows as any[]) || []) {
        memoryByDesc.set(row.description_norm, {
          inventory_item_id: row.inventory_item_id,
          suggested_rule_id: row.suggested_rule_id,
          unit_of_measure: row.unit_of_measure,
        });
      }
    }

    // Resolve tax_category_code -> rule_id using the rules we loaded.
    const ruleByCode = new Map<string, string>();
    for (const r of taxRules) {
      if (r.category_code && r.id) ruleByCode.set(r.category_code, r.id);
    }

    // Persist drafts immediately so closing the drawer doesn't lose
    // them. We also fold in memory hints for inventory_item_id and
    // suggested_rule_id where the operator has previously mapped this
    // {vendor, description} pair.
    const draftRows = (extraction.line_items || []).map((li: any) => {
      const descNorm = normaliseForMemory(li.description || "");
      const memoryHit = descNorm ? memoryByDesc.get(descNorm) : null;
      const aiRuleId = li.tax_category_code ? ruleByCode.get(li.tax_category_code) : null;
      return {
        receipt_id: receiptId,
        description: li.description ?? "",
        amount: typeof li.line_total === "number" ? li.line_total : null,
        quantity: typeof li.quantity === "number" ? li.quantity : null,
        unit_of_measure: li.unit ?? memoryHit?.unit_of_measure ?? null,
        unit_price: typeof li.unit_price === "number" ? li.unit_price : null,
        is_deductible: typeof li.is_deductible === "boolean" ? li.is_deductible : null,
        category: li.tax_category_code ?? null,
        // Memory wins over AI's classifier on the rule pick -- the
        // operator's repeated choice is the higher-quality signal.
        suggested_rule_id: memoryHit?.suggested_rule_id ?? aiRuleId ?? null,
        inventory_item_id: memoryHit?.inventory_item_id ?? null,
        is_draft: true,
      };
    });

    let insertedDrafts: any[] = [];
    if (draftRows.length > 0) {
      const { data: ins, error: insErr } = await supabase
        .from("purchase_receipt_items")
        .insert(draftRows)
        .select(
          "id, description, amount, is_deductible, category, suggested_rule_id, inventory_item_id, quantity, unit_of_measure, unit_price, is_draft"
        );
      if (insErr) {
        console.error("[rescan] draft insert failed", insErr);
      } else {
        insertedDrafts = ins || [];
      }
    }

    // Re-emit the line_items with the persisted ids + pre-fills folded
    // in. Drawer renders from this, doesn't need to know the items
    // were drafted to DB.
    const lineItemsOut = (extraction.line_items || []).map((li: any, idx: number) => {
      const draft = insertedDrafts[idx];
      return {
        ...li,
        existing_item_id: draft?.id ?? null,
        existing_inventory_item_id: draft?.inventory_item_id ?? null,
        existing_suggested_rule_id: draft?.suggested_rule_id ?? null,
        existing_is_draft: true,
      };
    });

    // Server-side breadcrumb so a 0-line response is debuggable.
    console.log("[rescan]", {
      receipt_id: receiptId,
      image_bytes: img.bytes.length,
      image_mime: img.mime,
      tokens_in,
      tokens_out,
      lines: extraction.line_items.length,
      warnings: extraction.warnings,
      rules_count: taxRules.length,
      memory_hits: Array.from(memoryByDesc.keys()).length,
      drafts_persisted: insertedDrafts.length,
    });

    return res.status(200).json({
      ok: true,
      from_cache: false,
      extraction: { ...extraction, line_items: lineItemsOut },
      receipt: {
        id: receipt.id,
        vendor: receipt.vendor,
        receipt_date: receipt.receipt_date,
        total: receipt.total,
        image_path: receipt.image_path,
      },
      ai: { tokens_in, tokens_out },
      debug: {
        image_bytes: img.bytes.length,
        image_mime: img.mime,
        rules_count: taxRules.length,
        memory_hits: Array.from(memoryByDesc.keys()).length,
      },
    });
  } catch (e: any) {
    console.error("/api/receipts/[id]/rescan crashed:", e);
    return res.status(500).json({ error: e?.message || "Rescan failed" });
  }
}

/**
 * Normalise a vendor name or line description for memory lookup.
 * lowercase, trim, collapse internal whitespace, strip punctuation.
 * Keeps the matcher robust to OCR variance and casing drift.
 */
function normaliseForMemory(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
