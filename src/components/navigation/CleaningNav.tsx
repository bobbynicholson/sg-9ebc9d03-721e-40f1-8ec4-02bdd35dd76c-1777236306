/**
 * CleaningNav -- thin wrapper around UnifiedSidebar.
 * Menu structure lives in navConfig.ts.
 */
import { UnifiedSidebar } from "@/components/navigation/UnifiedSidebar";
import { CLEANING_NAV } from "@/config/navConfig";

interface CleaningNavProps {
  className?: string;
  companySlug?: string;
}

export function CleaningNav({ className: _className, companySlug: _companySlug }: CleaningNavProps = {}) {
  void _className;
  void _companySlug;
  return <UnifiedSidebar nav={CLEANING_NAV} role="cleaning_staff" />;
}
