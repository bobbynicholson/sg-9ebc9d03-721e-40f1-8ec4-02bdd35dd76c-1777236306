import { useState } from "react";
import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface InfoTooltipProps {
  /**
   * Tooltip text. Split paragraphs with a blank line ("\n\n") -- each paragraph
   * renders on its own line so longer explanations stay scannable.
   */
  content: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

/**
 * Hover (desktop) + tap (mobile) tooltip used next to KPIs, table headers,
 * and section titles to explain what a number means and where it comes from.
 *
 * - On desktop: hovers open after a 200ms delay, just like a normal tooltip.
 * - On mobile / touch: tap the (i) icon to toggle, since hover doesn't exist.
 * - Width clamps to 90vw on small screens so the bubble never overflows the
 *   viewport, and caps at 22rem on bigger screens so a long explanation
 *   stays readable instead of running across the whole window.
 */
export function InfoTooltip({ content, side = "top", className = "" }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const paragraphs = content.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="More info"
            className={`inline-flex items-center justify-center text-slate-400 hover:text-slate-600 focus-visible:text-slate-700 focus-visible:outline-none transition-colors ${className}`}
            onClick={(e) => {
              // Toggle on click so the tooltip works on touch devices where
              // hover doesn't exist. Stop propagation so the click never
              // bubbles into the surrounding card / link.
              e.preventDefault();
              e.stopPropagation();
              setOpen((prev) => !prev);
            }}
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          collisionPadding={12}
          className="max-w-[min(90vw,22rem)] whitespace-normal break-words bg-slate-900 text-white px-3 py-2 leading-relaxed shadow-lg"
        >
          <div className="space-y-2 text-sm">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
