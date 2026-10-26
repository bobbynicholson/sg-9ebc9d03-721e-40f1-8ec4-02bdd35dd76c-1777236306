import { KitchenNav } from "@/components/navigation/KitchenNav";
import {
  OPERATIONAL_HERO_CHIP,
  OperationalPortalPageShell,
  type OperationalPortalPageShellProps,
} from "@/components/portal/OperationalPortalPageShell";

export const KITCHEN_HERO_CHIP = OPERATIONAL_HERO_CHIP;

type KitchenPageShellProps = Omit<
  OperationalPortalPageShellProps,
  "navigation" | "switchBorderClassName" | "switchDescription"
>;

/** The kitchen portal's branded adapter to the shared staff-page frame. */
export function KitchenPageShell(props: KitchenPageShellProps) {
  return (
    <OperationalPortalPageShell
      {...props}
      navigation={<KitchenNav />}
      switchBorderClassName="border-amber-200/80 dark:border-slate-700"
      switchDescription="Move between your assigned portals without signing in again."
    />
  );
}
