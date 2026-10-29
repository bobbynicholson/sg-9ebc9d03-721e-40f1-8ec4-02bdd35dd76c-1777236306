import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";

export function isPlatformOnlyRequest(method: string | undefined, url: string | undefined): boolean {
  const path = String(url || "").split("?")[0];
  if (path === "/api/platform/pricing-plans" && method === "GET") return false;
  return /^\/api\/(?:platform\/|cms\/|admin\/platform(?:\/|-|$))/.test(path)
    || path === "/api/admin/users-activity" || path === "/api/admin/env-check";
}

/** Portal choice never confers platform access. Verify the base role. */
export async function blockUnlessPlatformAdmin(req: NextApiRequest, res: NextApiResponse): Promise<boolean> {
  res.setHeader("Cache-Control", "private, no-store");
  const db = createPagesServerClient({ req, res });
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) {
    res.status(401).json({ error: "Sign in first" });
    return true;
  }
  const { data: profile, error } = await db.from("profiles")
    .select("role, is_active, deleted_at").eq("id", user.id).maybeSingle();
  if (error || !profile || profile.role !== "super_admin" || profile.is_active === false || profile.deleted_at) {
    res.status(403).json({ error: "Platform administrator access required" });
    return true;
  }
  return false;
}
