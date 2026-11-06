/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET  /api/admin/whatsapp/inbox?cursor=&q=&unread=1    a page of conversations
 * GET  /api/admin/whatsapp/inbox?phone=&before=         a page of one conversation
 * POST /api/admin/whatsapp/inbox                        { action: "read" | "reply", phone, text }
 *
 * Conversations and messages are both paged on the server, so the page stays
 * fast however many messages a company has. WhatsApp only allows a free-text
 * reply within 24 hours of the client's last message.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { normaliseToE164 } from "@/lib/whatsapp";
import { companyForAdmin } from "@/lib/whatsapp/adminAccess";
import {
  CONVERSATION_PAGE_SIZE,
  MESSAGE_PAGE_SIZE,
  cleanSearch,
  decodeCursor,
  encodeCursor,
  mergeThreadPage,
} from "@/lib/whatsapp/conversations";
import { loadWhatsAppCredentials, postWhatsAppMessage } from "@/lib/whatsapp/credentials";

const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

async function listConversations(sb: any, companyId: string, req: NextApiRequest, res: NextApiResponse) {
  if (req.query.countOnly === "1") {
    const { count } = await sb.from("whatsapp_conversations").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).gt("unread_count", 0);
    return res.status(200).json({ unreadConversations: count || 0 });
  }
  let query = sb.from("whatsapp_conversations")
    .select("id, phone, contact_name, last_message_at, last_preview, unread_count")
    .eq("company_id", companyId)
    .order("last_message_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(CONVERSATION_PAGE_SIZE + 1);

  const search = cleanSearch(req.query.q);
  if (search) query = query.or(`contact_name.ilike.%${search}%,phone.ilike.%${search}%`);
  if (req.query.unread === "1") query = query.gt("unread_count", 0);
  const cursor = decodeCursor(String(req.query.cursor || ""));
  if (cursor) query = query.or(`last_message_at.lt.${cursor.at},and(last_message_at.eq.${cursor.at},id.lt.${cursor.id})`);

  const { data, error } = await query;
  if (error) return res.status(200).json({ available: false, conversations: [], nextCursor: null, unreadConversations: 0 });

  const { count } = await sb.from("whatsapp_conversations").select("id", { count: "exact", head: true })
    .eq("company_id", companyId).gt("unread_count", 0);
  const rows = data || [];
  const page = rows.slice(0, CONVERSATION_PAGE_SIZE);
  return res.status(200).json({
    available: true,
    conversations: page,
    nextCursor: rows.length > CONVERSATION_PAGE_SIZE ? encodeCursor(page[page.length - 1]) : null,
    unreadConversations: count || 0,
  });
}

async function loadThread(sb: any, companyId: string, phone: string, req: NextApiRequest, res: NextApiResponse) {
  const before = String(req.query.before || "");
  const validBefore = before && !Number.isNaN(Date.parse(before)) ? before : null;

  let received = sb.from("whatsapp_inbound_messages").select("id, contact_name, body, message_type, received_at")
    .eq("company_id", companyId).eq("from_phone", phone).order("received_at", { ascending: false }).limit(MESSAGE_PAGE_SIZE + 1);
  let sent = sb.from("whatsapp_messages").select("id, recipient_name, message_content, template_name, status, created_at")
    .eq("company_id", companyId).eq("recipient_phone", phone).order("created_at", { ascending: false }).limit(MESSAGE_PAGE_SIZE + 1);
  if (validBefore) {
    received = received.lt("received_at", validBefore);
    sent = sent.lt("created_at", validBefore);
  }
  const [{ data: inbound, error }, { data: outbound }, { data: latest }] = await Promise.all([
    received,
    sent,
    sb.from("whatsapp_inbound_messages").select("received_at, contact_name")
      .eq("company_id", companyId).eq("from_phone", phone).order("received_at", { ascending: false }).limit(1),
  ]);

  const page = mergeThreadPage(
    (inbound || []).map((row: any) => ({ id: row.id, direction: "in" as const, text: row.body || `(${row.message_type} message)`, at: row.received_at })),
    (outbound || []).map((row: any) => ({
      id: row.id, direction: "out" as const, text: row.message_content || `Template: ${row.template_name}`, at: row.created_at, status: row.status,
    })),
    MESSAGE_PAGE_SIZE,
  );
  const lastReceived = latest?.[0]?.received_at;
  return res.status(200).json({
    available: !error,
    phone,
    name: latest?.[0]?.contact_name || outbound?.find((row: any) => row.recipient_name)?.recipient_name || null,
    canReply: !!lastReceived && Date.now() - new Date(lastReceived).getTime() < REPLY_WINDOW_MS,
    ...page,
  });
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const access = await companyForAdmin(req, res);
  if (!access) return;
  const { companyId, userId } = access;
  const sb: any = getServiceSupabase();

  if (req.method === "GET") {
    const phone = normaliseToE164(String(req.query.phone || ""));
    return phone ? loadThread(sb, companyId, phone, req, res) : listConversations(sb, companyId, req, res);
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const phone = normaliseToE164(String(req.body?.phone || ""));
  if (!phone) return res.status(400).json({ error: "Choose a conversation first." });

  const markRead = async () => {
    await Promise.all([
      sb.from("whatsapp_inbound_messages").update({ read_at: new Date().toISOString() })
        .eq("company_id", companyId).eq("from_phone", phone).is("read_at", null),
      sb.from("whatsapp_conversations").update({ unread_count: 0 }).eq("company_id", companyId).eq("phone", phone),
    ]);
  };

  if (req.body?.action === "read") {
    await markRead();
    return res.status(200).json({ success: true });
  }

  if (req.body?.action === "reply") {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Type your reply first." });
    if (text.length > 4096) return res.status(400).json({ error: "Keep your reply under 4,096 characters." });

    const { data: last } = await sb.from("whatsapp_inbound_messages").select("received_at")
      .eq("company_id", companyId).eq("from_phone", phone).order("received_at", { ascending: false }).limit(1);
    if (!last?.[0] || Date.now() - new Date(last[0].received_at).getTime() >= REPLY_WINDOW_MS) {
      return res.status(400).json({ error: "WhatsApp only allows a reply within 24 hours of the client's last message." });
    }
    const credentials = await loadWhatsAppCredentials(sb, companyId);
    if (!credentials) return res.status(400).json({ error: "Connect WhatsApp first." });

    const result = await postWhatsAppMessage(credentials, { to: phone, type: "text", text: { body: text } });
    if (!result.ok) return res.status(400).json({ error: `Meta refused the reply: ${result.error}` });
    const now = new Date().toISOString();
    await sb.from("whatsapp_messages").insert({
      company_id: companyId,
      recipient_phone: phone,
      message_type: "text",
      message_content: text,
      status: "sent",
      sent_at: now,
      gateway_message_id: result.id,
      enqueued_by: userId,
    });
    await sb.from("whatsapp_conversations").update({ last_message_at: now, last_preview: text.slice(0, 160) })
      .eq("company_id", companyId).eq("phone", phone);
    await markRead();
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: "Unknown action" });
}

export default withApiLogging(handler);
