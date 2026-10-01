const DEFAULT_APP_ORIGIN = "https://cateringms.com";

interface PublicAppOriginInput {
  environment: string | undefined;
  configuredUrl?: string | null;
  vercelProductionUrl?: string | null;
  vercelUrl?: string | null;
  requestOrigin?: string | null;
  requestHost?: string | null;
  forwardedProtocol?: string | null;
}

function asOrigin(value: string | null | undefined, requireHttps: boolean): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (requireHttps && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Resolve the public app origin for provider return and webhook URLs.
 * In production, never trust a caller-controlled Origin header: PayFast
 * would send its payment notification to whatever host the buyer supplied.
 */
export function publicAppOrigin(input: PublicAppOriginInput): string {
  const isProduction = input.environment === "production";
  const configured = asOrigin(input.configuredUrl, isProduction);
  if (configured) return configured;

  if (isProduction) {
    const productionOrigin = asOrigin(input.vercelProductionUrl, true);
    if (productionOrigin) return productionOrigin;
  }

  const vercel = input.vercelUrl?.trim();
  if (vercel && !isProduction) {
    const vercelOrigin = asOrigin(
      /^https?:\/\//i.test(vercel) ? vercel : `https://${vercel}`,
      false,
    );
    if (vercelOrigin) return vercelOrigin;
  }

  if (!isProduction) {
    const requestOrigin = asOrigin(input.requestOrigin, false);
    if (requestOrigin) return requestOrigin;

    const host = input.requestHost?.split(",")[0]?.trim();
    if (host) {
      const protocol = input.forwardedProtocol?.split(",")[0]?.trim().toLowerCase();
      const safeProtocol = protocol === "https" ? "https" : "http";
      const requestHostOrigin = asOrigin(`${safeProtocol}://${host}`, false);
      if (requestHostOrigin) return requestHostOrigin;
    }
  }

  return DEFAULT_APP_ORIGIN;
}
