export type PwaBranding = {
  id?: string;
  slug?: string;
  companyName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
};

export const isCompanySlug = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value);

export function pwaIconUrl(branding: PwaBranding | null, size: 180 | 192 | 512): string {
  if (!branding?.slug || !isCompanySlug(branding.slug)) {
    return `/icons/cateringms-${size === 180 ? 192 : size}.png`;
  }
  // A logo change gives the OS a new icon URL without changing app identity.
  const source = `${branding.logoUrl || ""}:${branding.primaryColor || ""}`;
  let revision = 0;
  for (let i = 0; i < source.length; i += 1) revision = (revision * 31 + source.charCodeAt(i)) | 0;
  return `/api/pwa/icon?slug=${encodeURIComponent(branding.slug)}&size=${size}&v=${(revision >>> 0).toString(36)}`;
}

export function pwaManifestUrl(branding: PwaBranding | null): string {
  if (branding?.slug && isCompanySlug(branding.slug)) {
    return `/api/pwa/manifest?slug=${encodeURIComponent(branding.slug)}`;
  }
  return "/manifest.webmanifest";
}

export function pwaInstallUrl(slug?: string | null): string {
  return slug && isCompanySlug(slug) ? `/auth/install?company=${encodeURIComponent(slug)}` : "/auth/install";
}

export function buildPwaManifest(branding: PwaBranding | null) {
  const slug = branding?.slug && isCompanySlug(branding.slug) ? branding.slug : null;
  const name = branding?.companyName?.trim() || "CateringMS";
  const color = branding?.primaryColor || "";
  const themeColor = /^#[a-f\d]{6}$/i.test(color) ? color : "#10b981";
  return {
    name,
    short_name: Array.from(name).slice(0, 24).join(""),
    id: slug ? `/pwa/${slug}` : "/",
    description: `${name} workspace powered by CateringMS.`,
    // The old ?company= start URL was ignored by the generic login page.
    start_url: slug ? `/${slug}/login` : "/auth/login",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: themeColor,
    categories: ["business", "productivity"],
    icons: ([192, 512] as const).map(size => ({
      src: pwaIconUrl(branding, size), sizes: `${size}x${size}`, type: "image/png", purpose: "any",
    })),
  };
}
