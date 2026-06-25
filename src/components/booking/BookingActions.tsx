/**
 * BookingActions - Wave 70.43
 *
 * Standardised role-driven action bar for a booking. Pairs with
 * <BookingHeader> (Wave 70.41) and <BookingFacts> (Wave 70.42).
 *
 * Each variant exposes only the CTAs that role is allowed to do:
 *
 *   admin    - Edit / Send invoice / Mark paid / Print prep sheet /
 *               Cancel order / Force-close
 *   client   - Pay deposit (deep link to payment) / Accept changes
 *               / Request changes (compose follow-up)
 *   kitchen  - Open order document / Mark prep done (when all
 *               tasks complete)
 *   driver   - Open run sheet / Mark delivered (POD)
 *   cleaning - Open handover / Sign off / Log damage
 *   shopping - Add to buy list
 *
 * Why a component (rather than each surface owning its own action
 * bar): the same booking touches multiple surfaces; the operator's
 * mental model is "what can I do here?" and the answer should be
 * consistent. Today each surface implements its own button group
 * with slightly different copy, ordering, and styling. This
 * standardises.
 *
 * Each action takes a handler prop so the surface owns the actual
 * mutation (open dialog / fire API / open route). The component
 * just renders the buttons + handles disabled / loading state.
 *
 * Mutations emit cateringms:order-updated via the Wave 70.40 helper
 * so cross-page listeners stay in sync (the parent handler is
 * responsible for emitting - this component doesn't fire events
 * directly so it stays pure UI).
 */
import { Button } from "@/components/ui/button";
import {
  Edit,
  Send,
  CheckCircle2,
  Printer,
  XCircle,
  FastForward,
  CreditCard,
  ThumbsUp,
  MessageCircle,
  ChefHat,
  Truck,
  Sparkles,
  ShoppingBag,
  AlertTriangle,
} from "lucide-react";
import type { BookingFactsRole } from "@/services/booking/bookingFacts";

// One "action" entry. Surfaces hand in only the actions they want
// to expose; this component renders + arranges them.
export interface BookingAction {
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  /** Visual weight. "primary" = brand gradient; "secondary" =
   *  outline; "danger" = rose. */
  tone?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  busy?: boolean;
  /** Optional title attribute - shown as hover tooltip. */
  hint?: string;
}

interface BookingActionsProps {
  variant: BookingFactsRole;
  actions: BookingAction[];
  /** When true, lays out as a sticky bar at the bottom of the
   *  container. Useful for full-page surfaces (client portal,
   *  order document on mobile). Defaults false for in-flow. */
  sticky?: boolean;
}

