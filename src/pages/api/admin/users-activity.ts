/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/admin/users-activity
 *
 * Returns a map of auth user id -> { last_sign_in_at } so the
 * user-management table can show invite status (Pending vs Active)
 * without a schema change. A staff member's last_sign_in_at is null
 * until they first click their invite / set-password link and sign in,
 * which is exactly the "has this invite been accepted?" signal.
 *
 * Super-admin only (this backs the platform user-management page). Uses
 * the service role to read auth.users via the admin API.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";

const PER_PAGE = 1000;
const MAX_PAGES = 20; // 20k users hard cap before we stop paging

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user: caller } } = await ssr.auth.getUser();
    if (!caller) return res.status(401).json({ error: "No active session." });

    const { data: callerProfile } = await ssr
      .from("profiles")
      .select("role, active_role")
      .eq("id", caller.id)
      .single();
    const callerRole = (callerProfile as any)?.active_role || (callerProfile as any)?.role;
    if (callerRole !== "super_admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    let admin: ReturnType<typeof getServiceSupabase>;
    try {
      admin = getServiceSupabase();
    } catch (e) {
      console.error("[users-activity] service role unavailable:", e);
      return res.status(500).json({ error: "Server not configured" });
    }

    const activity: Record<string, { last_sign_in_at: string | null }> = {};
    let page = 1;
    let truncated = false;
    for (; page <= MAX_PAGES; page++) {
      const { data, error } = await (admin as any).auth.admin.listUsers({ page, perPage: PER_PAGE });
      if (error) {
        console.error("[users-activity] listUsers failed:", error.message);
        break;
      }
      const batch: any[] = data?.users || [];
      for (const u of batch) {
        activity[u.id] = { last_sign_in_at: u.last_sign_in_at ?? null };
      }
      if (batch.length < PER_PAGE) break;
      if (page === MAX_PAGES) truncated = true;
    }

    return res.status(200).json({ ok: true, activity, truncated });
  } catch (e: any) {
    console.error("users-activity crashed:", e);
    return res.status(500).json({ error: e?.message || "Unexpected server error" });
  }
}

export default withApiLogging(handler);
