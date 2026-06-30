/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC Wave F: role-aware "what should I do now?" banner.
 *
 * Pure rules over the data we already have. Picks the single
 * highest-value action the viewer can take based on their role and
 * the order's state. One line, one CTA, dismissible (session-local).
 *
 * Not AI. The intel layer is rule-based - composite of countdown
 * minutes, payment state, prep state, driver assignment, POD state.
 * Cheap, deterministic, easy to extend.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantHref } from "@/lib/tenantUrl";
import { UserRole } from "@/types/app";
import { Lightbulb, X, ArrowRight } from "lucide-react";

interface OrderShape {
  id: string;
  status: string;
  event_date: string;
  event_time: string | null;
  collection_time: string | null;
  pickup_time: string | null;
  assigned_driver_id: string | null;
  assigned_chef_id: string | null;
  prep_started_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  arrived_at_venue_at: string | null;
  pod_captured_at: string | null;
  delivered_at: string | null;
  setup_started_at: string | null;
  cancelled_at: string | null;
  postponed_at: string | null;
  requires_two_drivers: boolean | null;
  secondary_driver_id: string | null;
  delivery_duration_minutes: number | null;
  payment_status: string | null;
  deposit_paid: boolean | null;
  balance_paid: boolean | null;
  final_order_change_date: string | null;
}

interface Props {
  order: OrderShape;
}