export function BookingActions({ variant, actions, sticky = false }: BookingActionsProps) {
  if (actions.length === 0) return null;

  // Variant-specific intro label so the operator knows which role
  // this action bar is offering. Helps debug surfaces that
  // accidentally mount the wrong variant.
  const VARIANT_LABEL: Record<BookingFactsRole, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
    admin:    { label: "Admin actions",       Icon: Edit },
    client:   { label: "Your options",         Icon: ThumbsUp },
    kitchen:  { label: "Kitchen actions",      Icon: ChefHat },
    driver:   { label: "Driver actions",       Icon: Truck },
    cleaning: { label: "Cleaning actions",     Icon: Sparkles },
    shopping: { label: "Shopping actions",     Icon: ShoppingBag },
  };
  const variantMeta = VARIANT_LABEL[variant];
  const VariantIcon = variantMeta.Icon;

  // tone -> shadcn Button props
  const toneToVariant = (tone?: BookingAction["tone"]) => {
    if (tone === "primary")   return "default" as const;
    if (tone === "danger")    return "destructive" as const;
    return "outline" as const;
  };

  return (
    <div
      // Wave 70.44 - no-print hides the action bar on PDF / paper
      // output. Action buttons are useless on a printed page (no
      // one's clicking "Mark paid" on a sheet of paper), and the
      // sticky variant in particular would print as a stuck banner
      // on every page. Surfaces that want the bar on print can
      // override by mounting their own copy without the class.
      className={
        sticky
          ? "no-print fixed bottom-0 left-0 right-0 lg:left-64 xl:left-72 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-700 shadow-lg"
          : "no-print rounded-lg border border-slate-200 bg-white"
      }
    >
      <div className={sticky ? "max-w-screen-2xl mx-auto px-4 py-3" : "px-4 py-3"}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-slate-500 mr-1">
            <VariantIcon className="w-3 h-3" />
            {variantMeta.label}
          </span>
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <Button
                key={a.key}
                size="sm"
                variant={toneToVariant(a.tone)}
                disabled={a.disabled || a.busy}
                onClick={a.onClick}
                title={a.hint}
                className={a.tone === "primary"
                  ? "bg-gradient-to-r from-brand-primary to-brand-secondary hover:opacity-90 text-white"
                  : ""}
              >
                {Icon && <Icon className="w-3.5 h-3.5 mr-1.5" />}
                {a.busy ? "..." : a.label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Action factory helpers ───────────────────────────────────────────────
// Each variant has a standard action set; surfaces use the factory
// + override individual handlers. Saves every surface from
// re-defining the same buttons.

export function buildAdminActions(handlers: {
  onEdit?: () => void;
  onSendInvoice?: () => void;
  onMarkPaid?: () => void;
  onOpenKitchenTicket?: () => void;
  onCancel?: () => void;
  onForceClose?: () => void;
}): BookingAction[] {
  const out: BookingAction[] = [];
  if (handlers.onEdit) out.push({
    key: "edit", label: "Edit", icon: Edit, tone: "primary",
    onClick: handlers.onEdit,
    hint: "Edit the order details",
  });
  if (handlers.onSendInvoice) out.push({
    key: "send-invoice", label: "Send invoice", icon: Send,
    onClick: handlers.onSendInvoice,
    hint: "Send (or resend) the invoice to the client",
  });
  if (handlers.onMarkPaid) out.push({
    key: "mark-paid", label: "Mark paid", icon: CheckCircle2,
    onClick: handlers.onMarkPaid,
    hint: "Record a manual payment",
  });
  if (handlers.onOpenKitchenTicket) out.push({
    key: "kitchen-ticket", label: "Print prep sheet", icon: Printer,
    onClick: handlers.onOpenKitchenTicket,
    hint: "Open the print-friendly kitchen prep sheet",
  });
  if (handlers.onForceClose) out.push({
    key: "force-close", label: "Force-close", icon: FastForward,
    onClick: handlers.onForceClose,
    hint: "Mark this order delivered + completed (one-click cascade for late paperwork)",
  });
  if (handlers.onCancel) out.push({
    key: "cancel", label: "Cancel order", icon: XCircle, tone: "danger",
    onClick: handlers.onCancel,
    hint: "Cancel with refund flow",
  });
  return out;
}

export function buildClientActions(handlers: {
  onPayDeposit?: () => void;
  onAcceptChanges?: () => void;
  onRequestChanges?: () => void;
}): BookingAction[] {
  const out: BookingAction[] = [];
  if (handlers.onPayDeposit) out.push({
    key: "pay-deposit", label: "Pay deposit", icon: CreditCard, tone: "primary",
    onClick: handlers.onPayDeposit,
    hint: "Pay the deposit to confirm your booking",
  });
  if (handlers.onAcceptChanges) out.push({
    key: "accept", label: "Accept changes", icon: ThumbsUp,
    onClick: handlers.onAcceptChanges,
  });
  if (handlers.onRequestChanges) out.push({
    key: "request-changes", label: "Request changes", icon: MessageCircle,
    onClick: handlers.onRequestChanges,
    hint: "Send the catering team a message with the changes you'd like",
  });
  return out;
}

export function buildKitchenActions(handlers: {
  onOpenTicket?: () => void;
  onMarkPrepDone?: () => void;
  onFlagIssue?: () => void;
}): BookingAction[] {
  const out: BookingAction[] = [];
  if (handlers.onOpenTicket) out.push({
    key: "open-ticket", label: "Open order document", icon: Printer, tone: "primary",
    onClick: handlers.onOpenTicket,
    hint: "Open the unified order document for kitchen prep",
  });
  if (handlers.onMarkPrepDone) out.push({
    key: "prep-done", label: "Mark all prep done", icon: CheckCircle2,
    onClick: handlers.onMarkPrepDone,
    hint: "Mark every prep task complete in one tap",
  });
  if (handlers.onFlagIssue) out.push({
    key: "flag-issue", label: "Flag issue", icon: AlertTriangle, tone: "danger",
    onClick: handlers.onFlagIssue,
    hint: "Tell admin something's wrong (missing ingredients, can't make the time, etc.)",
  });
  return out;
}

export function buildDriverActions(handlers: {
  onClaim?: () => void;
  onMarkDelivered?: () => void;
  onReportProblem?: () => void;
}): BookingAction[] {
  const out: BookingAction[] = [];
  if (handlers.onClaim) out.push({
    key: "claim", label: "Claim job", icon: Truck, tone: "primary",
    onClick: handlers.onClaim,
    hint: "Claim this job - you become the assigned driver",
  });
  if (handlers.onMarkDelivered) out.push({
    key: "delivered", label: "Mark delivered", icon: CheckCircle2, tone: "primary",
    onClick: handlers.onMarkDelivered,
    hint: "Capture POD photo + signature + recipient name",
  });
  if (handlers.onReportProblem) out.push({
    key: "report", label: "Report problem", icon: AlertTriangle, tone: "danger",
    onClick: handlers.onReportProblem,
    hint: "Flag a delivery issue (late, can't reach client, etc.)",
  });
  return out;
}

export function buildCleaningActions(handlers: {
  onOpenHandover?: () => void;
  onSignOff?: () => void;
  onLogDamage?: () => void;
}): BookingAction[] {
  const out: BookingAction[] = [];
  if (handlers.onOpenHandover) out.push({
    key: "open-handover", label: "Open handover", icon: Sparkles, tone: "primary",
    onClick: handlers.onOpenHandover,
  });
  if (handlers.onSignOff) out.push({
    key: "sign-off", label: "Sign off", icon: CheckCircle2,
    onClick: handlers.onSignOff,
    hint: "Mark the cleaning complete + record any final notes",
  });
  if (handlers.onLogDamage) out.push({
    key: "log-damage", label: "Log damage", icon: AlertTriangle, tone: "danger",
    onClick: handlers.onLogDamage,
    hint: "Record broken or missing equipment + an optional photo",
  });
  return out;
}

export function buildShoppingActions(handlers: {
  onAddToBuyList?: () => void;
}): BookingAction[] {
  const out: BookingAction[] = [];
  if (handlers.onAddToBuyList) out.push({
    key: "add-to-buylist", label: "Add to buy list", icon: ShoppingBag, tone: "primary",
    onClick: handlers.onAddToBuyList,
    hint: "Add this booking's ingredient demand to today's buy list",
  });
  return out;
}
