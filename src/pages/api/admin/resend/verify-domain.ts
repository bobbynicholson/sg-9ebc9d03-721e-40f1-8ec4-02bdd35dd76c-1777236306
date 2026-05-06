/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * Re-check the verification state of a tenant's Resend domain. Resend
 * may rotate the DNS records (rare, but documented), so we always
 * persist the latest record set as well as the new status. When status
 * flips to 'verified', stamp resend_domain_verified_at.
 */
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getResendDomain, isResendError } from "@/lib/resendDomains";
import type { NextApiRequest, NextApiResponse } from "next";

const ALLOWED_ROLES = new Set([
  "super_admin",
  "company_admin",
  "admin",
  "owner",
]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssr = createPagesServerClient({ req, res });
    const {
      data: { user: callerAuth },
    } = await ssr.auth.getUser();
    if (!callerAuth) {
      return res
        .status(401)
        .json({ error: "No active session, sign in and retry." });
    }

    const { data: callerProfile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", callerAuth.id)
      .single();
    const role =
      (callerProfile as any)?.active_role || (callerProfile as any)?.role;
    if (!callerProfile || !ALLOWED_ROLES.has(role)) {
      return res.status(403).json({
        error: `Role '${role || "unknown"}' is not permitted to manage email domains.`,
      });
    }

    const companyId = (callerProfile as any).company_id;
    if (!companyId) {
      return res.status(400).json({ error: "Caller has no company_id." });
    }

    const admin = getServiceSupabase();

    const { data: row } = await admin
      .from("email_provider_settings")
      .select(
        "id, resend_domain_id, resend_sending_domain, resend_domain_status, resend_domain_verified_at",
      )
      .eq("company_id", companyId)
      .eq("provider", "resend")
      .maybeSingle();

    if (!row || !(row as any).resend_domain_id) {
      return res.status(404).json({
        error:
          "No Resend domain registered for this company yet. Add one first.",
      });
    }

    const fresh = await getResendDomain((row as any).resend_domain_id);
    if (isResendError(fresh)) {
      // 404 from Resend means the domain was deleted out from under us
      // (e.g. via the Resend dashboard). Surface a clear error.
      const status =
        fresh.status === 404 ? 404 : fresh.status && fresh.status >= 400 ? fresh.status : 502;
      return res.status(status).json({ error: fresh.error });
    }

    const newStatus = (fresh as any).status || "pending";
    const newRecords = (fresh as any).records || [];
    const now = new Date().toISOString();
    const wasVerified = !!(row as any).resend_domain_verified_at;
    const verifiedAt =
      newStatus === "verified"
        ? (row as any).resend_domain_verified_at || now
        : null;

    const { error: updateErr } = await admin
      .from("email_provider_settings")
      .update({
        resend_dns_records: newRecords,
        resend_domain_status: newStatus,
        resend_domain_verified_at: verifiedAt,
        resend_last_checked_at: now,
        updated_at: now,
      })
      .eq("id", (row as any).id);
    if (updateErr) {
      console.error("[verify-domain] persist failed:", updateErr);
      return res.status(500).json({
        error: `Could not update domain status: ${updateErr.message}`,
      });
    }

    return res.status(200).json({
      domain: (row as any).resend_sending_domain,
      status: newStatus,
      records: newRecords,
      verified_at: verifiedAt,
      newly_verified: newStatus === "verified" && !wasVerified,
    });
  } catch (e: any) {
    console.error("[verify-domain] crashed:", e);
    return res
      .status(500)
      .json({ error: e?.message || "Unexpected server error" });
  }
}
