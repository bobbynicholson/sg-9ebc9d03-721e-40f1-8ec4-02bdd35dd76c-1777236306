/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * Force re-verification by deleting and re-creating the tenant's
 * Resend domain object in one atomic call.
 *
 * When a domain sits on 'pending' for hours despite DNS records being
 * verifiably live (our diagnostic + an independent dig agree), it
 * usually means Resend's internal DNS resolver got a NXDOMAIN once and
 * cached the negative response. Their re-verify endpoint then keeps
 * returning 'pending' from cache. Deleting + re-creating the domain
 * object gives Resend a brand-new verification cycle from scratch.
 *
 * DNS records stay valid: Resend assigns a deterministic DKIM selector
 * (`resend._domainkey`) and the same private key, so re-created
 * records are byte-identical to the previous set. SPF + MX records
 * are identical by definition. The operator does NOT need to touch
 * their DNS host.
 *
 * Behaviour:
 *   1. Look up the existing Resend domain for this company.
 *   2. Delete it at Resend (404 from Resend is fine, means already
 *      gone). Local row stays in place so we have a reference point.
 *   3. Re-create at Resend with the same hostname.
 *   4. Persist the new resend_domain_id + fresh records + reset status
 *      to 'pending'. The next "Verify now" runs against the new object.
 *
 * Trigger Resend's verify endpoint immediately so the user doesn't
 * have to wait + click a second time.
 */
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  createResendDomain,
  deleteResendDomain,
  isResendError,
  verifyResendDomain,
  getResendDomain,
} from "@/lib/resendDomains";
import type { NextApiRequest, NextApiResponse } from "next";
import { withApiLogging } from "@/lib/withApiLogging";


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
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssr = createPagesServerClient({ req, res });
    const {
      data: { user: callerAuth },
    } = await ssr.auth.getUser();
    if (!callerAuth) {
      return res.status(401).json({ error: "No active session." });
    }

    const { data: callerProfile, error: callerProfileErr } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", callerAuth.id)
      .single();
    if (callerProfileErr) {
      console.error("[admin/resend/force-reverify] profiles fetch failed:", callerProfileErr);
    }
    const role =
      (callerProfile as any)?.active_role || (callerProfile as any)?.role;
    if (!callerProfile || !ALLOWED_ROLES.has(role)) {
      return res
        .status(403)
        .json({ error: `Role '${role}' is not permitted.` });
    }

    const companyId = (callerProfile as any).company_id;
    const admin = getServiceSupabase();

    const { data: row, error: rowErr } = await admin
      .from("email_provider_settings")
      .select("id, resend_domain_id, resend_sending_domain")
      .eq("company_id", companyId)
      .eq("provider", "resend")
      .maybeSingle();
    if (rowErr) {
      console.error("[admin/resend/force-reverify] email_provider_settings fetch failed:", rowErr);
    }

    if (!row) {
      return res.status(404).json({
        error:
          "No Resend domain registered for this company. Add one first.",
      });
    }

    const domain = (row as any).resend_sending_domain as string | null;
    if (!domain) {
      return res.status(409).json({
        error:
          "Domain row is missing the sending domain. Reset and re-add.",
      });
    }

    // 1. Delete the existing object at Resend (if there is one). 404
    //    is fine: it means the object was already gone (e.g. removed
    //    via the Resend dashboard).
    const existingId = (row as any).resend_domain_id as string | null;
    if (existingId) {
      const del = await deleteResendDomain(existingId);
      if (isResendError(del) && del.status !== 404) {
        console.warn(
          `[force-reverify] delete failed (continuing): ${del.error}`,
        );
        // Fall through - the create call below will fail with
        // 'already exists' if Resend still has it, and we'll surface
        // that clearly.
      }
    }

    // 2. Re-create at Resend.
    const created = await createResendDomain(domain);
    if (isResendError(created)) {
      return res.status(502).json({
        error: `Could not re-create the domain at Resend: ${created.error}`,
      });
    }

    const newId = (created as any).id;
    const newRecords = (created as any).records || [];
    const newStatus = (created as any).status || "pending";
    const now = new Date().toISOString();

    // 3. Persist fresh state. resend_domain_verified_at is reset to
    //    null because this is a brand-new verification cycle.
    const { error: updErr } = await admin
      .from("email_provider_settings")
      .update({
        resend_domain_id: newId,
        resend_dns_records: newRecords,
        resend_domain_status: newStatus,
        resend_domain_verified_at: null,
        resend_last_checked_at: now,
        updated_at: now,
      })
      .eq("id", (row as any).id);
    if (updErr) {
      console.error("[force-reverify] persist failed:", updErr);
      return res.status(500).json({
        error: `Domain was re-created at Resend but local save failed: ${updErr.message}`,
      });
    }

    // 4. Trigger a verify check immediately so the user doesn't have
    //    to wait + click again. Best effort - a fail here just means
    //    they hit "Verify now" once after the response.
    const triggered = await verifyResendDomain(newId);
    if (isResendError(triggered)) {
      console.warn(
        `[force-reverify] post-create verify trigger failed: ${triggered.error}`,
      );
    }

    // Fetch the latest state after the trigger so the response shape
    // matches /verify-domain (the front-end already knows how to read
    // it).
    const fresh = await getResendDomain(newId);
    if (!isResendError(fresh)) {
      const finalStatus = (fresh as any).status || newStatus;
      const finalRecords = (fresh as any).records || newRecords;
      await admin
        .from("email_provider_settings")
        .update({
          resend_domain_status: finalStatus,
          resend_dns_records: finalRecords,
          resend_last_checked_at: new Date().toISOString(),
        })
        .eq("id", (row as any).id);
      return res.status(200).json({
        ok: true,
        domain,
        domain_id: newId,
        status: finalStatus,
        records: finalRecords,
      });
    }

    return res.status(200).json({
      ok: true,
      domain,
      domain_id: newId,
      status: newStatus,
      records: newRecords,
    });
  } catch (e: any) {
    console.error("[force-reverify] crashed:", e);
    return res
      .status(500)
      .json({ error: e?.message || "Unexpected server error" });
  }
}

export default withApiLogging(handler);
