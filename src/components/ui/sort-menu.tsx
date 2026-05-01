/**
 * <SortMenu/> -- compact "Sort by" dropdown for card-grid pages.
 *
 * Tables get clickable column headers (see SortHeader). Card-grid
 * pages don't have headers to click, so they pair this dropdown with
 * the same useSortable hook to expose every sortable field.
 *
 * Usage:
 *   const { rows, sortKey, sortDir, setSort } = useSortable(items, cols);
 *   <SortMenu
 *     options={[
 *       { key: "name",  label: "Name (A-Z)", dir: "asc"  },
 *       { key: "name",  label: "Name (Z-A)", dir: "desc" },
 *       { key: "price", label: "Price (high to low)", dir: "desc" },
 *       { key: "price", label: "Price (low to high)", dir: "asc"  },
 *     ]}
 *     activeKey={sortKey}
 *     activeDir={sortDir}
 *     onPick={setSort}
 *   />
 */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Check } from "lucide-react";

export interface SortMenuOption {
  key: string;
  dir: "asc" | "desc";
  label: string;
}

export function SortMenu({
  options, activeKey, activeDir, onPick, label = "Sort by",
}: {
  options: SortMenuOption[];
  activeKey: string;
  activeDir: "asc" | "desc";
  onPick: (key: string, dir: "asc" | "desc") => void;
  label?: string;
}) {
  const active = options.find((o) => o.key === activeKey && o.dir === activeDir);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span className="text-xs">{active?.label || label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-slate-500">
          {label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((opt) => {
          const isActive = opt.key === activeKey && opt.dir === activeDir;
          return (
            <DropdownMenuItem
              key={`${opt.key}-${opt.dir}`}
              onSelect={() => onPick(opt.key, opt.dir)}
              className="cursor-pointer flex items-center justify-between"
            >
              <span>{opt.label}</span>
              {isActive && <Check className="w-3.5 h-3.5 text-emerald-600" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
