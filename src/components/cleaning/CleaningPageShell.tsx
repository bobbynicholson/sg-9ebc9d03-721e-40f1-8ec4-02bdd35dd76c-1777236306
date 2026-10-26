import { CleaningNav } from "@/components/navigation/CleaningNav";
import {
  OPERATIONAL_HERO_CHIP,
  OperationalPortalPageShell,
  type OperationalPortalPageShellProps,
} from "@/components/portal/OperationalPortalPageShell";

export const CLEANING_HERO_CHIP = OPERATIONAL_HERO_CHIP;

type CleaningPageShellProps = Omit<
  OperationalPortalPageShellProps,
  "navigation" | "switchBorderClassName" | "switchDescription"
>;

/** The cleaning portal's branded adapter to the shared staff-page frame. */
export function CleaningPageShell(props: CleaningPageShellProps) {
  return (
    <OperationalPortalPageShell
      {...props}
      navigation={<CleaningNav />}
      switchBorderClassName="border-violet-200/80 dark:border-slate-700"
      switchDescription="Move between your assigned portals without signing in again."
    />
  );
}
