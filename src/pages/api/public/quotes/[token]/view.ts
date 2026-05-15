/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  applyCorsHeaders,
  checkAndIncrementRateLimit,
  getClientIp,
  hashIp,
  isUuid,
} from "@/lib/embedFormApi";

/**
 * POST /api/public/quotes/[token]/view
 *
 * Public, unauthenticated. Called from /q/[token] on first render so we
 * can stamp viewed_at on the quote and notify the admin "🟡 client
 * viewed your quote". Was previously done from the anon client directly
 * but the notifications RLS rejects anon writes, so the notification
 * was silently failing.
 *
 * Idempotent on viewed_at -- if it's already set we leave it alone so
 * the anchor stays the FIRST view, not the latest.
 */

export const config = {
  api: { bodyParser: { sizeLimit: "8kb" } },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  applyCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false });
  }

  const token = String(req.query.token || "");
  if (!isUuid(token)) return res.status(404).json({ ok: false });

  const supabase = getServiceSupabase();
  const ip = getClientIp(req as any);
  const ipHash = hashIp(ip);

  // Liberal rate limit: refresh-spam protection only. 60/hour/ip is
  // plenty for legit reloads.
  const rl = await checkAndIncrementRateLimit(token, ipHash, supabase, {
    limit: 60,
    bucket: "hour",
  });
  if (!rl.allowed) return res.status(429).json({ ok: false });

  // Resolve + stamp in one round trip. Returning the row gives us
  // enough to fire the notification.
  // Wave 12 follow-up: currency lives on companies, not quotes.
  // Selecting it here used to throw "column quotes.currency does
  // not exist" and 500 the view-tracking endpoint, which silently
  // swallowed every viewed-at stamp + the admin "client viewed"
  // notification.
  const { data: row, error: rowErr } = await (supabase as any)
    .from("quotes")
    .select("id, company_id, user_id, client_name, total, event_date, viewed_at, deleted_at")
    .eq("public_token", token)
    .maybeSingle();
  if (rowErr) {
    console.error("[public/quotes/[token]/view] quotes fetch failed:", rowErr);
  }

  if (!row || row.deleted_at) return res.status(404).json({ ok: false });

  // Already viewed -- nothing to do, return ok so the client doesn't
  // retry.
  if (row.viewed_at) return res.status(200).json({ ok: true, alreadyViewed: true });

  await (supabase as any)
    .from("quotes")
    .update({ viewed_at: new Date().toISOString() })
    .eq("id", row.id);

  // Best-effort notification. Service role bypasses the
  // tenant_create_notifications RLS so it actually lands.
  try {
    // Resolve currency from the company; quotes table doesn't carry it.
    let currencyCode = "ZAR";
    try {
      const { data: companyRow, error: companyRowErr } = await (supabase as any)
        .from("companies")
        .select("currency")
        .eq("id", row.company_id)
        .maybeSingle();
      if (companyRowErr) {
        console.error("[public/quotes/[token]/view] companies fetch failed:", companyRowErr);
      }
      if ((companyRow as any)?.currency) currencyCode = (companyRow as any).currency;
    } catch { /* fall back to ZAR */ }
    const totalLabel = `${currencyCode} ${Number(row.total || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
    const eventLabel = row.event_date
      ? new Date(row.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
      : "TBD";
    await (supabase as any).from("notifications").insert([
      {
        company_id: row.company_id,
        user_id: row.user_id,
        recipient_id: row.user_id,
        notification_type: "quote_viewed",
        title: "👀 Client viewed your quote",
        message: `${row.client_name || "Client"} just opened the quote (${totalLabel}, event ${eventLabel}). They're considering -- a follow-up nudge tomorrow if quiet might help.`,
        priority: "normal",
        link: `/admin/quotes/${row.id}`,
      },
    ]);
  } catch (err) {
    console.warn("[public/quotes/view] notification insert failed", err);
  }

  return res.status(200).json({ ok: true });
}
