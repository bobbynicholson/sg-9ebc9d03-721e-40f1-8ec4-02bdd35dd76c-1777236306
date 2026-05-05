/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/imports/[id]/map
 *
 * Run the AI column mapper on every distinct sheet in the import.
 * Stores the result on import_jobs.mapping as
 *   { "<sheet_name>": { "<source_header>": { target, confidence, rationale } } }
 *
 * Idempotent: if mapping already exists and ?refresh=1 isn't set, we
 * return the stored mapping without burning AI calls.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import {
  getImportJob, listImportRows, setJobStatus, logEvent,
} from "@/services/importService";
import { mapColumnsViaAI } from "@/lib/importAi";

const ALLOWED_CALLER_ROLES = new Set(["super_admin", "company_admin", "admin", "owner"]);

// Heuristic: when sheet name doesn't tell us, infer from headers --
// anything mentioning event/date/guest/total leans 'orders'; otherwise
// 'clients' is the safer default.
function inferSchema(sheetName: string, headers: string[]): "clients" | "orders" {
  const n = (sheetName || "").toLowerCase();
  if (n.includes("order") || n.includes("event") || n.includes("booking") || n.includes("quote")) return "orders";
  if (n.includes("client") || n.includes("customer") || n.includes("contact") || n.includes("lead")) return "clients";
  const h = headers.join(" ").toLowerCase();
  const orderHits = ["event", "venue", "guest", "total", "deposit", "function", "date"]
    .reduce((s, k) => s + (h.includes(k) ? 1 : 0), 0);
  return orderHits >= 2 ? "orders" : "clients";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .single();
    const role = (profile?.active_role || profile?.role || "") as string;
    if (!ALLOWED_CALLER_ROLES.has(role)) {
      return res.status(403).json({ error: "Only owners / admins can run imports" });
    }
    const companyId = profile?.company_id as string | null;
    if (!companyId) return res.status(403).json({ error: "Account is not linked to a company" });

    const jobId = String(req.query.id || "");
    if (!jobId) return res.status(400).json({ error: "Missing job id" });
    const refresh = req.query.refresh === "1";

    const job = await getImportJob(jobId, companyId);
    if (!job) return res.status(404).json({ error: "Import job not found" });
    if (!refresh && job.mapping && job.status !== "uploaded") {
      return res.status(200).json({ ok: true, mapping: job.mapping, cached: true });
    }

    // Pull every source row -- we'll group by sheet and pass a slice
    // to the model.
    const rows = await listImportRows(jobId, { limit: 11000 });
    if (rows.length === 0) {
      return res.status(400).json({ error: "Import has no rows to map" });
    }

    // Group by sheet, keeping insertion order.
    const bySheet = new Map<string, { headers: string[]; sampleRows: any[] }>();
    for (const r of rows) {
      let bucket = bySheet.get(r.sheet);
      if (!bucket) {
        const headers = Object.keys(r.source_data || {});
        bucket = { headers, sampleRows: [] };
        bySheet.set(r.sheet, bucket);
      }
      if (bucket.sampleRows.length < 3) {
        bucket.sampleRows.push(r.source_data);
      }
    }

    const mapping: Record<string, Record<string, { target: string; confidence: number; rationale: string }>> = {};
    let totalIn = 0, totalOut = 0;
    let aiCalls = 0;

    for (const [sheet, { headers, sampleRows }] of bySheet.entries()) {
      const schema = inferSchema(sheet, headers);
      try {
        const result = await mapColumnsViaAI({
          sheetName: sheet,
          headers,
          sampleRows,
          targetSchema: schema,
        });
        aiCalls += 1;
        totalIn += result.tokens_in;
        totalOut += result.tokens_out;
        const sheetMap: Record<string, { target: string; confidence: number; rationale: string }> = {};
        for (const m of result.mapping) {
          sheetMap[m.source_header] = {
            target: m.target,
            confidence: m.confidence,
            rationale: m.rationale,
          };
        }
        // Stash the inferred schema so the preview/commit step
        // doesn't have to re-derive it.
        sheetMap.__schema__ = { target: schema, confidence: 1, rationale: "inferred from sheet name + headers" };
        mapping[sheet] = sheetMap;
      } catch (e: any) {
        await logEvent(jobId, "ai_map_failed", { sheet, error: e?.message });
        return res.status(502).json({
          error: `AI mapping failed for sheet "${sheet}": ${e?.message || "unknown"}. Try again, or contact support.`,
        });
      }
    }

    await setJobStatus(jobId, "mapped", {
      mapping,
      summary: {
        ...(job.summary || {}),
        ai_calls: (job.summary?.ai_calls || 0) + aiCalls,
        ai_tokens_in: (job.summary?.ai_tokens_in || 0) + totalIn,
        ai_tokens_out: (job.summary?.ai_tokens_out || 0) + totalOut,
      },
    });

    return res.status(200).json({
      ok: true,
      mapping,
      ai: { calls: aiCalls, tokens_in: totalIn, tokens_out: totalOut },
    });
  } catch (outer: any) {
    console.error("imports/[id]/map handler crashed:", outer);
    return res.status(500).json({ error: outer?.message || "Mapping failed" });
  }
}
