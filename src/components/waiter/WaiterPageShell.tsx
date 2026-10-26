import { WaiterNav } from "@/components/navigation/WaiterNav";
import {
  OPERATIONAL_HERO_CHIP,
  OperationalPortalPageShell,
  type OperationalPortalPageShellProps,
} from "@/components/portal/OperationalPortalPageShell";

export const WAITER_HERO_CHIP = OPERATIONAL_HERO_CHIP;

type WaiterPageShellProps = Omit<
  OperationalPortalPageShellProps,
  "navigation" | "switchBorderClassName" | "switchDescription"
>;

/** The waiter portal's branded adapter to the shared staff-page frame. */
export function WaiterPageShell(props: WaiterPageShellProps) {
  return (
    <OperationalPortalPageShell
      {...props}
      navigation={<WaiterNav />}
      switchBorderClassName="border-cyan-200/80 dark:border-slate-700"
      switchDescription="Move between your assigned portals without signing in again."
    />
  );
}
