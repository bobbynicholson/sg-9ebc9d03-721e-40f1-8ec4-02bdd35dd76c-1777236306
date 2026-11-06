/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET  /api/admin/whatsapp/activity?days=&status=&q=&page=   totals, report and sent log
 * POST /api/admin/whatsapp/activity                          { action: "retry", id }
 *
 * Paged on the server. Totals use count queries and the per-message report is
 * summed in the database, so nothing here reads the whole message history.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { normaliseToE164 } from "@/lib/whatsapp";
import { ACTIVITY_PAGE_SIZE, ACTIVITY_STATUSES, messageSource, readPeriod } from "@/lib/whatsapp/activity";
import { companyForAdmin } from "@/lib/whatsapp/adminAccess";
import { WHATSAPP_AUTOMATIONS, readAutomationSettings } from "@/lib/whatsapp/automations";
import { cleanSearch } from "@/lib/whatsapp/conversations";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const access = await companyForAdmin(req, res);
  if (!access) return;
  const { companyId } = access;
  const sb: any = getServiceSupabase();

  if (req.method === "GET") {
    const days = readPeriod(req.query.days);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const page = Math.max(1, Math.min(100000, Number.parseInt(String(req.query.page || "1"), 10) || 1));
    const status = String(req.query.status || "");
    const search = cleanSearch(req.query.q);

    let log = sb.from("whatsapp_messages")
      .select("id, recipient_name, recipient_phone, template_name, message_type, status, failure_reason, created_at, sent_at, delivered_at, read_at, related_entity_type, related_entity_id, dedup_key", { count: "exact" })
      .eq("company_id", companyId).gte("created_at", since);
    if (ACTIVITY_STATUSES[status]) log = log.in("status", ACTIVITY_STATUSES[status]);
    if (search) log = log.or(`recipient_name.ilike.%${search}%,recipient_phone.ilike.%${search}%,template_name.ilike.%${search}%`);
    const from = (page - 1) * ACTIVITY_PAGE_SIZE;

    const statusCount = (statuses: string[]) => sb.from("whatsapp_messages").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).gte("created_at", since).in("status", statuses);

    const logPage = log.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, from + ACTIVITY_PAGE_SIZE - 1);
    const integrationRow = sb.from("integrations").select("settings").eq("company_id", companyId).eq("integration_type", "whatsapp").maybeSingle();
    const logOnly = req.query.summary === "0";

    const [logResult, integration, report, replies, ...totals] = await Promise.all(logOnly ? [logPage, integrationRow] : [
      logPage,
      integrationRow,
      sb.rpc("whatsapp_template_report", { p_company_id: companyId, p_since: since }),
      sb.from("whatsapp_inbound_messages").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("received_at", since),
      ...Object.values(ACTIVITY_STATUSES).map(statusCount),
    ]);
    if (logResult.error) return res.status(500).json({ error: "Could not load WhatsApp activity." });

    // Show the message's name, not the Meta template name, where they match.
    const settings = readAutomationSettings(integration.data?.settings);
    const labels = new Map<string, string>();
    for (const automation of WHATSAPP_AUTOMATIONS) {
      if (settings[automation.key].templateName) labels.set(settings[automation.key].templateName, automation.label);
    }
    const label = (row: { template_name?: string | null; message_type?: string | null }) =>
      (row.template_name && (labels.get(row.template_name) || row.template_name)) || "Text message";

    const summary = logOnly ? {} : {
      totals: {
        ...Object.fromEntries(Object.keys(ACTIVITY_STATUSES).map((key, index) => [key, totals[index].count || 0])),
        replies: replies.count || 0,
      },
      reportReady: !report.error,
      report: (report.data || []).map((row: any) => ({
        name: label(row),
        sent: Number(row.sent) || 0,
        delivered: Number(row.delivered) || 0,
        read: Number(row.read_count) || 0,
        failed: Number(row.failed) || 0,
      })),
    };
    return res.status(200).json({
      days,
      page,
      pageSize: ACTIVITY_PAGE_SIZE,
      matching: logResult.count || 0,
      ...summary,
      messages: (logResult.data || []).map((row: any) => ({
        id: row.id,
        recipient: row.recipient_name || row.recipient_phone,
        phone: row.recipient_phone,
        name: label(row),
        source: messageSource(row.dedup_key, row.message_type),
        status: row.status,
        failureReason: row.failure_reason,
        at: row.sent_at || row.created_at,
        orderId: row.related_entity_type === "order" ? row.related_entity_id : null,
      })),
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (req.body?.action !== "retry") return res.status(400).json({ error: "Unknown action" });

  const { data: row } = await sb.from("whatsapp_messages").select("id, status, recipient_phone")
    .eq("id", String(req.body?.id || "")).eq("company_id", companyId).maybeSingle();
  if (!row) return res.status(404).json({ error: "Message not found." });
  if (row.status !== "failed") return res.status(400).json({ error: "Only failed messages can be sent again." });

  const { data: blockedRows } = await sb.from("blocked_contacts").select("phone").eq("company_id", companyId);
  const phone = normaliseToE164(row.recipient_phone);
  if ((blockedRows || []).some((item: any) => normaliseToE164(item.phone) === phone)) {
    return res.status(400).json({ error: "This person has opted out, so it can't be sent again." });
  }

  const { error } = await sb.from("whatsapp_messages").update({
    status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), failed_at: null, failure_reason: null,
  }).eq("id", row.id).eq("company_id", companyId).eq("status", "failed");
  if (error) throw error;
  return res.status(200).json({ success: true });
}

export default withApiLogging(handler);
