/* eslint-disable @typescript-eslint/no-explicit-any */
import { notificationService } from "@/services/notificationService";

const ADMIN_ROLES = ["company_admin" as any, "admin" as any, "owner" as any, "region_admin" as any];

export async function notifyOutsourceDeclineForReassignment(
  sb: any,
  assignmentId: string,
  opts?: { reason?: string | null; source?: string | null; actorUserId?: string | null },
): Promise<boolean> {
  const { data: assignment, error } = await sb
    .from("outsource_assignments")
    .select(`
      id, company_id, order_id, service_description, decline_reason, routing_group_id,
      provider:provider_id ( provider_name ),
      order:order_id ( order_number, event_name, client_name, event_date, region_id )
    `)
    .eq("id", assignmentId)
    .maybeSingle();

  if (error) {
    console.warn("[outsourceDeclineService] assignment lookup failed:", error);
    return false;
  }
  if (!assignment?.company_id) return false;

  const order = (assignment as any).order || {};
  const providerName = (assignment as any).provider?.provider_name || "Outsource provider";
  const orderLabel = order.order_number || order.event_name || order.client_name || "this order";
  const reason = (opts?.reason || assignment.decline_reason || "").trim();

  try {
    await notificationService.broadcastNotification({
      companyId: assignment.company_id,
      regionId: order.region_id || null,
      targetRoles: ADMIN_ROLES,
      type: "outsource_reassign_needed",
      title: "Outsource provider declined",
      message:
        `${providerName} declined ${assignment.service_description || "the outsource request"} for ${orderLabel}. ` +
        `Pick a backup provider${reason ? ` - ${reason}` : ""}.`,
      priority: "high",
      link: `/admin/orders?orderId=${assignment.order_id}`,
      relatedEntityType: "outsource_assignment",
      relatedEntityId: assignment.id,
      dedup: true,
      dedupWindowMinutes: 60,
    }, sb);
  } catch (notifyErr) {
    console.warn("[outsourceDeclineService] reassignment notification failed:", notifyErr);
  }

  try {
    await sb.from("audit_logs").insert({
      company_id: assignment.company_id,
      user_id: opts?.actorUserId ?? null,
      action: "outsource_reassignment_prompted",
      entity_type: "outsource_assignment",
      entity_id: assignment.id,
      details: {
        source: opts?.source || "outsource_decline",
        provider_name: providerName,
        order_number: order.order_number || null,
        order_id: assignment.order_id,
        service_description: assignment.service_description,
        decline_reason: reason || null,
        routing_group_id: assignment.routing_group_id || null,
      },
    });
  } catch (auditErr) {
    console.warn("[outsourceDeclineService] reassignment audit failed:", auditErr);
  }

  return true;
}
