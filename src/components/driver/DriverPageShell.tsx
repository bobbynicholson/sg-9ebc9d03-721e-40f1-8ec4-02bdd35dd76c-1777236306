import { useRouter } from "next/router";
import { DriverNav } from "@/components/navigation/DriverNav";
import { SittingTrips } from "./SittingTrips";
import {
  OperationalPortalPageShell,
  type OperationalPortalPageShellProps,
} from "@/components/portal/OperationalPortalPageShell";

type DriverPageShellProps = Omit<
  OperationalPortalPageShellProps,
  "navigation" | "switchBorderClassName" | "switchDescription"
>;

/** The driver portal's branded adapter to the shared staff-page frame. */
export function DriverPageShell({ children, ...props }: DriverPageShellProps) {
  const router = useRouter();
  const showSittingTrips = /\/(dashboard|deliveries|routes|schedule|calendar)$/.test(router.pathname);

  return (
    <OperationalPortalPageShell
      {...props}
      navigation={<DriverNav />}
      switchBorderClassName="border-blue-200/80 dark:border-slate-700"
      switchDescription="Move between your assigned portals without signing in again."
    >
      <>{showSittingTrips && <SittingTrips />}{children}</>
    </OperationalPortalPageShell>
  );
}
