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
import { useTenantHref } from "@/lib/tenantUrl";

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
  withSlug,
}: {
  stage: OrderTimelineStage;
  size?: "default" | "small";
  onStageClick?: (stage: OrderTimelineStage) => void;
  /** Wave 26.1: tenant-slug wrapper from useTenantHref(). When the
   *  current user is on /spit-braai-delivery/admin/..., every Link
   *  href stays inside that namespace -- a stage dot pointing at
   *  /admin/orders?orderId=X gets rendered as
   *  /spit-braai-delivery/admin/orders?orderId=X. Passed by the
   *  parent because hooks can only run inside a React component, not
   *  inside a render-helper sub-function. */
  withSlug: (href: string) => string;
}) {
  const isCompleted = stage.status === "completed";
  const isCurrent = stage.status === "current";
  const isBlocked = stage.status === "blocked";
  const isUpcoming = stage.status === "upcoming";

  // Wave 25.1 polish: bumped completed dots up so the "done" track is
  // legible at glance distance (4px was barely a pixel cluster).
  // Current/blocked dots stay larger and pulse so they're the
  // unambiguous focus of the eye.
  const baseSize = size === "small" ? "w-2.5 h-2.5" : "w-4 h-4";
  const currentSize = size === "small" ? "w-4 h-4" : "w-7 h-7";

  // Logistics-spec colour rules: green = done, orange = next to do,
  // red = problem. green-500 (not emerald-500) is the unambiguous
  // hospital-cross green; emerald reads as teal which muddied the
  // signal in the live spit-braai walkthrough.
  const dotClasses = (() => {
    if (isCurrent) return `${currentSize} bg-orange-500 ring-4 ring-orange-100 animate-pulse shadow-md shadow-orange-200`;
    if (isBlocked) return `${currentSize} bg-red-500 ring-4 ring-red-100 animate-pulse shadow-md shadow-red-200`;
    if (isCompleted) return `${baseSize} bg-green-500 shadow-sm`;
    if (isUpcoming) return `${baseSize} bg-slate-300`;
    // skipped or n/a: rendered as a 0-size element so the layout
    // stays tight without faint visual noise. n/a stages are filtered
    // out at the cluster level too.
    return "w-0 h-0 hidden";
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
        href={withSlug(stage.sourceLink)}
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
  withSlug,
}: {
  group: StageGroup;
  stages: OrderTimelineStage[];
  onStageClick?: (stage: OrderTimelineStage) => void;
  withSlug: (href: string) => string;
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
    allCompleted ? "text-green-600" :
    hasBlocked ? "text-red-600" :
    hasCurrent ? "text-orange-600" :
    "text-slate-500";

  return (
    <div className="flex flex-col items-center gap-1.5 px-2 min-w-0">
      <div className={`text-[9px] font-semibold uppercase tracking-wide ${headerColor}`}>
        {STAGE_GROUP_LABELS[group]}
      </div>
      <div className="flex items-center gap-2">
        {visible.map((s, idx) => {
          // Wave 25.1: connector colour follows the stage transition.
          // Green when the previous stage is done (it's a finished leg
          // of the track); orange when the previous stage is current
          // (the pipe leading INTO the next dot, hinting at "what's
          // up next"); red when blocked; otherwise neutral grey.
          const next = visible[idx + 1];
          const connectorClass = !next
            ? ""
            : s.status === "completed" && next.status === "completed"
              ? "bg-green-500"
              : s.status === "completed" && (next.status === "current" || next.status === "blocked")
                ? "bg-gradient-to-r from-green-500 to-orange-400"
                : s.status === "current"
                  ? "bg-gradient-to-r from-orange-400 to-slate-200"
                  : s.status === "blocked"
                    ? "bg-red-300"
                    : "bg-slate-200";
          return (
            <div key={s.key} className="flex items-center gap-2">
              <StageDot stage={s} onStageClick={onStageClick} withSlug={withSlug} />
              {next && (
                <div className={`h-0.5 w-4 rounded-full ${connectorClass}`} />
              )}
            </div>
          );
        })}
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
    if (total > 0 && done === total) return "bg-green-100 text-green-700 border-green-300";
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

function NowCard({ stage, withSlug }: { stage: OrderTimelineStage | null; withSlug: (href: string) => string }) {
  if (!stage) return null;
  const tone =
    stage.status === "blocked"
      ? "border-red-300 bg-red-50 text-red-900"
      : stage.status === "current"
        ? "border-orange-300 bg-orange-50 text-orange-900"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`flex items-center justify-between gap-2 rounded-md border-l-4 border-y border-r px-3 py-2 ${tone}`}>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">
          {stage.status === "blocked" ? "Blocked" : "Next to do"}
        </div>
        <div className="text-sm font-semibold truncate">{stage.label}</div>
        {stage.blockedReason && (
          <div className="text-xs font-medium">{stage.blockedReason}</div>
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
          href={withSlug(stage.sourceLink)}
          onClick={(e) => e.stopPropagation()}
          // Wave 28.8: query-only nav was scrolling to top because
          // next/link defaults scroll:true. The /admin/orders page
          // adopts the orderId query param to open the drawer in-place.
          scroll={false}
          className="text-xs font-semibold underline decoration-dotted hover:decoration-solid flex-shrink-0"
        >
          Open →
        </Link>
      )}
    </div>
  );
}

// --- Main export ------------------------------------------------------------

export function TimelineTrack({ timeline, compact, onStageClick }: TimelineTrackProps) {
  const [expanded, setExpanded] = useState(false);
  // Wave 26.1: tenant-slug wrapper for every Link the timeline
  // renders. The user on /spit-braai-delivery/admin/orders should
  // click a stage dot and stay inside /spit-braai-delivery/admin/...
  // -- without this, the previous build dropped the operator out to
  // bare /admin/... which broke tenant isolation Bobby's been
  // enforcing across the codebase. Single hook call here, threaded
  // down to StageDot / ClusterBand / NowCard so the slug-prefix
  // happens at render time without each sub-component needing its
  // own router lookup.
  const { withSlug } = useTenantHref();

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
        <NowCard stage={currentStage} withSlug={withSlug} />
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
                    <StageDot stage={s} size="small" onStageClick={onStageClick} withSlug={withSlug} />
                    <span className={
                      s.status === "completed" ? "text-green-700 line-through opacity-70" :
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
  // Wave 25.1 polish: promoted the "what's the next action" question
  // out of an inline text label into a prominent banner at the top of
  // the timeline. The operator sees the actionable signal in one
  // glance instead of having to scan dots first. Banner colour reads
  // by status: orange = next to do, red = blocked.
  return (
    <div className="space-y-2.5">
      {/* Now / Blocked banner -- the single most important question.
          Wave 43 T3: tone now keys off urgency tier (today/overdue
          flash crimson, soon=amber, normal=orange) so the operator
          spots tomorrow's events at a glance. Blocked still wins
          (red, regardless of urgency). */}
      {currentStage && (() => {
        const isBlocked = currentStage.status === "blocked";
        const u = (timeline as any).urgency as string | undefined;
        const tone = isBlocked
          ? { card: "bg-red-50 border-red-200", dot: "bg-red-500", label: "text-red-700", btn: "bg-red-600 hover:bg-red-700", pulseClass: "animate-pulse" }
          : u === "overdue" || u === "today"
            ? { card: "bg-rose-50 border-rose-300 ring-2 ring-rose-200", dot: "bg-rose-500", label: "text-rose-700", btn: "bg-rose-600 hover:bg-rose-700", pulseClass: "animate-pulse" }
            : u === "soon"
              ? { card: "bg-amber-50 border-amber-300", dot: "bg-amber-500", label: "text-amber-700", btn: "bg-amber-600 hover:bg-amber-700", pulseClass: "animate-pulse" }
              : { card: "bg-orange-50 border-orange-200", dot: "bg-orange-500", label: "text-orange-700", btn: "bg-orange-600 hover:bg-orange-700", pulseClass: "animate-pulse" };
        const headerLabel = isBlocked
          ? "Blocked"
          : u === "overdue"
            ? "Event past -- still incomplete"
            : u === "today"
              ? "Event today -- act now"
              : u === "soon"
                ? "Event in <72h -- next to do"
                : "Next to do";
        return (
          <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${tone.card}`}>
            <div className={`w-2 h-2 rounded-full ${tone.pulseClass} flex-shrink-0 ${tone.dot}`} />
            <div className="flex-1 min-w-0">
              <div className={`text-[10px] font-bold uppercase tracking-wider ${tone.label}`}>
                {headerLabel}
              </div>
              <div className="text-sm font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
                <span>{currentStage.label}</span>
                {currentStage.meta?.progress && (
                  <span className="text-xs font-normal text-slate-600">
                    ({currentStage.meta.progress.done}/{currentStage.meta.progress.total})
                  </span>
                )}
                {currentStage.meta?.actor && (
                  <span className="text-xs font-normal text-slate-600">· {currentStage.meta.actor}</span>
                )}
                {currentStage.meta?.expectedAt && (
                  <span className="text-xs font-normal text-slate-600">
                    · expected {new Date(currentStage.meta.expectedAt).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
              {currentStage.blockedReason && (
                <div className="text-xs text-red-700 font-medium mt-0.5">
                  {currentStage.blockedReason}
                </div>
              )}
              {/* Wave 44 T2: cross-system blockers. Pulled from
                  cleaning_jobs + delivery shift state -- explains
                  why the current stage isn't moving with the
                  specific thing to unstick. */}
              {Array.isArray((timeline as any).crossSystemBlockers) &&
                (timeline as any).crossSystemBlockers.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {(timeline as any).crossSystemBlockers.map((b: any, i: number) => (
                      <div
                        key={i}
                        className={`text-[11px] font-medium inline-flex items-center gap-1 ${
                          b.severity === "error" ? "text-red-700" : "text-amber-700"
                        }`}
                      >
                        <span aria-hidden="true">{b.severity === "error" ? "✕" : "⚠"}</span>
                        {b.message}
                      </div>
                    ))}
                  </div>
                )}
            </div>
            {currentStage.sourceLink && (
              <Link
                href={withSlug(currentStage.sourceLink)}
                onClick={(e) => e.stopPropagation()}
                scroll={false}
                className={`text-xs font-semibold flex-shrink-0 px-3 py-1.5 rounded-md text-white shadow-sm hover:shadow-md transition-shadow ${tone.btn}`}
              >
                Open →
              </Link>
            )}
          </div>
        );
      })()}
      {/* Cluster band -- Wave 25.1 polish: flex-1 per cluster wrapper
          stretches the 5 clusters across the full width of the parent
          card. Without this the cluster band sized to its natural dot
          width and left a wide whitespace strip on the right at
          desktop widths. */}
      <div className="flex items-stretch gap-1 w-full overflow-x-auto pb-1">
        {CLUSTER_ORDER.map((g, idx) => (
          <div key={g} className="flex items-stretch flex-1 min-w-0">
            <div className="flex-1 flex justify-center min-w-0">
              <ClusterBand
                group={g}
                stages={stagesByCluster.get(g) || []}
                onStageClick={onStageClick}
                withSlug={withSlug}
              />
            </div>
            {idx < CLUSTER_ORDER.length - 1 && (
              <div className="w-px bg-slate-200 self-stretch mx-1" />
            )}
          </div>
        ))}
      </div>
      {/* Bottom progress count */}
      <div className="text-[10px] text-slate-500 text-right">
        {timeline.completedCount} of {timeline.applicableCount} stages complete
      </div>
    </div>
  );
}
