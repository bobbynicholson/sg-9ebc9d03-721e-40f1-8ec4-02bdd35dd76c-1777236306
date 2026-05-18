/**
 * GET /api/admin/email-failures
 *
 * Returns the recent email_automation_log rows that are not 'sent'.
 * Powers the Failures tab on /admin/email-automation-dashboard so the
 * team can see "what didn't go out" and click Resend on the rows
 * worth retrying.
 *
 * Query params:
 *   limit  - max rows (default 100, capped at 250)
 *   status - filter to a single status (failed | blocked | quarantined |
 *             simulated). Omit to get every non-sent row.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);
const ALLOWED_STATUSES = new Set(["failed", "blocked", "quarantined", "simulated"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Owner or admin only" });

    const companyId = (profile as any)?.company_id as string | null;
    if (!companyId && role !== "super_admin") {
      return res.status(403).json({ error: "Account is not linked to a company" });
    }

    const limit = Math.min(250, Math.max(1, parseInt(String(req.query.limit || "100"), 10) || 100));
    const filterStatus = String(req.query.status || "").toLowerCase();

    let q = ssr
      .from("email_automation_log")
      .select("id, user_id, order_id, template_type, recipient_email, recipient_name, subject, status, error_message, created_at, sent_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (role !== "super_admin" && companyId) {
      q = q.eq("user_id", companyId);
    }

    if (filterStatus && ALLOWED_STATUSES.has(filterStatus)) {
      q = q.eq("status", filterStatus);
    } else {
      // Default: every non-sent row.
      q = q.in("status", ["failed", "blocked", "quarantined", "simulated"]);
    }

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    // Counts grouped by status so the dashboard can show tab badges.
    const counts: Record<string, number> = {
      failed: 0, blocked: 0, quarantined: 0, simulated: 0,
    };
    for (const row of data || []) {
      const s = String((row as any).status || "");
      if (s in counts) counts[s] += 1;
    }

    return res.status(200).json({ ok: true, rows: data || [], counts });
  } catch (err: any) {
    console.error("[email-failures] crashed:", err);
    return res.status(500).json({ error: err?.message || "Failed to load" });
  }
}
