/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * EmailProviderBanner -- the operator's safety net.
 *
 * If a tenant has no email provider wired up (no Resend key, no SMTP
 * host) every emailService.sendEmail call falls into the "no provider"
 * branch, logs status='failed' with error_message='No email provider
 * configured', and returns false. The client never gets the quote /
 * confirmation / receipt. Without surfacing that state on the
 * dashboard, the only way an operator finds out is when a client
 * calls in confused.
 *
 * This banner reads email_settings for the active company and renders
 * an amber alert on the admin dashboard until a provider is set up.
 * Once configured, it self-hides.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantHref } from "@/lib/tenantUrl";
import { getEmailProviderStatus } from "@/lib/email/providerStatus";

interface Props {
  companyId: string;
}

export function EmailProviderBanner({ companyId }: Props) {
  // Wave 42 hotfix: destructure withSlug from the hook so the
  // Link href below resolves. Was missing -- the file's @ts-nocheck
  // hid the reference error at build time. The banner only renders
  // when email isn't configured, so any tenant with a missing
  // provider would crash the entire admin dashboard.
  const { withSlug } = useTenantHref();
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) return;

    void (async () => {
      // Wave 40.2: was querying email_settings (5-column skeleton)
      // by user_id (always wrong, the column is company_id) and
      // asking for smtp_password / smtp_host that don't exist on
      // that table. Net effect: every tenant saw the banner forever
      // even when properly configured. Helper queries the real
      // email_provider_settings table by company_id.
      const status = await getEmailProviderStatus(supabase as any, companyId);
      if (cancelled) return;
      setConfigured(status.configured);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  // Don't render anything until we know one way or the other --
  // avoids a banner flash on first paint for properly-configured
  // tenants.
  if (configured === null) return null;
  if (configured) return null;

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-amber-900">
            Email provider not set up -- emails to clients will NOT be sent.
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Configure at Email Settings to start sending quotes, confirmations and receipts.
          </p>
        </div>
      </div>
      <Link
        href={withSlug("/admin/email-settings")}
        className="inline-flex items-center gap-1 self-start rounded-md bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 sm:self-auto"
      >
        Configure now
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
