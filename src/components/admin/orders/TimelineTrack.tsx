/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TimelineTrack -- the new 22-stage / 5-cluster order timeline UI.
 *
 * Wave 25 architecture: replaces the 7-dot row in /admin/orders with
 * a clustered band that surfaces every operational milestone (deposit
 * paid, hire flow, prep progress, dispatch, post-event collection,
 * cleaning, balance paid, thank-you sent). The data model lives in
 * src/services/order/orderTimeline.ts; this file is pure presentation.
 *
 * Design goals (logistics-specialist plan):
 *   - One pulsing dot per row, eye-line at arm's length
 *   - 5 visual cluster bands so the operator's macro glance reads
 *     "where in the lifecycle is this order"
 *   - Conditional stages collapse cleanly (n/a hidden behind chevron
 *     when the cluster is otherwise inactive)
 *   - Click-through to the artifact (deposit -> invoice page, prep ->
 *     kitchen list, etc.) via stage.sourceLink
 *   - Mobile: render the cluster pills + a single "Now" card; tap to
 *     expand into a vertical list
 *
 * This component is presentation-only. It receives an OrderTimeline
 * object and renders. Click handlers delegate to the Link href in
 * stage.sourceLink so server-side navigation doesn't need a callback.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, AlertCircle, ChevronDown } from "lucide-react";
import {
  type OrderTimeline,
  type OrderTimelineStage,
  type StageGroup,
  STAGE_GROUP_LABELS,
} from "@/services/order/orderTimeline";

interface TimelineTrackProps {
  timeline: OrderTimeline;
  /** When true, render the compact cluster-pill view (mobile). When
   *  false (default), render the full dot-band view. */
  compact?: boolean;
  /** Click handler for the parent card -- the timeline calls
   *  stopPropagation when a stage dot is clicked so the parent card
   *  doesn't open the order drawer at the same time. */
  onStageClick?: (stage: OrderTimelineStage) => void;
}

const CLUSTER_ORDER: StageGroup[] = [
  "booking",
  "logistics",
  "dispatch",
  "post_event",
  "closure",
];

// --- Stage dot --------------------------------------------------------------

function StageDot({
  stage,
  size = "default",
  onStageClick,
}: {
  stage: OrderTimelineStage;
  size?: "default" | "small";
  onStageClick?: (stage: OrderTimelineStage) => void;
}) {
  const isCompleted = stage.status === "completed";
  const isCurrent = stage.status === "current";
  const isBlocked = stage.status === "blocked";
  const isUpcoming = stage.status === "upcoming";

  const baseSize = size === "small" ? "w-2 h-2" : "w-3 h-3";
  const currentSize = size === "small" ? "w-4 h-4" : "w-6 h-6";

  const dotClasses = (() => {
    if (isCurrent) return `${currentSize} bg-orange-500 ring-4 ring-orange-100 animate-pulse`;
    if (isBlocked) return `${currentSize} bg-red-500 ring-4 ring-red-100 animate-pulse`;
    if (isCompleted) return `${baseSize} bg-emerald-500`;
    if (isUpcoming) return `${baseSize} bg-slate-300`;
    // skipped or n/a: faint dashed
    return `${baseSize} border border-dashed border-slate-300 bg-transparent opacity-40`;
  })();

  const Icon = isCompleted ? CheckCircle2 : isBlocked ? AlertCircle : isCurrent ? Clock : null;

  const tooltip = (() => {
    const lines: string[] = [stage.label];
    if (stage.meta?.progress) {
      lines.push(`${stage.meta.progress.done} of ${stage.meta.progress.total}`);
    }
    if (stage.meta?.actor) lines.push(stage.meta.actor);
    if (stage.meta?.expectedAt) {
      try {
        lines.push(`Due ${new Date(stage.meta.expectedAt).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`);
      } catch { /* ignore */ }
    }
    if (stage.completedAt) {
      try {
        lines.push(`Done ${new Date(stage.completedAt).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`);
      } catch { /* ignore */ }
    }
    if (stage.blockedReason) lines.push(`Blocked: ${stage.blockedReason}`);
    return lines.join(" • ");
  })();

  const dot = (
    <div
      className={`relative group inline-flex items-center justify-center rounded-full transition-all ${dotClasses}`}
      title={tooltip}
      aria-label={tooltip}
    >
      {Icon && size !== "small" && (
        <Icon className={isCurrent || isBlocked ? "w-3 h-3 text-white" : "w-2.5 h-2.5 text-white"} />
      )}
    </div>
  );

  // When the dot has a sourceLink and a meaningful status, wrap as a
  // link so click navigates to the source artifact. Stop propagation
  // so the parent row click doesn't also fire.
  if (stage.sourceLink && (isCurrent || isBlocked || isCompleted)) {
    return (
      <Link
        href={stage.sourceLink}
        onClick={(e) => {
          e.stopPropagation();
          onStageClick?.(stage);
        }}
        className="inline-flex"
      >
        {dot}
      </Link>
    );
  }
  return dot;
}

