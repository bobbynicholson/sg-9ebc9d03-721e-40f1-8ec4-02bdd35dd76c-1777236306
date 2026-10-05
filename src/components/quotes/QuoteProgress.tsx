import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Quote journey at a glance: Created -> Sent -> Viewed -> Accepted -> Booked.
 * Pure presentation over fields already on the quote row; nothing is
 * fetched or written here. A rejected or expired quote ends the line in red.
 */
export interface QuoteProgressProps {
  status: string | null | undefined;
  createdAt?: string | null;
  sentAt?: string | null;
  viewedAt?: string | null;
  acceptedAt?: string | null;
  bookedAt?: string | null;
  /** True once the quote has become an order. */
  booked?: boolean;
  /** Client-facing wording ("You viewed", "You accepted"). */
  audience?: "staff" | "client";
  className?: string;
}

type StepState = "done" | "current" | "upcoming" | "failed";

function fmt(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

export function QuoteProgress({
  status,
  createdAt,
  sentAt,
  viewedAt,
  acceptedAt,
  bookedAt,
  booked = false,
  audience = "staff",
  className,
}: QuoteProgressProps) {
  const s = String(status || "draft").toLowerCase();
  const rejected = s === "rejected" || s === "declined" || s === "lost";
  const expired = s === "expired";
  const accepted = s === "accepted" || !!acceptedAt || booked;
  const viewed = !!viewedAt || accepted || s === "viewed";
  const sent = !!sentAt || viewed || s === "sent";
  const client = audience === "client";

  const reached = [true, sent, viewed, accepted, booked];
  const steps = [
    { label: client ? "Prepared" : "Created", at: createdAt },
    { label: "Sent", at: sentAt },
    { label: client ? "You viewed" : "Viewed by client", at: viewedAt },
    { label: client ? "You accepted" : "Accepted", at: acceptedAt },
    { label: client ? "Booked" : "Booked as order", at: bookedAt },
  ];
  // First unreached step is "current"; a lost/expired quote fails there.
  const firstOpen = reached.findIndex((r) => !r);
  const states: StepState[] = reached.map((r, i) => {
    if (r) return "done";
    if (i === firstOpen) return rejected || expired ? "failed" : "current";
    return "upcoming";
  });
  const failLabel = rejected ? (client ? "Declined" : "Declined by client") : expired ? "Expired" : null;

  return (
    <ol className={cn("flex w-full items-start", className)} aria-label="Quote progress">
      {steps.map((step, i) => {
        const state = states[i];
        const allBeforeDone = i > 0 && states.slice(0, i).every((x) => x === "done");
        const label = state === "failed" && failLabel ? failLabel : step.label;
        const date = state === "done" ? fmt(step.at) : null;
        return (
          <li key={step.label} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
            {i > 0 && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-[15px] h-[3px] rounded-full",
                  allBeforeDone && state !== "upcoming" ? "bg-emerald-500" : "bg-slate-200",
                )}
                style={{ left: "calc(-50% + 18px)", right: "calc(50% + 18px)" }}
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold",
                state === "done" && "border-emerald-500 bg-emerald-500 text-white",
                state === "current" && "border-orange-500 bg-white text-orange-600 ring-4 ring-orange-100",
                state === "failed" && "border-rose-500 bg-rose-500 text-white ring-4 ring-rose-100",
                state === "upcoming" && "border-slate-300 bg-white text-slate-400",
              )}
            >
              {state === "done" ? <CheckCircle2 className="h-4 w-4" /> : state === "failed" ? <XCircle className="h-4 w-4" /> : i + 1}
            </span>
            <span
              className={cn(
                "mt-1.5 px-0.5 text-[11px] font-semibold leading-tight sm:text-xs",
                state === "done" && "text-slate-900",
                state === "current" && "text-orange-700",
                state === "failed" && "text-rose-700",
                state === "upcoming" && "text-slate-400",
              )}
            >
              {label}
            </span>
            <span className="text-[10px] tabular-nums text-slate-500">
              {date || (state === "current" ? (client ? "Waiting on you" : "Waiting") : "")}
            </span>
            <span className="sr-only">
              {label}: {state === "done" ? "done" : state === "current" ? "in progress" : state === "failed" ? "stopped" : "not yet"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
