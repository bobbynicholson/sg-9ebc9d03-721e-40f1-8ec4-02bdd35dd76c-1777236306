/**
 * Header dropdown for the global region filter.
 *
 * Hides itself entirely when the tenant has only one branch - single-
 * branch operators should never see this control. When visible it
 * always offers an "All branches" option so a multi-branch admin can
 * widen back out without leaving the page.
 */
import { Building2, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRegionFilter } from "@/contexts/RegionFilterContext";

export function RegionFilterDropdown() {
  const { hasMultipleBranches, options, regionFilterId, setRegionFilterId } =
    useRegionFilter();

  if (!hasMultipleBranches) return null;

  const selected = options.find((o) => o.id === regionFilterId);
  const label = selected ? selected.name : "All branches";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-blue-400 hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
          aria-label="Filter by branch"
        >
          <Building2 className="w-3.5 h-3.5" />
          <span className="max-w-[7rem] truncate">{label}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuLabel className="text-xs">Filter by branch</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setRegionFilterId(null)}
          className="cursor-pointer"
        >
          <span className="flex-1">All branches</span>
          {regionFilterId === null && <Check className="w-4 h-4 text-blue-600" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onClick={() => setRegionFilterId(o.id)}
            className="cursor-pointer"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{o.name}</div>
              {o.address && (
                <div className="text-xs text-slate-500 truncate">{o.address}</div>
              )}
            </div>
            {regionFilterId === o.id && (
              <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
