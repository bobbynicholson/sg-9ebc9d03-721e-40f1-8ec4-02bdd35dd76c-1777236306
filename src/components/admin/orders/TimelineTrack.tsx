/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TimelineTrack - the 22-stage / 5-cluster order timeline UI.
 *
 * Wave 66.4 rewrite. Full UI audit (5 specialists, 3 passes) concluded
 * the previous design glanced well at cluster level but failed at the
 * per-stage drill-in: labels were only visible via browser `title`
 * tooltips (slow, unstylable, no touch), cluster headers showed names
 * but no progress, the current stage label only appeared in the top
 * banner, and four sourceLinks routed to surfaces that didn't honour
 * the query param.
 *
 * Now:
 *   - Each stage dot is wrapped in a HoverCard with rich content:
 *     status, when, who, what triggers completion, click-through.
 *   - Cluster headers show progress count + tick when all done.
 *   - Each cluster surfaces its current-or-next stage label inline
 *     under the dot row so ops read context without hovering.
 *   - Mini progress bar under each cluster (visual fill 0-100%).
 *   - Connectors thickened to 2px with smoother transitions.
 *   - Focus-visible ring on every dot for keyboard navigation.
 *   - Stage-trigger glossary so the popover answers "what makes this
 *     stage complete" - operators learn the pipeline by hovering.
 *
 * Data model still lives in src/services/order/orderTimeline.ts. This
 * file is pure presentation; click handlers delegate to stage.sourceLink.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import {
  type OrderTimeline,
  type OrderTimelineStage,
  type StageGroup,
  type StageKey,
  STAGE_GROUP_LABELS,
} from "@/services/order/orderTimeline";
import { useTenantHref } from "@/lib/tenantUrl";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

interface TimelineTrackProps {
  timeline: OrderTimeline;
  /** When true, render the compact cluster-pill view (mobile). When
   *  false (default), render the full dot-band view. */
  compact?: boolean;
  /** Click handler for the parent card - the timeline calls
   *  stopPropagation when a stage dot is clicked so the parent card
   *  doesn't open the order drawer at the same time. */
  onStageClick?: (stage: OrderTimelineStage) => void;
  /** Wave 47 - when true, suppress the "Now / Blocked" banner at
   *  the top. /admin/orders sets this because the new
   *  OrderReadinessChip mounted above the TimelineTrack already
   *  shows the urgency tier + next-action and the operator was
   *  seeing two banners reading the same situation. Client portals
   *  + the order detail drawer keep the banner (no chip there). */
  hideOperatorBanner?: boolean;
  /** Wave 70.49e - when true, suppress the "Completes when" / Owner
   *  glossary block in the per-stage hover tooltip. The glossary
   *  copy is internal operational language (mentions table names like
   *  "kitchen_prep_tasks marked done", scheduling jargon like
   *  "Backplanned from pickup time", and Owner role assignments) that
   *  belongs on the operator surface, NOT on a client-facing magic-link
   *  view. /c/order/[id] sets this true; admin surfaces keep the
   *  glossary so chefs / drivers / dispatchers can see the trigger. */
  hideOperatorGlossary?: boolean;
  /** Keep hover detail but suppress admin/source links on role-scoped
   *  order documents. */
  disableSourceLinks?: boolean;
}

const CLUSTER_ORDER: StageGroup[] = [
  "booking",
  "logistics",
  "dispatch",
  "on_site",
  "post_event",
  "closure",
];

