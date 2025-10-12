
export type MarketRegion = "za" | "us" | "uk" | "other";

export interface GeoLocation {
  country: string;
  countryCode: string;
  region: MarketRegion;
  currency: "ZAR" | "USD" | "GBP";
}

/**
 * Detect user's market region based on various signals
 */
export async function detectUserRegion(): Promise<MarketRegion> {
  // Check if user has already been redirected (via cookie or session)
  const storedRegion = getStoredRegion();
  if (storedRegion) {
    return storedRegion;
  }

  // Try to detect via IP geolocation
  try {
    const response = await fetch("https://ipapi.co/json/");
    const data = await response.json();
    
    const countryCode = data.country_code?.toUpperCase();
    
    if (countryCode === "ZA") return "za";
    if (countryCode === "US") return "us";
    if (countryCode === "GB" || countryCode === "UK") return "uk";
    
    return "other";
  } catch (error) {
    console.error("Geo-detection failed:", error);
    return "za"; // Default to South Africa
  }
}

/**
 * Get market region from stored preference
 */
export function getStoredRegion(): MarketRegion | null {
  if (typeof window === "undefined") return null;
  
  const stored = localStorage.getItem("market_region");
  if (stored && ["za", "us", "uk", "other"].includes(stored)) {
    return stored as MarketRegion;
  }
  
  return null;
}

/**
 * Store user's market region preference
 */
export function setStoredRegion(region: MarketRegion): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("market_region", region);
}

/**
 * Get market region from URL path
 */
export function getRegionFromPath(pathname: string): MarketRegion {
  if (pathname.startsWith("/us/") || pathname === "/us") return "us";
  if (pathname.startsWith("/uk/") || pathname === "/uk") return "uk";
  return "za";
}

/**
 * Get redirect URL for detected region
 */
export function getRegionRedirectUrl(
  currentPath: string,
  detectedRegion: MarketRegion
): string | null {
  const currentRegion = getRegionFromPath(currentPath);
  
  // Don't redirect if already on correct regional site
  if (currentRegion === detectedRegion) return null;
  
  // Don't redirect admin, auth, or API routes
  if (
    currentPath.startsWith("/admin") ||
    currentPath.startsWith("/auth") ||
    currentPath.startsWith("/api") ||
    currentPath.startsWith("/portal") ||
    currentPath.startsWith("/client") ||
    currentPath.startsWith("/tracking")
  ) {
    return null;
  }
  
  // Handle regional redirects
  if (detectedRegion === "us") {
    if (currentPath.startsWith("/uk/")) {
      return currentPath.replace("/uk/", "/us/");
    }
    return currentPath === "/" ? "/us" : `/us${currentPath}`;
  }
  
  if (detectedRegion === "uk") {
    if (currentPath.startsWith("/us/")) {
      return currentPath.replace("/us/", "/uk/");
    }
    return currentPath === "/" ? "/uk" : `/uk${currentPath}`;
  }
  
  // Redirect to main site (ZA) if on regional variant but detected elsewhere
  if (detectedRegion === "za" || detectedRegion === "other") {
    if (currentPath.startsWith("/us/")) {
      return currentPath.replace("/us/", "/");
    }
    if (currentPath.startsWith("/uk/")) {
      return currentPath.replace("/uk/", "/");
    }
  }
  
  return null;
}

/**
 * Get currency for market region
 */
export function getRegionCurrency(region: MarketRegion): "ZAR" | "USD" | "GBP" {
  switch (region) {
    case "us":
      return "USD";
    case "uk":
      return "GBP";
    case "za":
    case "other":
    default:
      return "ZAR";
  }
}

/**
 * Get country name for market region
 */
export function getRegionCountry(region: MarketRegion): string {
  switch (region) {
    case "us":
      return "United States";
    case "uk":
      return "United Kingdom";
    case "za":
      return "South Africa";
    case "other":
    default:
      return "International";
  }
}
