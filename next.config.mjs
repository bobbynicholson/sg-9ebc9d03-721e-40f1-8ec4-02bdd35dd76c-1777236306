/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    instrumentationHook: true,
  },
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
  // Stage-3 URL canonicalisation. Legacy admin paths now redirect into
  // their hub-with-tabs canonical URLs. We cover both the bare path
  // (browsers / API clients hitting the page directly) and the
  // tenant-slug-prefixed form (the URL operators actually see in their
  // address bar). Redirects run BEFORE rewrites in Next, so a user
  // visiting /spit-braai-delivery/admin/equipment-shortages gets a 308
  // to /spit-braai-delivery/admin/equipment?tab=shortages, then the
  // rewrite layer strips the slug into ?company_slug=... as usual.
  //
  // `permanent: true` issues 308 (preserves method, signals SEO move).
  // Old notification deep-links and bookmarks keep working forever.
  async redirects() {
    return [
      // ── Equipment hub-with-tabs ─────────────────────────────────
      { source: "/admin/equipment-shortages",                 destination: "/admin/equipment?tab=shortages",           permanent: true },
      { source: "/admin/equipment-shortages/:flag",           destination: "/admin/equipment?tab=shortages&flag=:flag", permanent: true },
      { source: "/admin/equipment/hire-orders",               destination: "/admin/equipment?tab=hire-in",             permanent: true },
      { source: "/admin/equipment/hire-orders/:rest*",        destination: "/admin/equipment?tab=hire-in",             permanent: true },
      { source: "/:companySlug/admin/equipment-shortages",          destination: "/:companySlug/admin/equipment?tab=shortages",           permanent: true },
      { source: "/:companySlug/admin/equipment-shortages/:flag",    destination: "/:companySlug/admin/equipment?tab=shortages&flag=:flag", permanent: true },
      { source: "/:companySlug/admin/equipment/hire-orders",        destination: "/:companySlug/admin/equipment?tab=hire-in",             permanent: true },
      { source: "/:companySlug/admin/equipment/hire-orders/:rest*", destination: "/:companySlug/admin/equipment?tab=hire-in",             permanent: true },

      // ── Lifecycle Emails hub-with-tabs ──────────────────────────
      // The hub itself lives at /admin/email-templates. Three sub-pages
      // collapse into tabs there.
      { source: "/admin/after-sales-emails",                  destination: "/admin/email-templates?tab=sent-log",   permanent: true },
      { source: "/admin/email-automation-dashboard",          destination: "/admin/email-templates?tab=automation", permanent: true },
      { source: "/admin/email-automation-settings",           destination: "/admin/email-templates?tab=settings",   permanent: true },
      { source: "/:companySlug/admin/after-sales-emails",         destination: "/:companySlug/admin/email-templates?tab=sent-log",   permanent: true },
      { source: "/:companySlug/admin/email-automation-dashboard", destination: "/:companySlug/admin/email-templates?tab=automation", permanent: true },
      { source: "/:companySlug/admin/email-automation-settings",  destination: "/:companySlug/admin/email-templates?tab=settings",   permanent: true },
    ];
  },

  async rewrites() {
    // IMPORTANT: array rewrites are applied as `afterFiles`, which run
    // AFTER static files but BEFORE dynamic routes. The `:company_slug`
    // param would otherwise match `api` (e.g. /api/admin/invoices/:id/
    // mark-paid) and hijack DYNAMIC /api/admin/*/[id]/* routes to a
    // non-existent page -> 404. Static /api routes survived (filesystem
    // phase wins) but dynamic ones did not. The `((?!api)[^/]+)`
    // constraint stops the slug from matching anything starting with
    // "api", so /api/* always falls through to the real API handlers.
    return [
      // ── Client portal (clients) ────────────────────────────────
      {
        source: "/:company_slug((?!api)[^/]+)/client-portal/:path*",
        destination: "/client-portal/:path*?company_slug=:company_slug",
      },
      {
        source: "/:company_slug((?!api)[^/]+)/client-portal",
        destination: "/client-portal/dashboard?company_slug=:company_slug",
      },
      // ── Admin (owner / company_admin) ──────────────────────────
      {
        source: "/:company_slug((?!api)[^/]+)/admin/:path*",
        destination: "/admin/:path*?company_slug=:company_slug",
      },
      {
        source: "/:company_slug((?!api)[^/]+)/admin",
        destination: "/admin/dashboard?company_slug=:company_slug",
      },
      // ── Team portal (kitchen / driver / shopping / cleaning) ───
      {
        source: "/:company_slug((?!api)[^/]+)/team-portal/:path*",
        destination: "/team-portal/:path*?company_slug=:company_slug",
      },
      {
        source: "/:company_slug((?!api)[^/]+)/team-portal",
        destination: "/team-portal/general?company_slug=:company_slug",
      },
      // ── Account settings ───────────────────────────────────────
      {
        source: "/:company_slug((?!api)[^/]+)/account/:path*",
        destination: "/account/:path*?company_slug=:company_slug",
      },
      // ── Subscription (billing) ────────────────────────────────
      {
        source: "/:company_slug((?!api)[^/]+)/subscription/:path*",
        destination: "/subscription/:path*?company_slug=:company_slug",
      },
      // ── Customer public surfaces (TIGHTEN I.115, 2026-06-02) ──
      // The bare /q/{token}, /c/order/{id}, and /pay/i/{token} paths
      // hit the apex domain which doesn't serve the app cleanly in
      // production. Mirror the admin/team-portal/client-portal pattern
      // so the email link can read like cateringms.com/spit-braai-
      // delivery/q/{token} - same destination page, but the URL
      // surfaces the tenant brand and goes through the same
      // slug-aware routing every other surface uses.
      {
        source: "/:company_slug((?!api)[^/]+)/q/:token",
        destination: "/q/:token?company_slug=:company_slug",
      },
      {
        source: "/:company_slug((?!api)[^/]+)/c/order/:path*",
        destination: "/c/order/:path*?company_slug=:company_slug",
      },
      {
        source: "/:company_slug((?!api)[^/]+)/pay/i/:token",
        destination: "/pay/i/:token?company_slug=:company_slug",
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
