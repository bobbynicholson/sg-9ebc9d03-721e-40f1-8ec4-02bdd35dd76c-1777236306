import { Badge } from "@/components/ui/badge";

const VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  trial: "secondary",
  active: "default",
  past_due: "destructive",
  cancelled: "outline",
  suspended: "destructive",
};

/**
 * Subscription-status pill used on the company list and the details
 * modal. Extracted from the inlined `getStatusBadge` function in
 * /admin/platform/company-database as part of the P2-13 split.
 */
export function CompanyStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={VARIANTS[status] || "outline"}>
      {status.replace("_", " ").toUpperCase()}
    </Badge>
  );
}
