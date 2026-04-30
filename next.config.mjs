/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  allowedDevOrigins: ["*.daytona.work", "*.softgen.dev"],

  // Tenant-scoped URLs.
  //
  // Why: every catering company gets their own slug -- e.g. Spit Braai
  // Delivery sees /spit-braai-delivery/admin/dashboard,
  // /spit-braai-delivery/team-portal/kitchen, etc. The page files
  // themselves live at the bare paths (/admin/dashboard etc.) and the
  // rewrite passes the slug through as a query param so each page can
  // read router.query.company_slug for branding and tenant context.
  //
  // White-label feel without duplicating page files.
  //
  // Middleware enforces that the authenticated user owns the slug they
  // are hitting (super_admin bypass; everyone else must match their
  // own company's slug), so this is safe.
  //
  // Reserved first-segments that must NEVER be used as a slug:
  //   admin, api, auth, blog, c, client-portal, contact, demo,
  //   features, pay, page, pricing, privacy, security, super-admin,
  //   support, team-portal, terms, uk, us, _next, account,
  //   subscription, company-signup
  // The slug picker on sign-up rejects these.
  async rewrites() {
    return [
      // ── Client portal (clients) ────────────────────────────────
      {
        source: "/:company_slug/client-portal/:path*",
        destination: "/client-portal/:path*?company_slug=:company_slug",
      },
      {
        source: "/:company_slug/client-portal",
        destination: "/client-portal/dashboard?company_slug=:company_slug",
      },
      // ── Admin (owner / company_admin) ──────────────────────────
      {
        source: "/:company_slug/admin/:path*",
        destination: "/admin/:path*?company_slug=:company_slug",
      },
      {
        source: "/:company_slug/admin",
        destination: "/admin/dashboard?company_slug=:company_slug",
      },
      // ── Team portal (kitchen / driver / shopping / cleaning) ───
      {
        source: "/:company_slug/team-portal/:path*",
        destination: "/team-portal/:path*?company_slug=:company_slug",
      },
      {
        source: "/:company_slug/team-portal",
        destination: "/team-portal/general?company_slug=:company_slug",
      },
      // ── Account settings ───────────────────────────────────────
      {
        source: "/:company_slug/account/:path*",
        destination: "/account/:path*?company_slug=:company_slug",
      },
      // ── Subscription (billing) ────────────────────────────────
      {
        source: "/:company_slug/subscription/:path*",
        destination: "/subscription/:path*?company_slug=:company_slug",
      },
    ];
  },

  // Cache headers -- HTML must always be revalidated so deploys land
  // immediately. JS bundles are content-hashed by Next so they're safe
  // to cache long-term. The VersionWatcher (in _app.tsx) belt-and-braces
  // this with a runtime check that prompts a refresh if it detects the
  // build ID changed under the user's feet.
  async headers() {
    return [
      {
        // HTML pages and API JSON: never trust the cache.
        source: "/:path*",
        has: [
          { type: "header", key: "accept", value: "(.*text/html.*|.*application/json.*)" },
        ],
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        // Hashed Next bundles -- safe to cache forever.
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
