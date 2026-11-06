/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET  /api/admin/whatsapp/templates    the company's templates and their status in Meta
 * POST /api/admin/whatsapp/templates    { key, name, wording, language } submits one to Meta
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { companyForAdmin } from "@/lib/whatsapp/adminAccess";
import {
  WHATSAPP_AUTOMATIONS,
  applyAutomationChanges,
  automationVariables,
  isValidLanguageCode,
  isValidTemplateName,
  readAutomationSettings,
  wordingProblem,
} from "@/lib/whatsapp/automations";
import { callMeta, loadWhatsAppCredentials } from "@/lib/whatsapp/credentials";

function bodyVariableCount(components: any[] | undefined): number {
  const body = (components || []).find((component) => component.type === "BODY")?.text || "";
  return new Set(String(body).match(/\{\{\d+\}\}/g) || []).size;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const access = await companyForAdmin(req, res);
  if (!access) return;
  const sb: any = getServiceSupabase();
  const credentials = await loadWhatsAppCredentials(sb, access.companyId);
  if (!credentials) return res.status(400).json({ error: "Connect WhatsApp first." });
  if (!credentials.businessAccountId) return res.status(400).json({ error: "Reconnect WhatsApp with your Business account ID." });

  if (req.method === "GET") {
    const result = await callMeta(credentials, `${credentials.businessAccountId}/message_templates?fields=name,status,language,category,components&limit=200`);
    if (!result.ok) return res.status(400).json({ error: `Meta refused: ${result.error}` });
    return res.status(200).json({
      templates: (result.json?.data || []).map((item: any) => ({
        name: item.name,
        status: item.status,
        language: item.language,
        category: item.category,
        variables: bodyVariableCount(item.components),
      })),
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const automation = WHATSAPP_AUTOMATIONS.find((item) => item.key === req.body?.key);
  if (!automation) return res.status(400).json({ error: "Choose a message first." });
  const wording = String(req.body?.wording || automation.wording).trim();
  const problem = wordingProblem(automation, wording);
  if (problem) return res.status(400).json({ error: problem });
  const name = String(req.body?.name || automation.key.replace(/^whatsapp_/, "")).trim();
  const language = String(req.body?.language || "en").trim();
  if (!isValidTemplateName(name)) return res.status(400).json({ error: "Template names use lowercase letters, numbers and underscores." });
  if (!isValidLanguageCode(language)) return res.status(400).json({ error: "Check the language code, for example en or en_US." });

  const result = await callMeta(credentials, `${credentials.businessAccountId}/message_templates`, {
    method: "POST",
    body: {
      name,
      language,
      category: "UTILITY",
      components: [{
        type: "BODY",
        text: wording,
        example: { body_text: [automationVariables(automation).map((variable) => variable.example)] },
      }],
    },
  });
  if (!result.ok) return res.status(400).json({ error: `Meta refused the template: ${result.error}` });

  const { data: row } = await sb.from("integrations").select("id, settings")
    .eq("company_id", access.companyId).eq("integration_type", "whatsapp").maybeSingle();
  const automations = applyAutomationChanges(
    readAutomationSettings(row?.settings),
    { [automation.key]: { enabled: readAutomationSettings(row?.settings)[automation.key].enabled, templateName: name, language, wording } },
    new Date().toISOString(),
  );
  await sb.from("integrations").update({ settings: { ...(row?.settings || {}), automations } }).eq("id", row.id);
  return res.status(200).json({ success: true, name, status: result.json?.status || "PENDING" });
}

export default withApiLogging(handler);
