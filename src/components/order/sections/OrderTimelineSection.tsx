/**
 * ODOC: timeline - status progression. Visual chip strip showing
 * where the order is in the lifecycle. Same shape every viewer
 * sees - matches the client portal's status timeline so internal
 * staff understand what the customer is seeing on their portal.
 */
import { CollapsibleSection } from "./CollapsibleSection";
import { CheckCircle2, Clock, ChefHat, Truck, Sparkles, PackageCheck, PartyPopper } from "lucide-react";

const TIMELINE = [
  { id: "confirmed",  label: "Confirmed",  Icon: CheckCircle2 },
  { id: "preparing",  label: "Preparing",  Icon: ChefHat },
  { id: "ready",      label: "Ready",      Icon: PackageCheck },
  { id: "in_transit", label: "On the way", Icon: Truck },
  { id: "delivered",  label: "Delivered",  Icon: PartyPopper },
  { id: "completed",  label: "Completed",  Icon: Sparkles },
];

interface Props {
  order: { status: string; event_date: string; event_time: string | null };
  defaultOpen?: boolean;
  forceOpen?: boolean;
}

export function OrderTimelineSection({ order, defaultOpen, forceOpen }: Props) {
  const status = order.status?.toLowerCase();
  const idx = TIMELINE.findIndex((s) => s.id === status);
  const currentLabel = TIMELINE.find((s) => s.id === status)?.label || order.status;
  return (
    <CollapsibleSection
      id="section-timeline"
      title="Status timeline"
      summary={`Currently: ${currentLabel}`}
      icon={Clock}
      accent="blue"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
    >
      <div className="flex items-start justify-between gap-1 sm:gap-2 pt-2">
        {TIMELINE.map((step, i) => {
          const reached = idx >= 0 && idx >= i;
          const isCurrent = idx === i;
          const Icon = step.Icon;
          return (
            <div key={step.id} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
              <div
                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition ${
                  reached ? "bg-gradient-to-br from-orange-500 to-red-500 shadow-md" : "bg-slate-100"
                }`}
              >
                <Icon className={`w-4 h-4 ${reached ? "text-white" : "text-slate-400"}`} />
              </div>
              <span
                className={`text-[10px] sm:text-xs text-center leading-tight ${
                  isCurrent ? "font-semibold text-slate-900" : "text-slate-500"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}
