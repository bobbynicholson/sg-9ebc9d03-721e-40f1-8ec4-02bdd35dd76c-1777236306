/**
 * DriverNav -- thin wrapper around UnifiedSidebar.
 *
 * The hand-rolled mobile/desktop/collapse logic that used to live in this
 * file now lives in UnifiedSidebar. Menu structure is in navConfig.ts.
 * Existing pages keep working without changes.
 */
import { UnifiedSidebar } from "@/components/navigation/UnifiedSidebar";
import { DRIVER_NAV } from "@/config/navConfig";

interface DriverNavProps {
  className?: string;
  companySlug?: string;
}

export function DriverNav({ className: _className, companySlug: _companySlug }: DriverNavProps = {}) {
  // Props kept for backwards compatibility -- driver routes are not
  // slug-scoped today, and class overrides aren't relevant on the
  // shared component.
  void _className;
  void _companySlug;
  return <UnifiedSidebar nav={DRIVER_NAV} role="driver" />;
}
