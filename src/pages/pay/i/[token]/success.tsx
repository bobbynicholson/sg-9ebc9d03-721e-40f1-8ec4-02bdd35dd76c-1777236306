/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /pay/i/[token]/success -- post-payment landing page.
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
import { CheckCircle2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function hexToRgbTriplet(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)}`;
}

export default function InvoicePaymentSuccessPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : null;
  const [companyName, setCompanyName] = useState<string | null>(null);

  // Pull just enough invoice/company info for the brand colour + name.
  // Failures here are silent -- this is a confirmation page, not a
  // critical path.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("invoices")
        .select(`
          id,
          companies!inner ( company_name, primary_color, secondary_color, accent_color )
        `)
        .eq("public_token", token)
        .maybeSingle();
      if (cancelled || !data?.companies) return;
      const root = document.documentElement;
      const apply = (key: string, hex: string | null) => {
        if (!hex) return;
        const rgb = hexToRgbTriplet(hex);
        if (!rgb) return;
        root.style.setProperty(`--brand-${key}`, hex);
        root.style.setProperty(`--brand-${key}-rgb`, rgb);
      };
      apply("primary",   data.companies.primary_color);
      apply("secondary", data.companies.secondary_color);
      apply("accent",    data.companies.accent_color);
      setCompanyName(data.companies.company_name);
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <>
      <Head>
        <title>Payment received</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-0 shadow-sm">
          <CardContent className="py-10 px-6 text-center space-y-5">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-600 shadow-lg">
              <CheckCircle2 className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-bold text-stone-900">
                Payment received
              </h1>
              <p className="text-sm text-stone-600 mt-2 max-w-xs mx-auto">
                Thanks{companyName ? ` -- ${companyName} has been notified` : ""}.
                A confirmation email is on its way.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              {token && (
                <Button
                  onClick={() => router.push(`/pay/i/${token}`)}
                  variant="outline"
                  className="gap-1.5"
                >
                  <FileText className="w-4 h-4" />
                  View invoice
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
