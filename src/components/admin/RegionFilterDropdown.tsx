/**
 * Header dropdown for the global region filter.
 *
 * Hides itself entirely when the tenant has only one branch - single-
 * branch operators should never see this control. When visible it
 * always offers an "All branches" option so a multi-branch admin can
 * widen back out without leaving the page.
 */
import { Building2, Check, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { useIsMobile } from "@/hooks/use-mobile";

export function RegionFilterDropdown() {
  const { hasMultipleBranches, options, regionFilterId, setRegionFilterId } =
    useRegionFilter();
  const isMobile = useIsMobile();
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isMobile || typeof document === "undefined") {
      setPortalContainer(null);
      return;
    }
    setPortalContainer(document.querySelector<HTMLElement>('[role="dialog"][data-state="open"]'));
  }, [isMobile]);

  if (!hasMultipleBranches) return null;

  const selected = options.find((o) => o.id === regionFilterId);
  const label = selected ? selected.name : "All branches";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:border-brand-primary/50 hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/70 dark:border-white/20 dark:bg-white/10 dark:text-white/90 dark:hover:border-white/35 dark:hover:bg-white/15 dark:hover:text-white dark:focus-visible:ring-white/80"
          aria-label="Filter by branch"
        >
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="max-w-28 truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent portalContainer={portalContainer} align="end" collisionPadding={12} className="max-h-[min(65dvh,var(--radix-dropdown-menu-content-available-height))] min-w-[14rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto border-slate-200 bg-white text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
        <DropdownMenuLabel className="text-xs">Filter by branch</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setRegionFilterId(null)}
          className="min-h-11 cursor-pointer"
        >
          <span className="flex-1">All branches</span>
          {regionFilterId === null && <Check className="w-4 h-4 text-blue-600" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onClick={() => setRegionFilterId(o.id)}
            className="min-h-11 cursor-pointer"
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
