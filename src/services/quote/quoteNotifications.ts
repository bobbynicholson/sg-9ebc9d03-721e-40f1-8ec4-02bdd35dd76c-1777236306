import { UserRole } from "@/types/app";
import { notificationService } from "@/services/notificationService";

const FIELD_LABELS: Record<string, string> = {
  client_name: "client details", client_email: "client details", client_phone: "client details",
  quote_name: "event details", event_date: "event details", event_time: "event details", setup_time: "event details",
  guest_count: "guest count", venue_address: "venue details", menu_items: "menu items", equipment_items: "equipment items",
  delivery_fee: "delivery fee", collection_fee: "collection fee", waiter_service_required: "waiter service",
  waiter_count: "waiter service", waiter_duration_hours: "waiter service", waiter_hourly_rate: "waiter service",
  waiter_total_fee: "waiter service", subtotal: "pricing", tax: "pricing", tax_amount: "pricing",
  discount_amount: "discount", total: "total", total_amount: "total", valid_until: "validity date",
  notes: "client-facing note", status: "status", sent_at: "status",
};

const IGNORED_FIELDS = new Set([
  "updated_at", "created_at", "deleted_at", "public_token", "viewed_at", "accepted_at", "rejected_at", "converted_at",
]);

function changedLabels(updates: Record<string, unknown>): string[] {
  const labels = new Set<string>();
  for (const key of Object.keys(updates)) {
    if (IGNORED_FIELDS.has(key)) continue;
    labels.add(FIELD_LABELS[key] || key.replace(/_/g, " "));
  }
  return Array.from(labels).slice(0, 4);
}

export async function notifyQuoteUpdated({
  quote,
  updates,
}: {
  quote: Record<string, any>;
  updates: Record<string, unknown>;
}): Promise<void> {
  const companyId = quote?.company_id;
  const quoteId = quote?.id;
  if (!companyId || !quoteId) return;

  const labels = changedLabels(updates);
  if (labels.length === 0) return;
  const quoteLabel = quote.quote_number || `quote ${String(quoteId).slice(0, 8)}`;
  const pricingChanged = labels.some((label) => ["pricing", "discount", "total"].includes(label));

  try {
    await notificationService.broadcastNotification({
      companyId,
      type: "quote_updated",
      title: "Quote updated",
      message: `${quoteLabel} was updated: ${labels.join(", ")}.`,
      targetRoles: [UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN],
      priority: pricingChanged || labels.includes("status") ? "high" : "normal",
      link: `/admin/quotes/${quoteId}`,
      regionId: quote.region_id || undefined,
      relatedEntityType: "quote",
      relatedEntityId: quoteId,
      dedup: true,
      dedupWindowMinutes: 5,
    });
  } catch (error) {
    console.warn("[quoteNotifications] quote update notification failed:", error);
  }
}
