/**
 * Shared cron auth gate.
 *
 * Every endpoint under /api/cron/* should accept either:
 *   1. Vercel Cron: Authorization: Bearer ${CRON_SECRET}
 *   2. An authenticated super_admin session (manual operator trigger
 *      from the browser, e.g. when Vercel's scheduler isn't firing or
 *      when the operator wants to drain a backed-up queue immediately).
 *
 * Use:
 *   const auth = await requireCronAuth(req, res);
 *   if (!auth.ok) return; // 401 already sent
 *   // proceed with cron body. `auth.source` tells you whether this
 *   // was Vercel or a manual trigger - useful for heartbeat metadata.
 *
 * Replaces the ~20-line inlined dual-auth block that was being
 * copy-pasted across cron handlers. Single source of truth so policy
 * changes (e.g. add an org-owner role, accept service-role JWT) land
 * in one place.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";

export type CronAuthSource = "cron" | "super_admin";

export interface CronAuthOk {
  ok: true;
  source: CronAuthSource;
}

export interface CronAuthFail {
  ok: false;
}

export async function requireCronAuth(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<CronAuthOk | CronAuthFail> {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (expected && auth === `Bearer ${expected}`) {
    return { ok: true, source: "cron" };
  }

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (user) {
      const { data: profile } = await ssr
        .from("profiles")
        .select("role, active_role")
        .eq("id", user.id)
        .maybeSingle();
      const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
      if (role === "super_admin") {
        return { ok: true, source: "super_admin" };
      }
    }
  } catch {
    // fall through to 401
  }

  res.status(401).json({ error: "Unauthorised" });
  return { ok: false };
}
