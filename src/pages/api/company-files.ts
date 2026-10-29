import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { PRIVATE_COMPANY_BUCKETS } from "@/lib/companyFiles";

// This endpoint deliberately uses the caller's JWT, so storage RLS applies.
// No service credential, public redirect, or reusable signed token is issued.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Vary", "Cookie, Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { bucket, path } = req.query;
  if (typeof bucket !== "string" || !PRIVATE_COMPANY_BUCKETS.has(bucket)
    || typeof path !== "string" || !path || path.length > 2048
    || path.split("/").some(segment => !segment || segment === "." || segment === "..")
    || /[\\\x00-\x1f]/.test(path)) {
    return res.status(400).json({ error: "Invalid file reference" });
  }
  try {
    const db = createPagesServerClient({ req, res });
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return res.status(401).json({ error: "Sign in to view this file" });
    const { data: profile, error: profileError } = await db.from("profiles")
      .select("company_id, role, is_active, deleted_at").eq("id", user.id).maybeSingle();
    if (profileError || !profile || profile.is_active === false || profile.deleted_at) {
      return res.status(403).json({ error: "File access denied" });
    }
    if (profile.role !== "super_admin") {
      if (!profile.company_id) return res.status(404).end();
      if (bucket === "pod") {
        const segments = path.split("/");
        if (segments[0] !== "orders" || !/^[0-9a-f-]{36}$/i.test(segments[1] || "")) return res.status(404).end();
        const { data: order, error } = await db.from("orders").select("id")
          .eq("id", segments[1]).eq("company_id", profile.company_id).maybeSingle();
        if (error || !order) return res.status(404).end();
      } else if (path.split("/")[0] !== profile.company_id) return res.status(404).end();
    }
    const { data: file, error } = await db.storage.from(bucket).download(path);
    if (error || !file) return res.status(404).end();
    const safeInline = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(file.type);
    res.setHeader("Content-Type", safeInline ? file.type : "application/octet-stream");
    res.setHeader("Content-Disposition", safeInline ? "inline" : "attachment");
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    if (req.method === "HEAD") return res.status(200).end();
    return res.status(200).send(Buffer.from(await file.arrayBuffer()));
  } catch {
    return res.status(500).json({ error: "File could not be loaded" });
  }
}
