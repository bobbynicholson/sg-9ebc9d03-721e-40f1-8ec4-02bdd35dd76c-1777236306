/**
 * Wave 28.6 - single rich admin notification for a cancellation.
 *
 * Replaces the "spam admins per channel" pattern. One broadcast fires
 * with a structured message that includes:
 *   - days out from event
 *   - payout choice + amount + bonus
 *   - committed cost (if any)
 *   - freed slot (so the admin knows what re-opens for re-booking)
 *   - link straight to the order detail
 *
 * Idempotency is handled by notificationService.broadcastNotification's
 * dedup window (60 min) - a duplicate cancel call won't double-fire.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface CancellationNotificationInput {
  supabase: SupabaseClient;
  orderId: string;
  companyId: string;
  orderNumber?: string | null;
  clientName?: string | null;
  eventDate?: string | null;
  daysToEvent: number;
  payoutChoice: "refund" | "credit";
  refundAmount: number;
  creditAmount: number;
  committedCostNote: string | null;
  /** 'admin' (operator-cancel) or 'client' (self-service). */
  requestedBy: "admin" | "client";
  /** Catering company currency code, defaults ZAR. */
  currencyCode?: string | null;
  /** Reason text from wizard, optional. */
  reason?: string | null;
}

const fmtMoney = (n: number, code?: string | null): string => {
  try {
    // Consistency (Callum 2026-07-08): exact cents + dot-decimal / space
    // grouping like formatZAR so refund / balance amounts in a
    // cancellation notification match the invoice + PDF, no rounding.
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: (code || "ZAR").toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).formatToParts(n || 0).map((p) => {
      if (p.type === "group") return " ";
      if (p.type === "decimal") return ".";
      return p.value.replace(/\s/g, " ");
    }).join("");
  } catch {
    return `R${(n || 0).toFixed(2)}`;
  }
};

const fmtEvent = (iso: string | null | undefined): string => {
  if (!iso) return "the event date";
  try {
    const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
    return d.toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
  } catch {
    return String(iso);
  }
};

export async function fireRichCancellationNotification(
  input: CancellationNotificationInput,
): Promise<void> {
  try {
    const { notificationService } = await import("@/services/notificationService");
    const { UserRole } = await import("@/types/app");

    const orderRef = input.orderNumber || `#${input.orderId.slice(0, 8)}`;
    const who = input.clientName || "A client";
    const eventLabel = fmtEvent(input.eventDate);
    const daysOutLabel =
      input.daysToEvent === 0
        ? "on the day of the event"
        : `${input.daysToEvent} day${input.daysToEvent === 1 ? "" : "s"} out`;

    const payoutLine =
      input.payoutChoice === "credit" && input.creditAmount > 0
        ? `Store credit issued: ${fmtMoney(input.creditAmount, input.currencyCode)}.`
        : input.payoutChoice === "refund" && input.refundAmount > 0
          ? `Refund queued: ${fmtMoney(input.refundAmount, input.currencyCode)}.`
          : `No payout (nothing was paid yet, or forfeit per policy).`;

    const committedLine = input.committedCostNote
      ? `Committed costs: ${input.committedCostNote}`
      : "No committed costs flagged.";

    const initiator =
      input.requestedBy === "client" ? "via self-service" : "by the team";

    const message =
      `${who} cancelled order ${orderRef} ${initiator} - ${daysOutLabel}.\n` +
      `${payoutLine}\n` +
      `${committedLine}\n` +
      `The ${eventLabel} slot is now free to re-offer.` +
      (input.reason ? `\nReason: "${input.reason}"` : "");

    await (notificationService as any).broadcastNotification(
      {
        companyId: input.companyId,
        type: "order_cancelled",
        title: `Order ${orderRef} cancelled (${daysOutLabel})`,
        message,
        priority: "high",
        link: `/order/${input.orderId}?role=admin`,
        relatedEntityType: "order",
        relatedEntityId: input.orderId,
        targetRoles: [
          UserRole.SUPER_ADMIN,
          UserRole.COMPANY_ADMIN,
          UserRole.ADMIN,
          "owner" as any,
        ],
        // Dedup - broadcastNotification uses (type + relatedEntityId)
        // within the window when dedup:true. Same cancel firing twice
        // (e.g. retry path) collapses to a single admin notification.
        dedup: true,
        dedupWindowMinutes: 60,
      },
      input.supabase,
    );
  } catch (e) {
    console.warn("[fireRichCancellationNotification] failed:", e);
  }
}
