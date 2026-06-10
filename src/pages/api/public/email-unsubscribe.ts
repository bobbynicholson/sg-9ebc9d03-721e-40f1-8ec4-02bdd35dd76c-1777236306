/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/public/email-unsubscribe
 *
 * Per-recipient suppression endpoint. Public (no auth) - the token
 * IS the authorisation. Validates the HMAC-signed token, inserts a
 * row into blocked_contacts so emailService.sendEmail short-circuits
 * the next time this (company, email) pair is targeted.
 *
 * Idempotent: a second click on the same link is a no-op (RLS +
 * application code allow the insert to upsert-by-natural-key).
 *
 * Privacy: always returns 200 even on bad tokens so a probe can't
 * confirm whether an email is on file. Real failures land in the
 * server log via observability.
 *
 * See src/lib/emailUnsubscribe.ts for the token format.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { verifyUnsubscribeToken } from "@/lib/emailUnsubscribe";
import { withApiLogging } from "@/lib/withApiLogging";


async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) || {};
    const token = String(body.token || "").trim();
    if (!token) return res.status(200).json({ ok: true });

    const { email, companyId, valid } = verifyUnsubscribeToken(token);
    if (!valid || !email || !companyId) {
      // Always 200 for privacy.
      return res.status(200).json({ ok: true });
    }

    const sb: any = getServiceSupabase();

    // blocked_contacts is keyed on (company_id, email_lower) via
    // the unique index from the original migration. Idempotent
    // upsert keeps a second click a no-op.
    const { error } = await sb
      .from("blocked_contacts")
      .upsert(
        {
          company_id: companyId,
          email_lower: email,
          reason: "User clicked unsubscribe link",
          blocked_at: new Date().toISOString(),
        },
        { onConflict: "company_id,email_lower" },
      );
    if (error) {
      console.warn("[email-unsubscribe] insert failed:", error);
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[email-unsubscribe] crashed:", err);
    // Still return 200 for privacy.
    return res.status(200).json({ ok: true });
  }
}

export default withApiLogging(handler);
