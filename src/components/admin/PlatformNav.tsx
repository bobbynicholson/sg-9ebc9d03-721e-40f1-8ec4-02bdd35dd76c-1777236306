/**
 * PlatformNav -- thin wrapper around UnifiedSidebar.
 *
 * The ~600 lines of hand-rolled sidebar logic that used to live here
 * now lives in UnifiedSidebar; menu structure in navConfig.ts under
 * PLATFORM_NAV. Existing /admin/platform/* pages keep working without
 * any change to their imports.
 */
import { UnifiedSidebar } from "@/components/navigation/UnifiedSidebar";
import { PLATFORM_NAV } from "@/config/navConfig";

export function PlatformNav() {
  return <UnifiedSidebar nav={PLATFORM_NAV} role="super_admin" />;
}
