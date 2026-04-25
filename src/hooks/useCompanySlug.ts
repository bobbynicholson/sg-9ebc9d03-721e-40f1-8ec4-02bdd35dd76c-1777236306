import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";

/**
 * Hook to extract and validate company slug from URL
 * Ensures user can only access their own company's routes
 */
export function useCompanySlug() {
  const router = useRouter();
  const { user } = useAuth();
  const [companySlug, setCompanySlug] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsValidating(false);
      return;
    }

    // Extract company slug from URL
    const pathParts = router.pathname.split("/").filter(Boolean);
    
    // Check if URL has a company slug pattern
    if (pathParts[0] && !pathParts[0].startsWith("[")) {
      const urlSlug = pathParts[0];
      
      // Super admin can access any company
      if (user.active_role === "super_admin") {
        setCompanySlug(urlSlug);
        setIsValidating(false);
        return;
      }

      // Regular users must match their company slug
      if (user.company_slug !== urlSlug) {
        console.error(`🚨 Company slug mismatch: URL has ${urlSlug}, user belongs to ${user.company_slug}`);
        
        // Redirect to correct company
        const correctedPath = router.pathname.replace(`/${urlSlug}/`, `/${user.company_slug}/`);
        router.push(correctedPath);
        return;
      }

      setCompanySlug(urlSlug);
    } else {
      // Dynamic route - get from router query
      const slugFromQuery = router.query.company_slug as string;
      if (slugFromQuery) {
        setCompanySlug(slugFromQuery);
      }
    }

    setIsValidating(false);
  }, [router.pathname, router.query, user]);

  return {
    companySlug,
    isValidating,
    userCompanySlug: user?.company_slug,
    isSuperAdmin: user?.active_role === "super_admin",
  };
}