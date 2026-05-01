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
      const { data } = await supabase.storage.from(bucket).download(imagePath);
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

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .single();
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

    // Load active SARS rules for the classifier prompt.
    const { data: rulesData } = await supabase
      .from("sa_tax_deductibility_rules")
      .select("category_code, display_name, group_label, deductibility, match_keywords")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    const taxRules = (rulesData || []) as Array<any>;

    const { extraction, tokens_in, tokens_out } = await extractReceiptViaAI({
      imageBase64: img.bytes.toString("base64"),
      imageMime: img.mime,
      taxRules,
    });

    return res.status(200).json({
      ok: true,
      extraction,
      receipt: {
        id: receipt.id,
        vendor: receipt.vendor,
        receipt_date: receipt.receipt_date,
        total: receipt.total,
        image_path: receipt.image_path,
      },
      ai: { tokens_in, tokens_out },
    });
  } catch (e: any) {
    console.error("/api/receipts/[id]/rescan crashed:", e);
    return res.status(500).json({ error: e?.message || "Rescan failed" });
  }
}
