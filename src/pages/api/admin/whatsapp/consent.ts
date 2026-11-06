/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET  /api/admin/whatsapp/consent?q=&filter=&page=   one page of clients, with counts
 * POST /api/admin/whatsapp/consent                    { clientId, agreed: true | false | null }
 *
 * Paged on the server. Before the consent column exists the client list still
 * shows, and saving is switched off (canSave: false).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { companyForAdmin } from "@/lib/whatsapp/adminAccess";
import { cleanSearch } from "@/lib/whatsapp/conversations";

const CONSENT_PAGE_SIZE = 25;
const FILTERS = new Set(["all", "agreed", "not_asked", "opted_out"]);

function applySearch(query: any, search: string) {
  return search ? query.or(`client_name.ilike.%${search}%,phone.ilike.%${search}%,mobile_number.ilike.%${search}%`) : query;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const access = await companyForAdmin(req, res);
  if (!access) return;
  const { companyId } = access;
  const sb: any = getServiceSupabase();

  if (req.method === "GET") {
    const search = cleanSearch(req.query.q);
    const filter = FILTERS.has(String(req.query.filter)) ? String(req.query.filter) : "all";
    const page = Math.max(1, Math.min(100000, Number.parseInt(String(req.query.page || "1"), 10) || 1));
    const from = (page - 1) * CONSENT_PAGE_SIZE;
    const to = from + CONSENT_PAGE_SIZE - 1;

    const clients = (fields: string) => applySearch(
      sb.from("clients").select(fields, { count: "exact" }).eq("company_id", companyId).is("deleted_at", null),
      search,
    );
    const counted = async (apply: (query: any) => any) => {
      const base = sb.from("clients").select("id", { count: "exact", head: true }).eq("company_id", companyId).is("deleted_at", null);
      const { count, error } = await apply(applySearch(base, search));
      return error ? null : count || 0;
    };

    let listing = clients("id, client_name, phone, mobile_number, whatsapp_opt_in");
    if (filter === "agreed") listing = listing.eq("whatsapp_opt_in", true);
    if (filter === "opted_out") listing = listing.eq("whatsapp_opt_in", false);
    if (filter === "not_asked") listing = listing.is("whatsapp_opt_in", null);
    let result = await listing.order("client_name", { ascending: true, nullsFirst: false }).order("id", { ascending: true }).range(from, to);

    // The consent column isn't there yet: still show every client.
    const canSave = !result.error;
    if (result.error) {
      result = await clients("id, client_name, phone, mobile_number")
        .order("client_name", { ascending: true, nullsFirst: false }).order("id", { ascending: true }).range(from, to);
      if (result.error) return res.status(500).json({ error: "Could not load your clients." });
    }

    // Moving between pages doesn't change the totals, so skip counting again.
    if (req.query.counts === "0") {
      return res.status(200).json({
        canSave,
        clients: (result.data || []).map((client: any) => ({ ...client, whatsapp_opt_in: client.whatsapp_opt_in ?? null })),
        page,
        pageSize: CONSENT_PAGE_SIZE,
        matching: result.count ?? 0,
      });
    }

    const [all, agreed, optedOut] = await Promise.all([
      counted((query) => query),
      canSave ? counted((query) => query.eq("whatsapp_opt_in", true)) : 0,
      canSave ? counted((query) => query.eq("whatsapp_opt_in", false)) : 0,
    ]);
    const total = all || 0;
    return res.status(200).json({
      canSave,
      clients: (result.data || []).map((client: any) => ({ ...client, whatsapp_opt_in: client.whatsapp_opt_in ?? null })),
      page,
      pageSize: CONSENT_PAGE_SIZE,
      matching: result.count ?? total,
      counts: { all: total, agreed: agreed || 0, optedOut: optedOut || 0, notAsked: Math.max(0, total - (agreed || 0) - (optedOut || 0)) },
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const clientId = String(req.body?.clientId || "");
  const agreed = req.body?.agreed;
  if (!clientId || ![true, false, null].includes(agreed)) return res.status(400).json({ error: "Choose a client and an answer." });
  const { error } = await sb.from("clients")
    .update({ whatsapp_opt_in: agreed, whatsapp_opt_in_at: agreed === null ? null : new Date().toISOString() })
    .eq("id", clientId).eq("company_id", companyId);
  if (error) return res.status(400).json({ error: "Consent couldn't be saved. Try again." });
  return res.status(200).json({ success: true });
}

export default withApiLogging(handler);