function combineDateTime(date: string, time: string | null): Date | null {
  if (!date) return null;
  const t = time || "12:00:00";
  const iso = `${date}T${t.length === 5 ? t + ":00" : t}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function OrderSuggestedAction({ order }: Props) {
  const { user, userRoles } = useAuth();
  const { withSlug } = useTenantHref();
  const [dismissed, setDismissed] = useState(false);

  const roles = useMemo(() => {
    const all = new Set<string>();
    if (user?.role) all.add(String(user.role));
    (userRoles || []).forEach((r) => all.add(String(r)));
    return all;
  }, [user?.role, userRoles]);

  const isAssignedDriver = roles.has(UserRole.DRIVER) && order.assigned_driver_id === user?.id;
  const isAssignedChef = (roles.has(UserRole.KITCHEN_MANAGER) || roles.has(UserRole.KITCHEN_STAFF)) && order.assigned_chef_id === user?.id;
  const isKitchen = roles.has(UserRole.KITCHEN_MANAGER) || roles.has(UserRole.KITCHEN_STAFF);
  const isDriver = roles.has(UserRole.DRIVER);
  const isWaiter = roles.has(UserRole.WAITER);
  const isShopping = roles.has(UserRole.SHOPPING_STAFF);
  const isAdminTier = roles.has(UserRole.COMPANY_ADMIN) || roles.has(UserRole.OWNER) || roles.has(UserRole.REGION_ADMIN) || roles.has(UserRole.SALES_ADMIN) || roles.has(UserRole.ADMIN);

  // Compute the timing signals once.
  const now = Date.now();
  const collectionDt = combineDateTime(order.event_date, order.collection_time || order.event_time);
  const eventDt = combineDateTime(order.event_date, order.event_time);
  const minsToCollection = collectionDt ? (collectionDt.getTime() - now) / 60_000 : null;
  const hoursToEvent = eventDt ? (eventDt.getTime() - now) / 3_600_000 : null;

  // Terminal states: no suggested action.
  if (order.cancelled_at || order.postponed_at) return null;
  if (order.status === "completed") return null;
  if (dismissed) return null;

  // Build a candidate list with priority weights. Highest priority wins.
  interface Suggestion {
    weight: number;
    text: string;
    cta?: { label: string; href: string };
    tone: "rose" | "amber" | "blue" | "indigo" | "emerald";
  }
  const candidates: Suggestion[] = [];

  // === Driver candidates ===
  if (isAssignedDriver) {
    if (order.delivered_at && !order.pod_captured_at) {
      candidates.push({
        weight: 100,
        text: "Capture POD - photo + signature before leaving the venue.",
        cta: { label: "Capture POD", href: `${withSlug("/team-portal/driver/dashboard")}#order-${order.id}` },
        tone: "rose",
      });
    } else if (order.arrived_at_venue_at && !order.delivered_at) {
      candidates.push({
        weight: 90,
        text: "You're on site - hand the order over and stamp delivered.",
        tone: "amber",
      });
    } else if (order.picked_up_at && !order.arrived_at_venue_at && collectionDt) {
      candidates.push({
        weight: 85,
        text: "On route. Tap Arrived once you're at the venue.",
        tone: "indigo",
      });
    } else if (!order.picked_up_at && order.ready_at && minsToCollection != null && minsToCollection < 30) {
      candidates.push({
        weight: 95,
        text: `Order is ready and collection is in ${Math.max(0, Math.round(minsToCollection))} min. Head to the kitchen now.`,
        tone: "rose",
      });
    } else if (!order.picked_up_at && order.ready_at && order.delivery_duration_minutes && collectionDt) {
      const leaveBy = new Date(collectionDt.getTime() - order.delivery_duration_minutes * 60_000);
      const minsToLeave = (leaveBy.getTime() - now) / 60_000;
      if (minsToLeave < 60 && minsToLeave > 0) {
        candidates.push({
          weight: 70,
          text: `Leave by ${leaveBy.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })} to make collection on time.`,
          tone: "amber",
        });
      } else if (minsToLeave <= 0) {
        candidates.push({
          weight: 95,
          text: "You should already be on the road. Get going.",
          tone: "rose",
        });
      }
    }
  }

  // === Chef / kitchen candidates ===
  if (isKitchen || isAssignedChef) {
    if (!order.prep_started_at && order.status === "confirmed" && minsToCollection != null && minsToCollection < 240) {
      candidates.push({
        weight: 80,
        text: `Prep hasn't started and collection is in ${Math.round(minsToCollection / 60 * 10) / 10}h. Kick off now.`,
        tone: "rose",
      });
    } else if (order.prep_started_at && !order.ready_at && minsToCollection != null && minsToCollection < 60) {
      candidates.push({
        weight: 85,
        text: `Plating window. ${Math.max(0, Math.round(minsToCollection))} min to driver collection.`,
        tone: "rose",
      });
    } else if (order.prep_started_at && !order.ready_at && order.status === "preparing") {
      candidates.push({
        weight: 50,
        text: "Tap Ready once everything is packed for collection.",
        tone: "amber",
      });
    }
  }

  // === Waiter candidates ===
  if (isWaiter && eventDt) {
    const hoursToService = hoursToEvent || 0;
    if (hoursToService < 2 && hoursToService > 0 && !order.setup_started_at) {
      candidates.push({
        weight: 75,
        text: "Service in under 2 hours. Stamp 'I'm on site' when you arrive.",
        tone: "amber",
      });
    } else if (order.arrived_at_venue_at && !order.delivered_at) {
      candidates.push({
        weight: 60,
        text: "Driver has arrived. Help with offload + setup.",
        tone: "indigo",
      });
    }
  }

  // === Shopping candidates ===
  if (isShopping && order.status === "confirmed" && hoursToEvent != null && hoursToEvent < 72) {
    candidates.push({
      weight: 40,
      text: "Event within 72h - confirm shortfalls have been bought.",
      tone: "amber",
    });
  }

  // === Admin / dispatch candidates ===
  if (isAdminTier) {
    if (order.status === "confirmed" && !order.assigned_driver_id && hoursToEvent != null && hoursToEvent < 48) {
      candidates.push({
        weight: 90,
        text: `Event in ${Math.round(hoursToEvent)}h and no driver assigned. Pick one now.`,
        tone: "rose",
      });
    }
    if (order.requires_two_drivers && !order.secondary_driver_id && hoursToEvent != null && hoursToEvent < 72) {
      candidates.push({
        weight: 85,
        text: "Two-driver job - secondary driver not yet assigned.",
        tone: "rose",
      });
    }
    if (!order.deposit_paid && hoursToEvent != null && hoursToEvent < 48 && order.status !== "delivered" && order.status !== "completed") {
      candidates.push({
        weight: 70,
        text: `Deposit not received and event in ${Math.round(hoursToEvent)}h. Chase the client.`,
        tone: "amber",
      });
    }
    if (!order.balance_paid && (order.status === "delivered" || order.delivered_at)) {
      candidates.push({
        weight: 55,
        text: "Delivered but balance not paid. Send the invoice / collect.",
        tone: "amber",
      });
    }
    // Amendment cutoff approaching - generic admin nudge
    if (order.final_order_change_date) {
      const cutoffH = (new Date(order.final_order_change_date).getTime() - now) / 3_600_000;
      if (cutoffH > 0 && cutoffH < 24 && order.status !== "delivered") {
        candidates.push({
          weight: 50,
          text: `Amendment cutoff in ${Math.round(cutoffH)}h - lock final menu + guest count.`,
          tone: "amber",
        });
      }
    }
  }

  // Pick the highest-weight candidate.
  candidates.sort((a, b) => b.weight - a.weight);
  const top = candidates[0];
  if (!top) return null;

  const toneClass: Record<Suggestion["tone"], string> = {
    rose: "border-rose-300 bg-rose-50 text-rose-900",
    amber: "border-amber-300 bg-amber-50 text-amber-900",
    blue: "border-blue-300 bg-blue-50 text-blue-900",
    indigo: "border-blue-300 bg-blue-50 text-blue-900",
    emerald: "border-brand-primary/30 bg-brand-primary/10 text-brand-primary",
  };

  return (
    <div className={`flex items-start gap-3 p-3 mb-3 rounded-lg border-2 ${toneClass[top.tone]} print:hidden`}>
      <Lightbulb className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider font-semibold opacity-80">Suggested next action</p>
        <p className="text-sm font-medium mt-0.5">{top.text}</p>
      </div>
      {top.cta && (
        <Link
          href={top.cta.href}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 flex-shrink-0"
        >
          {top.cta.label}
          <ArrowRight className="w-3 h-3" />
        </Link>
      )}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-slate-500 hover:text-slate-700 flex-shrink-0 p-0.5 -mt-1 -mr-1"
        title="Dismiss for this session"
        aria-label="Dismiss suggestion"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
