import Head from "next/head";

/**
 * NoIndexMeta Component
 * 
 * CRITICAL SECURITY COMPONENT
 * 
 * This component prevents search engines from indexing sensitive pages
 * containing client data, business information, or portal functionality.
 * 
 * Usage: Add to any page that should not appear in search results
 * 
 * Example:
 * ```tsx
 * export default function ProtectedPage() {
 *   return (
 *     <>
 *       <NoIndexMeta />
 *       <div>Your protected content</div>
 *     </>
 *   );
 * }
 * ```
 */
export function NoIndexMeta() {
  return (
    <Head>
      {/* Prevent indexing by all search engines */}
      <meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
      
      {/* Additional security headers for major search engines */}
      <meta name="googlebot" content="noindex, nofollow" />
      <meta name="bingbot" content="noindex, nofollow" />
      
      {/* Prevent caching of sensitive pages */}
      <meta httpEquiv="cache-control" content="no-cache, no-store, must-revalidate" />
      <meta httpEquiv="pragma" content="no-cache" />
      <meta httpEquiv="expires" content="0" />
      
      {/* OG tags to prevent social sharing previews */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content="CateringMS Portal" />
      <meta property="og:description" content="Secure portal access" />
      
      {/* Twitter card prevention */}
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content="CateringMS Portal" />
    </Head>
  );
}

/**
 * Hook to programmatically add noindex to any component
 */
export function useNoIndex() {
  return <NoIndexMeta />;
}
