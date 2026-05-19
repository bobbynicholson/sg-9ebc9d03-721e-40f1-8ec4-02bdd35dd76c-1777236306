/**
 * AddToCalendarButton - downloads a .ics file the user can drop
 * into Outlook / Google Calendar / Apple Calendar (CLI-I / CLI-29).
 *
 * Why a download instead of a deep link to each provider's "add
 * event" URL: a single .ics file works in every desktop + mobile
 * calendar, including offline. Provider deep links break when the
 * user is signed into a different Google account than the one their
 * calendar lives on - and there's no way to know that ahead of time.
 *
 * Generation runs in the browser via a Blob so the dashboard does
 * not need a network round-trip for a tiny text payload. The ICS
 * builder is the same pure module used server-side; see
 * lib/calendar/ics.ts.
 */
import { useCallback, useState } from "react";
import { CalendarPlus, Check } from "lucide-react";
import { buildEventIcs, type IcsEventInput } from "@/lib/calendar/ics";

export interface AddToCalendarButtonProps {
  /** Event metadata. Mirrors lib/calendar/ics.IcsEventInput. */
  event: IcsEventInput;
  /** Optional brand-coloured render. Falls back to a neutral chip. */
  brandPrimary?: string;
  /** Optional explicit text colour for brand variant (default: white). */
  brandText?: "white" | "black";
  /**
   * Visual variant:
   *   - "chip"  : pill-style, compact, used in past-event tiles
   *   - "ghost" : underlined link, used inside HeroCard header
   *   - "solid" : filled button, brand colour, default for primary spots
   */
  variant?: "chip" | "ghost" | "solid";
  /** Hide the leading icon when label needs to be terse. */
  hideIcon?: boolean;
  /** Override button label. Defaults to "Add to calendar". */
  label?: string;
  /** Extra Tailwind classes for the wrapper. */
  className?: string;
}

export function AddToCalendarButton({
  event,
  brandPrimary,
  brandText = "white",
  variant = "solid",
  hideIcon,
  label = "Add to calendar",
  className,
}: AddToCalendarButtonProps) {
  const [done, setDone] = useState(false);

  const onClick = useCallback(() => {
    const { ics, filename, mimeType } = buildEventIcs(event);
    // Blob URL works in every evergreen browser. Avoid data: URIs -
    // older Safari versions cap them at ~2MB and the download-
    // attribute behaviour is inconsistent.
    const blob = new Blob([ics], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }, [event]);

  const baseClasses =
    "inline-flex items-center gap-1.5 font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2";
  const variantClasses =
    variant === "solid"
      ? "px-4 py-3 rounded-lg min-h-11 shadow-sm hover:opacity-90"
      : variant === "chip"
        ? "px-3 py-2 rounded-full text-xs border min-h-9"
        : "px-2 py-1 text-sm underline-offset-2 hover:underline";

  const style =
    variant === "solid" && brandPrimary
      ? { background: brandPrimary, color: brandText }
      : variant === "chip" && brandPrimary
        ? { borderColor: brandPrimary, color: brandPrimary, background: "transparent" }
        : variant === "ghost" && brandPrimary
          ? { color: brandPrimary }
          : undefined;

  const fallbackClasses =
    !brandPrimary && variant === "solid"
      ? " bg-slate-900 text-white"
      : !brandPrimary && variant === "chip"
        ? " border-slate-300 text-slate-700"
        : !brandPrimary && variant === "ghost"
          ? " text-slate-700"
          : "";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClasses} ${variantClasses}${fallbackClasses}${className ? ` ${className}` : ""}`}
      style={style}
      aria-label={label}
    >
      {!hideIcon && (done ? <Check className="w-4 h-4" /> : <CalendarPlus className="w-4 h-4" />)}
      <span>{done ? "Downloaded" : label}</span>
    </button>
  );
}

export default AddToCalendarButton;
