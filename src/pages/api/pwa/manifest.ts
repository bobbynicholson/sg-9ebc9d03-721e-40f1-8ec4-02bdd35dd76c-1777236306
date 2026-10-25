import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

type ManifestIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose: "any maskable";
};

const FALLBACK_ICON = "/icons/cateringms-512.png";

function cleanShortName(value: string): string {
  const name = value.trim() || "CateringMS";
  return name.length > 24 ? `${name.slice(0, 23).trimEnd()}...` : name;
}

function isUsableLogoUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  return /^https:\/\//i.test(value) || /^data:image\//i.test(value);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = typeof req.query.slug === "string" ? req.query.slug.trim() : "";
  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  let company: { slug: string; company_name: string | null; logo_url: string | null } | null = null;

  if (slug || id) {
    try {
      const db = getServiceSupabase();
      const query = db
        .from("companies")
        .select("slug, company_name, logo_url")
        .limit(1);
      const result = slug
        ? await query.eq("slug", slug).maybeSingle()
        : await query.eq("id", id).maybeSingle();
      if (!result.error && result.data) company = result.data;
    } catch {
      // A branding lookup must never prevent the shared PWA manifest from
      // loading. The fallback below keeps installation available.
    }
  }

  const companyName = company?.company_name?.trim() || "CateringMS";
  const companySlug = company?.slug || slug || "cateringms";
  const logo = isUsableLogoUrl(company?.logo_url) ? company.logo_url : FALLBACK_ICON;
  const iconType = logo.startsWith("data:image/svg") ? "image/svg+xml" : "image/png";
  const manifest = {
    name: companyName,
    short_name: cleanShortName(companyName),
    id: `/pwa/${encodeURIComponent(companySlug)}`,
    description: `${companyName} workspace powered by CateringMS.`,
    start_url: `/auth/login?company=${encodeURIComponent(companySlug)}`,
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0f172a",
    theme_color: "#10b981",
    categories: ["business", "productivity"],
    icons: [
      { src: logo, sizes: "192x192", type: iconType, purpose: "any maskable" as const },
      { src: logo, sizes: "512x512", type: iconType, purpose: "any maskable" as const },
    ] as ManifestIcon[],
  };

  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  return res.status(200).json(manifest);
}
