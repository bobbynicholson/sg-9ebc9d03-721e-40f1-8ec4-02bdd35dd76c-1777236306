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

// Fallback cron secret. A MISSING CRON_SECRET env used to silently 401
// every cron fire - which is exactly how the email queue got stuck for
// weeks (the worker never ran, so queued emails never sent). The env var
// STILL wins in production; this default only kicks in when the env is
// absent, so a forgotten/cleared env never disables the whole cron layer.
//
// IMPORTANT for the scheduled Vercel cron: Vercel only attaches the
// `Authorization: Bearer <CRON_SECRET>` header when the CRON_SECRET env is
// set. So for the *scheduled* worker to authenticate, set CRON_SECRET in
// Vercel to THIS value (or any value). The default keeps manual + external
// triggers (curl / cron-job.org with the known value) working regardless.
const DEFAULT_CRON_SECRET = "8faf9fa241e2fbf0848ef76a18723e7a4230e6eec50869519b8547588658ce95";

export async function requireCronAuth(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<CronAuthOk | CronAuthFail> {
  const expected = process.env.CRON_SECRET || DEFAULT_CRON_SECRET;
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
