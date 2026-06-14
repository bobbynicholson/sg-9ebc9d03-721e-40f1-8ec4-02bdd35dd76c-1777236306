/**
 * Tenant-scoped STAFF login - email + password.
 *
 * URL: /{company_slug}/login
 *
 * For company admins, owners and staff (kitchen, drivers, shopping,
 * cleaning). Clients use a different page - see
 * /[company_slug]/client/login - where they get a magic-link with no
 * password.
 *
 * Branding (logo, primary/secondary colours) is loaded via the
 * SECURITY DEFINER RPC `get_company_branding`. The RPC is the only
 * safe way to read tenant branding while the user is still anon, since
 * the `companies` table no longer permits anon SELECTs (it used to leak
 * embed tokens, billing info and tax IDs via a USING(true) policy).
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import type { GetStaticPaths, GetStaticProps } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, ArrowRight, Loader2, Building2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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

const DEFAULT_PRIMARY = "#9333ea";
const DEFAULT_SECONDARY = "#ec4899";

interface PageProps {
  // Raw branding from getStaticProps. _app.tsx forwards this to
  // BrandingProvider so pre-auth pages don't flash default colours.
  // Each page also reads it directly to seed its own local UI.
  initialBranding: InitialBranding | null;
  slugNotFound: boolean;
  // TIGHTEN I.34: when slugNotFound, the failure reason so the page
  // can show the right copy. `null` when branding loaded fine.
  slugFailureReason: BrandingLookupReason | null;
  /** Free-text server-side debug message. Surfaced verbatim on the
   *  "not configured / server error" screens so ops sees the cause. */
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
  // TIGHTEN I.34: when the failure is a server-side misconfiguration
  // (not_configured / server_error), don't cache the bad result for 60s
  // - serve as plain SSR so the next request retries immediately. Only
  // legitimate "company doesn't exist" + happy-path branding gets the
  // 60s ISR cache.
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

