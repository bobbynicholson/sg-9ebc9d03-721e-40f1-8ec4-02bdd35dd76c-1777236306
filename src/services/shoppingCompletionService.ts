import { getShoppingCostVariance, formatShoppingVariance, SHOPPING_VARIANCE_THRESHOLD } from "@/lib/shopping/completionRules";
import { notificationService } from "@/services/notificationService";
import { UserRole } from "@/types/app";

function fmtMoney(amount: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export async function recordShoppingCostVariance(args: {
  sb: any;
  companyId: string | null | undefined;
  userId?: string | null;
  listId: string;
  listTitle?: string | null;
  estimatedTotal: number | null | undefined;
  actualTotal: number | null | undefined;
}): Promise<boolean> {
  if (!args.companyId) return false;
  const variance = getShoppingCostVariance(args.estimatedTotal, args.actualTotal);
  if (!variance?.shouldFlag) return false;

  const varianceLabel = formatShoppingVariance(variance);
  const listLabel = args.listTitle || "Shopping list";
  const message =
    `${listLabel} closed ${varianceLabel} estimate: ` +
    `${fmtMoney(variance.actual)} actual vs ${fmtMoney(variance.estimated)} estimated.`;

  try {
    await args.sb.from("audit_logs").insert({
      company_id: args.companyId,
      user_id: args.userId ?? null,
      action: "shopping_cost_variance_flagged",
      entity_type: "shopping_list",
      entity_id: args.listId,
      details: {
        estimated_total: variance.estimated,
        actual_total: variance.actual,
        difference: variance.difference,
        variance_percent: variance.percent,
        threshold_percent: SHOPPING_VARIANCE_THRESHOLD,
        direction: variance.direction,
      },
    });
  } catch (auditErr) {
    console.warn("[shoppingCompletionService] cost variance audit failed:", auditErr);
  }

  try {
    await notificationService.broadcastNotification({
      companyId: args.companyId,
      type: "shopping_cost_variance",
      title: "Shopping cost variance flagged",
      message,
      targetRoles: [UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN],
      priority: "high",
      link: `/admin/shopping?listId=${args.listId}`,
      relatedEntityType: "shopping_list",
      relatedEntityId: args.listId,
      dedup: true,
      dedupWindowMinutes: 24 * 60,
    } as any, args.sb);
  } catch (notifyErr) {
    console.warn("[shoppingCompletionService] cost variance notification failed:", notifyErr);
  }

  return true;
}
