import { SubscriptionStatusChip } from "@/components/admin/platform/PlatformStatusChip";

/**
 * Subscription-status pill used on the company list and the details
 * modal. Extracted from the inlined `getStatusBadge` function in
 * /admin/platform/company-database as part of the P2-13 split.
 */
export function CompanyStatusBadge({ status }: { status: string }) {
  return <SubscriptionStatusChip status={status} />;
}
