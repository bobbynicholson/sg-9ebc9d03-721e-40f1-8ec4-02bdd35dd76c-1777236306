/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Receipt-scan quota -- defensive cap on per-tenant AI receipt scans.
 *
 * Why: AI calls are the largest variable line on platform COGS (see
 * /admin/platform/tech-costs). One runaway tenant uploading 500 slips
 * in a weekend could rack up R200+ of Anthropic spend on its own. We
 * cap each tenant at 60 scans per calendar month -- enough for normal
 * weekly shopping plus headroom, far below "burning money" territory.
 *
 * Counted: every purchase_receipts row created in the current calendar
 * month for this company. Both fresh slip uploads and "Add slip"
 * keyed-in entries count, but the latter doesn't actually trigger AI
 * (no image_path) -- so practically the count is "scans".
 *
 * Not counted: rescans of an existing receipt that hit the draft cache
 * (no new AI call). The draft persistence layer handles that.
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

  const { count } = await supabase
    .from("purchase_receipts")
    .select("id", { head: true, count: "exact" })
    .eq("company_id", companyId)
    .gte("created_at", startOfMonth.toISOString());

  const used = count ?? 0;
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
