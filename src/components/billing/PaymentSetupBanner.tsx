import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CreditCard, X } from "lucide-react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { getTenantSlugFromPathname } from "@/lib/tenantRoute";

/**
 * Tenant payment readiness guard. This is deliberately informational: a
 * company may still create quotes/orders and collect EFT while online
 * payments are being configured, but operators must never miss the setup.
 */
export function PaymentSetupBanner() {
  const { user } = useAuth() as any;
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  const role = user?.active_role || user?.role;
  const companyId = user?.company_id;
  const canManagePayments = ["owner", "company_admin", "admin", "super_admin"].includes(role);
  const isPaymentPage = router.pathname.includes("/payment-gateways") || router.pathname.includes("/onboarding");
  const tenantSlug = getTenantSlugFromPathname(router.asPath);
  const setupHref = tenantSlug ? `/${tenantSlug}/admin/onboarding?step=payment` : "/admin/onboarding?step=payment";

  useEffect(() => {
    if (!companyId || !canManagePayments || isPaymentPage) {
      setLoading(false);
      setVisible(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/payment-gateways", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        const gateways = Array.isArray(payload?.gateways) ? payload.gateways : [];
        const active = gateways.some((gateway: any) => gateway?.is_active === true);
        if (!cancelled) setVisible(!active);
      } catch {
        // A readiness banner must never turn a network hiccup into a block.
        if (!cancelled) setVisible(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, canManagePayments, isPaymentPage]);

  if (loading || !visible || dismissed) return null;

  return (
    <div className="sticky top-0 z-30 border-b border-amber-300 bg-amber-50/95 shadow-sm backdrop-blur dark:border-amber-700 dark:bg-amber-950/95">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200">
          <CreditCard className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-amber-950 dark:text-amber-100">Online payments are not set up</p>
          <p className="hidden text-amber-800 sm:block dark:text-amber-200">Configure your company’s payment method before sending clients a quote or order payment link.</p>
        </div>
        <Link href={setupHref}>
          <Button size="sm" className="shrink-0 bg-amber-600 text-white hover:bg-amber-700">
            Complete setup <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </Link>
        <button aria-label="Dismiss payment setup reminder" className="shrink-0 rounded p-1 text-amber-700 hover:bg-amber-100" onClick={() => setDismissed(true)}>
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
