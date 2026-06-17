/**
 * POST /api/contact-form
 *
 * The public marketing contact page (/contact) submits here. This is
 * NOT the tenant lead-intake path - those go through embed forms or
 * /api/integrations/leads. This is for someone reaching out to the
 * CateringMS platform itself ("can you give us a demo", "pricing
 * question", "partnership"). It emails the platform support address;
 * no tenant DB writes happen here.
 *
 * Lightweight bot mitigation: honeypot field + size cap. We don't
 * need full Turnstile here - the volume is low and the cost of a
 * spam email is just a deletion.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { Resend } from "resend";
import { withApiLogging } from "@/lib/withApiLogging";


const SUPPORT_INBOX =
  process.env.PLATFORM_SUPPORT_INBOX || "support@cateringms.com";
// Verified shared sender by default (not Resend's sandbox address,
// which only delivers to the account owner). Explicit env still wins.
const FROM_ADDRESS = process.env.PLATFORM_FROM_EMAIL || "noreply@send.cateringms.com";

interface Body {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  subject?: string;
  message?: string;
  // Honeypot - if this is filled, the submission is a bot.
  website?: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = (req.body || {}) as Body;
    if (body.website && body.website.length > 0) {
      // Honeypot tripped. Pretend success so the bot moves on.
      return res.status(200).json({ ok: true });
    }

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const message = String(body.message || "").trim();
    if (!name || !email || !message) {
      return res.status(400).json({ error: "Name, email and message are required." });
    }
    if (name.length > 200 || email.length > 200 || message.length > 5000) {
      return res.status(413).json({ error: "Submission too large." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Email looks invalid." });
    }

    const subjectLine = `[contact form] ${body.subject || "general"} - ${name}`;
    const html = `
<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
${body.phone ? `<p><strong>Phone:</strong> ${escapeHtml(body.phone)}</p>` : ""}
${body.company ? `<p><strong>Company:</strong> ${escapeHtml(body.company)}</p>` : ""}
<p><strong>Subject:</strong> ${escapeHtml(body.subject || "general")}</p>
<hr/>
<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(message)}</pre>
`;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // No Resend key configured - log and accept so the form still
      // reads as success. The platform owner can wire Resend later.
      console.warn("[contact-form] RESEND_API_KEY missing, skipping send");
      return res.status(200).json({ ok: true, simulated: true });
    }

    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: SUPPORT_INBOX,
      replyTo: email,
      subject: subjectLine,
      html,
    });

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[contact-form] crashed:", err);
    return res.status(500).json({ error: dbErrorMessage(err) || "Could not send" });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default withApiLogging(handler);
