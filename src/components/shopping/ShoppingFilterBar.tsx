/**
 * On-demand filter bar for shopping list pages - the same pattern as the
 * kitchen Stock and Recipes pages: the list stays the focus, filters open
 * when needed, and any active filter is summarised while closed.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PortalCard } from "@/components/portal/ui";

interface ShoppingFilterBarProps {
  title: string;
  /** Shown when no filter is active. */
  idleHint: string;
  activeCount: number;
  /** e.g. "12 suppliers shown" - shown next to the active count. */
  shownLabel: string;
  children: ReactNode;
  className?: string;
  id?: string;
  /** Chat-assistant anchor (data-chat-section) kept on the card. */
  chatSection?: string;
  chatSectionLabel?: string;
}

export function ShoppingFilterBar({
  title, idleHint, activeCount, shownLabel, children, className, id, chatSection, chatSectionLabel,
}: ShoppingFilterBarProps) {
  const [open, setOpen] = useState(false);
  return (
    <PortalCard id={id} data-chat-section={chatSection} data-chat-section-label={chatSectionLabel} padded={false} className={`mb-6 border-brand-primary/15 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {activeCount > 0
              ? `${activeCount} filter${activeCount === 1 ? "" : "s"} active · ${shownLabel}`
              : idleHint}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={open ? "outline" : "default"}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="h-9 shrink-0 gap-1.5"
        >
          {open ? "Hide filters" : "Open filters"}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </div>
      {open && (
        <div className="flex flex-col gap-3 border-t border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:p-5">
          {children}
        </div>
      )}
    </PortalCard>
  );
}
