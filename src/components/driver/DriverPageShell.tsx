import { useRouter } from "next/router";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useDriverGPSPing } from "@/hooks/useDriverGPSPing";
import { DriverNav } from "@/components/navigation/DriverNav";
import { SittingTrips } from "./SittingTrips";
import {
  OperationalPortalPageShell,
  type OperationalPortalPageShellProps,
} from "@/components/portal/OperationalPortalPageShell";

type DriverPageShellProps = Omit<
  OperationalPortalPageShellProps,
  "navigation" | "switchBorderClassName" | "switchDescription"
> & { gpsEnabled?: boolean };

/** The driver portal's branded adapter to the shared staff-page frame. */
export function DriverPageShell({ children, gpsEnabled = true, ...props }: DriverPageShellProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { activeTrip, isTracking, lastError, lastPingAt } = useDriverGPSPing(gpsEnabled ? user?.id ?? null : null);
  const showSittingTrips = /\/(dashboard|deliveries|routes|schedule|calendar)$/.test(router.pathname);

  return (
    <OperationalPortalPageShell
      {...props}
      navigation={<DriverNav />}
      switchBorderClassName="border-blue-200/80 dark:border-slate-700"
      switchDescription="Move between your assigned portals without signing in again."
    >
      <>
        {(activeTrip || lastError) && gpsEnabled && (
          <div className="mx-auto mb-3 flex w-full max-w-screen-2xl flex-wrap items-center gap-2 px-3 sm:px-5">
            <Badge className={activeTrip && isTracking && !lastError
              ? "border-brand-primary/20 bg-brand-primary/10 text-brand-primary"
              : "border-amber-200 bg-amber-50 text-amber-800"}>
              <MapPin className="mr-1 h-3 w-3" />
              {activeTrip
                ? isTracking && !lastError ? "GPS saved to this trip" : "Trip timer running · GPS needs attention"
                : "Could not check the active trip timer"}
              {lastPingAt ? ` · last ping ${new Date(lastPingAt).toLocaleTimeString()}` : ""}
            </Badge>
            {lastError && <span className="text-xs text-amber-800">{lastError}</span>}
          </div>
        )}
        {showSittingTrips && <SittingTrips />}
        {children}
      </>
    </OperationalPortalPageShell>
  );
}
