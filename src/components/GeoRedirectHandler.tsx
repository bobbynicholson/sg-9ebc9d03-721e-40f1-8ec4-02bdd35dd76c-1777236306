import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { detectUserRegion, getRegionFromPath, getRegionRedirectUrl, setStoredRegion } from "@/lib/geoLocation";

/**
 * Component that handles automatic geo-based redirects
 * Only runs on public marketing pages, not on admin/portal/auth pages
 */
export function GeoRedirectHandler() {
  const router = useRouter();
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    const handleGeoRedirect = async () => {
      // Don't run multiple times
      if (hasChecked) return;
      
      // Don't redirect on server
      if (typeof window === "undefined") return;
      
      // Check if user has dismissed redirect prompt
      const dismissedRedirect = sessionStorage.getItem("geo_redirect_dismissed");
      if (dismissedRedirect) {
        setHasChecked(true);
        return;
      }

      try {
        const currentPath = router.pathname;
        
        // Skip redirect for API routes, portal pages, 404 pages, and already localized paths
        if (
          currentPath.startsWith('/api') || 
          currentPath.startsWith('/portal') ||
          currentPath.startsWith('/platform') ||
          currentPath.includes('404') || // Do not redirect on 404 pages
          getRegionFromPath(currentPath)
        ) {
          setHasChecked(true);
          return;
        }

        const detectedRegion = await detectUserRegion();
        const redirectUrl = getRegionRedirectUrl(currentPath, detectedRegion);

        if (redirectUrl) {
          // Store the detected region
          setStoredRegion(detectedRegion);
          
          // Perform redirect
          router.push(redirectUrl);
        }

        setHasChecked(true);
      } catch (error) {
        console.error("Geo-redirect error:", error);
        setHasChecked(true);
      }
    };

    handleGeoRedirect();
  }, [hasChecked, router]);

  return null; // This component doesn't render anything
}
