/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * Reset the tenant's Resend domain. Removes it from Resend and clears
 * the resend_* columns on email_provider_settings. The provider row
 * itself stays (so other settings - daily cap, auto-attach toggles --
 * survive). Use when the operator typoed or wants to switch domain.
 */
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { deleteResendDomain, isResendError } from "@/lib/resendDomains";
import type { NextApiRequest, NextApiResponse } from "next";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";


const ALLOWED_ROLES = new Set([
  "super_admin",
  "company_admin",
  "admin",
  "owner",
]);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "POST" && req.method !== "DELETE") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssr = createPagesServerClient({ req, res });
    const {
      data: { user: callerAuth },
    } = await ssr.auth.getUser();
    if (!callerAuth) {
      return res.status(401).json({ error: "No active session." });
    }

    const { data: callerProfile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", callerAuth.id)
      .single();
    const role =
      (callerProfile as any)?.active_role || (callerProfile as any)?.role;
    if (!callerProfile || !ALLOWED_ROLES.has(role)) {
      return res
        .status(403)
        .json({ error: `Role '${role}' is not permitted.` });
    }

    const companyId = (callerProfile as any).company_id;
    const admin = getServiceSupabase();

    const { data: row } = await admin
      .from("email_provider_settings")
      .select("id, resend_domain_id")
      .eq("company_id", companyId)
      .eq("provider", "resend")
      .maybeSingle();

    if (!row) {
      return res.status(200).json({ ok: true, note: "Nothing to reset." });
    }

    if ((row as any).resend_domain_id) {
      const del = await deleteResendDomain((row as any).resend_domain_id);
      if (isResendError(del) && del.status !== 404) {
        // Soft-fail: still clear locally so the operator can re-add. Log
        // for ops to clean up dangling Resend entries if needed.
        console.warn(
          `[delete-domain] Resend rejected delete: ${del.error}. Clearing local row anyway.`,
        );
      }
    }

    const now = new Date().toISOString();
    const { error: updErr } = await admin
      .from("email_provider_settings")
      .update({
        resend_domain_id: null,
        resend_sending_domain: null,
        resend_dns_records: null,
        resend_domain_status: null,
        resend_domain_verified_at: null,
        resend_last_checked_at: now,
        updated_at: now,
      })
      .eq("id", (row as any).id);
    if (updErr) {
      console.error("[delete-domain] persist failed:", updErr);
      return res
        .status(500)
        .json({ error: `Could not clear domain: ${dbErrorMessage(updErr)}` });
    }

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("[delete-domain] crashed:", e);
    return res
      .status(500)
      .json({ error: dbErrorMessage(e) || "Unexpected server error" });
  }
}

export default withApiLogging(handler);
