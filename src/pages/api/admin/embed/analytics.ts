/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Per-form analytics for the customiser sidebar.
 *
 *   GET /api/admin/embed/analytics?form_id=ID
 *
 * Returns:
 *   - daily submissions count, last 30 days (sparkline data)
 *   - top 5 referrers
 *   - 30-day total + previous-30-day total for trend arrow
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";


// Restructure audit 2026-07-02: "owner" added - the enum gained it in
// migration 20260521150000 and the page gate admits OWNER; without it
// here an owner hit 403s across the lead-capture area.
const ALLOWED = new Set(["super_admin", "owner", "company_admin", "admin"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return res.status(401).json({ error: "Authentication required" });

  const { data: profile, error: profileErr } = await ssr
    .from("profiles")
    .select("role, active_role, company_id")
    .eq("id", user.id)
    .single();
  if (profileErr) {
    console.error("[admin/embed/analytics] profiles fetch failed:", profileErr);
  }
  if (!profile) return res.status(403).json({ error: "Profile not found" });
  const role = (profile as any).active_role || (profile as any).role;
  if (!ALLOWED.has(role)) return res.status(403).json({ error: "Forbidden" });
  const companyId = (profile as any).company_id as string | null;
  if (!companyId) return res.status(400).json({ error: "Missing company" });

  const formId = typeof req.query.form_id === "string" ? req.query.form_id : null;
  if (!formId || !UUID_RE.test(formId)) {
    return res.status(400).json({ error: "Invalid form_id" });
  }

  const db = getServiceSupabase();

  // Verify the form belongs to caller's company.
  const { data: form, error: formErr } = await (db as any)
    .from("embed_form_configs")
    .select("id, company_id, views_count, submissions_count")
    .eq("id", formId)
    .maybeSingle();
  if (formErr) {
    console.error("[admin/embed/analytics] embed_form_configs fetch failed:", formErr);
  }

  if (!form) return res.status(404).json({ error: "Form not found" });
  if ((form as any).company_id !== companyId && role !== "super_admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 60);

  const { data: subs, error } = await (db as any)
    .from("embed_form_submissions")
    .select("created_at, referrer, is_spam")
    .eq("embed_form_id", formId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: dbErrorMessage(error) });

  const rows = (subs || []) as Array<{ created_at: string; referrer: string | null; is_spam: boolean }>;

  // Daily series: bucket by yyyy-mm-dd, last 30 days.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days: { date: string; count: number }[] = [];
  const buckets = new Map<string, number>();
  for (const r of rows) {
    if (r.is_spam) continue;
    const d = new Date(r.created_at);
    d.setUTCHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: buckets.get(key) ?? 0 });
  }

  // Previous 30-day total for trend arrow.
  let prev30 = 0;
  for (const r of rows) {
    if (r.is_spam) continue;
    const t = new Date(r.created_at).getTime();
    const cutoffNew = today.getTime() - 30 * 86400 * 1000;
    if (t < cutoffNew) prev30 += 1;
  }
  const last30 = days.reduce((s, d) => s + d.count, 0);

  // Top referrers.
  const refMap = new Map<string, number>();
  for (const r of rows) {
    if (r.is_spam) continue;
    const ref = (r.referrer || "(direct)").slice(0, 200);
    refMap.set(ref, (refMap.get(ref) ?? 0) + 1);
  }
  const topReferrers = Array.from(refMap.entries())
    .map(([referrer, count]) => ({ referrer, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return res.status(200).json({
    ok: true,
    daily: days,
    last30,
    prev30,
    topReferrers,
    views: (form as any).views_count ?? 0,
    submissions: (form as any).submissions_count ?? 0,
  });
}

export default withApiLogging(handler);
