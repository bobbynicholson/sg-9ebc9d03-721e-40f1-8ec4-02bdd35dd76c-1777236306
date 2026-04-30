/**
 * Tenant-scoped CLIENT login -- magic-link only.
 *
 * URL: /{company_slug}/client/login?email={prefill}&next={path}
 *
 * For customers tracking orders / managing their bookings. No password.
 * Staff use a separate page at /{company_slug}/login.
 *
 * This is the URL Bobby uses in client-facing emails (booking
 * confirmations, "Track your event" links, post-event review prompts)
 * so it stays stable forever.
 *
 * UX touches:
 *   - localStorage caches the last email used at THIS slug, so a
 *     returning client sees the field already filled in. We key by slug
 *     so a customer who orders from two different catering companies
 *     keeps two separate cached emails.
 *   - The cache is wiped on "Use a different email" so the next visit
 *     remembers the new address instead.
 *   - When the URL itself carries ?email= (e.g. from an order email),
 *     that wins over the cached value.
 *
 * Security:
 *   - Always shows "check your inbox" regardless of whether the email
 *     is on file -- the API doesn't reveal account existence.
 *   - Branding loaded via SECURITY DEFINER RPC `get_company_branding`,
 *     never via direct companies SELECT.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Mail,
  ArrowRight,
  Loader2,
  Building2,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CompanyBrand {
  name: string;
  logo: string | null;
  primary: string;
  secondary: string;
}

const DEFAULT_PRIMARY = "#9333ea";
const DEFAULT_SECONDARY = "#ec4899";
const EMAIL_CACHE_PREFIX = "cateringms.client_email.";

function readCachedEmail(slug: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(EMAIL_CACHE_PREFIX + slug) || "";
  } catch {
    return "";
  }
}

function writeCachedEmail(slug: string, email: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EMAIL_CACHE_PREFIX + slug, email);
  } catch {
    /* private browsing / quota -- silently skip */
  }
}

function clearCachedEmail(slug: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(EMAIL_CACHE_PREFIX + slug);
  } catch {
    /* ignore */
  }
}

export default function CompanyClientLoginPage() {
  const router = useRouter();
  const { company_slug, email: emailFromQuery, next, message } = router.query;

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [companyBrand, setCompanyBrand] = useState<CompanyBrand | null>(null);
  const [companyLookupFailed, setCompanyLookupFailed] = useState(false);

  // Resolve initial email value once the slug is available.
  // Priority: URL ?email= > cached email > empty.
  useEffect(() => {
    if (typeof company_slug !== "string") return;
    if (email) return; // already populated, don't clobber
    if (typeof emailFromQuery === "string" && emailFromQuery.includes("@")) {
      setEmail(emailFromQuery.trim().toLowerCase());
      return;
    }
    const cached = readCachedEmail(company_slug);
    if (cached) setEmail(cached);
  }, [company_slug, emailFromQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Branding lookup via SECURITY DEFINER RPC.
  useEffect(() => {
    if (!company_slug || typeof company_slug !== "string") return;
    let cancelled = false;
    (async () => {
      // Cast to any: types haven't been regenerated since the RPC was added.
      const { data } = await (supabase.rpc as any)("get_company_branding", {
        p_slug: company_slug,
      });
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        setCompanyLookupFailed(true);
        return;
      }
      setCompanyBrand({
        name: (row as any).company_name || "Your portal",
        logo: (row as any).logo_url || null,
        primary: (row as any).primary_color || DEFAULT_PRIMARY,
        secondary: (row as any).secondary_color || DEFAULT_SECONDARY,
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
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/client-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          company_slug: slug,
          next: typeof next === "string" ? next : undefined,
        }),
      });

      if (res.status === 429) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Too many tries. Please wait and try again.");
        return;
      }
      if (!res.ok) {
        setError("Could not send sign-in link. Please try again.");
        return;
      }
      const json = await res.json().catch(() => ({} as any));
      // Cache only AFTER a successful API call so a typo'd email never
      // gets remembered for next time.
      writeCachedEmail(slug, cleanEmail);

      // Dev fallback: server returns the link directly when
      // DEV_RETURN_MAGIC_LINK=true. NEVER on in production.
      if (json?.dev_link && typeof json.dev_link === "string") {
        window.location.href = json.dev_link;
        return;
      }
      setSent(true);
    } catch {
      setError("Network issue, please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const brandGradient = companyBrand
    ? `linear-gradient(135deg, ${companyBrand.primary} 0%, ${companyBrand.secondary} 100%)`
    : `linear-gradient(135deg, ${DEFAULT_PRIMARY} 0%, ${DEFAULT_SECONDARY} 100%)`;

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
        style={{ background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)" }}
      >
        <Card className="w-full max-w-md border-0 shadow-2xl rounded-3xl overflow-hidden">
          <div className="px-7 pt-7 pb-6" style={{ background: brandGradient }}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shadow-lg flex-shrink-0">
                {companyBrand?.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={companyBrand.logo}
                    alt={companyBrand.name}
                    className="w-10 h-10 object-contain rounded-lg"
                  />
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
                <p className="text-sm text-slate-600 leading-relaxed">
                  Enter your email and we'll send you a secure sign-in link. No password needed.
                </p>

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

                <div className="pt-2 text-center">
                  <Link
                    href={`/${typeof company_slug === "string" ? company_slug : ""}/login`}
                    className="text-sm text-slate-600 hover:text-slate-900 underline underline-offset-2"
                  >
                    Staff sign-in (email + password)
                  </Link>
                </div>
              </form>
            ) : (
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
                    <strong className="text-slate-900">Tip:</strong> if it doesn't show up in 30 seconds,
                    check spam or promotions. The link expires in 1 hour.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 text-sm"
                  onClick={() => {
                    if (typeof company_slug === "string") {
                      clearCachedEmail(company_slug);
                    }
                    setSent(false);
                    setError("");
                    setEmail("");
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