// Wave 66.4 - stage-trigger glossary. Each entry answers "what makes
// this stage flip to completed" so the operator can see, without
// reading the code, what data point closes the loop. Surfaced in the
// HoverCard popover under "Completes when". Where the trigger is a
// human action ("supplier delivers"), the actor is named so ops know
// who's accountable.
const STAGE_GLOSSARY: Record<StageKey, { trigger: string; owner: string }> = {
  quote_accepted: {
    trigger: "Client accepted the quote or admin marked it accepted.",
    owner: "Sales / client",
  },
  order_created: {
    trigger: "Order row exists in the system.",
    owner: "Sales admin",
  },
  deposit_invoice_issued: {
    trigger: "First invoice with a deposit amount has been generated.",
    owner: "Sales admin",
  },
  deposit_paid: {
    trigger: "Deposit payment recorded against the invoice (manual or auto).",
    owner: "Client / bookkeeping",
  },
  confirmed: {
    trigger: "Order status moved off 'pending' / 'draft'. Blocked when deposit is required but unpaid.",
    owner: "Sales admin",
  },
  equipment_hire_booked: {
    trigger: "Every hire row has an expected_pickup_date set with the supplier.",
    owner: "Operations / procurement",
  },
  equipment_hire_collected: {
    trigger: "Every hire row has actual_pickup_date stamped - the supplier handed it over.",
    owner: "Driver / collector",
  },
  pre_event_cleaning: {
    trigger: "All owned equipment has pre_event_cleaning_done_at stamped.",
    owner: "Cleaning team",
  },
  pre_event_shopping: {
    trigger: "The shopping run for this event's ingredients is complete.",
    owner: "Shopping team",
  },
  kitchen_prep_in_progress: {
    trigger: "All kitchen_prep_tasks marked done. Backplanned from pickup time.",
    owner: "Head chef",
  },
  ready_for_dispatch: {
    trigger: "Prep tasks complete OR order status flipped to 'ready' / beyond.",
    owner: "Head chef",
  },
  driver_assigned_delivery: {
    trigger: "A driver is assigned to this order via dispatch or self-claim.",
    owner: "Dispatcher",
  },
  in_transit: {
    trigger: "Order status flips to 'in_transit' or picked_up_at is stamped.",
    owner: "Driver",
  },
  delivered: {
    trigger: "delivered_at stamped via driver portal or status moves to 'delivered'.",
    owner: "Driver",
  },
  setup_started: {
    trigger: "Driver/waiter tapped 'Setup started' at the venue (setup_started_at).",
    owner: "Driver / waiter",
  },
  service_started: {
    trigger: "Driver/waiter tapped 'Service started' - food service to guests began.",
    owner: "Driver / waiter",
  },
  service_ended: {
    trigger: "Waiter marked service ended on the attendance sheet.",
    owner: "Waiter",
  },
  event_complete: {
    trigger: "Waiter marked the event complete on the attendance sheet.",
    owner: "Waiter",
  },
  departed_venue: {
    trigger: "Driver tapped 'Departed venue' - the crew left after the event (departed_venue_at).",
    owner: "Driver",
  },
  collection_scheduled: {
    trigger: "Driver assignment of type 'collection' exists for this order.",
    owner: "Dispatcher",
  },
  collection_done: {
    trigger: "Collection driver_assignment marked completed.",
    owner: "Driver",
  },
  post_event_cleaning: {
    trigger: "All equipment_cleaning_status rows back to ready / stored / available.",
    owner: "Cleaning team",
  },
  final_invoice_issued: {
    trigger: "Invoice matching order total exists.",
    owner: "Bookkeeping",
  },
  final_invoice_sent: {
    trigger: "Invoice has sent_at stamped (emailed to client).",
    owner: "Bookkeeping",
  },
  balance_paid: {
    trigger: "Balance payment recorded. Blocked when due date passes unpaid.",
    owner: "Client / bookkeeping",
  },
  receipt_issued: {
    trigger: "Payment receipt sent or recorded for the balance.",
    owner: "Bookkeeping",
  },
  completed: {
    trigger: "Order status moved to 'completed' or completed_at stamped.",
    owner: "Sales admin",
  },
  thank_you_sent: {
    trigger: "Thank-you / order_completed / review_request email logged for this order.",
    owner: "Sales admin",
  },
};

function fmtDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("en-ZA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

// --- Stage dot --------------------------------------------------------------

function StageDot({
  stage,
  size = "default",
  onStageClick,
  withSlug,
  hideOperatorGlossary,
  disableSourceLinks,
}: {
  stage: OrderTimelineStage;
  size?: "default" | "small";
  onStageClick?: (stage: OrderTimelineStage) => void;
  withSlug: (href: string) => string;
  /** Wave 70.49e - suppress the operator glossary block in the tooltip
   *  (Completes when / Owner). Set by the client magic-link surface so
   *  customers don't see internal table-name jargon. */
  hideOperatorGlossary?: boolean;
  disableSourceLinks?: boolean;
}) {
  const isCompleted = stage.status === "completed";
  const isCurrent = stage.status === "current";
  const isBlocked = stage.status === "blocked";
  const isUpcoming = stage.status === "upcoming";

  // Wave 66.4 - dot sizing nudged up a notch for legibility at desk
  // distance. Completed dots got w-3.5 (was w-4 but used as
  // background), current/blocked stay distinct at w-7.
  const baseSize = size === "small" ? "w-2.5 h-2.5" : "w-3.5 h-3.5";
  const currentSize = size === "small" ? "w-4 h-4" : "w-7 h-7";

  const focusRing = "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500";

  const dotClasses = (() => {
    if (isCurrent) return `${currentSize} bg-orange-500 ring-4 ring-orange-100 shadow-md shadow-orange-200`;
    if (isBlocked) return `${currentSize} bg-red-500 ring-4 ring-red-100 animate-pulse shadow-md shadow-red-200`;
    if (isCompleted) return `${baseSize} bg-green-500 shadow-sm`;
    if (isUpcoming) return `${baseSize} bg-slate-300`;
    // not_applicable - render a faint hollow dot (instead of hiding it)
    // so EVERY order shows the full 22-stage pipeline at a consistent
    // length. N/A steps are clearly de-emphasised, not missing.
    return `${baseSize} bg-slate-100 border border-dashed border-slate-300 opacity-60`;
  })();

  const Icon = isCompleted ? CheckCircle2 : isBlocked ? AlertCircle : isCurrent ? Clock : null;

  const glossary = STAGE_GLOSSARY[stage.key];
  const completedAt = fmtDateTime(stage.completedAt);
  const startedAt = fmtDateTime(stage.startedAt);
  const expectedAt = fmtDateTime(stage.meta?.expectedAt);

  const dot = (
    <span
      className={`relative inline-flex items-center justify-center rounded-full transition-all ${dotClasses} ${focusRing}`}
      aria-label={`${stage.label}: ${stage.status}`}
      tabIndex={isCompleted || isCurrent || isBlocked ? 0 : -1}
    >
      {Icon && size !== "small" && (
        <Icon className={isCurrent || isBlocked ? "w-3 h-3 text-white" : "w-2 h-2 text-white"} />
      )}
    </span>
  );

  // Wave 66.4 - HoverCard replaces the browser-native `title`
  // attribute. Same trigger semantics (hover on desktop, focus
  // for keyboard) but a stylable rich content panel.
  const dotWithHover = (
    <HoverCard openDelay={150} closeDelay={50}>
      <HoverCardTrigger asChild>
        {stage.sourceLink && !disableSourceLinks && (isCurrent || isBlocked || isCompleted) ? (
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
        ) : (
          <span className="inline-flex">{dot}</span>
        )}
      </HoverCardTrigger>
      <HoverCardContent align="center" sideOffset={8} className="w-72 p-3">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900">{stage.label}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">
                {STAGE_GROUP_LABELS[stage.group]}
              </div>
            </div>
            <StatusBadge stage={stage} />
          </div>

          {stage.blockedReason && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
              <span className="font-semibold">Blocked: </span>
              {stage.blockedReason}
            </div>
          )}

          {stage.meta?.progress && (
            <div className="text-xs">
              <span className="text-slate-500">Progress: </span>
              <span className="font-semibold text-slate-900 tabular-nums">
                {stage.meta.progress.done} of {stage.meta.progress.total}
              </span>
            </div>
          )}

          {stage.meta?.actor && (
            <div className="text-xs">
              <span className="text-slate-500">Assigned: </span>
              <span className="font-semibold text-slate-900">{stage.meta.actor}</span>
            </div>
          )}

          {expectedAt && !isCompleted && (
            <div className="text-xs">
              <span className="text-slate-500">Expected: </span>
              <span className="font-semibold text-slate-900">{expectedAt}</span>
            </div>
          )}

          {startedAt && !isCompleted && (
            <div className="text-xs">
              <span className="text-slate-500">Started: </span>
              <span className="font-semibold text-slate-900">{startedAt}</span>
            </div>
          )}

          {completedAt && (
            <div className="text-xs">
              <span className="text-slate-500">Done: </span>
              <span className="font-semibold text-green-700">{completedAt}</span>
            </div>
          )}

          {glossary && !hideOperatorGlossary && (
            <div className="text-xs border-t border-slate-100 pt-2 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Completes when
              </div>
              <div className="text-slate-700">{glossary.trigger}</div>
              <div className="text-[11px] text-slate-500">
                <span className="font-medium">Owner:</span> {glossary.owner}
              </div>
            </div>
          )}

          {stage.sourceLink && !disableSourceLinks && (isCurrent || isBlocked || isCompleted) && (
            <Link
              href={withSlug(stage.sourceLink)}
              onClick={(e) => {
                e.stopPropagation();
                onStageClick?.(stage);
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 pt-1 border-t border-slate-100 w-full"
            >
              Open the surface for this stage
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );

  return dotWithHover;
}

function StatusBadge({ stage }: { stage: OrderTimelineStage }) {
  const cfg = (() => {
    switch (stage.status) {
      case "completed":
        return { label: "Done", cls: "bg-green-50 text-green-700 border-green-200" };
      case "current":
        // Wave 70.49f - distinguish "actually happening right now" from
        // "this is the next stage to focus on but nobody has started".
        // Bobby flagged the misleading "In progress" badge on
        // /c/order/[id] where an order 2 days out from the event was
        // showing kitchen prep as "In progress" because the stage was
        // `current` - but the resolver marks something `current` the
        // moment it's the NEXT unfinished stage, regardless of whether
        // work has actually started. The truthful signal is
        // `startedAt`: set when the underlying entity (prep task,
        // driver assignment, etc.) has a started_at timestamp.
        return stage.startedAt
          ? { label: "In progress", cls: "bg-orange-50 text-orange-700 border-orange-200" }
          : { label: "Up next",     cls: "bg-amber-50 text-amber-700 border-amber-200" };
      case "blocked":
        return { label: "Blocked", cls: "bg-rose-50 text-rose-700 border-rose-200" };
      case "upcoming":
        return { label: "Upcoming", cls: "bg-slate-50 text-slate-600 border-slate-200" };
      case "skipped":
        return { label: "Skipped", cls: "bg-slate-50 text-slate-500 border-slate-200" };
      default:
        return { label: "N/a", cls: "bg-slate-50 text-slate-400 border-slate-200" };
    }
  })();
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cfg.cls} shrink-0`}>
      {cfg.label}
    </span>
  );
}

function TimelineColourLegend({ compact = false }: { compact?: boolean }) {
  const items = [
    { label: "Done", cls: "bg-green-500", text: "text-green-700" },
    { label: "Problem", cls: "bg-red-500", text: "text-red-700" },
    { label: "Needs to be done", cls: "bg-orange-500", text: "text-orange-700" },
    { label: "Not started", cls: "bg-slate-300", text: "text-slate-600" },
  ];
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${compact ? "text-[10px]" : "text-[11px]"}`}>
      {items.map((item) => (
        <span key={item.label} className={`inline-flex items-center gap-1.5 font-medium ${item.text}`}>
          <span className={`w-2.5 h-2.5 rounded-full ${item.cls}`} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </div>
  );
}

// --- Cluster band -----------------------------------------------------------

function ClusterBand({
  group,
  stages,
  onStageClick,
  withSlug,
  hideOperatorGlossary,
  disableSourceLinks,
}: {
  group: StageGroup;
  stages: OrderTimelineStage[];
  onStageClick?: (stage: OrderTimelineStage) => void;
  withSlug: (href: string) => string;
  hideOperatorGlossary?: boolean;
  disableSourceLinks?: boolean;
}) {
  // Show the FULL pipeline in every order - render a dot for EVERY
  // stage (incl not_applicable, shown faint) so the timeline is a
  // consistent 22-stage length across all orders. Progress counts are
  // based on the applicable (non-n/a) stages so the maths stays honest.
  const applicable = stages.filter((s) => s.status !== "not_applicable");
  const completed = applicable.filter((s) => s.status === "completed").length;
  const total = applicable.length;
  const allCompleted = total > 0 && completed === total;
  const hasCurrent = applicable.some((s) => s.status === "current");
  const hasBlocked = applicable.some((s) => s.status === "blocked");
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Wave 66.4 - inline cluster context. If the cluster has the
  // current (or blocked) stage, surface its label + progress beneath
  // the dot row so ops read "Logistics: Kitchen prep (5/8)" without
  // hovering. If fully done, surface a small "all done" hint. If
  // upcoming-only, surface the next pending stage's label so the
  // operator sees what this cluster is waiting on.
  const focusStage = hasBlocked
    ? applicable.find((s) => s.status === "blocked")
    : hasCurrent
      ? applicable.find((s) => s.status === "current")
      : !allCompleted
        ? applicable.find((s) => s.status === "upcoming")
        : null;

  const headerColor =
    allCompleted ? "text-green-700" :
    hasBlocked ? "text-red-600" :
    hasCurrent ? "text-orange-600" :
    "text-slate-500";

  const progressBarColor =
    hasBlocked ? "bg-red-500" :
    allCompleted ? "bg-green-500" :
    hasCurrent ? "bg-orange-500" :
    "bg-slate-300";

  return (
    <div className="flex flex-col items-center gap-1.5 px-2 min-w-0 w-full">
      {/* Header row: name + count + tick */}
      <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${headerColor}`}>
        <span>{STAGE_GROUP_LABELS[group]}</span>
        <span className="tabular-nums text-[9px] opacity-80">
          {total > 0 ? `${completed}/${total}` : "n/a"}
        </span>
        {allCompleted && <CheckCircle2 className="w-3 h-3" />}
      </div>

      {/* Dot row */}
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {stages.map((s, idx) => {
          const next = stages[idx + 1];
          // Wave 66.4 - connector polish. 2px height (was 0.5),
          // brighter gradient for in-progress legs, wider for
          // breathing room.
          const connectorClass = !next
            ? ""
            : s.status === "completed" && next.status === "completed"
              ? "bg-green-500"
              : s.status === "completed" && (next.status === "current" || next.status === "blocked")
                ? "bg-gradient-to-r from-green-500 via-orange-400 to-orange-300"
                : s.status === "current"
                  ? "bg-gradient-to-r from-orange-400 to-slate-200"
                  : s.status === "blocked"
                    ? "bg-red-300"
                    : "bg-slate-200";
          return (
            <div key={s.key} className="flex items-center gap-1.5">
              <StageDot
                stage={s}
                onStageClick={onStageClick}
                withSlug={withSlug}
                hideOperatorGlossary={hideOperatorGlossary}
                disableSourceLinks={disableSourceLinks}
              />
              {next && (
                <div className={`h-[3px] w-5 rounded-full ${connectorClass}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Inline focus-stage label */}
      {focusStage && (
        <div className={`text-[10px] text-center leading-tight ${
          hasBlocked ? "text-red-700 font-semibold" :
          hasCurrent ? "text-orange-700 font-semibold" :
          "text-slate-500"
        }`}>
          {focusStage.label}
          {focusStage.meta?.progress && (
            <span className="ml-1 tabular-nums opacity-80">
              {focusStage.meta.progress.done}/{focusStage.meta.progress.total}
            </span>
          )}
        </div>
      )}
      {!focusStage && allCompleted && (
        <div className="text-[10px] text-green-700 font-medium leading-tight text-center">
          All done
        </div>
      )}

      {/* Mini progress bar - visual fill 0-100% */}
      <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${progressBarColor}`}
          style={{ width: `${progressPct}%` }}
        />
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
  const applicable = stages.filter((s) => s.status !== "not_applicable");
  const total = applicable.length;
  const done = applicable.filter((s) => s.status === "completed").length;
  const hasBlocked = applicable.some((s) => s.status === "blocked");
  const hasCurrent = applicable.some((s) => s.status === "current");

  const tone = (() => {
    if (hasBlocked) return "bg-red-100 text-red-700 border-red-300";
    if (hasCurrent) return "bg-orange-100 text-orange-700 border-orange-300";
    if (total > 0 && done === total) return "bg-green-50 text-green-700 border-green-200";
    return "bg-slate-100 text-slate-500 border-slate-200";
  })();

  // Always render every cluster so the timeline reads the same on every
  // order; clusters with no applicable stage for this order show "n/a".
  return (
    <div className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${tone}`}>
      {STAGE_GROUP_LABELS[group]} {total > 0 ? `${done}/${total}` : "n/a"}
    </div>
  );
}

// --- Now card --------------------------------------------------------------

function NowCard({
  stage,
  withSlug,
  disableSourceLinks,
}: {
  stage: OrderTimelineStage | null;
  withSlug: (href: string) => string;
  disableSourceLinks?: boolean;
}) {
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
      {stage.sourceLink && !disableSourceLinks && (
        <Link
          href={withSlug(stage.sourceLink)}
          onClick={(e) => e.stopPropagation()}
          scroll={false}
          className="text-xs font-semibold underline decoration-dotted hover:decoration-solid flex-shrink-0"
        >
          Open <ChevronRight className="w-3 h-3 inline" />
        </Link>
      )}
    </div>
  );
}

// --- Main export ------------------------------------------------------------

export function TimelineTrack({
  timeline,
  compact,
  onStageClick,
  hideOperatorBanner,
  hideOperatorGlossary,
  disableSourceLinks,
}: TimelineTrackProps) {
  const [expanded, setExpanded] = useState(false);
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
        <NowCard stage={currentStage} withSlug={withSlug} disableSourceLinks={disableSourceLinks} />
        <TimelineColourLegend compact />
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
              .map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <StageDot
                      stage={s}
                      size="small"
                      onStageClick={onStageClick}
                      withSlug={withSlug}
                      hideOperatorGlossary={hideOperatorGlossary}
                      disableSourceLinks={disableSourceLinks}
                    />
                    <span className={
                      s.status === "completed" ? "text-green-700 line-through opacity-70" :
                      s.status === "current" ? "text-orange-700 font-semibold" :
                      s.status === "blocked" ? "text-red-700 font-semibold" :
                      s.status === "not_applicable" ? "text-slate-400 italic" :
                      "text-slate-500"
                    }>{s.label}{s.status === "not_applicable" && <span className="ml-1 text-[9px] uppercase tracking-wide text-slate-300">n/a</span>}</span>
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
    <div className="space-y-2.5">
      {!hideOperatorBanner && currentStage && (() => {
        const isBlocked = currentStage.status === "blocked";
        const u = (timeline as any).urgency as string | undefined;
        const tone = isBlocked
          ? { card: "bg-red-50 border-red-200", dot: "bg-red-500", label: "text-red-700", btn: "bg-red-600 hover:bg-red-700", pulseClass: "animate-pulse" }
          : u === "overdue" || u === "today"
            ? { card: "bg-rose-50 border-rose-300 ring-2 ring-rose-200", dot: "bg-rose-500", label: "text-rose-700", btn: "bg-rose-600 hover:bg-rose-700", pulseClass: "animate-pulse" }
            : u === "tomorrow"
              ? { card: "bg-amber-50 border-amber-300", dot: "bg-amber-500", label: "text-amber-700", btn: "bg-amber-600 hover:bg-amber-700", pulseClass: "animate-pulse" }
              : u === "soon"
                ? { card: "bg-amber-50 border-amber-300", dot: "bg-amber-500", label: "text-amber-700", btn: "bg-amber-600 hover:bg-amber-700", pulseClass: "animate-pulse" }
                : { card: "bg-orange-50 border-orange-200", dot: "bg-orange-500", label: "text-orange-700", btn: "bg-orange-600 hover:bg-orange-700", pulseClass: "animate-pulse" };
        const headerLabel = isBlocked
          ? "Blocked"
          : u === "overdue"
            ? "Event past - close out"
            : u === "today"
              ? "Event today - final checks"
              : u === "tomorrow"
                ? "Event tomorrow - final checks"
                : u === "soon"
                  ? "Event this week - next to do"
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
                    · expected {fmtDateTime(currentStage.meta.expectedAt)}
                  </span>
                )}
              </div>
              {currentStage.blockedReason && (
                <div className="text-xs text-red-700 font-medium mt-0.5">
                  {currentStage.blockedReason}
                </div>
              )}
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
            {currentStage.sourceLink && !disableSourceLinks && (
              <Link
                href={withSlug(currentStage.sourceLink)}
                onClick={(e) => e.stopPropagation()}
                scroll={false}
                className={`text-xs font-semibold flex-shrink-0 px-3 py-1.5 rounded-md text-white shadow-sm hover:shadow-md transition-shadow ${tone.btn}`}
              >
                Open <ChevronRight className="w-3 h-3 inline" />
              </Link>
            )}
          </div>
        );
      })()}

      <TimelineColourLegend />

      {/* Cluster band */}
      <div className="flex items-stretch gap-1 w-full overflow-x-auto pb-1">
        {CLUSTER_ORDER.map((g, idx) => (
          <div key={g} className="flex items-stretch flex-1 min-w-0">
            <div className="flex-1 flex justify-center min-w-0">
              <ClusterBand
                group={g}
                stages={stagesByCluster.get(g) || []}
                onStageClick={onStageClick}
                withSlug={withSlug}
                hideOperatorGlossary={hideOperatorGlossary}
                disableSourceLinks={disableSourceLinks}
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
