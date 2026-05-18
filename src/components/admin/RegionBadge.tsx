/**
 * Tiny pill that shows which branch a row belongs to.
 *
 * Single-branch tenants don't render anything (all rows belong to the
 * same place, the badge would be visual noise). Multi-branch tenants
 * see "CPT" / "JHB" / etc, sourced from regions.code or regions.name
 * via useCompanyKitchens.
 *
 * region_id IS NULL renders as "Company-wide" - legacy rows from
 * before Stage 0 propagation, which still need to surface and stay
 * editable until they're stamped.
 */
import { Building2 } from "lucide-react";
import { useRegionFilter } from "@/contexts/RegionFilterContext";

interface RegionBadgeProps {
  regionId: string | null | undefined;
  /** Show even when only one branch exists. Defaults to false. */
  alwaysShow?: boolean;
  className?: string;
}

export function RegionBadge({ regionId, alwaysShow, className }: RegionBadgeProps) {
  const { hasMultipleBranches, options } = useRegionFilter();

  if (!hasMultipleBranches && !alwaysShow) return null;

  const region = options.find((o) => o.id === regionId);
  const label = region?.name || (regionId ? "Branch" : "Company-wide");
  const tone = regionId
    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900"
    : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";

  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        tone,
        className || "",
      ].join(" ")}
      title={region?.address || label}
    >
      <Building2 className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}
