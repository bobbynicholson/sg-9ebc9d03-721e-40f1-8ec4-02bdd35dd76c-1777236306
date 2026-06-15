/**
 * Tenant-scoped CLIENT login - magic-link only.
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
 *     is on file - the API doesn't reveal account existence.
 *   - Branding loaded via SECURITY DEFINER RPC `get_company_branding`,
 *     never via direct companies SELECT.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import type { GetStaticPaths, GetStaticProps } from "next";
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
  Star,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getInitialBrandingForSlugDetailed,
  type InitialBranding,
  type BrandingLookupReason,
} from "@/lib/branding/serverBrandingForSlug";

interface CompanyBrand {
  name: string;
  logo: string | null;
  primary: string;
  secondary: string;
}

// Default brand when a tenant hasn't set custom colours — the CateringMS
// warm amber, so un-branded tenant portals match the rest of the product.
const DEFAULT_PRIMARY = "#f59e0b";
const DEFAULT_SECONDARY = "#ea580c";
// Same food photo as the generic CateringMS login so all sign-in pages share
// one composition; the tenant's colour layers on top as a glow.
const PANEL_IMG =
  "https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&q=70&w=1300";
const EMAIL_CACHE_PREFIX = "cateringms.client_email.";

interface PageProps {
  // Raw branding from getStaticProps. _app.tsx forwards this to
  // BrandingProvider so pre-auth pages don't flash default colours.
  // Each page also reads it directly to seed its own local UI.
  initialBranding: InitialBranding | null;
  slugNotFound: boolean;
  // TIGHTEN I.34: discriminated failure reason (see staff login).
  slugFailureReason: BrandingLookupReason | null;
  slugFailureDebug: string | null;
}

function brandFromInitial(b: InitialBranding | null): CompanyBrand | null {
  if (!b) return null;
  return {
    name: b.companyName,
    logo: b.logoUrl,
    primary: b.primaryColor || DEFAULT_PRIMARY,
    secondary: b.secondaryColor || DEFAULT_SECONDARY,
  };
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: [],
  fallback: "blocking",
});

export const getStaticProps: GetStaticProps<PageProps> = async (ctx) => {
  const slug =
    typeof ctx.params?.company_slug === "string" ? ctx.params.company_slug : "";
  const result = await getInitialBrandingForSlugDetailed(slug);
  // TIGHTEN I.34: when the failure is server-side misconfiguration,
  // skip the 60s ISR cache so the next request retries.
  const transientFailure =
    result.reason === "not_configured" || result.reason === "server_error";
  return {
    props: {
      initialBranding: result.branding,
      slugNotFound: !result.branding,
      slugFailureReason: result.reason,
      slugFailureDebug: result.debug,
    },
    revalidate: transientFailure ? 1 : 60,
  };
};

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
    /* private browsing / quota - silently skip */
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

