import type { NextApiRequest, NextApiResponse } from "next";
import { isCompanySlug } from "@/lib/pwa/metadata";
import { getPwaBranding } from "@/lib/pwa/serverBranding";
import { renderCompanyIcon } from "@/lib/pwa/logoImage";

const cache = new Map<string, { image: Buffer; expires: number }>();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }
  const slug = req.query.slug;
  const size = Number(req.query.size || 192);
  if (!isCompanySlug(slug) || ![180, 192, 512].includes(size)) return res.status(400).end();
  const fallback = `/icons/cateringms-${size === 512 ? 512 : 192}.png`;
  try {
    const branding = await getPwaBranding({ slug });
    if (!branding) return res.status(404).end();
    const key = `${branding.id || slug}:${branding.companyName || ""}:${branding.logoUrl || ""}:${branding.primaryColor || ""}:${size}`;
    const cached = cache.get(key);
    const image = cached && cached.expires > Date.now()
      ? cached.image
      : await renderCompanyIcon(branding.logoUrl || null, size, branding.companyName || "Company", branding.primaryColor);
    if (!cached || cached.expires <= Date.now()) {
      const oldestKey = cache.keys().next().value;
      if (cache.size >= 50 && oldestKey) cache.delete(oldestKey);
      cache.set(key, { image, expires: Date.now() + 300_000 });
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // The versioned URL changes when the company name, logo or brand color changes.
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (req.method === "HEAD") return res.status(200).end();
    return res.status(200).send(image);
  } catch {
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, fallback);
  }
}
