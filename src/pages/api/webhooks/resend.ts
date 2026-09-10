/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/webhooks/resend
 *
 * Resend webhook endpoint. Captures bounce + complaint events so the
 * operator can spot bad email addresses in the failures dashboard
 * (/admin/email-settings has an EmailFailuresTab that reads
 * email_automation_log where status != 'sent').
 *
 * Events handled:
 *   - email.bounced     -> status='bounced'
 *   - email.complained  -> status='complained' (spam report)
 *
 * Other events (sent, delivered, opened, clicked) are ignored. The
 * outbound send path already logs status='sent' on dispatch - we
 * don't need to double-record them.
 *
 * Signature verification: Resend uses Svix-format signatures. The raw
 * body is HMAC-SHA256'd with the webhook secret + svix-id +
 * svix-timestamp. We verify when RESEND_WEBHOOK_SECRET is set;
 * otherwise we accept the post (dev convenience). Production should
 * always set the secret.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createHmac, timingSafeEqual } from "crypto";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";


// Disable body parsing - we need the raw body for signature
// verification. Next.js Pages routes default to JSON parsed; this
// override gives us the raw stream. Keep size cap.
export const config = {
  api: {
    bodyParser: false,
    sizeLimit: "1mb",
  },
};

async function readRawBody(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    let bytes = 0;
    const MAX = 1024 * 1024; // 1 MB hard cap
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX) {
        req.destroy();
        reject(new Error("Body too large"));
        return;
      }
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function verifySignature(
  rawBody: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string,
): boolean {
  // Resend / Svix signing format. The secret arrives as
  // "whsec_<base64>". Strip the prefix and base64-decode it for the
  // HMAC key.
  const cleanSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const key = Buffer.from(cleanSecret, "base64");

  const signed = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", key).update(signed).digest("base64");

  // svix-signature is space-separated entries like "v1,base64sig v2,base64sig"
  // - accept any version whose digest matches.
  const candidates = svixSignature.split(" ").map((s) => {
    const idx = s.indexOf(",");
    return idx >= 0 ? s.slice(idx + 1) : s;
  });
  for (const cand of candidates) {
    try {
      const a = Buffer.from(cand, "base64");
      const b = Buffer.from(expected, "base64");
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      // malformed candidate, try next
    }
  }
  return false;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false });
  }

  let rawBody: string;
  try {
    rawBody = await readRawBody(req);
  } catch {
    return res.status(413).json({ ok: false, error: "Body too large" });
  }

  // Signature verification.
  // TIGHTEN I.102 (2026-06-02): in production, the secret is mandatory.
  // Previously the "no secret = dev convenience" branch accepted any
  // POST in every environment, so an attacker who knew the route URL
  // could forge bounce / complaint events and mark good addresses as
  // bounced. Now: prod-no-secret = 500 (config error), other-no-secret
  // = warn + accept (dev / preview).
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[webhooks/resend] RESEND_WEBHOOK_SECRET not set in production");
      return res.status(500).json({ ok: false, error: "Server config error" });
    }
    console.warn(
      "[webhooks/resend] RESEND_WEBHOOK_SECRET not set - accepting webhook " +
        "without signature verification. Dev / preview only."
    );
  } else {
    const id = String(req.headers["svix-id"] || "");
    const ts = String(req.headers["svix-timestamp"] || "");
    const sig = String(req.headers["svix-signature"] || "");
    if (!id || !ts || !sig) {
      return res.status(401).json({ ok: false, error: "Missing signature headers" });
    }
    // Stale-event guard: reject anything older than 5 minutes
    // (replay defence).
    const tsNum = Number(ts);
    if (Number.isFinite(tsNum)) {
      const ageSec = Math.abs(Date.now() / 1000 - tsNum);
      if (ageSec > 300) {
        return res.status(401).json({ ok: false, error: "Stale event" });
      }
    }
    if (!verifySignature(rawBody, id, ts, sig, secret)) {
      return res.status(401).json({ ok: false, error: "Invalid signature" });
    }
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON" });
  }

  const type = String(event?.type || "");
  const data = event?.data || {};
  const supabase = getServiceSupabase();

  // TIGHTEN I.45: pull company_id from Resend tags. emailService now
  // tags every send with company_id + template, so any event for a
  // send we originated carries the attribution.
  //
  // TIGHTEN I.46 (2026-06-01): Resend's webhook payload encodes tags
  // as a flat OBJECT (`{name: value}`), not the array we send them
  // as (`[{name, value}]`). The old array check never matched a
  // real payload - every event ingested with company_id=null,
  // hiding rows behind RLS for the tenant they belonged to. Handle
  // both shapes.
  const tagMap = new Map<string, string>();
  const rawTags = data?.tags;
  if (Array.isArray(rawTags)) {
    for (const t of rawTags) {
      if (t && typeof t.name === "string" && typeof t.value === "string") {
        tagMap.set(t.name, t.value);
      }
    }
  } else if (rawTags && typeof rawTags === "object") {
    for (const [name, value] of Object.entries(rawTags)) {
      if (typeof value === "string") tagMap.set(name, value);
    }
  }
  const companyId = tagMap.get("company_id") || null;

  const recipients: string[] = Array.isArray(data?.to)
    ? data.to
    : typeof data?.to === "string"
      ? [data.to]
      : [];
  const subject: string | null = typeof data?.subject === "string" ? data.subject : null;
  const resendEmailId: string | null = data?.email_id || data?.id || null;
  const eventAt: string = event?.created_at || data?.created_at || new Date().toISOString();

  // TIGHTEN I.45: write to email_delivery_events for ALL allowed event
  // types. This is the proper event log that drives the per-tenant
  // deliverability panel. We accept the full set so we can compute
  // delivered-rate, not just bounce/complaint rate.
  const ALLOWED_EVENTS = new Set([
    "email.sent",
    "email.delivered",
    "email.delivery_delayed",
    "email.bounced",
    "email.complained",
    "email.opened",
    "email.clicked",
    "email.failed",
  ]);
  if (ALLOWED_EVENTS.has(type)) {
    // Bounce / complaint detail extraction for the events table.
    let bounceType: string | null = null;
    let reason: string | null = null;
    if (type === "email.bounced") {
      const bRaw = String(data?.bounce?.type || "").toLowerCase();
      bounceType = bRaw === "permanent" ? "hard" : bRaw === "transient" ? "soft" : bRaw || null;
      reason = data?.bounce?.message || data?.bounce?.subType || null;
    } else if (type === "email.complained") {
      reason = "spam_complaint";
    } else if (type === "email.failed" || type === "email.delivery_delayed") {
      reason = data?.failed?.reason || data?.reason || null;
    }
    const normalisedType = type.startsWith("email.") ? type.slice("email.".length) : type;
    // One row per recipient. Bulk inserts collapse for batch sends.
    const eventRows = (recipients.length > 0 ? recipients : [null]).slice(0, 50).map((to) => ({
      event_type: normalisedType,
      event_at: eventAt,
      resend_email_id: resendEmailId,
      company_id: companyId,
      to_email: to ? String(to).toLowerCase().slice(0, 320) : null,
      bounce_type: bounceType,
      reason,
      raw_payload: event,
    }));
    try {
      await (supabase as any).from("email_delivery_events").insert(eventRows);
    } catch (err: any) {
      console.error("[webhooks/resend] email_delivery_events insert failed", err?.message || err);
      // Don't bail - still try the legacy log insert below so the
      // failures dashboard stays accurate.
    }
  }

  // Legacy back-compat: keep writing bounced/complained to
  // email_automation_log so the existing EmailFailuresTab keeps
  // working. Now also stamps user_id (= company_id, legacy misnomer)
  // when we can read it from tags - which we can for any send the
  // platform originated post-I.45.
  if (type !== "email.bounced" && type !== "email.complained") {
    return res.status(200).json({ ok: true, recorded: "event_only" });
  }

  const errorMsg: string | null =
    type === "email.bounced"
      ? (data?.bounce?.message ||
         data?.bounce?.subType ||
         data?.bounce?.type ||
         "Bounced")
      : "Complained (marked as spam)";

  if (recipients.length === 0) {
    return res.status(200).json({ ok: true, noRecipients: true });
  }

  const status = type === "email.bounced" ? "bounced" : "complained";
  const rows = recipients.slice(0, 50).map((to) => ({
    user_id: companyId, // I.45: previously null; now attributed when tags present.
    template_type: "webhook",
    recipient_email: String(to).toLowerCase().slice(0, 320),
    recipient_name: null,
    subject: subject?.slice(0, 500) ?? null,
    status,
    error_message: errorMsg?.slice(0, 1000) ?? null,
    sent_at: new Date().toISOString(),
  }));

  try {
    await (supabase as any).from("email_automation_log").insert(rows);
  } catch (err: any) {
    console.error("[webhooks/resend] log insert failed", err?.message || err);
  }

  return res.status(200).json({ ok: true, recorded: rows.length });
}

export default withApiLogging(handler);
