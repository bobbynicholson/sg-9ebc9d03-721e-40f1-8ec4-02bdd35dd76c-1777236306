/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * EmailProviderBanner - operator-facing email-sending state.
 *
 * TIGHTEN I.37 (2026-06-01): the old version yelled
 * "Email provider not set up - emails to clients will NOT be sent"
 * at every fresh tenant. That's a lie: every tenant CAN send out
 * the box because emailService falls back to the shared platform
 * Resend sender (noreply@send.cateringms.com) with Reply-To set to
 * the operator's from address. Clients still reach the operator
 * when they hit Reply. The DNS-verify path is an upgrade, not a
 * prerequisite.
 *
 * Three states (see getEmailProviderStatus):
 *
 *   - "verified"          - hide the banner. They're done.
 *   - "platform_default"  - calm sky-blue notice: "Emails are going
 *                           out via our shared sender. Replies route
 *                           to you. Verify your domain when you want
 *                           your address on the From line."
 *                           This is the MOST COMMON state across the
 *                           customer base - don't make it look like
 *                           a fire.
 *   - "broken"            - amber alert, real failure: they picked
 *                           SMTP/Mailchimp and didn't finish wiring
 *                           it, so emailService can't fall back.
 *                           Send is genuinely blocked.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Mail, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantHref } from "@/lib/tenantUrl";
import {
  getEmailProviderStatus,
  type EmailProviderStatus,
} from "@/lib/email/providerStatus";

interface Props {
  companyId: string;
}

export function EmailProviderBanner({ companyId }: Props) {
  const { withSlug } = useTenantHref();
  const [status, setStatus] = useState<EmailProviderStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) return;

    void (async () => {
      const next = await getEmailProviderStatus(supabase as any, companyId);
      if (cancelled) return;
      setStatus(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  // Don't flash anything before the status is in. Avoids a "we're
  // sending via our shared sender" beat on first paint for tenants
  // who have already verified their own domain.
  if (!status) return null;
  if (status.state === "verified") return null;

  const settingsHref = withSlug("/admin/email-settings");

  if (status.state === "broken") {
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Email sending is paused - your provider config is incomplete.
            </p>
            <p className="mt-1 text-xs text-amber-800">
              {status.reason || "Finish setup in Email settings to start sending again."}
            </p>
          </div>
        </div>
        <Link
          href={settingsHref}
          className="inline-flex items-center gap-1 self-start rounded-md bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 sm:self-auto"
        >
          Fix in Email settings
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  // platform_default - calm, informational, framed as an upgrade.
  // Sky-blue palette so it reads as "good to know", not "act now".
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 h-5 w-5 flex-shrink-0 text-sky-600" />
        <div>
          <p className="text-sm font-semibold text-sky-900">
            Your client emails are sending from our shared address.
          </p>
          <p className="mt-1 text-xs text-sky-800 leading-relaxed">
            Quotes, confirmations and receipts go out from{" "}
            <span className="font-mono">noreply@send.cateringms.com</span>.{" "}
            {status.fromEmail ? (
              <>
                Replies route back to <span className="font-medium">{status.fromEmail}</span>, so clients can still reach you directly.
              </>
            ) : (
              <>Replies route back to your team's inbox, so clients can still reach you directly.</>
            )}{" "}
            Want your own address on the From line? Verify your domain - takes about 10 minutes.
          </p>
          <p className="mt-2 text-[11px] text-sky-700 inline-flex items-center gap-1">
            <Info className="h-3 w-3" />
            This is fine for most caterers. Verification is optional.
          </p>
        </div>
      </div>
      <Link
        href={settingsHref}
        className="inline-flex items-center gap-1 self-start rounded-md bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 sm:self-auto whitespace-nowrap"
      >
        Verify my domain
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
