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
const REACTION_COLUMNS_MISSING = new Set(["42703", "PGRST204"]);

function webhookMessageAt(value: unknown): string {
  if (typeof value === "string" && !/^\d+$/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString();
}

function webhookMessageBody(message: any): string | null {
  const direct = message.text?.body
    ?? message.button?.text
    ?? message.interactive?.button_reply?.title
    ?? message.interactive?.list_reply?.title
    ?? message.image?.caption
    ?? message.video?.caption
    ?? message.document?.caption;
  if (typeof direct === "string" && direct.trim()) return direct;
  if (message.type === "reaction" && message.reaction) {
    const emoji = typeof message.reaction.emoji === "string" ? message.reaction.emoji : "";
    const target = typeof message.reaction.message_id === "string" ? message.reaction.message_id : "";
    return emoji
      ? `Reacted ${emoji} to message ${target || "in this chat"}`
      : `Removed a reaction${target ? ` from message ${target}` : " from a message"}`;
  }
  if (message.type === "location" && message.location) {
    return message.location.name || message.location.address || "Location shared";
  }
  return null;
}

function contactNameFor(contacts: any[], phone: string): string | null {
  const contact = contacts.find((item) => normaliseToE164(item.wa_id) === phone);
  return contact?.profile?.name || contact?.profile?.username || null;
}

function normalizedContactPhone(value: unknown): string {
  if (typeof value !== "string") return "";
  const phone = normaliseToE164(value);
  return /^\d{8,15}$/.test(phone) ? phone : "";
}

type ExternalMessageRow = {
  company_id: string;
  contact_phone: string;
  direction: "in" | "out";
  message_type: string;
  wa_message_id: string;
  source: "whatsapp_business_app" | "synced_history";
  message_at: string;
  contact_name?: string;
  body?: string;
  status?: string;
  related_message_id?: string;
  reaction_emoji?: string;
};

function buildExternalMessageRow(
  companyId: string,
  phone: string,
  direction: "in" | "out",
  message: any,
  contacts: any[],
  source: ExternalMessageRow["source"],
): ExternalMessageRow | null {
  const messageId = typeof message.id === "string" ? message.id : "";
  if (!phone || !messageId) return null;
  const messageType = typeof message.type === "string" ? message.type : "text";
  const body = webhookMessageBody(message);
  const name = contactNameFor(contacts, phone);
  const status = message.history_context?.status || message.status;
  const relatedMessageId = message.type === "reaction" && typeof message.reaction?.message_id === "string"
    ? message.reaction.message_id : "";
  const reactionEmoji = message.type === "reaction" && typeof message.reaction?.emoji === "string"
    ? message.reaction.emoji : "";
  return {
    company_id: companyId,
    contact_phone: phone,
    direction,
    message_type: messageType,
    wa_message_id: messageId,
    source,
    message_at: webhookMessageAt(message.timestamp),
    ...(name ? { contact_name: name } : {}),
    ...(body ? { body } : {}),
    ...(typeof status === "string" && status ? { status: status.toLowerCase() } : {}),
    ...(relatedMessageId ? { related_message_id: relatedMessageId } : {}),
    ...(reactionEmoji ? { reaction_emoji: reactionEmoji } : {}),
  };
}

async function saveExternalMessages(sb: any, rows: ExternalMessageRow[]) {
  const unique = new Map<string, ExternalMessageRow>();
  for (const row of rows) unique.set(row.wa_message_id, row);
  const messages = [...unique.values()];
  for (let index = 0; index < messages.length; index += 100) {
    const chunk = messages.slice(index, index + 100);
    let { error } = await sb.from("whatsapp_external_messages").upsert(chunk, {
      onConflict: "company_id,wa_message_id",
    });
    if (error && REACTION_COLUMNS_MISSING.has(String(error.code))) {
      const fallback = chunk.map(({ related_message_id: _related, reaction_emoji: _emoji, ...row }) => row);
      ({ error } = await sb.from("whatsapp_external_messages").upsert(fallback, {
        onConflict: "company_id,wa_message_id",
      }));
    }
    if (error) {
      console.error("[webhooks/whatsapp] App/history messages not saved", { code: error.code || "unknown" });
      throw new Error("WhatsApp app history could not be saved");
    }
  }
  if (!messages.length) return;

  const latestByPhone = new Map<string, ExternalMessageRow>();
  for (const row of messages) {
    const previous = latestByPhone.get(row.contact_phone);
    if (!previous || row.message_at > previous.message_at) latestByPhone.set(row.contact_phone, row);
  }
  const phones = [...latestByPhone.keys()];
  for (let index = 0; index < phones.length; index += 100) {
    const phoneBatch = phones.slice(index, index + 100);
    const { data: existing, error: readError } = await sb.from("whatsapp_conversations")
      .select("phone,contact_name,last_message_at,unread_count")
      .eq("company_id", messages[0].company_id).in("phone", phoneBatch);
    if (readError) throw new Error("WhatsApp conversation preview could not be loaded");
    const currentByPhone = new Map<string, any>((existing || []).map((row: any) => [row.phone, row]));
    const updates = phoneBatch.flatMap((phone) => {
      const latest = latestByPhone.get(phone)!;
      const current = currentByPhone.get(phone);
      const currentAt = Date.parse(current?.last_message_at || "");
      if (Number.isFinite(currentAt) && currentAt > Date.parse(latest.message_at)) return [];
      const fallback = `${latest.message_type.charAt(0).toUpperCase()}${latest.message_type.slice(1)} ${latest.direction === "in" ? "received" : "sent"}`;
      return [{
        company_id: latest.company_id,
        phone,
        ...(latest.contact_name || current?.contact_name ? { contact_name: latest.contact_name || current.contact_name } : {}),
        last_message_at: latest.message_at,
        last_preview: String(latest.body || fallback).slice(0, 160),
        unread_count: current?.unread_count || 0,
      }];
    });
    if (!updates.length) continue;
    const { error } = await sb.from("whatsapp_conversations").upsert(updates, { onConflict: "company_id,phone" });
    if (error) throw new Error("WhatsApp conversation preview could not be updated");
  }
}

async function applyMessageEchoes(sb: any, companyId: string, value: any) {
  const contacts = value.contacts || [];
  const rows = (value.message_echoes || []).map((message: any) => {
    const contact = contacts.find((item: any) => item.user_id === message.to_user_id);
    const phone = normalizedContactPhone(message.to) || normalizedContactPhone(contact?.wa_id);
    return buildExternalMessageRow(companyId, phone, "out", message, contacts, "whatsapp_business_app");
  }).filter(Boolean) as ExternalMessageRow[];
  await saveExternalMessages(sb, rows);
}

async function updateHistorySyncProgress(sb: any, companyId: string, value: any) {
  const batches = Array.isArray(value.history) ? value.history : value.history ? [value.history] : [];
  const errors = batches.flatMap((batch: any) => batch.errors || []);
  const declined = errors.some((error: any) => Number(error.code) === 2593109);
  const progress = batches.map((batch: any) => Number(batch.metadata?.progress)).filter(Number.isFinite);
  const { data: integration, error: readError } = await sb.from("integrations")
    .select("id,settings").eq("company_id", companyId).eq("integration_type", "whatsapp").maybeSingle();
  if (readError || !integration) throw new Error("WhatsApp history sync status could not be loaded");
  const previous = Number(integration.settings?.whatsappBusinessAppHistoryProgress) || 0;
  const nextProgress = Math.max(previous, ...progress);
  const status = declined ? "declined" : errors.length ? "failed" : nextProgress >= 100 ? "complete" : "syncing";
  const errorText = errors.length
    ? Number(errors[0].code) === 2593109
      ? "History sharing is turned off in the WhatsApp Business app. The business must approve sharing before Meta can send old chats."
      : `Meta returned a history sync error (${String(errors[0].code || "unknown")}).`
    : null;
  const { error } = await sb.from("integrations").update({ settings: {
    ...(integration.settings || {}),
    whatsappBusinessAppHistoryStatus: status,
    whatsappBusinessAppHistoryProgress: nextProgress,
    ...(errorText ? { whatsappBusinessAppHistoryLastError: errorText } : {}),
  } }).eq("id", integration.id).eq("company_id", companyId);
  if (error) throw new Error("WhatsApp history sync status could not be saved");
}

async function applyHistory(sb: any, companyId: string, value: any) {
  const businessPhone = normalizedContactPhone(value.metadata?.display_phone_number);
  const contacts = value.contacts || [];
  const rows: ExternalMessageRow[] = [];
  for (const batch of Array.isArray(value.history) ? value.history : value.history ? [value.history] : []) {
    for (const thread of batch.threads || []) {
      const threadPhone = normalizedContactPhone(thread.id) || normalizedContactPhone(thread.context?.wa_id);
      for (const message of thread.messages || []) {
        const fromPhone = normalizedContactPhone(message.from);
        const toPhone = normalizedContactPhone(message.to);
        let direction: "in" | "out" | null = null;
        if (businessPhone && fromPhone === businessPhone) direction = "out";
        else if (businessPhone && toPhone === businessPhone) direction = "in";
        else if (threadPhone && toPhone === threadPhone) direction = "out";
        else if (threadPhone && (fromPhone === threadPhone || !fromPhone)) direction = "in";
        if (!direction) continue;
        const phone = direction === "out"
          ? (toPhone && toPhone !== businessPhone ? toPhone : threadPhone)
          : (fromPhone && fromPhone !== businessPhone ? fromPhone : threadPhone);
        const row = buildExternalMessageRow(companyId, phone, direction, message, contacts, "synced_history");
        if (row) rows.push(row);
      }
    }
  }
  await saveExternalMessages(sb, rows);
  await updateHistorySyncProgress(sb, companyId, value);
}

/** Kept as bytes: joining text chunks can split an emoji and break the signature. */
async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on("data", (chunk) => {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += part.length;
      if (bytes > 4 * 1024 * 1024) {
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
    ? [
      failure.code ? `Meta ${failure.code}` : null,
      failure.error_subcode ? `Subcode ${failure.error_subcode}` : null,
      failure.title,
      failure.error_data?.details,
      failure.fbtrace_id ? `Meta reference ${failure.fbtrace_id}` : null,
    ].filter(Boolean).join(": ")
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
  const name = contactNameFor(contacts, phone);
  const body = webhookMessageBody(message);
  const receivedAt = webhookMessageAt(message.timestamp);
  const messageType = message.type || "text";
  const row = {
    company_id: companyId,
    from_phone: phone,
    contact_name: name,
    message_type: messageType,
    body,
    wa_message_id: message.id,
    ...(message.type === "reaction" && typeof message.reaction?.message_id === "string"
      ? { related_message_id: message.reaction.message_id } : {}),
    ...(message.type === "reaction" && typeof message.reaction?.emoji === "string"
      ? { reaction_emoji: message.reaction.emoji } : {}),
    received_at: receivedAt,
  };
  let { error } = await sb.from("whatsapp_inbound_messages").insert(row);
  if (error && REACTION_COLUMNS_MISSING.has(String(error.code))) {
    const { related_message_id: _related, reaction_emoji: _emoji, ...fallback } = row;
    ({ error } = await sb.from("whatsapp_inbound_messages").insert(fallback));
  }
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
    last_message_at: receivedAt,
    last_preview: String(body || `${messageType.charAt(0).toUpperCase()}${messageType.slice(1)} received`).slice(0, 160),
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

    try {
      for (const status of value.statuses || []) await applyStatus(sb, company.companyId, status);
      for (const message of value.messages || []) await applyMessage(sb, company.companyId, message, value.contacts || []);
      await applyMessageEchoes(sb, company.companyId, value);
      await applyHistory(sb, company.companyId, value);
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as any).code) : "unknown";
      console.error("[webhooks/whatsapp] Could not process a verified event", { code });
      return res.status(500).json({ error: "WhatsApp event could not be saved; Meta should retry it." });
    }
  }
  return res.status(200).json({ ok: true });
}

export default handler;
