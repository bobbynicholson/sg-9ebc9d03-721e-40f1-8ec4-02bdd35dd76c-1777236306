/**
 * ClientNav -- thin wrapper around UnifiedSidebar.
 * Menu structure lives in navConfig.ts.
 */
import { UnifiedSidebar } from "@/components/navigation/UnifiedSidebar";
import { CLIENT_NAV } from "@/config/navConfig";

export function ClientNav() {
  return <UnifiedSidebar nav={CLIENT_NAV} role="client" />;
}
