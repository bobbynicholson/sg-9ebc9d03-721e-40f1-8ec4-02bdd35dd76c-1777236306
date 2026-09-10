/**
 * ODOC: shared collapsible wrapper for every OrderDocument section.
 *
 * Behaviour:
 * - When `forceOpen` (print mode), the section is open + the toggle
 *   button is hidden.
 * - When `defaultOpen`, the section starts expanded - typically true
 *   for the viewer's "own" role section.
 * - Otherwise the section renders as a one-line summary that expands
 *   on tap. Mobile defaults non-relevant sections to collapsed.
 * - `accent` controls the left-edge stripe tint per section type
 *   so the eye finds its lane fast on a long document.
 */
import { ReactNode, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

export type SectionAccent = "slate" | "orange" | "emerald" | "indigo" | "amber" | "purple" | "cyan" | "rose" | "blue";

const neutralAccent = {
  bar: "bg-slate-300",
  ring: "ring-brand-primary/20",
  bg: "bg-white",
  text: "text-slate-900",
};

const ACCENTS: Record<SectionAccent, { bar: string; ring: string; bg: string; text: string }> = {
  slate: neutralAccent,
  orange: neutralAccent,
  emerald: neutralAccent,
  indigo: neutralAccent,
  amber: neutralAccent,
  purple: neutralAccent,
  cyan: neutralAccent,
  rose: neutralAccent,
  blue: neutralAccent,
};

export function CollapsibleSection({
  id,
  title,
  summary,
  icon: Icon,
  accent = "slate",
  defaultOpen = false,
  forceOpen = false,
  highlight = false,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: SectionAccent;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  highlight?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = forceOpen || open;
  const a = ACCENTS[accent];
  const bar = highlight ? "bg-brand-primary" : a.bar;

  // ODOC: open this section when an explicit expand event targets
  // it (chip tap in the anchor nav). Decoupled via a custom event
  // so we don't conflate this with IntersectionObserver hash
  // updates that fire on plain scroll.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onExpand = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      if (detail?.id === id) setOpen(true);
    };
    window.addEventListener("odoc:expand-section", onExpand as EventListener);
    // On first mount, honour a hash that targets this section -
    // covers deep-links like /order/abc#section-driver.
    const initialHash = window.location.hash.replace(/^#/, "");
    if (initialHash === id) setOpen(true);
    return () => window.removeEventListener("odoc:expand-section", onExpand as EventListener);
  }, [id]);
  return (
    <section
      id={id}
      // ODOC Wave D: scroll-margin-top so anchor scroll clears the
      // sticky nav (72px on mobile incl. safe-area, 64px desktop).
      style={{ scrollMarginTop: "72px" }}
      className={`relative rounded-xl border bg-white shadow-sm overflow-hidden scroll-mt-[72px] ${highlight ? `ring-2 ring-offset-1 ${a.ring}` : ""}`}
    >
      {/* Coloured left stripe so the eye locates the section type at a glance */}
      <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${bar}`} aria-hidden />
      <button
        type="button"
        onClick={() => { if (!forceOpen) setOpen((v) => !v); }}
        disabled={forceOpen}
        className={`w-full text-left flex items-start justify-between gap-3 p-4 sm:p-5 ${forceOpen ? "cursor-default" : "hover:bg-slate-50/60"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1`}
        aria-expanded={isOpen}
        aria-controls={`${id}-body`}
      >
        <div className="min-w-0 flex-1 pl-3">
          <h2 className={`text-base sm:text-lg font-semibold ${a.text} flex items-center gap-2`}>
            {Icon && <Icon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />}
            {title}
          </h2>
          {summary && !isOpen && (
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate">{summary}</p>
          )}
        </div>
        {!forceOpen && (
          <ChevronDown
            className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {isOpen && (
        <div id={`${id}-body`} className={`px-4 sm:px-5 pb-5 pl-7 sm:pl-8 ${a.bg}`}>{children}</div>
      )}
    </section>
  );
}
