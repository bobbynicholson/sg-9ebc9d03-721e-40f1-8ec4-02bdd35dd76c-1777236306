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
    trigger: "Collection assignment exists, or post-event cleaning has started for this order.",
    owner: "Dispatcher",
  },
  collection_done: {
    trigger: "Collection assignment marked picked up/completed, or all post-event cleaning jobs are complete.",
    owner: "Driver",
  },
  post_event_cleaning: {
    trigger: "All order-level post-event cleaning jobs are complete.",
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
    if (isBlocked) return `${currentSize} bg-rose-500 ring-4 ring-rose-100 animate-pulse shadow-md shadow-rose-200`;
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

// --- Phase stepper ----------------------------------------------------------
//
// One circle per phase (Booking -> Closure) so anyone can read where an
// order is at a glance: green tick = done, orange ring = in progress,
// red = problem, grey = not started, dashed = not needed for this order.
// Per-stage detail lives in the expandable checklist below it.

type PhaseState = "done" | "current" | "started" | "blocked" | "upcoming" | "na";

interface PhaseSummary {
  group: StageGroup;
  stages: OrderTimelineStage[];
  done: number;
  total: number;
  state: PhaseState;
  focus: OrderTimelineStage | null;
}

function summarisePhase(group: StageGroup, stages: OrderTimelineStage[], isActive: boolean): PhaseSummary {
  const applicable = stages.filter((s) => s.status !== "not_applicable" && s.status !== "skipped");
  const done = applicable.filter((s) => s.status === "completed").length;
  const total = applicable.length;
  const blocked = applicable.find((s) => s.status === "blocked") || null;
  const current = applicable.find((s) => s.status === "current") || null;
  const state: PhaseState =
    total === 0 ? "na"
      : blocked ? "blocked"
        : done === total ? "done"
          // Only the phase holding the order's current step is "current";
          // phases with a few steps ticked off early read as "started".
          : isActive || current ? "current"
            : done > 0 ? "started"
              : "upcoming";
  const focus = blocked || current || (state === "current" ? applicable.find((s) => s.status === "upcoming") || null : null);
  return { group, stages, done, total, state, focus };
}

const PHASE_CIRCLE: Record<PhaseState, string> = {
  done: "bg-emerald-500 border-emerald-500 text-white",
  current: "bg-white border-orange-500 text-orange-600 ring-4 ring-orange-100",
  started: "bg-white border-emerald-300 text-emerald-700",
  blocked: "bg-rose-500 border-rose-500 text-white ring-4 ring-rose-100",
  upcoming: "bg-white border-slate-300 text-slate-400",
  na: "bg-white border-dashed border-slate-200 text-slate-300",
};

const PHASE_CAPTION: Record<PhaseState, string> = {
  done: "text-emerald-700",
  current: "text-orange-700",
  started: "text-emerald-700",
  blocked: "text-rose-700",
  upcoming: "text-slate-500",
  na: "text-slate-400",
};

function PhaseStepper({ phases, small = false }: { phases: PhaseSummary[]; small?: boolean }) {
  const size = small ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-xs";
  return (
    <ol className="flex w-full items-start" aria-label="Order progress by phase">
      {phases.map((p, idx) => {
        // Connector into this phase is green only when every phase before
        // it is finished (or not needed) - never green across a gap.
        const before = phases.slice(0, idx);
        const allBeforeDone = before.length > 0
          && before.every((b) => b.state === "done" || b.state === "na")
          && before.some((b) => b.state === "done");
        const lineTone = allBeforeDone ? "bg-emerald-500" : "bg-slate-200";
        const caption =
          p.state === "done" ? "Done"
            : p.state === "na" ? "Not needed"
              : `${p.done}/${p.total}`;
        return (
          <li key={p.group} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
            {idx > 0 && (
              <span
                aria-hidden="true"
                className={`absolute h-[3px] rounded-full ${lineTone}`}
                style={{
                  top: small ? 13 : 17,
                  left: `calc(-50% + ${small ? 16 : 20}px)`,
                  right: `calc(50% + ${small ? 16 : 20}px)`,
                }}
              />
            )}
            <span
              className={`relative z-10 flex shrink-0 items-center justify-center rounded-full border-2 font-semibold tabular-nums transition-colors ${size} ${PHASE_CIRCLE[p.state]}`}
              aria-hidden="true"
            >
              {p.state === "done" ? (
                <CheckCircle2 className={small ? "h-4 w-4" : "h-5 w-5"} />
              ) : p.state === "blocked" ? (
                <AlertCircle className={small ? "h-4 w-4" : "h-5 w-5"} />
              ) : p.state === "na" ? (
                "–"
              ) : (
                idx + 1
              )}
            </span>
            <span className={`mt-1.5 truncate px-0.5 font-semibold ${small ? "text-[10px]" : "text-xs"} ${p.state === "na" || p.state === "upcoming" ? "text-slate-500" : "text-slate-900"}`}>
              {STAGE_GROUP_LABELS[p.group]}
            </span>
            <span className={`text-[10px] font-medium tabular-nums ${PHASE_CAPTION[p.state]}`}>{caption}</span>
            {!small && p.focus && (p.state === "current" || p.state === "blocked") && (
              <span className={`mt-0.5 line-clamp-2 px-1 text-[10px] leading-tight ${PHASE_CAPTION[p.state]}`}>
                {p.focus.label}
              </span>
            )}
            <span className="sr-only">
              {STAGE_GROUP_LABELS[p.group]}: {p.state === "na" ? "not needed" : `${p.done} of ${p.total} done${p.state === "blocked" ? ", has a problem" : ""}`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StepChecklist({
  phases,
  onStageClick,
  withSlug,
  hideOperatorGlossary,
  disableSourceLinks,
}: {
  phases: PhaseSummary[];
  onStageClick?: (stage: OrderTimelineStage) => void;
  withSlug: (href: string) => string;
  hideOperatorGlossary?: boolean;
  disableSourceLinks?: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {phases.map((p) => (
        <div key={p.group} className="min-w-0">
          <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${PHASE_CAPTION[p.state]}`}>
            {STAGE_GROUP_LABELS[p.group]}
          </p>
          <ul className="space-y-1.5">
            {p.stages.map((s) => (
              <li key={s.key} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 flex w-4 shrink-0 justify-center">
                  <StageDot
                    stage={s}
                    size="small"
                    onStageClick={onStageClick}
                    withSlug={withSlug}
                    hideOperatorGlossary={hideOperatorGlossary}
                    disableSourceLinks={disableSourceLinks}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={
                    s.status === "completed" ? "text-slate-700"
                      : s.status === "current" ? "font-semibold text-orange-700"
                        : s.status === "blocked" ? "font-semibold text-rose-700"
                          : s.status === "not_applicable" || s.status === "skipped" ? "text-slate-400"
                            : "text-slate-500"
                  }>
                    {s.label}
                  </span>
                  {s.status === "completed" && s.completedAt && (
                    <span className="block text-[10px] tabular-nums text-emerald-700">
                      Done {new Date(s.completedAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                    </span>
                  )}
                  {s.status === "blocked" && s.blockedReason && (
                    <span className="block text-[10px] text-rose-700">{s.blockedReason}</span>
                  )}
                  {(s.status === "current" || s.status === "blocked") && s.meta?.progress && (
                    <span className="block text-[10px] tabular-nums text-slate-500">
                      {s.meta.progress.done} of {s.meta.progress.total}
                    </span>
                  )}
                  {(s.status === "not_applicable" || s.status === "skipped") && (
                    <span className="block text-[10px] text-slate-400">Not needed</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
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
      ? "border-rose-300 bg-rose-50 text-rose-900"
      : stage.status === "current"
        ? "border-orange-300 bg-orange-50 text-orange-900"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`flex items-center justify-between gap-2 rounded-md border-l-4 border-y border-r px-3 py-2 ${tone}`}>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">
          {stage.status === "blocked" ? "Problem" : "Next to do"}
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

  const phases = useMemo(() => {
    const map = new Map<StageGroup, OrderTimelineStage[]>();
    for (const g of CLUSTER_ORDER) map.set(g, []);
    for (const s of timeline.stages) map.get(s.group)?.push(s);
    return CLUSTER_ORDER.map((g) => summarisePhase(g, map.get(g) || [], g === timeline.currentClusterKey));
  }, [timeline.stages, timeline.currentClusterKey]);

  const currentStage = useMemo(
    () => timeline.stages.find((s) => s.key === timeline.currentStageKey) || null,
    [timeline.stages, timeline.currentStageKey],
  );

  const pct = timeline.applicableCount > 0
    ? Math.round((timeline.completedCount / timeline.applicableCount) * 100)
    : 0;
  const allDone = timeline.applicableCount > 0 && timeline.completedCount >= timeline.applicableCount;

  // Summary line + overall progress bar, shared by every layout.
  const summary = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="min-w-0 flex-1 text-xs text-slate-600">
        {allDone ? (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> All steps complete
          </span>
        ) : currentStage ? (
          <>
            <span className={`font-semibold ${currentStage.status === "blocked" ? "text-rose-700" : "text-orange-700"}`}>
              {currentStage.status === "blocked" ? "Problem:" : "Next:"}
            </span>{" "}
            <span className="font-medium text-slate-900">{currentStage.label}</span>
          </>
        ) : (
          <span className="text-slate-500">Not started yet</span>
        )}
      </p>
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 sm:w-32" aria-hidden="true">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11px] tabular-nums text-slate-500">
          {timeline.completedCount} of {timeline.applicableCount} steps done
        </span>
      </div>
    </div>
  );

  const toggle = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setExpanded((v) => !v);
      }}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-900"
      aria-expanded={expanded}
    >
      {expanded ? "Hide steps" : "Show all steps"}
      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
    </button>
  );

  const checklist = expanded && (
    <StepChecklist
      phases={phases}
      onStageClick={onStageClick}
      withSlug={withSlug}
      hideOperatorGlossary={hideOperatorGlossary}
      disableSourceLinks={disableSourceLinks}
    />
  );

  // --- Compact / mobile view ---
  const compactView = (
    <div className="space-y-2.5">
      {!hideOperatorBanner && (
        <NowCard stage={currentStage} withSlug={withSlug} disableSourceLinks={disableSourceLinks} />
      )}
      <PhaseStepper phases={phases} small />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] tabular-nums text-slate-500">
          {timeline.completedCount} of {timeline.applicableCount} steps done
        </span>
        {toggle}
      </div>
      {checklist}
    </div>
  );

  // --- Full desktop view ---
  const fullView = (
    <div className="space-y-3">
      {!hideOperatorBanner && currentStage && (() => {
        const isBlocked = currentStage.status === "blocked";
        const u = timeline.urgency;
        const tone = isBlocked || u === "overdue" || u === "today"
          ? { card: "bg-rose-50 border-rose-200", dot: "bg-rose-500", label: "text-rose-700", btn: "bg-rose-600 hover:bg-rose-700" }
          : u === "tomorrow" || u === "soon"
            ? { card: "bg-amber-50 border-amber-300", dot: "bg-amber-500", label: "text-amber-700", btn: "bg-amber-600 hover:bg-amber-700" }
            : { card: "bg-orange-50 border-orange-200", dot: "bg-orange-500", label: "text-orange-700", btn: "bg-orange-600 hover:bg-orange-700" };
        const headerLabel = isBlocked
          ? "Problem"
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
            <div className={`h-2 w-2 flex-shrink-0 animate-pulse rounded-full motion-reduce:animate-none ${tone.dot}`} />
            <div className="min-w-0 flex-1">
              <div className={`text-[10px] font-bold uppercase tracking-wider ${tone.label}`}>{headerLabel}</div>
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
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
                  <span className="text-xs font-normal text-slate-600">· expected {fmtDateTime(currentStage.meta.expectedAt)}</span>
                )}
              </div>
              {currentStage.blockedReason && (
                <div className="mt-0.5 text-xs font-medium text-rose-700">{currentStage.blockedReason}</div>
              )}
              {timeline.crossSystemBlockers.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {timeline.crossSystemBlockers.map((b, i) => (
                    <div
                      key={i}
                      className={`inline-flex items-center gap-1 text-[11px] font-medium ${b.severity === "error" ? "text-rose-700" : "text-amber-700"}`}
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
                className={`flex-shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-shadow hover:shadow-md ${tone.btn}`}
              >
                Open <ChevronRight className="inline h-3 w-3" />
              </Link>
            )}
          </div>
        );
      })()}

      {summary}
      <PhaseStepper phases={phases} />
      <div className="flex justify-end">{toggle}</div>
      {checklist}
    </div>
  );

  // Phones get the compact layout; md and up get the full stepper. A
  // caller can force compact everywhere with the `compact` prop.
  if (compact) return compactView;
  return (
    <>
      <div className="md:hidden">{compactView}</div>
      <div className="hidden md:block">{fullView}</div>
    </>
  );
}
