/**
 * OrderReadinessChip -- Wave 46 T2.
 *
 * Single full-width pill at the top of the order card. Replaces the
 * old "NEXT TO DO" banner. Shows the green/orange/red logistics
 * traffic light + headline + subhead for the most pressing missing
 * piece. Click the chevron to expand into the per-signal breakdown
 * (each row has a deep-link "Fix it" button).
 *
 * Bobby's "lovely vibe" register -- emerald for green, amber for
 * orange, rose for red. No "ACT NOW" alarmist copy. Goal is to make
 * Callum feel held, not policed.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, AlertCircle, ExternalLink } from "lucide-react";
import type { OrderReadiness, ReadinessSignal } from "@/services/order/orderReadiness";
import { useTenantHref } from "@/lib/tenantUrl";

const TONE: Record<OrderReadiness["chip"], {
  card: string;
  dot: string;
  label: string;
  Icon: any;
  pulse: string;
}> = {
  green: {
    card: "bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-500",
    label: "text-emerald-800",
    Icon: CheckCircle2,
    pulse: "",
  },
  orange: {
    card: "bg-amber-50 border-amber-200",
    dot: "bg-amber-500",
    label: "text-amber-800",
    Icon: AlertTriangle,
    pulse: "",
  },
  red: {
    card: "bg-rose-50 border-rose-300 ring-1 ring-rose-200",
    dot: "bg-rose-500",
    label: "text-rose-800",
    Icon: AlertCircle,
    pulse: "animate-pulse",
  },
};

interface Props {
  readiness: OrderReadiness;
  /** Optional click target for the headline -- typically opens the
   *  order detail drawer. */
  onOpen?: () => void;
}

export function OrderReadinessChip({ readiness, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const { withSlug } = useTenantHref();
  const tone = TONE[readiness.chip];
  const Icon = tone.Icon;
  const failingCount = readiness.failingHigh.length + readiness.failingMedium.length;

  return (
    <div className={`rounded-lg border ${tone.card} px-3 py-2 mb-2`}>
      {/* Headline row */}
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex w-7 h-7 rounded-full items-center justify-center shrink-0 ${tone.dot} ${tone.pulse}`}
          aria-hidden="true"
        >
          <Icon className="w-4 h-4 text-white" />
        </span>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold ${tone.label}`}>
            {readiness.headline}
          </div>
          <div className="text-xs text-slate-700 mt-0.5 truncate">
            {readiness.subhead}
          </div>
        </div>
        {onOpen && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            className="text-xs font-semibold flex-shrink-0 px-3 py-1.5 rounded-md text-slate-700 bg-white border border-slate-200 hover:bg-slate-50"
          >
            Open →
          </button>
        )}
        {failingCount > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-600 hover:bg-white/60 shrink-0"
            aria-label={open ? "Collapse details" : "Expand details"}
          >
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Expanded per-signal breakdown */}
      {open && failingCount > 0 && (
        <ul className="mt-2 space-y-1 border-t border-white/40 pt-2">
          {[...readiness.failingHigh, ...readiness.failingMedium].map((sig) => (
            <SignalRow key={sig.key} signal={sig} withSlug={withSlug} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SignalRow({
  signal,
  withSlug,
}: {
  signal: ReadinessSignal;
  withSlug: (href: string) => string;
}) {
  const dotTone = signal.severity === "high" ? "bg-rose-500" : "bg-amber-500";
  return (
    <li className="flex items-start gap-2 text-xs">
      <span className={`mt-1 inline-block w-1.5 h-1.5 rounded-full shrink-0 ${dotTone}`} aria-hidden="true" />
      <span className="flex-1 text-slate-800">{signal.message}</span>
      {signal.actionLink && (
        <Link
          href={withSlug(signal.actionLink)}
          onClick={(e) => e.stopPropagation()}
          scroll={false}
          className="text-xs font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-0.5 shrink-0"
        >
          Fix it <ExternalLink className="w-3 h-3" />
        </Link>
      )}
    </li>
  );
}
