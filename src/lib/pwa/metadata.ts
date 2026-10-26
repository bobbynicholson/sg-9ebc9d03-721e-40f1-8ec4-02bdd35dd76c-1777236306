export type PwaBranding = {
  id?: string;
  slug?: string | null;
  companyName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
};

export const isCompanySlug = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value);

/** Stable for unchanged branding and different whenever the tenant brand changes. */
export function pwaBrandRevision(branding: PwaBranding | null): string {
  const source = [
    branding?.id || "",
    branding?.slug || "",
    branding?.companyName || "",
    branding?.logoUrl || "",
    branding?.primaryColor || "",
  ].join(":");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function pwaIconUrl(branding: PwaBranding | null, size: 180 | 192 | 512): string {
  if (!branding?.slug || !isCompanySlug(branding.slug)) {
    return `/icons/cateringms-${size === 180 ? 192 : size}.png`;
  }
  const query = new URLSearchParams({
    slug: branding.slug,
    size: String(size),
    v: pwaBrandRevision(branding),
  });
  return `/api/pwa/icon?${query.toString()}`;
}

export function pwaManifestUrl(branding: PwaBranding | null): string {
  if (branding?.slug && isCompanySlug(branding.slug)) {
    // Keep the manifest location stable; its contents and versioned icon URLs
    // change with tenant branding while the installed app keeps one identity.
    return `/api/pwa/manifest?slug=${encodeURIComponent(branding.slug)}`;
  }
  return "/manifest.webmanifest";
}

export function pwaInstallUrl(slug?: string | null): string {
  return slug && isCompanySlug(slug) ? `/auth/install?company=${encodeURIComponent(slug)}` : "/auth/install";
}

export function shouldOpenCompanyInstallPage(inline: boolean, companySlug?: string): boolean {
  return !inline && Boolean(companySlug && isCompanySlug(companySlug));
}

export function buildPwaManifest(branding: PwaBranding | null) {
  const slug = branding?.slug && isCompanySlug(branding.slug) ? branding.slug : null;
  const name = branding?.companyName?.trim() || "CateringMS";
  const color = branding?.primaryColor || "";
  const themeColor = /^#[a-f\d]{6}$/i.test(color) ? color : "#10b981";
  const backgroundColor = /^#[a-f\d]{6}$/i.test(color) ? color : "#f8fafc";
  return {
    name,
    // Keep the stored company name intact. The home screen may visually
    // shorten it to fit, but an artificial 24-character cut loses identity.
    short_name: name,
    // Keep the existing per-company identity stable across brand edits so
    // installed PWAs update in place instead of becoming a second app.
    id: slug ? `/pwa/${slug}` : "/",
    description: `${name} workspace powered by CateringMS.`,
    // The old ?company= start URL was ignored by the generic login page.
    start_url: slug ? `/${slug}/login` : "/auth/login",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // Browsers use this for the OS-generated launch splash background.
    background_color: backgroundColor,
    theme_color: themeColor,
    categories: ["business", "productivity"],
    icons: ([192, 512] as const).map(size => ({
      src: pwaIconUrl(branding, size), sizes: `${size}x${size}`, type: "image/png", purpose: "any",
    })),
  };
}
