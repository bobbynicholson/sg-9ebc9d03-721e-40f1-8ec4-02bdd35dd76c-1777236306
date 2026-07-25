export interface NormalizedEmbedSubmitRequest {
  formSlug: string | null;
  turnstileToken: string;
  honeypot: string;
  referrer: string | null;
}

export function normalizeEmbedSubmitRequest(
  body: Record<string, any>,
): NormalizedEmbedSubmitRequest {
  const rawFormSlug =
    typeof body.formSlug === "string"
      ? body.formSlug
      : typeof body.slug === "string"
        ? body.slug
        : "";
  const formSlug =
    rawFormSlug && rawFormSlug !== "default"
      ? rawFormSlug.slice(0, 200)
      : null;

  const rawTurnstileToken = body.turnstileToken ?? body.turnstile_token;
  const turnstileToken =
    typeof rawTurnstileToken === "string" ? rawTurnstileToken : "";
  const honeypot = typeof body.honeypot === "string" ? body.honeypot : "";

  const legacyClientMeta =
    body.client_meta && typeof body.client_meta === "object"
      ? body.client_meta
      : null;
  const canonicalClientMeta =
    body.clientMeta && typeof body.clientMeta === "object"
      ? body.clientMeta
      : null;
  const rawReferrer =
    typeof body.referrer === "string"
      ? body.referrer
      : typeof legacyClientMeta?.referrer === "string"
        ? legacyClientMeta.referrer
        : typeof canonicalClientMeta?.referrer === "string"
          ? canonicalClientMeta.referrer
          : null;

  return {
    formSlug,
    turnstileToken,
    honeypot,
    referrer: rawReferrer ? rawReferrer.slice(0, 1000) : null,
  };
}
