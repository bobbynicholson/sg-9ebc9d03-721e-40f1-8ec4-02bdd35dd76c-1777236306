/** Shared rules for the WhatsApp Activity page. */
export const ACTIVITY_PAGE_SIZE = 25;
export const ACTIVITY_PERIODS = [7, 30, 90] as const;

export const ACTIVITY_STATUSES: Record<string, string[]> = {
  waiting: ["pending", "sending"],
  sent: ["sent"],
  delivered: ["delivered"],
  read: ["read"],
  failed: ["failed"],
  cancelled: ["cancelled"],
};

export type MessageSource = "Automatic" | "Manual" | "Bulk" | "Reply" | "Test";

/** How a message came to be sent, from the way it was queued. */
export function messageSource(dedupKey: string | null | undefined, messageType: string | null | undefined): MessageSource {
  const key = String(dedupKey || "");
  if (key.startsWith("test:")) return "Test";
  if (key.startsWith("auto:")) return "Automatic";
  if (key.startsWith("bulk:")) return "Bulk";
  if (key.startsWith("manual:")) return "Manual";
  return messageType === "text" ? "Reply" : "Manual";
}

export function statusLabel(status: string): string {
  if (status === "pending" || status === "sending") return "Waiting";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function readPeriod(value: unknown): number {
  const days = Number(value);
  return (ACTIVITY_PERIODS as readonly number[]).includes(days) ? days : 30;
}
