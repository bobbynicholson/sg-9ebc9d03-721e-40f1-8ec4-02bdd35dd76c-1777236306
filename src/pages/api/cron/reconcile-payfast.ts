/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";
import { recoverPayFastGateway } from "@/lib/paymentRecovery";
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "POST"].includes(req.method || "")) return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireCronAuth(req, res); if (!auth.ok) return;
  const sb: any = getServiceSupabase();
  try {
    // Include inactive and soft-deleted configurations: old checkouts can
    // finish after an owner switches providers. Private checkout versions
    // retain earlier merchant accounts and test/live modes too.
    const { data: gateways, error } = await sb.from("payment_gateways")
      .select("id, company_id, is_test").eq("provider", "payfast");
    if (error) throw error;
    const { data: versions, error: versionError } = await sb.from("payment_gateway_credential_versions")
      .select("id, gateway_id, company_id, is_test, credentials, created_at").eq("provider", "payfast")
      .order("created_at", { ascending: false });
    if (versionError) throw versionError;
    const sources: any[] = [];
    const seen = new Set<string>();
    const addSource = (gateway: any, credentials: any, sourceId: string) => {
      const key = `${gateway.id}:${credentials.merchantId}:${gateway.is_test}`;
      if (seen.has(key)) return;
      seen.add(key); sources.push({ ...gateway, credentials, recoverySourceId: sourceId });
    };
    for (const gateway of gateways || []) {
      const { data: row, error: credentialError } = await sb.from("payment_gateway_credentials")
        .select("credentials").eq("gateway_id", gateway.id).maybeSingle();
      if (credentialError) throw credentialError;
      if (row?.credentials?.merchantId) addSource(gateway, row.credentials, gateway.id);
    }
    for (const version of versions || []) {
      if (version.credentials?.merchantId) addSource({ id: version.gateway_id,
        company_id: version.company_id, is_test: version.is_test }, version.credentials, version.id);
    }
    const { data: cursors, error: cursorError } = await sb.from("payfast_recovery_cursors").select("source_id, last_checked_at");
    if (cursorError) throw cursorError;
    const lastCheck = new Map((cursors || []).map((cursor: any) => [cursor.source_id, cursor.last_checked_at || ""]));
    const batch = sources.sort((a, b) => String(lastCheck.get(a.recoverySourceId) || "")
      .localeCompare(String(lastCheck.get(b.recoverySourceId) || ""))).slice(0, 10);
    const details: any[] = [];
    const deadline = Date.now() + 45000;
    for (const gateway of batch) {
      if (Date.now() > deadline) break;
      try {
        details.push({ company_id: gateway.company_id, gateway_id: gateway.id,
          ...await recoverPayFastGateway(sb, gateway, { ...gateway.credentials, isTest: gateway.is_test }) });
      } catch (failure: any) {
        details.push({ company_id: gateway.company_id, gateway_id: gateway.id, error: failure.message });
      }
    }
    const errors = details.filter((entry) => entry.error).length;
    await recordCronHeartbeat(sb, "reconcile-payfast", errors ? "error" : "ok", { source: auth.source,
      gateways_checked: details.length, errors_count: errors, details });
    return res.status(errors ? 503 : 200).json({ ok: errors === 0, details });
  } catch (failure: any) {
    await recordCronHeartbeat(sb, "reconcile-payfast", "error", { source: auth.source, error_message: failure.message });
    return res.status(503).json({ ok: false, error: "PayFast recovery failed" });
  }
}
export default withApiLogging(handler);
