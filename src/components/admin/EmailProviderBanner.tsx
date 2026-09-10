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
 * Three base states (see getEmailProviderStatus):
 *
 *   - "verified"          - hide the banner. They're done.
 *   - "platform_default"  - shared sender working as designed.
 *   - "broken"            - they picked SMTP/Mailchimp + didn't
 *                           finish wiring it.
 *
 * TIGHTEN I.44 (2026-06-01): the platform_default banner now tiers
 * by 30-day send volume. Low-volume tenants see the calm sky-blue
 * informational notice. Once they cross 10 sends in 30 days, the
 * banner flips to amber with explicit "verify your domain to
 * improve inbox placement" framing - active senders are the ones
 * who actually feel the shared-sender deliverability ceiling, and
 * the upgrade ROI is real for them. Heavy senders (50+) get a
 * stronger CTA with the actual count surfaced.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Mail, Info, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantHref } from "@/lib/tenantUrl";
import {
  getEmailProviderStatus,
  type EmailProviderStatus,
} from "@/lib/email/providerStatus";

interface Props {
  companyId: string;
}

const LIGHT_VOLUME_THRESHOLD = 10;
const HEAVY_VOLUME_THRESHOLD = 50;

export function EmailProviderBanner({ companyId }: Props) {
  const { withSlug } = useTenantHref();
  const [status, setStatus] = useState<EmailProviderStatus | null>(null);
  // Last-30-days successful send count via the shared sender. Only
  // queried when state === "platform_default" because it's the only
  // state where the count drives a UI change.
  const [sentCount30d, setSentCount30d] = useState<number | null>(null);

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

  useEffect(() => {
    if (!companyId || status?.state !== "platform_default") {
      setSentCount30d(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      // email_automation_log.user_id is actually company_id - legacy
      // misnomer that getEmailConfig and logEmailSent both use.
      const { count, error } = await (supabase as any)
        .from("email_automation_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", companyId)
        .eq("status", "sent")
        .gte("created_at", thirtyDaysAgo.toISOString());
      if (cancelled) return;
      if (error) {
        // Don't fail loud - the volume signal is a nice-to-have. The
        // banner still renders the low-volume copy if the count
        // can't be fetched.
        // eslint-disable-next-line no-console
        console.warn("[EmailProviderBanner] send-count query failed:", error);
        setSentCount30d(0);
        return;
      }
      setSentCount30d(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, status?.state]);

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

  // platform_default - tier by send volume.
  const count = sentCount30d ?? 0;
  const heavy = count >= HEAVY_VOLUME_THRESHOLD;
  const light = count >= LIGHT_VOLUME_THRESHOLD && !heavy;
  const quiet = !light && !heavy;

  if (quiet) {
    // Low volume - calm sky-blue notice, framed as an opportunity.
    // Most fresh tenants live here for their first weeks.
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

  // Active sender (10+ / 50+ sends in 30d) - the deliverability ceiling
  // of the shared sender starts to bite. Push toward own-domain
  // verification with the actual number to make it concrete.
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <TrendingUp className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-amber-900">
            {heavy ? (
              <>You've sent {count} emails in the last 30 days - it's time to verify your own domain.</>
            ) : (
              <>You're actively sending ({count} emails in the last 30 days). Verify your own domain to improve inbox placement.</>
            )}
          </p>
          <p className="mt-1 text-xs text-amber-800 leading-relaxed">
            Right now your emails go out from{" "}
            <span className="font-mono">noreply@send.cateringms.com</span>{" "}
            with replies routing to{" "}
            <span className="font-medium">{status.fromEmail || "your address"}</span>.
            That works, but shared senders typically see ~70-85% inbox placement.{" "}
            <strong>
              Verifying your own domain lifts that to ~92-98%
            </strong>{" "}
            - especially for Gmail and Microsoft 365 recipients who run stricter filters.
            Takes about 10 minutes of DNS work.
          </p>
          <p className="mt-2 text-[11px] text-amber-700 inline-flex items-center gap-1">
            <Info className="h-3 w-3" />
            Clients won't notice during the change - emails keep flowing.
          </p>
        </div>
      </div>
      <Link
        href={settingsHref}
        className="inline-flex items-center gap-1 self-start rounded-md bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 sm:self-auto whitespace-nowrap"
      >
        Verify my domain
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
