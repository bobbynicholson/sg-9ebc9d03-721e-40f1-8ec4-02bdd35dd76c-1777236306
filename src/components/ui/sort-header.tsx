/**
 * <SortHeader/> - click-to-sort table header cell.
 *
 * Pairs with the `useSortable` hook in lib/useSortable.ts. Renders the
 * label, an arrow that flips with the active direction, and dims when
 * the column is not the active sort key.
 *
 * Usage:
 *   const { rows, sortKey, sortDir, toggle } = useSortable(items, cols);
 *   <th>
 *     <SortHeader sortKey="name" activeKey={sortKey} activeDir={sortDir} onToggle={toggle}>
 *       Name
 *     </SortHeader>
 *   </th>
 */
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function SortHeader({
  sortKey, activeKey, activeDir, onToggle, children, className, align = "left",
}: {
  sortKey: string;
  activeKey: string;
  activeDir: "asc" | "desc";
  onToggle: (key: string) => void;
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  const active = sortKey === activeKey;
  const Icon = active ? (activeDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      className={cn(
        "group inline-flex items-center gap-1.5 select-none transition-colors",
        align === "right" ? "justify-end w-full" : align === "center" ? "justify-center w-full" : "",
        active ? "text-slate-900" : "text-slate-500 hover:text-slate-700",
        className,
      )}
      aria-sort={active ? (activeDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span>{children}</span>
      <Icon
        className={cn(
          "w-3 h-3 flex-shrink-0 transition-opacity",
          active ? "opacity-100" : "opacity-30 group-hover:opacity-70",
        )}
      />
    </button>
  );
}
