import type { NextApiRequest, NextApiResponse } from "next";
import { buildPwaManifest, isCompanySlug } from "@/lib/pwa/metadata";
import { getPwaBranding } from "@/lib/pwa/serverBranding";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const slug = typeof req.query.slug === "string" ? req.query.slug : undefined;
  const id = typeof req.query.id === "string" ? req.query.id : undefined;
  if ((req.query.slug !== undefined && !isCompanySlug(slug)) ||
      (req.query.id !== undefined && !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id || ""))) {
    return res.status(400).json({ error: "Invalid company" });
  }
  try {
    const branding = slug || id ? await getPwaBranding({ slug, id }) : null;
    if ((slug || id) && !branding) return res.status(404).json({ error: "Company not found" });
    // Keep the manifest URL stable and revalidate its contents so installed
    // browsers can update this same app after a company branding change.
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // send() preserves the manifest MIME; Next's json() resets it to application/json.
    res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
    if (req.method === "HEAD") return res.status(200).end();
    return res.status(200).send(JSON.stringify(buildPwaManifest(branding)));
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({ error: "App branding is temporarily unavailable. Please retry." });
  }
}
