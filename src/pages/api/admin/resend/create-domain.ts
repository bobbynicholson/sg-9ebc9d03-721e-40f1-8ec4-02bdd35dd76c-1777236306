/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * Register a new sending domain with Resend for the caller's company.
 *
 * Auth: super_admin / company_admin / admin / owner of the same company
 * the row belongs to. Each company has at most one resend domain row;
 * if one already exists, the caller must pass `force: true` to delete
 * the previous one first (covers typos and switching domains).
 *
 * Returns the Resend response so the UI can render the DNS records
 * immediately. The records are also persisted on the
 * email_provider_settings row so a refresh re-renders them.
 */
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  createResendDomain,
  deleteResendDomain,
  isResendError,
  normaliseDomain,
} from "@/lib/resendDomains";
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
      return res
        .status(400)
        .json({ error: "Caller has no company_id, cannot register a domain." });
    }

    const { domain: rawDomain, force } = req.body || {};
    const domain = normaliseDomain(String(rawDomain || ""));
    if (!domain) {
      return res.status(400).json({
        error:
          "That doesn't look like a valid domain. Use the apex (e.g. spitbraaidelivery.co.za) or a subdomain (e.g. mail.spitbraaidelivery.co.za).",
      });
    }

    const admin = getServiceSupabase();

    // Look up an existing resend row for this tenant.
    const { data: existing } = await admin
      .from("email_provider_settings")
      .select(
        "id, resend_domain_id, resend_sending_domain, resend_domain_status",
      )
      .eq("company_id", companyId)
      .eq("provider", "resend")
      .maybeSingle();

    if (existing && (existing as any).resend_domain_id && !force) {
      return res.status(409).json({
        error: `A domain (${(existing as any).resend_sending_domain}) is already registered for this company. Pass force=true to replace it.`,
        existing: {
          domain: (existing as any).resend_sending_domain,
          status: (existing as any).resend_domain_status,
        },
      });
    }

    if (existing && (existing as any).resend_domain_id && force) {
      // Best-effort delete of the old Resend domain. If Resend has
      // already lost it (404), keep going.
      const del = await deleteResendDomain((existing as any).resend_domain_id);
      if (isResendError(del) && del.status !== 404) {
        console.warn(
          `[create-domain] could not remove previous Resend domain: ${del.error}`,
        );
      }
    }

    const created = await createResendDomain(domain);
    if (isResendError(created)) {
      return res
        .status(created.status && created.status >= 400 ? created.status : 502)
        .json({ error: created.error });
    }

    const records = (created as any).records || [];
    const status = (created as any).status || "pending";
    const now = new Date().toISOString();

    // Upsert the resend row. On (company_id, provider) conflict, replace
    // the resend_* columns so a force=true reset stamps the new id.
    const payload: any = {
      company_id: companyId,
      provider: "resend",
      resend_domain_id: (created as any).id,
      resend_sending_domain: domain,
      resend_dns_records: records,
      resend_domain_status: status,
      resend_domain_verified_at: status === "verified" ? now : null,
      resend_last_checked_at: now,
      updated_at: now,
    };

    const { error: upsertErr } = await admin
      .from("email_provider_settings")
      .upsert(payload, { onConflict: "company_id,provider" });
    if (upsertErr) {
      console.error("[create-domain] persist failed:", upsertErr);
      return res.status(500).json({
        error: `Could not save domain locally: ${upsertErr.message}`,
      });
    }

    return res.status(200).json({
      domain,
      domain_id: (created as any).id,
      status,
      records,
    });
  } catch (e: any) {
    console.error("[create-domain] crashed:", e);
    return res
      .status(500)
      .json({ error: e?.message || "Unexpected server error" });
  }
}
