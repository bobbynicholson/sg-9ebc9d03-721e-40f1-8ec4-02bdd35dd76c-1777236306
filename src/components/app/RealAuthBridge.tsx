import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { TenantBrandingApplier } from "@/components/TenantBrandingApplier";
import type { AuthContextType } from "@/contexts/authContextCore";

function Reporter({ onChange }: { onChange: (value: AuthContextType) => void }) {
  const value = useAuth();
  useEffect(() => {
    onChange(value);
  }, [value, onChange]);
  return null;
}

/**
 * The real AuthProvider (and the tenant branding it drives), mounted BESIDE
 * a marketing page rather than around it, so loading it never remounts the
 * page. Every auth change is reported up to MarketingAuthProvider, which
 * hands it to the page through the shared auth context.
 */
export function RealAuthBridge({ onChange }: { onChange: (value: AuthContextType) => void }) {
  return (
    <AuthProvider>
      <TenantBrandingApplier />
      <Reporter onChange={onChange} />
    </AuthProvider>
  );
}
