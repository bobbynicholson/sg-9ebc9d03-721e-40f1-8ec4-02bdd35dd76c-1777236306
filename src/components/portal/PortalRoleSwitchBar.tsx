import { ArrowLeftRight } from "lucide-react";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { useAuth } from "@/contexts/AuthContext";

interface PortalRoleSwitchBarProps {
  /** Border colour that keeps the bar aligned with the current portal. */
  borderClassName?: string;
  /** Short explanation shown beside the role picker. */
  description?: string;
}

/**
 * A deliberately visible role return point shared by every operational
 * portal. The sidebar still has the compact picker, but the bar means a
 * cross-trained operator never has to guess how to get back to another
 * assigned portal after switching here.
 */
export function PortalRoleSwitchBar({
  borderClassName = "border-slate-200/80 dark:border-slate-700",
  description = "Move between your assigned portals without signing in again.",
}: PortalRoleSwitchBarProps) {
  const { userRoles } = useAuth();

  if (userRoles.length <= 1) return null;

  return (
    <div className={`sticky top-0 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white/95 px-4 py-3 shadow-sm backdrop-blur dark:bg-slate-900/95 ${borderClassName}`}>
      <div className="flex min-w-0 items-start gap-2.5">
        <ArrowLeftRight className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" aria-hidden="true" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-primary">Switch portal</p>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{description}</p>
        </div>
      </div>
      <RoleSwitcher variant="default" showLabel />
    </div>
  );
}
