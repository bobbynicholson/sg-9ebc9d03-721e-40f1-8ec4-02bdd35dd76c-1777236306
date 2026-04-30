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

  // Tenant-scoped client portal URLs.
  //
  // Why: clients see /spit-braai-delivery/client-portal/dashboard in
  // their browser URL while the page itself is the same component as
  // /client-portal/dashboard. White-label feel without duplicating
  // page files. The slug is passed through as a query param so any
  // page that cares (branding, logo) can read router.query.company_slug.
  //
  // Middleware already validates the user owns the slug they're hitting
  // (super_admin bypass; everyone else must match), so this is safe.
  async rewrites() {
    return [
      {
        // /[slug]/client-portal/<rest>  ->  /client-portal/<rest>?company_slug=<slug>
        source: "/:company_slug/client-portal/:path*",
        destination: "/client-portal/:path*?company_slug=:company_slug",
      },
      {
        // Bare /[slug]/client-portal -> dashboard
        source: "/:company_slug/client-portal",
        destination: "/client-portal/dashboard?company_slug=:company_slug",
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
