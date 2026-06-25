/**
 * ComposeDrawerHost - shared resizable right-edge drawer for compose UIs.
 *
 * Shared between the Quote Management Compose drawer and the Lead
 * Management compose drawer so both surfaces behave the same:
 *   - Slides in from the right.
 *   - Default width is 60% of the viewport, clamped to 480..1280.
 *   - Drag handle on the left edge resizes the drawer; width persists
 *     to sessionStorage under "compose_drawer_w" so it survives between
 *     opens within the same session.
 *
 * The host component is intentionally dumb: pass in the contents and it
 * handles the chrome. Pair with <MessageComposer/> for the actual form.
 */
import { useEffect, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_W = 480;
const MAX_W = 1280;
const DEFAULT_FRAC = 0.6;
const STORAGE_KEY = "compose_drawer_w";

export function ComposeDrawerHost({
  open, onClose, children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const initialWidth = () => {
    if (typeof window === "undefined") return 800;
    const stored = Number(window.sessionStorage.getItem(STORAGE_KEY) || "0");
    if (stored >= MIN_W && stored <= MAX_W) return stored;
    return Math.min(MAX_W, Math.max(MIN_W, Math.round(window.innerWidth * DEFAULT_FRAC)));
  };

  const [width, setWidth] = useState<number>(800);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (open) setWidth(initialWidth());
  }, [open]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      // Drag handle is on the left edge of the drawer; the drawer itself
      // sits on the right edge of the viewport. New width = distance from
      // mouse to the right edge.
      const next = Math.min(MAX_W, Math.max(MIN_W, window.innerWidth - e.clientX));
      setWidth(next);
    };
    const onUp = () => {
      setDragging(false);
      try {
        window.sessionStorage.setItem(STORAGE_KEY, String(width));
      } catch { /* ignore */ }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [dragging, width]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="p-0 sm:max-w-none flex flex-col"
        style={{ width: `${width}px`, maxWidth: "100vw" }}
      >
        {/* Drag handle on the left edge. Hover surfaces the grip; while
            dragging the bar lights up emerald to mirror the brand. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize compose drawer"
          onMouseDown={(e) => { e.preventDefault(); setDragging(true); }}
          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize group hover:bg-brand-primary/15"
          style={{ zIndex: 60 }}
        >
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 left-0 w-1.5 h-16 rounded-r-lg transition-colors",
              dragging ? "bg-brand-primary" : "bg-slate-200 group-hover:bg-brand-primary/70",
            )}
          />
          <GripVertical
            className={cn(
              "absolute top-1/2 -translate-y-1/2 left-0 w-3 h-3",
              dragging ? "text-brand-primary" : "text-slate-400 opacity-0 group-hover:opacity-100",
            )}
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pl-8 py-6">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
