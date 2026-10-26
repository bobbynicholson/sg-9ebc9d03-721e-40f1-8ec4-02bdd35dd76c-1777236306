import { ShoppingNav } from "@/components/navigation/ShoppingNav";
import {
  OPERATIONAL_HERO_CHIP,
  OperationalPortalPageShell,
  type OperationalPortalPageShellProps,
} from "@/components/portal/OperationalPortalPageShell";

export const SHOPPING_HERO_CHIP = OPERATIONAL_HERO_CHIP;

type ShoppingPageShellProps = Omit<
  OperationalPortalPageShellProps,
  "navigation" | "switchBorderClassName" | "switchDescription"
>;

/** The shopping portal's branded adapter to the shared staff-page frame. */
export function ShoppingPageShell(props: ShoppingPageShellProps) {
  return (
    <OperationalPortalPageShell
      {...props}
      navigation={<ShoppingNav />}
      switchBorderClassName="border-emerald-200/80 dark:border-slate-700"
      switchDescription="Move between your assigned portals without signing in again."
    />
  );
}
