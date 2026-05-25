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

const ACCENTS: Record<SectionAccent, { bar: string; ring: string; bg: string; text: string }> = {
  slate:   { bar: "bg-slate-400",   ring: "ring-slate-200",   bg: "bg-white",         text: "text-slate-900" },
  orange:  { bar: "bg-orange-500",  ring: "ring-orange-200",  bg: "bg-orange-50/40",  text: "text-orange-900" },
  emerald: { bar: "bg-emerald-500", ring: "ring-emerald-200", bg: "bg-emerald-50/40", text: "text-emerald-900" },
  indigo:  { bar: "bg-indigo-500",  ring: "ring-indigo-200",  bg: "bg-indigo-50/40",  text: "text-indigo-900" },
  amber:   { bar: "bg-amber-500",   ring: "ring-amber-200",   bg: "bg-amber-50/40",   text: "text-amber-900" },
  purple:  { bar: "bg-purple-500",  ring: "ring-purple-200",  bg: "bg-purple-50/40",  text: "text-purple-900" },
  cyan:    { bar: "bg-cyan-500",    ring: "ring-cyan-200",    bg: "bg-cyan-50/40",    text: "text-cyan-900" },
  rose:    { bar: "bg-rose-500",    ring: "ring-rose-200",    bg: "bg-rose-50/40",    text: "text-rose-900" },
  blue:    { bar: "bg-blue-500",    ring: "ring-blue-200",    bg: "bg-blue-50/40",    text: "text-blue-900" },
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
      <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${a.bar}`} aria-hidden />
      <button
        type="button"
        onClick={() => { if (!forceOpen) setOpen((v) => !v); }}
        disabled={forceOpen}
        className={`w-full text-left flex items-start justify-between gap-3 p-4 sm:p-5 ${forceOpen ? "cursor-default" : "hover:bg-slate-50/60"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1`}
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
