/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /pay/i/[token]/success - post-payment landing page.
 *
 * Reached after PayFast bounces the customer back via the return_url
 * we set in /pay/i/[token].tsx. Confirms the payment landed in a
 * branded card matching the invoice template.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, CircleAlert, FileText, Loader2 } from "lucide-react";
import { applyBrandingToDOM, loadBrandFonts } from "@/lib/branding/applyBranding";
import { PublicActionShell } from "@/components/PublicActionShell";

export default function InvoicePaymentSuccessPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : null;
  const paymentAttemptId = typeof router.query.payment_attempt_id === "string"
    ? router.query.payment_attempt_id
    : null;
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [paymentState, setPaymentState] = useState<"checking" | "pending" | "succeeded" | "failed" | "expired">("checking");
  const hasFinalPaymentState = ["succeeded", "failed", "expired"].includes(paymentState);
  const invoiceDashboardUrl = token
    ? `/pay/i/${encodeURIComponent(token)}${paymentAttemptId
      ? `?payment_return=1&payment_attempt_id=${encodeURIComponent(paymentAttemptId)}`
      : ""}`
    : null;

  // A return URL is not proof of payment. Poll the server-side attempt
  // status, which only the signed provider webhook can mark successful.
  useEffect(() => {
    if (!router.isReady || !token) return;
    if (!paymentAttemptId) {
      setPaymentState("pending");
      return;
    }
    let cancelled = false;
    (async () => {
      for (let check = 0; check < 120 && !cancelled; check += 1) {
        try {
          const response = await fetch("/api/payments/confirm-return", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({ public_token: token, payment_attempt_id: paymentAttemptId }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error("Payment status unavailable");
          if (cancelled) return;
          if (["succeeded", "failed", "expired"].includes(result?.status)) {
            setPaymentState(result.status);
            return;
          }
          setPaymentState("pending");
        } catch {
          if (!cancelled) setPaymentState("pending");
        }
        if (check < 119) await new Promise((resolve) => setTimeout(resolve, check < 12 ? 2500 : 10000));
      }
    })();
    return () => { cancelled = true; };
  }, [router.isReady, token, paymentAttemptId]);

  // Give the payer a moment to read the verified result, then return to
  // the public invoice dashboard where the refreshed paid-to-date and
  // remaining balance are shown. The attempt ID lets that page recheck
  // the result and render its matching success/failure message.
  useEffect(() => {
    if (!router.isReady || !invoiceDashboardUrl || !paymentAttemptId || !hasFinalPaymentState) return;
    const timer = window.setTimeout(() => {
      void router.replace(invoiceDashboardUrl);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [router.isReady, router, invoiceDashboardUrl, paymentAttemptId, hasFinalPaymentState]);

  // Pull just enough invoice/company info for the brand colour + name.
  // Failures here are silent - this is a confirmation page, not a
  // critical path.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/public/invoices/${encodeURIComponent(token)}/get`, {
        method: "GET",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      const company = data?.invoice?.companies;
      if (cancelled || !company) return;
      const row = {
        id: company.id,
        companyName: company.company_name,
        logoUrl: company.logo_url,
        primaryColor: company.primary_color,
        secondaryColor: company.secondary_color,
        accentColor: company.accent_color,
        fontBody: company.brand_font_body ?? null,
        fontDisplay: company.brand_font_display ?? null,
      };
      applyBrandingToDOM(row);
      loadBrandFonts(row);
      setCompanyName(company.company_name);
    })().catch(() => { /* Optional branding must not interrupt payment confirmation. */ });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <>
      <Head>
        <title>{paymentState === "succeeded" ? "Payment received" : "Payment status"}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <PublicActionShell className="items-center">
        <Card className="max-w-md w-full border-0 shadow-sm">
          <CardContent className="py-10 px-6 text-center space-y-5">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-primary shadow-lg">
              {paymentState === "succeeded"
                ? <CheckCircle2 className="w-7 h-7 text-white" />
                : paymentState === "failed" || paymentState === "expired"
                  ? <CircleAlert className="w-7 h-7 text-white" />
                  : <Loader2 className="w-7 h-7 text-white animate-spin" />}
            </div>
            <div>
              <h1 className="text-2xl font-serif font-bold text-stone-900">
                {paymentState === "succeeded"
                  ? "Payment received"
                  : paymentState === "failed"
                    ? "Payment was not completed"
                    : paymentState === "expired"
                      ? "Checkout expired"
                      : "Payment is processing"}
              </h1>
              <p className="text-sm text-stone-600 mt-2 max-w-xs mx-auto">
                {paymentState === "succeeded"
                  ? `Thanks${companyName ? ` - ${companyName} has been notified` : ""}. A confirmation email is on its way.`
                  : paymentState === "failed"
                    ? "The payment provider reported a failed or cancelled payment. You can return to the invoice and try again."
                    : paymentState === "expired"
                      ? "This checkout expired before payment was confirmed. Return to the invoice to start a new checkout."
                      : "We are waiting for the payment provider to confirm the transaction. This page will update automatically."}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              {token && (
                <Button
                  onClick={() => router.push(invoiceDashboardUrl || `/pay/i/${token}`)}
                  variant="outline"
                  className="gap-1.5"
                >
                  <FileText className="w-4 h-4" />
                  View invoice now
                </Button>
              )}
            </div>
            {hasFinalPaymentState && (
              <p className="text-xs text-stone-500" role="status">
                Returning to your invoice dashboard shortly…
              </p>
            )}
          </CardContent>
        </Card>
      </PublicActionShell>
    </>
  );
}
