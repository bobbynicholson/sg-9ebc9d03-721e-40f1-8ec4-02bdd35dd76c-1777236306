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
      <div
        className="min-h-screen flex items-center justify-center px-4 py-10"
        style={{
          background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
          paddingTop: "max(2.5rem, env(safe-area-inset-top, 2.5rem))",
          paddingBottom: "max(2.5rem, env(safe-area-inset-bottom, 2.5rem))",
        }}
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
                <p className="text-xs sm:text-sm text-white/80">Staff sign-in</p>
              </div>
            </div>
          </div>

          <CardContent className="p-7 sm:p-8">
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

              <p className="text-xs text-slate-400 text-center pt-1">
                <Link href="/" className="hover:text-slate-600">
                  ← Back to home
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