// --- Cluster band -----------------------------------------------------------

function ClusterBand({
  group,
  stages,
  onStageClick,
}: {
  group: StageGroup;
  stages: OrderTimelineStage[];
  onStageClick?: (stage: OrderTimelineStage) => void;
}) {
  // Filter out n/a stages; if everything is n/a, render a faint placeholder
  // so the cluster keeps a stable column width.
  const visible = stages.filter((s) => s.status !== "not_applicable");
  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 px-2 opacity-40">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          {STAGE_GROUP_LABELS[group]}
        </div>
        <div className="text-[10px] text-slate-400">n/a</div>
      </div>
    );
  }

  const allCompleted = visible.every((s) => s.status === "completed");
  const hasCurrent = visible.some((s) => s.status === "current");
  const hasBlocked = visible.some((s) => s.status === "blocked");

  const headerColor =
    allCompleted ? "text-emerald-600" :
    hasBlocked ? "text-red-600" :
    hasCurrent ? "text-orange-600" :
    "text-slate-500";

  return (
    <div className="flex flex-col items-center gap-1.5 px-2 min-w-0">
      <div className={`text-[9px] font-semibold uppercase tracking-wide ${headerColor}`}>
        {STAGE_GROUP_LABELS[group]}
      </div>
      <div className="flex items-center gap-1.5">
        {visible.map((s, idx) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <StageDot stage={s} onStageClick={onStageClick} />
            {idx < visible.length - 1 && (
              <div className={`h-px w-3 ${
                s.status === "completed" ? "bg-emerald-300" : "bg-slate-200"
              }`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Cluster pill (compact / mobile) ---------------------------------------

function ClusterPill({
  group,
  stages,
}: {
  group: StageGroup;
  stages: OrderTimelineStage[];
}) {
  const visible = stages.filter((s) => s.status !== "not_applicable");
  const total = visible.length;
  const done = visible.filter((s) => s.status === "completed").length;
  const hasBlocked = visible.some((s) => s.status === "blocked");
  const hasCurrent = visible.some((s) => s.status === "current");

  const tone = (() => {
    if (hasBlocked) return "bg-red-100 text-red-700 border-red-300";
    if (hasCurrent) return "bg-orange-100 text-orange-700 border-orange-300";
    if (total > 0 && done === total) return "bg-emerald-100 text-emerald-700 border-emerald-300";
    return "bg-slate-100 text-slate-500 border-slate-200";
  })();

  if (total === 0) return null;

  return (
    <div className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${tone}`}>
      {STAGE_GROUP_LABELS[group]} {done}/{total}
    </div>
  );
}

// --- Now card --------------------------------------------------------------

function NowCard({ stage }: { stage: OrderTimelineStage | null }) {
  if (!stage) return null;
  const tone =
    stage.status === "blocked"
      ? "border-red-300 bg-red-50 text-red-900"
      : stage.status === "current"
        ? "border-orange-300 bg-orange-50 text-orange-900"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${tone}`}>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
          {stage.status === "blocked" ? "Blocked" : "Now"}
        </div>
        <div className="text-sm font-semibold truncate">{stage.label}</div>
        {stage.blockedReason && (
          <div className="text-xs">{stage.blockedReason}</div>
        )}
        {!stage.blockedReason && stage.meta?.progress && (
          <div className="text-xs">
            {stage.meta.progress.done} of {stage.meta.progress.total}
          </div>
        )}
        {!stage.blockedReason && !stage.meta?.progress && stage.meta?.actor && (
          <div className="text-xs">{stage.meta.actor}</div>
        )}
      </div>
      {stage.sourceLink && (
        <Link
          href={stage.sourceLink}
          onClick={(e) => e.stopPropagation()}
          className="text-xs font-medium underline decoration-dotted hover:decoration-solid flex-shrink-0"
        >
          Open
        </Link>
      )}
    </div>
  );
}

// --- Main export ------------------------------------------------------------

export function TimelineTrack({ timeline, compact, onStageClick }: TimelineTrackProps) {
  const [expanded, setExpanded] = useState(false);

  const stagesByCluster = useMemo(() => {
    const map = new Map<StageGroup, OrderTimelineStage[]>();
    for (const g of CLUSTER_ORDER) map.set(g, []);
    for (const s of timeline.stages) {
      map.get(s.group)?.push(s);
    }
    return map;
  }, [timeline.stages]);

  const currentStage = useMemo(
    () => timeline.stages.find((s) => s.key === timeline.currentStageKey) || null,
    [timeline.stages, timeline.currentStageKey],
  );

  // --- Compact / mobile view ---
  if (compact) {
    return (
      <div className="space-y-2">
        <NowCard stage={currentStage} />
        <div className="flex flex-wrap items-center gap-1.5">
          {CLUSTER_ORDER.map((g) => (
            <ClusterPill key={g} group={g} stages={stagesByCluster.get(g) || []} />
          ))}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="ml-auto inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-800"
            aria-expanded={expanded}
            aria-label="Toggle full timeline"
          >
            {expanded ? "Hide" : "Show all"}
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
        {expanded && (
          <ul className="space-y-1.5 mt-2">
            {timeline.stages
              .filter((s) => s.status !== "not_applicable")
              .map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <StageDot stage={s} size="small" onStageClick={onStageClick} />
                    <span className={
                      s.status === "completed" ? "text-emerald-700 line-through opacity-70" :
                      s.status === "current" ? "text-orange-700 font-semibold" :
                      s.status === "blocked" ? "text-red-700 font-semibold" :
                      "text-slate-500"
                    }>{s.label}</span>
                  </div>
                  {s.completedAt && (
                    <span className="text-[10px] text-slate-400 tabular-nums">
                      {new Date(s.completedAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </li>
              ))}
          </ul>
        )}
      </div>
    );
  }

  // --- Full desktop view ---
  return (
    <div className="space-y-2">
      {/* Cluster band */}
      <div className="flex items-start gap-2 overflow-x-auto pb-1">
        {CLUSTER_ORDER.map((g, idx) => (
          <div key={g} className="flex items-start">
            <ClusterBand
              group={g}
              stages={stagesByCluster.get(g) || []}
              onStageClick={onStageClick}
            />
            {idx < CLUSTER_ORDER.length - 1 && (
              <div className="h-8 w-px bg-slate-200 self-center mx-1" />
            )}
          </div>
        ))}
      </div>
      {/* Inline current-stage label */}
      {currentStage && (
        <div className="flex items-center gap-2 text-xs">
          <span className={`font-medium ${
            currentStage.status === "blocked" ? "text-red-600" : "text-orange-600"
          }`}>
            {currentStage.status === "blocked" ? "Blocked:" : "Now:"}
          </span>
          <span className="text-slate-700 font-medium">{currentStage.label}</span>
          {currentStage.blockedReason && (
            <span className="text-red-600">— {currentStage.blockedReason}</span>
          )}
          {!currentStage.blockedReason && currentStage.meta?.progress && (
            <span className="text-slate-500">
              ({currentStage.meta.progress.done}/{currentStage.meta.progress.total})
            </span>
          )}
          {!currentStage.blockedReason && !currentStage.meta?.progress && currentStage.meta?.expectedAt && (
            <span className="text-slate-500">
              · expected {new Date(currentStage.meta.expectedAt).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {currentStage.sourceLink && (
            <Link
              href={currentStage.sourceLink}
              onClick={(e) => e.stopPropagation()}
              className="ml-auto text-blue-600 hover:underline"
            >
              Open →
            </Link>
          )}
        </div>
      )}
      {/* Bottom progress count */}
      <div className="text-[10px] text-slate-500 text-right">
        {timeline.completedCount} of {timeline.applicableCount} stages complete
      </div>
    </div>
  );
}
