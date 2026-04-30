/**
 * Tenant-scoped client login -- magic-link only.
 *
 * URL: /{company_slug}/login?email={prefill}&next={path}
 *
 * Flow:
 *   1. Page loads, fetches the company's branding by slug.
 *   2. User types their email (or it's pre-filled from the link they
 *      followed from a confirmation email).
 *   3. Submit -> POST /api/auth/client-magic-link with { email, slug,
 *      next }.
 *   4. Show "check your inbox" state with the email shown.
 *   5. They click the magic link in the email, which goes to
 *      /{slug}/auth/callback to actually create the session.
 *
 * No password ever. No signup form. Just one email input.
 *
 * Why we removed the password path:
 *   - Bobby: clients shouldn't have to remember anything.
 *   - First-time clients are auto-provisioned on the callback page,
 *     so the same email field handles "I'm new" and "I'm back".
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, ArrowRight, Loader2, Building2, CheckCircle2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CompanyBrand {
  name: string;
  logo: string | null;
  primary: string;
  secondary: string;
}

const DEFAULT_PRIMARY = "#9333ea";
const DEFAULT_SECONDARY = "#ec4899";

export default function CompanyLoginPage() {
  const router = useRouter();
  const { company_slug, email: emailFromQuery, next, message } = router.query;

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [companyBrand, setCompanyBrand] = useState<CompanyBrand | null>(null);
  const [companyLookupFailed, setCompanyLookupFailed] = useState(false);

  // Pre-fill the email from the URL when the user arrived from a
  // "Track your event" link in their order email. Only runs once when
  // the query parameter first becomes available.
  useEffect(() => {
    if (typeof emailFromQuery === "string" && emailFromQuery.includes("@") && !email) {
      setEmail(emailFromQuery.trim().toLowerCase());
    }
  }, [emailFromQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Look up the company by slug to load branding (logo + colours +
  // name). Falls back to the default purple-pink palette if the slug
  // doesn't match -- with a polite "company not found" message so the
  // user can correct the URL.
  useEffect(() => {
    if (!company_slug || typeof company_slug !== "string") return;

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("companies")
        .select("company_name, logo_url, primary_color, secondary_color")
        .eq("slug", company_slug)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        setCompanyLookupFailed(true);
        return;
      }
      setCompanyBrand({
        name: (data as any).company_name || "Your portal",
        logo: (data as any).logo_url || null,
        primary: (data as any).primary_color || DEFAULT_PRIMARY,
        secondary: (data as any).secondary_color || DEFAULT_SECONDARY,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [company_slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const slug = typeof company_slug === "string" ? company_slug : "";
    if (!slug) {
      setError("This sign-in link is missing the company name.");
      return;
    }
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/client-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          company_slug: slug,
          next: typeof next === "string" ? next : undefined,
        }),
      });

      // We treat all 2xx as "we tried" -- the API never confirms whether
      // the email was actually deliverable, by design (privacy). The
      // user always sees "check your inbox" so an attacker can't probe
      // for valid emails.
      if (res.status === 429) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Too many tries. Please wait and try again.");
        return;
      }
      if (!res.ok) {
        setError("Could not send sign-in link. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Network issue -- please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  // Branding-driven gradient classes for the header tile + button. We
  // use inline styles so each catering company's colours apply per
  // tenant without a Tailwind safelist explosion.
  const brandGradient =
    companyBrand
      ? `linear-gradient(135deg, ${companyBrand.primary} 0%, ${companyBrand.secondary} 100%)`
      : `linear-gradient(135deg, ${DEFAULT_PRIMARY} 0%, ${DEFAULT_SECONDARY} 100%)`;

  // Loading shimmer while the slug param hasn't resolved (typical on
  // first hydration). Using a slim card so the page doesn't flash empty.
  if (!company_slug && !companyLookupFailed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50">
        <Card className="w-full max-w-md">
          <CardContent className="p-12 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-3 text-slate-400 animate-spin" />
            <p className="text-sm text-slate-600">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (companyLookupFailed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardContent className="p-10 text-center">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-400" />
            <h1 className="text-lg font-semibold text-slate-900 mb-1">Company not found</h1>
            <p className="text-sm text-slate-600">
              We couldn't find the catering company at this URL. Please double-check the link from your confirmation email.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{companyBrand ? `${companyBrand.name} | Sign in` : "Sign in"}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div
        className="min-h-screen flex items-center justify-center px-4 py-10"
        style={{
          background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
        }}
      >
        <Card className="w-full max-w-md border-0 shadow-2xl rounded-3xl overflow-hidden">
          {/* Header strip uses the company's brand colours -- thin so the
              card stays focused on the input below. */}
          <div className="px-7 pt-7 pb-6" style={{ background: brandGradient }}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shadow-lg flex-shrink-0">
                {companyBrand?.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={companyBrand.logo} alt={companyBrand.name} className="w-10 h-10 object-contain rounded-lg" />
                ) : (
                  <Building2 className="w-6 h-6 text-white" />
                )}
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-white truncate">
                  {companyBrand?.name || "Your portal"}
                </h1>
                <p className="text-xs sm:text-sm text-white/80">
                  {sent ? "Check your inbox" : "Sign in to your account"}
                </p>
              </div>
            </div>
          </div>

          <CardContent className="p-7 sm:p-8">
            {!sent ? (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Enter your email and we'll send you a secure sign-in link. No password needed.
                  </p>
                </div>

                {message === "session_expired" && (
                  <Alert className="text-sm border-amber-200 bg-amber-50 text-amber-900">
                    <AlertDescription>
                      Your session ended. Pop your email in below and we'll send a fresh link.
                    </AlertDescription>
                  </Alert>
                )}

                {error && (
                  <Alert variant="destructive" className="text-sm">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-700 font-medium text-sm">
                    Email address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-400 pointer-events-none" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-12 text-base"
                      required
                      disabled={loading}
                      autoComplete="email"
                      autoFocus={!email}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 text-base font-semibold text-white border-0"
                  style={{ background: brandGradient }}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Sending link...
                    </>
                  ) : (
                    <>
                      Email me a sign-in link
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>

                <p className="text-xs text-slate-500 text-center leading-relaxed">
                  Links expire in 1 hour for your security.
                </p>
              </form>
            ) : (
              /* Sent state -- single calm screen confirming we sent an
                 email. We don't reveal whether the address is on file
                 (privacy), but we do show the address typed so the user
                 can spot a typo before going to look in their inbox. */
              <div className="space-y-5 text-center">
                <div
                  className="mx-auto w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ background: brandGradient }}
                >
                  <CheckCircle2 className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 mb-1">Check your inbox</h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    We've sent a sign-in link to{" "}
                    <span className="font-medium text-slate-900">{email}</span>.
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-left">
                  <p className="text-xs text-slate-700 leading-relaxed">
                    <strong className="text-slate-900">Tip:</strong> if it doesn't show up in 30 seconds, check spam or promotions. The link expires in 1 hour.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 text-sm"
                  onClick={() => {
                    setSent(false);
                    setError("");
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Use a different email
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
