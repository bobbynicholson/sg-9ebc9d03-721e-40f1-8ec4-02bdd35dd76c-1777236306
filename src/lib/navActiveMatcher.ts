/**
 * Shared active-route matcher for every sidebar / topbar nav in the app.
 *
 * Distilled from AdminNav.tsx after the May 2026 fix. The bug there:
 * `slugHrefPath` (the link being tested) was being compared against
 * itself in the candidates loop, so the third comparison was trivially
 * true on every nav item -- every link "matched", and the longest-match
 * resolver picked whichever entry had the longest href. Every other
 * portal nav had its own simpler bug (naive equality, naive
 * startsWith), so we centralise the logic here.
 *
 * Behaviour:
 *   - Candidates list = the *current* location only (router.pathname,
 *     router.asPath). The link being tested NEVER goes in the
 *     candidates list.
 *   - Compare each candidate against both the bare href AND the
 *     slug-prefixed href.
 *   - Path-prefix checks use `+ "/"` boundary so `/admin/orders`
 *     does not match `/admin/order-assignments`.
 *   - Longest-match resolver picks the most-specific href when
 *     multiple match.
 *   - Query-param awareness: when an href specifies query params (e.g.
 *     /admin/equipment?tab=shortages), every key in the href's query
 *     must match the current URL's query for the entry to count active.
 *
 * Service-layer style: this file ships with @ts-nocheck because it
 * holds the loose-typed router shape from next/router and we'd rather
 * keep the helper compact than fight the typings.
 */
/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck

interface RouterLite {
  pathname: string;
  asPath: string;
}

interface MatcherDeps {
  router: RouterLite;
  /**
   * Slug-aware href wrapper. Wraps a bare href (e.g. /admin/orders)
   * with the resolved tenant slug (e.g. /spit-braai-delivery/admin/orders)
   * when one is available. If the nav is not tenant-scoped (e.g.
   * PlatformNav) pass an identity function `(h) => h`.
   */
  withSlug: (href: string) => string;
}

const splitHref = (
  h: string,
): { path: string; query: URLSearchParams | null } => {
  const i = h.indexOf("?");
  if (i < 0) return { path: h, query: null };
  return {
    path: h.slice(0, i),
    query: new URLSearchParams(h.slice(i + 1)),
  };
};

const stripQuery = (p: string) => p.split("?")[0];

/**
 * Returns true when the given nav href should be considered "active"
 * relative to the current location. Sub-paths match (so
 * /admin/onboarding/imports lights up /admin/onboarding) but path
 * boundaries are honoured so /admin/orders does not match
 * /admin/order-assignments.
 */
export function matchesHref(href: string, deps: MatcherDeps): boolean {
  const { router, withSlug } = deps;
  const { path: hrefPath, query: hrefQuery } = splitHref(href);
  const slugHrefPath = splitHref(withSlug(href)).path;

  // Candidates are the *current* location -- the user's actual URL.
  // Never include the link being tested in here.
  const candidates = [
    stripQuery(router.pathname),
    stripQuery(router.asPath),
  ];

  let pathMatched = false;
  for (const c of candidates) {
    if (c === hrefPath || c === slugHrefPath) {
      pathMatched = true;
      break;
    }
    if (
      c.startsWith(hrefPath + "/") ||
      c.startsWith(slugHrefPath + "/")
    ) {
      pathMatched = true;
      break;
    }
  }
  if (!pathMatched) return false;

  if (!hrefQuery) return true;

  const currentQ = new URLSearchParams(
    router.asPath.split("?")[1] || "",
  );
  for (const [k, v] of hrefQuery.entries()) {
    if (currentQ.get(k) !== v) return false;
  }
  return true;
}

/**
 * Resolves which one of the supplied hrefs (if any) is the currently
 * active nav item. Picks the longest matching href so that nested
 * routes light up the most specific entry in the sidebar.
 *
 * Returns the winning href, or null if nothing matches.
 */
export function resolveActiveHref(
  hrefs: string[],
  deps: MatcherDeps,
): string | null {
  const matching = hrefs.filter((h) => matchesHref(h, deps));
  if (matching.length === 0) return null;
  return matching.sort((a, b) => b.length - a.length)[0];
}

/**
 * Convenience builder: returns an `isActive(href)` predicate that has
 * already resolved the longest-match winner across the supplied hrefs.
 * Use this once per render and then call the predicate per-link.
 */
export function buildIsActive(
  hrefs: string[],
  deps: MatcherDeps,
): (href: string) => boolean {
  const winner = resolveActiveHref(hrefs, deps);
  return (href: string) => href === winner;
}
