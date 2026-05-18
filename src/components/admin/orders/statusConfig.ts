/**
 * Status display config + workflow stage helpers for the orders
 * surfaces. Extracted from src/pages/admin/orders.tsx in the P2-13
 * Phase B split. Pure data + pure functions - no React, no state.
 */
import {
  Clock,
  CheckCircle2,
  Package,
  Truck,
  AlertCircle,
} from "lucide-react";
import type { AppOrder } from "@/types/app";

// Wave 56 - collapsed from 8 categorical hues to a 3-tone semantic
// scheme. The status progression is genuinely linear (waiting ->
// active -> done), not categorical. The previous palette taught the
// operator nothing because every status was a different unrelated
// colour. Now: amber = waiting on someone, blue = work in motion,
// slate = closed, rose = cancelled (the only true alert tone).
//
// Icons retained per stage so the badge still carries fast
// recognition; sentence-case labels match Wave 54.5 dropdown.
export const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    icon: Clock,
    color: "bg-amber-50 text-amber-800 border-amber-200",
    dotColor: "bg-amber-500",
  },
  confirmed: {
    label: "Confirmed",
    icon: CheckCircle2,
    color: "bg-blue-50 text-blue-800 border-blue-200",
    dotColor: "bg-blue-500",
  },
  preparing: {
    label: "In prep",
    icon: Package,
    color: "bg-blue-50 text-blue-800 border-blue-200",
    dotColor: "bg-blue-500",
  },
  ready: {
    label: "Ready",
    icon: CheckCircle2,
    color: "bg-blue-50 text-blue-800 border-blue-200",
    dotColor: "bg-blue-500",
  },
  in_transit: {
    label: "In transit",
    icon: Truck,
    color: "bg-blue-50 text-blue-800 border-blue-200",
    dotColor: "bg-blue-500",
  },
  delivered: {
    label: "Delivered",
    icon: CheckCircle2,
    color: "bg-blue-50 text-blue-800 border-blue-200",
    dotColor: "bg-blue-500",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    color: "bg-slate-100 text-slate-700 border-slate-200",
    dotColor: "bg-slate-400",
  },
  paused: {
    label: "Paused",
    icon: Clock,
    color: "bg-slate-100 text-slate-700 border-slate-300",
    dotColor: "bg-slate-400",
  },
  cancelled: {
    label: "Cancelled",
    icon: AlertCircle,
    color: "bg-rose-50 text-rose-800 border-rose-200",
    dotColor: "bg-rose-400",
  },
};

// Workflow stages for timeline view
export const WORKFLOW_STAGES = [
  { key: "pending", label: "Pending", order: 0 },
  { key: "confirmed", label: "Confirmed", order: 1 },
  { key: "preparing", label: "In Prep", order: 2 },
  { key: "ready", label: "Ready", order: 3 },
  { key: "in_transit", label: "In Transit", order: 4 },
  { key: "delivered", label: "Delivered", order: 5 },
  { key: "completed", label: "Completed", order: 6 },
];

// Get stage status (completed, current, critical, upcoming)
export const getStageStatus = (
  order: AppOrder,
  stageKey: string,
): "completed" | "current" | "critical" | "upcoming" => {
  const currentStageOrder =
    WORKFLOW_STAGES.find((s) => s.key === order.status)?.order ?? 0;
  const thisStageOrder = WORKFLOW_STAGES.find((s) => s.key === stageKey)?.order ?? 0;

  if (thisStageOrder < currentStageOrder) {
    return "completed";
  } else if (thisStageOrder === currentStageOrder) {
    // Check if critical (event date is today or past and not completed)
    const eventDate = new Date(order.event_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (eventDate <= today && order.status !== "completed" && order.status !== "cancelled") {
      return "critical";
    }
    return "current";
  }
  return "upcoming";
};

// Get next stage
export const getNextStage = (order: AppOrder): string | null => {
  const currentStageOrder =
    WORKFLOW_STAGES.find((s) => s.key === order.status)?.order ?? 0;
  const nextStage = WORKFLOW_STAGES.find((s) => s.order === currentStageOrder + 1);
  return nextStage ? nextStage.label : null;
};
