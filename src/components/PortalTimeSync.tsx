/**
 * Applies the signed-in company's time zone and time format
 * (Company profile > Region & currency) to every date / time the
 * portal shows - see src/lib/portalTime.ts.
 *
 * Mounted once in _app, before the page, and applied during render
 * (not in an effect) so the page's first render already uses them.
 * Signed out / no company: nothing is applied, times show as before.
 */
import { useAuth } from "@/contexts/AuthContext";
import { getPortalTimeSettings, setPortalTimeSettings } from "@/lib/portalTime";

export function PortalTimeSync() {
  const { company } = useAuth();
  const timeZone = ((company as any)?.timezone as string | null) || null;
  const timeFormat = ((company as any)?.time_format as string | null) || null;
  const current = getPortalTimeSettings();
  if (current.timeZone !== timeZone || current.timeFormat !== timeFormat) {
    setPortalTimeSettings({ timeZone, timeFormat });
  }
  return null;
}
