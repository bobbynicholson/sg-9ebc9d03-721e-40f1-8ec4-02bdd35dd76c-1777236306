/**
 * Contextual breadcrumb banner shown on the four destinations a
 * cashflow-dashboard Quick Action sends the operator to. Reads
 * `?from=cashflow` off the router and explains why they landed
 * here. Pre-CASH-D the operator clicked "Manage payables" on the
 * forecast and landed on a generic list with no signal that they'd
 * come from a forecast page; this stitches the two together.
 *
 * Renders nothing when the query param is absent, so it's safe to
 * mount unconditionally near the top of each destination page.
 */
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft } from "lucide-react";
import { useTenantHref } from "@/lib/tenantUrl";

interface Props {
  /** Short sentence describing why this page is the right next step. */
  message: string;
}

export function CashflowContextBanner({ message }: Props) {
  const router = useRouter();
  const { withSlug } = useTenantHref();
  const from = router.query.from;
  if (from !== "cashflow") return null;
  return (
    <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between gap-3">
      <p className="text-sm text-emerald-900">
        <span className="font-semibold">From the cashflow forecast:</span>{" "}
        {message}
      </p>
      <Link
        href={withSlug("/admin/cashflow-dashboard")}
        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 shrink-0"
      >
        <ArrowLeft className="w-3 h-3" />
        Back to forecast
      </Link>
    </div>
  );
}
