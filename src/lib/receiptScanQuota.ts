/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Receipt-scan quota - defensive cap on per-tenant AI receipt scans.
 *
 * Why: AI calls are the largest variable line on platform COGS (see
 * /admin/platform/tech-costs). One runaway tenant uploading 500 slips
 * in a weekend could rack up R200+ of Anthropic spend on its own. We
 * cap each tenant at 60 scans per calendar month - enough for normal
 * weekly shopping plus headroom, far below "burning money" territory.
 *
 * SHOP-B (shopping audit fix, 2026-05-24): the previous version
 * counted purchase_receipts rows, but the upload endpoint inserts
 * import_rows (one per image) rather than purchase_receipts (which
 * only get written when the operator Reconciles). The cap therefore
 * NEVER tripped on the actual scan - it tripped on the save step.
 *
 * Now counts import_rows belonging to receipts jobs for this tenant
 * in the current calendar month. Manual "Add slip by hand" entries
 * write straight to purchase_receipts and bypass the scanner, so
 * they're correctly excluded from the AI-quota count.
 */
const MONTHLY_SCAN_CAP = 60;

export interface QuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
}

/**
 * Read the current month's scan count for a company and return quota
 * status. Caller decides whether to block (fresh scan) or proceed
 * (rescan of existing).
 */
export async function getReceiptScanQuota(
  supabase: any,
  companyId: string,
): Promise<QuotaStatus> {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  // Two-step because import_rows doesn't carry company_id directly.
  // 1. Pull import_jobs.id for receipts jobs this tenant has created
  //    this month.
  // 2. Count import_rows belonging to those jobs.
  const { data: jobs } = await supabase
    .from("import_jobs")
    .select("id")
    .eq("company_id", companyId)
    .eq("kind", "receipts")
    .gte("created_at", startOfMonth.toISOString());

  const jobIds = ((jobs || []) as Array<{ id: string }>).map((j) => j.id);
  let used = 0;
  if (jobIds.length > 0) {
    const { count } = await supabase
      .from("import_rows")
      .select("id", { head: true, count: "exact" })
      .in("job_id", jobIds);
    used = count ?? 0;
  }

  return {
    used,
    limit: MONTHLY_SCAN_CAP,
    remaining: Math.max(0, MONTHLY_SCAN_CAP - used),
    exceeded: used >= MONTHLY_SCAN_CAP,
  };
}

/**
 * Convenience: throw a structured error a fetch handler can return
 * directly. Shape matches the toast contract on the client.
 */
export class ReceiptScanQuotaExceeded extends Error {
  status: QuotaStatus;
  constructor(status: QuotaStatus) {
    super(
      `Monthly scan limit reached (${status.used} of ${status.limit}). ` +
      `New scans available next calendar month.`,
    );
    this.name = "ReceiptScanQuotaExceeded";
    this.status = status;
  }
}
