import { useEffect, useState } from "react";
import { Building2, LoaderCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandingRow } from "@/lib/branding/useBranding";
import { readBrandingCacheForSlug } from "@/lib/branding/store";
import type { InitialBranding } from "@/lib/branding/serverBrandingForSlug";
import { useRouter } from "next/router";
import { getTenantSlugFromPathname } from "@/lib/tenantRoute";

const isHexColor = (value?: string | null): value is string =>
  Boolean(value && /^#[\da-f]{6}$/i.test(value));

function initials(value: string): string {
  return value.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "C";
}

/** One lightweight, tenant-aware launch screen for auth checks and app navigation. */
export function PwaLoadingScreen({ initialBranding }: { initialBranding?: InitialBranding | null }) {
  const router = useRouter();
  const { company } = useAuth();
  const liveBrand = useBrandingRow();
  const slug = getTenantSlugFromPathname(router.asPath || router.pathname || "");
  const [cachedBrand, setCachedBrand] = useState<ReturnType<typeof readBrandingCacheForSlug>>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    setCachedBrand(slug ? readBrandingCacheForSlug(slug) : null);
  }, [slug]);

  const matchesSlug = (candidate?: { slug?: string | null } | null) =>
    Boolean(candidate && (!slug || candidate.slug === slug));
  const cached = matchesSlug(liveBrand)
    ? liveBrand
    : matchesSlug(cachedBrand)
      ? cachedBrand
      : null;
  const companyMatches = !slug || company?.slug === slug;
  const name = (matchesSlug(initialBranding) ? initialBranding?.companyName : null) ||
    cached?.companyName ||
    (companyMatches ? company?.company_name : null) ||
    "CateringMS";
  const logo = (matchesSlug(initialBranding) ? initialBranding?.logoUrl : null) ||
    cached?.logoUrl ||
    (companyMatches ? company?.logo_url : null) ||
    null;
  const accentValue = (matchesSlug(initialBranding) ? initialBranding?.primaryColor : null) ||
    cached?.primaryColor ||
    (companyMatches ? company?.primary_color : null);
  const accent = isHexColor(accentValue) ? accentValue : "#d97706";

  useEffect(() => setLogoLoaded(false), [logo]);

  return (
    <main
      role="status"
      aria-live="polite"
      aria-label={`Opening ${name}`}
      className="fixed inset-0 z-[120] flex min-h-[100svh] items-center justify-center overflow-hidden bg-slate-50 px-6 text-slate-950"
      style={{
        paddingTop: "max(1.5rem, env(safe-area-inset-top))",
        paddingRight: "max(1.5rem, env(safe-area-inset-right))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1.5rem, env(safe-area-inset-left))",
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />
      <div className="relative flex w-full max-w-xs flex-col items-center text-center">
        <div className="relative flex h-[4.75rem] w-[4.75rem] items-center justify-center overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-sm">
          <span
            aria-hidden="true"
            className={`absolute inset-0 flex items-center justify-center text-lg font-semibold transition-opacity ${logoLoaded ? "opacity-0" : "opacity-100"}`}
            style={{ color: accent }}
          >
            {logo ? initials(name) : <Building2 className="h-7 w-7" strokeWidth={1.8} />}
          </span>
          {logo && (
            // Company logos may be stored on customer-owned HTTPS hosts; bypass Next image optimization here.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt=""
              width={76}
              height={76}
              loading="eager"
              fetchPriority="high"
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-contain p-2"
              onLoad={() => setLogoLoaded(true)}
              onError={() => setLogoLoaded(false)}
            />
          )}
        </div>
        <h1 className="mt-5 max-w-full truncate text-xl font-semibold tracking-tight text-slate-900">{name}</h1>
        <p className="mt-1 text-sm text-slate-500">Getting your workspace ready</p>
        <LoaderCircle className="mt-6 h-5 w-5 animate-spin motion-reduce:animate-none" style={{ color: accent }} aria-hidden="true" />
      </div>
    </main>
  );
}
