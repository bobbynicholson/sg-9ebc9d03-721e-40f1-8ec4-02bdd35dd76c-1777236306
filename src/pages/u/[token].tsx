/**
 * /u/[token] - public email unsubscribe confirmation page.
 *
 * The user clicks the unsubscribe link in an email footer; the link
 * carries the HMAC-signed token from src/lib/emailUnsubscribe.ts.
 * This page renders a "Confirm unsubscribe" button so a misclick
 * doesn't accidentally suppress the user. The Confirm button POSTs
 * to /api/public/email-unsubscribe which inserts into
 * blocked_contacts.
 *
 * Privacy: the page deliberately doesn't display the email or
 * company name decoded from the token - that would leak the
 * targeting info if a stranger forwarded the link. It just says
 * "click to confirm".
 */
import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Loader2, MailMinus } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";

export default function EmailUnsubscribePage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : "";

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!token || submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      const resp = await fetch("/api/public/email-unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      // Endpoint is privacy-locked at 200, so any non-200 is a real
      // network problem (offline, 5xx). Treat 200 as success regardless
      // of what the endpoint thought about the token.
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setDone(true);
    } catch (e: any) {
      setErr(e?.message || "Couldn't process the request. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Unsubscribe - CateringMS</title></Head>
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
        <Card className="max-w-md w-full border-0 shadow-lg">
          <CardContent className="pt-8 pb-6 text-center">
            {done ? (
              <>
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
                <h1 className="text-xl font-bold text-slate-900 mb-2">You're unsubscribed</h1>
                <p className="text-sm text-slate-600">
                  We won't email you again from this catering company. If you change your mind, just contact them directly to opt back in.
                </p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <MailMinus className="w-6 h-6 text-slate-700" />
                </div>
                <h1 className="text-xl font-bold text-slate-900 mb-2">Unsubscribe</h1>
                <p className="text-sm text-slate-600 mb-6">
                  Click confirm to stop receiving emails from this catering company. You can ask them to opt back in any time by contacting them directly.
                </p>
                {err && (
                  <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 mb-4 text-left">
                    <p className="text-xs text-rose-700">{err}</p>
                  </div>
                )}
                <Button
                  onClick={handleConfirm}
                  disabled={!token || submitting}
                  className="bg-slate-900 hover:bg-slate-800 text-white"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {submitting ? "Working..." : "Confirm unsubscribe"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
