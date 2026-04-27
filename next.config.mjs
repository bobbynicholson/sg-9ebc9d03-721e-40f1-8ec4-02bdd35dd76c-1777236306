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
