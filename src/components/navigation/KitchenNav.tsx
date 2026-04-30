/**
 * KitchenNav -- thin wrapper around UnifiedSidebar.
 * Menu structure lives in navConfig.ts.
 */
import { UnifiedSidebar } from "@/components/navigation/UnifiedSidebar";
import { KITCHEN_NAV } from "@/config/navConfig";

interface KitchenNavProps {
  className?: string;
  companySlug?: string;
}

export function KitchenNav({ className: _className, companySlug: _companySlug }: KitchenNavProps = {}) {
  void _className;
  void _companySlug;
  return <UnifiedSidebar nav={KITCHEN_NAV} role="kitchen_staff" />;
}
