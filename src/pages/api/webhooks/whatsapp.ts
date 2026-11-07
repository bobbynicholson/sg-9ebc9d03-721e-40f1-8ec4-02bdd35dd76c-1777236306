/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Meta WhatsApp webhook.
 *
 * GET  Meta confirms the callback URL using the company's verify token.
 * POST Delivery updates and client replies.
 *
 * Every POST must carry a valid signature made with that company's App secret,
 * so nobody can fake a reply or a delivery update. Logs never include message
 * text or phone numbers.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { getServiceSupabase } from "@/lib/supabase/service";
import { normaliseToE164 } from "@/lib/whatsapp";
import { alertWhatsAppReply } from "@/lib/whatsapp/alerts";
import { decryptWhatsAppToken, isValidMetaSignature, readWhatsAppWebhookVerifyToken } from "@/lib/whatsapp/credentials";
import { keyedSecretHashCandidates } from "@/lib/credentialVault";
import { replyIntent } from "@/lib/whatsapp/rules";

export const config = { api: { bodyParser: false } };

const OPT_OUT_REASON = "Replied STOP on WhatsApp";

/** Kept as bytes: joining text chunks can split an emoji and break the signature. */
async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on("data", (chunk) => {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += part.length;
      if (bytes > 1024 * 1024) {
        req.destroy();
        reject(new Error("Body too large"));
        return;
      }
      chunks.push(part);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function applyStatus(sb: any, companyId: string, status: any) {
  const messageIdSuffix = typeof status.id === "string" ? status.id.slice(-12) : null;
  const recipient = typeof status.recipient_id === "string" ? `***${status.recipient_id.slice(-4)}` : null;
  console.info("[whatsapp-webhook] Meta delivery status received", {
    status: status.status || "unknown",
    messageIdSuffix,
    recipient,
    errorCode: status.errors?.[0]?.code ?? null,
    errorTitle: status.errors?.[0]?.title ?? null,
  });
  const at = status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString();
  const failure = status.errors?.[0];
  const failureReason = failure
    ? [failure.code ? `Meta ${failure.code}` : null, failure.title, failure.error_data?.details].filter(Boolean).join(": ")
    : "Meta could not deliver this message";
  const patch: Record<string, unknown> =
    status.status === "delivered" ? { status: "delivered", delivered_at: at }
    : status.status === "read" ? { status: "read", read_at: at }
    : status.status === "failed" ? { status: "failed", failed_at: at, failure_reason: failureReason }
    : {};
  if (Object.keys(patch).length === 0) return;
  let update = sb.from("whatsapp_messages").update(patch).eq("company_id", companyId).eq("gateway_message_id", status.id);
  // Updates can arrive out of order, so a late "delivered" never undoes "read".
  if (status.status === "delivered") update = update.neq("status", "read");
  const { data, error } = await update.select("id");
  if (error) {
    console.error("[whatsapp-webhook] Could not save Meta delivery status", {
      status: status.status,
      messageIdSuffix,
      errorCode: error.code || null,
    });
    return;
  }
  if (!data?.length) {
    console.warn("[whatsapp-webhook] Delivery status had no matching saved message", { status: status.status, messageIdSuffix });
  } else {
    console.info("[whatsapp-webhook] Meta delivery status saved", { status: status.status, messageIdSuffix });
  }
}

async function setOptOut(sb: any, companyId: string, phone: string, optedOut: boolean) {
  // Clients save numbers in different formats, so match each of them.
  const local = phone.startsWith("27") ? `0${phone.slice(2)}` : phone;
  const formats = [phone, `+${phone}`, local].map((value) => `phone.eq.${value},mobile_number.eq.${value}`).join(",");
  await sb.from("clients")
    .update({ whatsapp_opt_in: optedOut ? false : null, whatsapp_opt_in_at: new Date().toISOString() })
    .eq("company_id", companyId).or(formats);
  if (optedOut) {
    const { data: existing } = await sb.from("blocked_contacts").select("id").eq("company_id", companyId).eq("phone", phone).limit(1);
    if (!existing?.length) await sb.from("blocked_contacts").insert({ company_id: companyId, phone, reason: OPT_OUT_REASON });
  } else {
    // Only undo a block the client made themselves, never one an admin added.
    await sb.from("blocked_contacts").delete().eq("company_id", companyId).eq("phone", phone).eq("reason", OPT_OUT_REASON);
  }
}

async function applyMessage(sb: any, companyId: string, message: any, contacts: any[]) {
  const phone = normaliseToE164(message.from);
  const name = contacts.find((contact) => contact.wa_id === message.from)?.profile?.name || null;
  const body = message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title ?? null;
  const { error } = await sb.from("whatsapp_inbound_messages").insert({
    company_id: companyId,
    from_phone: phone,
    contact_name: name,
    message_type: message.type || "text",
    body,
    wa_message_id: message.id,
    received_at: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
  });
  if (error) {
    if (String(error.code) !== "23505") console.error("[webhooks/whatsapp] reply not saved:", error.message);
    return; // Meta resends webhooks, so a duplicate is expected.
  }
  // Counted from the messages, so a retried webhook can't inflate it.
  const { count: unread } = await sb.from("whatsapp_inbound_messages").select("id", { count: "exact", head: true })
    .eq("company_id", companyId).eq("from_phone", phone).is("read_at", null);
  await sb.from("whatsapp_conversations").upsert({
    company_id: companyId,
    phone,
    ...(name ? { contact_name: name } : {}),
    last_message_at: new Date().toISOString(),
    last_preview: String(body || `(${message.type || "media"} message)`).slice(0, 160),
    unread_count: unread || 1,
  }, { onConflict: "company_id,phone" });
  const intent = replyIntent(body);
  if (intent) await setOptOut(sb, companyId, phone, intent === "stop");
  await alertWhatsAppReply(companyId, name);
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const sb: any = getServiceSupabase();

  if (req.method === "GET") {
    const token = String(req.query["hub.verify_token"] || "");
    const tokenHashes = token ? await keyedSecretHashCandidates(token) : [];
    const { data: vaultRows } = tokenHashes.length
      ? await sb.from("whatsapp_credential_vault").select("integration_id, webhook_verify_token_hash")
        .in("webhook_verify_token_hash", tokenHashes).limit(1)
      : { data: [] };
    const matchedVault = vaultRows?.[0];
    const { data: legacyHashedRows } = !matchedVault && tokenHashes.length
      ? await sb.from("integrations").select("id, settings").eq("integration_type", "whatsapp").eq("is_active", true)
        .in("settings->>webhookVerifyTokenHash", tokenHashes).limit(1)
      : { data: [] };
    const { data: legacyPlainRows } = !matchedVault && !legacyHashedRows?.length && token
      ? await sb.from("integrations").select("id, settings").eq("integration_type", "whatsapp").eq("is_active", true)
        .eq("settings->>webhookVerifyToken", token).limit(1)
      : { data: [] };
    let row: any = null;
    if (matchedVault?.integration_id) {
      const { data } = await sb.from("integrations").select("id, settings")
        .eq("id", matchedVault.integration_id).eq("is_active", true).maybeSingle();
      row = data;
    }
    const legacyRows = [...(legacyHashedRows || []), ...(legacyPlainRows || [])];
    if (!row && legacyRows.length) {
      const candidate = legacyRows[0];
      const legacyToken = await readWhatsAppWebhookVerifyToken(candidate.settings);
      if (legacyToken && legacyToken.length === token.length &&
        crypto.timingSafeEqual(Buffer.from(legacyToken), Buffer.from(token))) row = candidate;
    }
    if (req.query["hub.mode"] === "subscribe" && row) {
      const { error } = await sb.from("integrations")
        .update({ settings: {
          ...(row.settings || {}),
          webhookVerifiedAt: new Date().toISOString(),
        } })
        .eq("id", row.id).eq("is_active", true);
      if (error) return res.status(500).json({ error: "Could not record verification" });
      return res.status(200).send(String(req.query["hub.challenge"] || ""));
    }
    return res.status(403).json({ error: "Verification failed" });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let raw: Buffer;
  try {
    raw = await readRawBody(req);
  } catch {
    return res.status(413).json({ error: "Body too large" });
  }
  let payload: any;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid body" });
  }

  const changes = (payload?.entry || []).flatMap((entry: any) => entry.changes || []);
  const signature = String(req.headers["x-hub-signature-256"] || "");
  const companyByNumber = new Map<string, { companyId: string; valid: boolean }>();

  // We can verify signatures only after identifying the connected number.
  // Never acknowledge an empty or unidentifiable POST as an accepted webhook.
  if (!changes.length) return res.status(401).json({ error: "Invalid signature" });

  for (const change of changes) {
    const value = change?.value;
    const numberId = String(value?.metadata?.phone_number_id || "");
    if (!numberId) return res.status(401).json({ error: "Invalid signature" });
    if (!companyByNumber.has(numberId)) {
      const { data: rows } = await sb.from("integrations").select("id, company_id, credentials")
        .eq("integration_type", "whatsapp").eq("is_active", true).eq("credentials->>phoneNumberId", numberId).limit(1);
      const row = rows?.[0];
      let valid = false;
      try {
        if (row?.id) {
          const { data: vault } = await sb.from("whatsapp_credential_vault")
            .select("app_secret_ciphertext").eq("integration_id", row.id).maybeSingle();
          const appSecretCiphertext = vault?.app_secret_ciphertext || row.credentials?.appSecretEncrypted;
          valid = !!appSecretCiphertext && isValidMetaSignature(raw, signature, await decryptWhatsAppToken(appSecretCiphertext));
        }
      } catch {
        valid = false;
      }
      companyByNumber.set(numberId, { companyId: row?.company_id || "", valid });
    }
    const company = companyByNumber.get(numberId)!;
    if (!company.valid) return res.status(401).json({ error: "Invalid signature" });

    for (const status of value.statuses || []) await applyStatus(sb, company.companyId, status);
    for (const message of value.messages || []) await applyMessage(sb, company.companyId, message, value.contacts || []);
  }
  return res.status(200).json({ ok: true });
}

export default handler;