export default function CompanyStaffLoginPage({
  initialBranding,
  slugNotFound,
  slugFailureReason,
  slugFailureDebug,
}: PageProps) {
  const router = useRouter();
  const { company_slug, message } = router.query;
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Seed from getStaticProps so the very first paint already shows the
  // tenant's logo and palette - no flash of CateringMS defaults.
  const [companyBrand, setCompanyBrand] = useState<CompanyBrand | null>(() =>
    brandFromInitial(initialBranding),
  );
  const [companyLookupFailed, setCompanyLookupFailed] = useState(slugNotFound);

  // Refresh branding from the SECURITY DEFINER RPC once we're on the
  // client. Catches the case where the operator has just saved new
  // colours and we're still serving an ISR-cached page from before the
  // change. Falls through silently if the call fails - the SSG seed is
  // already on the page.
  useEffect(() => {
    if (!company_slug || typeof company_slug !== "string") return;
    let cancelled = false;
    (async () => {
      // Cast to any: the auto-generated Supabase types haven't been
      // regenerated since `get_company_branding` was added.
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

  // Toast for redirect messages from middleware.
  useEffect(() => {
    if (message === "session_expired") {
      toast({
        title: "Session expired",
        description: "Your session has expired. Please sign in again.",
        variant: "destructive",
        duration: 5000,
      });
    } else if (message === "login_required") {
      toast({
        title: "Sign in required",
        description: "Please sign in to access this page.",
        variant: "destructive",
        duration: 4000,
      });
    } else if (message === "subscription_expired") {
      toast({
        title: "Subscription expired",
        description: "This company's subscription has lapsed. Ask your administrator to renew it to restore access.",
        variant: "destructive",
        duration: 6000,
      });
    }
  }, [message, toast]);

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const slug = typeof company_slug === "string" ? company_slug : "";
    if (!slug) {
      setError("Invalid login URL.");
      return;
    }
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);

    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInError || !authData.user) {
      setError("Incorrect email or password.");
      setLoading(false);
      return;
    }

    // Authenticated - own profile is readable via `profiles_own` policy.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("active_role, role, company_id, companies:company_id ( slug )")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      setError("Your account is not set up. Contact your administrator.");
      setLoading(false);
      return;
    }

    const profileSlug = Array.isArray(profile.companies)
      ? (profile.companies[0] as any)?.slug
      : (profile.companies as any)?.slug;
    const activeRole = (profile.active_role || profile.role) as string;

    if (activeRole !== "super_admin" && profileSlug !== slug) {
      await supabase.auth.signOut();
      setError("This account does not belong to this company.");
      setLoading(false);
      return;
    }

    // Hard-navigate so middleware applies the slug-aware role landing.
    window.location.assign("/");
  };

  const brandGradient = companyBrand
    ? `linear-gradient(135deg, ${companyBrand.primary} 0%, ${companyBrand.secondary} 100%)`
    : `linear-gradient(135deg, ${DEFAULT_PRIMARY} 0%, ${DEFAULT_SECONDARY} 100%)`;

  if (!company_slug && !companyLookupFailed) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 px-4"
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top, 1rem))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom, 1rem))",
        }}
      >
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
    // TIGHTEN I.34: surface the real reason instead of one generic
    // "Company not found" for every failure mode. Lets ops tell
    // misconfiguration apart from a genuine bad URL at a glance.
    const isMisconfig = slugFailureReason === "not_configured";
    const isServerErr = slugFailureReason === "server_error";
    const title = isMisconfig
      ? "Login portal temporarily unavailable"
      : isServerErr
        ? "Couldn't reach the portal"
        : "Company not found";
    const body = isMisconfig
      ? "The server is missing credentials needed to load this portal. Operators: check Vercel's SUPABASE_SERVICE_ROLE_KEY env var (Production + Preview) and that it's the service_role JWT, not the anon key."
      : isServerErr
        ? "We hit a server error trying to load this portal. The team has been notified. Try again in a moment."
        : "We couldn't find the catering company at this URL. Please double-check the link.";
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4"
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top, 1rem))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom, 1rem))",
        }}
      >
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardContent className="p-10 text-center">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-400" />
            <h1 className="text-lg font-semibold text-slate-900 mb-1">{title}</h1>
            <p className="text-sm text-slate-600">{body}</p>
            {/* Recovery hatch: a genuine bad/forgotten slug is the common
                case here. Don't dead-end the user on "double-check the
                link" - the generic email login needs no slug and the
                middleware routes them to their own portal after sign-in.
                Hidden for misconfig/server-error (the email login would
                fail the same way), shown only for the real "not found". */}
            {!isMisconfig && !isServerErr && (
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-800 mb-1">
                  Forgot your company&apos;s web address? No problem.
                </p>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  You don&apos;t need it. Just sign in with your email and password and we&apos;ll take
                  you straight to your own portal.
                </p>
                <Link
                  href="/auth/login"
                  className="inline-flex items-center justify-center h-11 px-5 w-full rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
                >
                  Sign in with your email →
                </Link>
              </div>
            )}
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
        <div
          className="relative hidden lg:flex lg:sticky lg:top-0 lg:h-screen lg:self-start flex-col justify-between overflow-hidden p-12 text-white"
          style={{ background: brandGradient }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "22px 22px" }}
          />
          <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-white/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-white/10 blur-3xl" />

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
            <h2 className="text-[2.6rem] font-bold leading-[1.1] tracking-tight">Welcome back.</h2>
            <p className="mt-4 text-lg text-white/85">
              Sign in to manage quotes, kitchen prep, dispatch and deliveries — your whole operation in one place.
            </p>
          </div>

          <p className="relative text-sm text-white/70">Powered by CateringMS</p>
        </div>

        {/* Form column */}
        <div
          className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-10 lg:min-h-0 lg:bg-white lg:bg-none"
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
            <div className="mb-7">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Staff sign-in</h1>
              <p className="text-sm text-slate-500 mt-1.5">Welcome back — sign in to your portal.</p>
            </div>
            <form onSubmit={handleStaffLogin} className="space-y-5">
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
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700 font-medium text-sm">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400 pointer-events-none" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-12 text-base"
                    required
                    disabled={loading}
                    autoComplete="current-password"
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
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>

              <div className="pt-2 text-center">
                <Link
                  href={`/${typeof company_slug === "string" ? company_slug : ""}/client/login`}
                  className="text-sm text-slate-600 hover:text-slate-900 underline underline-offset-2"
                >
                  Are you a customer? Sign in here
                </Link>
              </div>

              {/* Highlighted recovery box. A small link was too easy to
                  miss, so non-technical staff who can't get in (wrong/old
                  company URL, or never received their invite email) get an
                  obvious "here's what to do" panel instead of a dead end. */}
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
                <p className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-1.5">
                  <span aria-hidden>💡</span> Trouble signing in?
                </p>
                <ul className="space-y-2.5 text-sm text-amber-900/90">
                  <li className="flex gap-2">
                    <span aria-hidden>🔑</span>
                    <span>
                      Don&apos;t know your company&apos;s web address?{" "}
                      <Link
                        href="/auth/login"
                        className="font-semibold underline underline-offset-2 hover:text-amber-700"
                      >
                        Sign in with your email →
                      </Link>{" "}
                      and we&apos;ll take you to the right place.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span aria-hidden>✉️</span>
                    <span>
                      Didn&apos;t get your invite or sign-in email? Check your{" "}
                      <span className="font-semibold">spam / promotions</span> folder, then ask your manager to
                      resend it from their <span className="font-semibold">Team</span> page.
                    </span>
                  </li>
                </ul>
              </div>

              <p className="text-xs text-slate-400 text-center pt-1">
                <Link href="/" className="hover:text-slate-600">
                  ← Back to home
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
        </div>
      </div>
    </>
  );
}