export default function CompanyClientLoginPage({
  initialBranding,
  slugNotFound,
  slugFailureReason,
  slugFailureDebug,
}: PageProps) {
  const router = useRouter();
  const { company_slug, email: emailFromQuery, next, message, reason } = router.query;
  // Phase 3 #8: repeat-customer self-serve. When the URL has
  // ?reason=view_orders we reframe the headline + CTA so a customer
  // who clicks "Email me my orders" from marketing copy / website
  // footer sees a purpose-shaped page instead of a generic sign-in.
  // The actual flow is identical - it's still a magic-link request.
  const isViewOrdersIntent = reason === "view_orders";

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  // Seed from getStaticProps so the very first paint already shows the
  // tenant's logo and palette - no flash of CateringMS defaults.
  const [companyBrand, setCompanyBrand] = useState<CompanyBrand | null>(() =>
    brandFromInitial(initialBranding),
  );
  const [companyLookupFailed, setCompanyLookupFailed] = useState(slugNotFound);

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

  // Refresh branding from the SECURITY DEFINER RPC once we're on the
  // client. Catches the case where the operator has just saved new
  // colours and we're still serving an ISR-cached page from before the
  // change. Falls through silently if the call fails - the SSG seed is
  // already on the page.
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
        if (!initialBranding) setCompanyLookupFailed(true);
        return;
      }
      setCompanyBrand({
        name: (row as any).company_name || "Your portal",
        logo: (row as any).logo_url || null,
        primary: (row as any).primary_color || DEFAULT_PRIMARY,
        secondary: (row as any).secondary_color || DEFAULT_SECONDARY,
      });
      setCompanyLookupFailed(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [company_slug, initialBranding]);

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 via-amber-50 to-orange-50">
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
    // TIGHTEN I.34: differentiate genuine "bad URL" from server-side
    // misconfiguration. End-users still get gentle copy; operators
    // landing here see the actual cause and a debug line.
    const isMisconfig = slugFailureReason === "not_configured";
    const isServerErr = slugFailureReason === "server_error";
    const title = isMisconfig
      ? "Login portal temporarily unavailable"
      : isServerErr
        ? "Couldn't reach the portal"
        : "Company not found";
    const body = isMisconfig
      ? "The server is missing credentials needed to load this portal. Try again shortly, or reach out to the catering team if it persists."
      : isServerErr
        ? "We hit a server error trying to load this portal. Try again in a moment."
        : "We couldn't find the catering company at this URL. Please double-check the link from your confirmation email.";
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-50 to-stone-100 px-4">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardContent className="p-10 text-center">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-400" />
            <h1 className="text-lg font-semibold text-slate-900 mb-1">{title}</h1>
            <p className="text-sm text-slate-600">{body}</p>
            {slugFailureDebug && (isMisconfig || isServerErr) && (
              <p className="text-[11px] text-slate-400 mt-3 font-mono break-words">
                debug: {slugFailureDebug}
              </p>
            )}
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
      <div className="min-h-screen lg:grid lg:grid-cols-2 bg-white">
        {/* Brand showcase panel - desktop only, tenant-branded */}
        <div className="relative hidden lg:flex lg:sticky lg:top-0 lg:h-screen lg:self-start flex-col justify-between overflow-hidden bg-stone-950 p-12 text-white">
          {/* Shared food photography (same as the generic CateringMS login) */}
          <div
            aria-hidden
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url('${PANEL_IMG}')` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/85 to-stone-950/70" />
          {/* Tenant-colour glow (their brand, or the amber default) */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: `radial-gradient(60% 50% at 25% 0%, ${(companyBrand?.primary || DEFAULT_PRIMARY)}40, transparent)` }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "24px 24px" }}
          />

          <div className="relative flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 shadow-lg backdrop-blur">
              {companyBrand?.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={companyBrand.logo} alt={companyBrand.name} className="h-10 w-10 rounded-lg object-contain" />
              ) : (
                <Building2 className="h-6 w-6 text-white" />
              )}
            </div>
            <span className="text-xl font-bold tracking-tight truncate">{companyBrand?.name || "Your portal"}</span>
          </div>

          <div className="relative max-w-md">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-md">
              <Star className="h-3.5 w-3.5 fill-white text-white" />
              Your booking, beautifully handled
            </span>
            <h2 className="mt-5 font-display text-[2.6rem] font-semibold leading-[1.08] tracking-tight">Your events, in one place.</h2>
            <p className="mt-4 text-lg leading-relaxed text-white/85">
              View your quotes and orders, track your event, and pay securely — sign in with just your email, no password to remember.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["Track your event", "View quotes & orders", "Pay securely online"].map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[13px] text-white/90 backdrop-blur-sm"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                  {p}
                </span>
              ))}
            </div>
            <figure className="mt-8 rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-md">
              <div className="mb-2 flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-white text-white" />
                ))}
              </div>
              <blockquote className="text-sm italic leading-relaxed text-white/90">
                &ldquo;Loved being able to see exactly where my order was on the day —
                no phone calls, no stress.&rdquo;
              </blockquote>
              <figcaption className="mt-3 text-xs font-semibold text-white/70">
                A happy CateringMS customer
              </figcaption>
            </figure>
          </div>

          <p className="relative text-sm text-white/70">Powered by CateringMS</p>
        </div>

        {/* Form column */}
        <div
          className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-stone-50 to-stone-100 px-4 py-10 lg:min-h-0 lg:bg-white lg:bg-none"
          style={{
            paddingTop: "max(2.5rem, env(safe-area-inset-top, 2.5rem))",
            paddingBottom: "max(2.5rem, env(safe-area-inset-bottom, 2.5rem))",
          }}
        >
          {/* Mobile brand badge */}
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl shadow-md" style={{ background: brandGradient }}>
              {companyBrand?.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={companyBrand.logo} alt={companyBrand.name} className="h-8 w-8 rounded-md object-contain" />
              ) : (
                <Building2 className="h-5 w-5 text-white" />
              )}
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-800 truncate max-w-[60vw]">{companyBrand?.name || "Your portal"}</span>
          </div>

          <Card className="w-full max-w-md border border-slate-200/70 shadow-2xl shadow-slate-200/60 rounded-2xl">
          <CardContent className="p-6 sm:p-8">
            <div className="mb-5">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">
                {sent ? "Check your inbox" : isViewOrdersIntent ? "Email me my orders" : "Sign in"}
              </h1>
            </div>
            {!sent ? (
              <form onSubmit={handleSubmit} className="space-y-5">
                <p className="text-sm text-slate-600 leading-relaxed">
                  {isViewOrdersIntent
                    ? "Pop in the email you used to book and we'll send a secure link to your past orders. No password needed."
                    : "Enter your email and we'll send you a secure sign-in link. No password needed."}
                </p>

                {/* The single most common support ticket on a magic-link
                    portal is "I can't sign in" - usually because the
                    client tried a different email than the one they
                    used to request the quote. Surface this rule loud
                    and clear before they type. */}
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 leading-relaxed">
                  <strong className="font-semibold">Use the same email</strong> you gave when you
                  requested your quote. We can&apos;t link a different address to your bookings, so a
                  link sent to anywhere else won&apos;t work.
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
                      {isViewOrdersIntent ? "Email me my orders" : "Email me a sign-in link"}
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
      </div>
    </>
  );
}
