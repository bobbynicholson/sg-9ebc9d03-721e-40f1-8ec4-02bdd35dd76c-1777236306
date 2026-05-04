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
 * outbound send path already logs status='sent' on dispatch -- we
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

// Disable body parsing -- we need the raw body for signature
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
  // -- accept any version whose digest matches.
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  // Signature verification when secret is configured.
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
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
  } else {
    console.warn(
      "[webhooks/resend] RESEND_WEBHOOK_SECRET not set -- accepting webhook " +
        "without signature verification. Set this env var in production."
    );
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON" });
  }

  const type = String(event?.type || "");
  // Only care about delivery failures.
  if (type !== "email.bounced" && type !== "email.complained") {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const data = event?.data || {};
  const recipients: string[] = Array.isArray(data?.to)
    ? data.to
    : typeof data?.to === "string"
      ? [data.to]
      : [];
  const subject: string | null = typeof data?.subject === "string" ? data.subject : null;
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

  const supabase = getServiceSupabase();

  // Log a row per recipient so the failures dashboard surfaces each
  // bad address. user_id is left null because Resend's payload doesn't
  // tell us which company sent the email -- the EmailFailuresTab can
  // still group by recipient address. If the original send had a
  // resend_message_id we'd correlate, but the current emailService
  // doesn't capture that yet; that's a separate enhancement.
  const rows = recipients.slice(0, 50).map((to) => ({
    user_id: null,
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
    // Still 200 -- Resend retries on non-2xx and we don't want a
    // transient db hiccup to spam-loop the webhook.
  }

  return res.status(200).json({ ok: true, recorded: rows.length });
}
