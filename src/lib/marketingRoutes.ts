/**
 * Public marketing pages that render in the light marketing shell (see
 * pages/_app.tsx). Accepts a route pattern (router.pathname) or a real URL
 * path; query strings and hashes are ignored.
 *
 * Mirrors the marketing entries of AuthContext's PUBLIC_ROUTES. Tokenised
 * customer links (/q, /pay, /c/order), tenant terms (/terms/[company]),
 * sign-up and auth pages stay in the full app shell.
 */
const MARKETING_PATH =
  /^\/(?:|pricing|features(?:\/[^/]+)?|blog(?:\/[^/]+)?|page\/[^/]+|contact|support|security|privacy|demo|terms|(?:uk|us|eu)(?:\/pricing)?)\/?$/;

export function isMarketingPath(value: string): boolean {
  const path = (value || "/").split(/[?#]/)[0] || "/";
  return MARKETING_PATH.test(path);
}
