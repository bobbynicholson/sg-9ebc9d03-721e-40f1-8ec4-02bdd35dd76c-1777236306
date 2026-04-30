/**
 * ShoppingNav -- thin wrapper around UnifiedSidebar.
 * Menu structure lives in navConfig.ts.
 */
import { UnifiedSidebar } from "@/components/navigation/UnifiedSidebar";
import { SHOPPING_NAV } from "@/config/navConfig";

interface ShoppingNavProps {
  className?: string;
  companySlug?: string;
}

export function ShoppingNav({ className: _className, companySlug: _companySlug }: ShoppingNavProps = {}) {
  void _className;
  void _companySlug;
  return <UnifiedSidebar nav={SHOPPING_NAV} role="shopping_staff" />;
}
