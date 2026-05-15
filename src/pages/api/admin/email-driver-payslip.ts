/**
 * POST /api/admin/email-driver-payslip
 *
 * Phase 5 #4: emails a per-driver payslip PDF to the driver. The
 * client renders the PDF (jsPDF is browser-only) and POSTs the
 * base64-encoded blob here; this endpoint just wraps the existing
 * emailService.sendEmail with the right shape so the send picks up
 * the tenant's branded sender + audit logging.
 *
 * Auth: admin/owner in the driver's company.
 *
 * Body:
 *   {
 *     driver_id: string,
 *     driver_email: string,
 *     driver_name: string,
 *     period_from: 'YYYY-MM-DD',
 *     period_to: 'YYYY-MM-DD',
 *     grand_total: number,
 *     attachment_filename: string,
 *     attachment_base64: string
 *   }
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { emailService } from "@/services/emailService";

const ADMIN_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile, error: profileErr } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("[admin/email-driver-payslip] profiles fetch failed:", profileErr);
    }
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ADMIN_ROLES.has(role)) return res.status(403).json({ error: "Admin only" });
    const companyId = (profile as any)?.company_id;

    const b = (req.body || {}) as any;
    const driver_id = String(b.driver_id || "");
    const driver_email = String(b.driver_email || "").trim();
    const driver_name = String(b.driver_name || "").trim();
    const period_from = String(b.period_from || "");
    const period_to = String(b.period_to || "");
    const grand_total = Number(b.grand_total ?? 0);
    const attachment_filename = String(b.attachment_filename || "");
    const attachment_base64 = String(b.attachment_base64 || "");

    if (!driver_id || !driver_email || !attachment_base64 || !attachment_filename) {
      return res.status(400).json({ error: "driver_id, driver_email, attachment_filename, attachment_base64 are required" });
    }

    // Tenant scope: confirm the driver belongs to the caller's company.
    const { data: driver } = await ssr
      .from("profiles")
      .select("id, company_id, full_name, email")
      .eq("id", driver_id)
      .maybeSingle();
    if (!driver) return res.status(404).json({ error: "Driver not found" });
    if ((driver as any).company_id !== companyId) {
      return res.status(403).json({ error: "Wrong company" });
    }

    // Pull company name for the email body.
    const { data: companyRow } = await ssr
      .from("companies")
      .select("company_name, currency")
      .eq("id", companyId)
      .maybeSingle();
    const companyName = ((companyRow as any)?.company_name as string) || "your company";
    const currencySymbol = ((companyRow as any)?.currency as string) === "GBP" ? "£"
      : ((companyRow as any)?.currency as string) === "USD" ? "$"
      : ((companyRow as any)?.currency as string) === "EUR" ? "€"
      : "R";

    const firstName = driver_name.split(" ")[0] || "there";
    const subject = `Payslip ${period_from} -- ${period_to}`;
    const bodyText =
      `Hi ${firstName},\n\n` +
      `Your payslip for the period ${period_from} to ${period_to} is attached.\n\n` +
      `Total: ${currencySymbol} ${grand_total.toFixed(2)}\n\n` +
      `Any questions, hit reply.\n\n` +
      `-- ${companyName}`;
    const bodyHtml = `<p>${bodyText.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br />")}</p>`;

    const ok = await emailService.sendEmail({
      companyId,
      to: driver_email,
      subject,
      template: "transactional",
      html: bodyHtml,
      text: bodyText,
      attachments: [
        {
          filename: attachment_filename,
          content: attachment_base64,
        },
      ],
      _client: ssr,
    } as any);

    if (!ok) {
      return res.status(502).json({ error: "Email send failed" });
    }

    // Audit row so we can prove payslip distribution if a driver
    // disputes ever receiving theirs.
    try {
      await ssr.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        action: "driver_payslip_emailed",
        entity_type: "user",
        entity_id: driver_id,
        details: {
          period_from,
          period_to,
          grand_total,
          driver_email,
          filename: attachment_filename,
        },
      });
    } catch (auditErr) {
      console.warn("[email-driver-payslip] audit insert failed:", auditErr);
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[email-driver-payslip] crashed:", err);
    return res.status(500).json({ error: err?.message || "Email failed" });
  }
}
