/**
 * Tenant-scoped login page -- shared between staff and clients.
 *
 * URL: /{company_slug}/login?email={prefill}&next={path}&message={status}
 *
 * Two modes on the same page:
 *   - "staff"  (default) -- email + password sign-in for company admins,
 *                            owners, kitchen, drivers, etc.
 *   - "client"            -- email-only magic-link, no password. Used by
 *                            customers tracking their orders.
 *
 * The staff flow is the one Bobby and the catering teams use every day,
 * so it stays the default. Clients land here from "Track your event"
 * links in their order emails -- they tap the small "I'm a customer"
 * link to switch to magic-link mode.
 *
 * Both flows share the same branded card (logo, primary/secondary colour
 * gradient) loaded via the SECURITY DEFINER RPC `get_company_branding`.
 * That RPC is the only safe way to read tenant branding while the user
 * is still anon, since the `companies` table no longer permits anon
 * SELECTs (it used to leak embed tokens, billing info and tax IDs via a
 * USING(true) policy).
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
  Lock,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CompanyBrand {
  id?: string;
  name: string;
  logo: string | null;
  primary: string;
  secondary: string;
}

const DEFAULT_PRIMARY = "#9333ea";
const DEFAULT_SECONDARY = "#ec4899";

type Mode = "staff" | "client";

export default function CompanyLoginPage() {
  const router = useRouter();
  const { company_slug, message, email: emailFromQuery, next } = router.query;
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>("staff");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [companyBrand, setCompanyBrand] = useState<CompanyBrand | null>(null);
  const [companyLookupFailed, setCompanyLookupFailed] = useState(false);

  // Pre-fill the email from the URL when a client lands from a "Track
  // your event" link in an order email. We also flip to client mode in
  // that case -- a typical client never has a password.
  useEffect(() => {
    if (typeof emailFromQuery === "string" && emailFromQuery.includes("@") && !email) {
      setEmail(emailFromQuery.trim().toLowerCase());
      setMode("client");
    }
  }, [emailFromQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Branding lookup via SECURITY DEFINER RPC. Returns ONLY the safe
  // branding fields (id, name, slug, logo, colours) -- never billing,
  // tokens, or tax info.
  useEffect(() => {
    if (!company_slug || typeof company_slug !== "string") return;
    let cancelled = false;
    (async () => {
      // Cast to any: the auto-generated Supabase types haven't been
      // regenerated since `get_company_branding` was added via migration.
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
        id: (row as any).id,
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

  // Show toast for session_expired / login_required messages from the
  // middleware redirect query string.
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

  // ── Staff: email + password ───────────────────────────────────────────
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

    // After login the user is authenticated, so the RLS policy
    // `profiles_own` lets them read their own row to confirm slug
    // membership before we route them.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("active_role, role, company_id, companies:company_id ( slug )")
      .eq("id", authData.user.id)
      .single();

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

  // ── Client: magic link ───────────────────────────────────────────────
  const handleClientMagicLink = async (e: React.FormEvent) => {
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
      // Dev fallback: server returns the link directly when
      // DEV_RETURN_MAGIC_LINK=true. NEVER on in production.
      if (json?.dev_link && typeof json.dev_link === "string") {
        window.location.href = json.dev_link;
        return;
      }
      setSent(true);
    } catch {
      setError("Network issue -- please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  // Branding-driven gradient for header tile + primary buttons.
  const brandGradient = companyBrand
    ? `linear-gradient(135deg, ${companyBrand.primary} 0%, ${companyBrand.secondary} 100%)`
    : `linear-gradient(135deg, ${DEFAULT_PRIMARY} 0%, ${DEFAULT_SECONDARY} 100%)`;

  // Loading shimmer while the slug param hasn't resolved.
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
          {/* Branded header strip */}
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
                  {sent
                    ? "Check your inbox"
                    : mode === "staff"
                    ? "Sign in to your account"
                    : "Sign in as a customer"}
                </p>
              </div>
            </div>
          </div>

          <CardContent className="p-7 sm:p-8">
            {/* Sent state for client magic-link */}
            {sent && mode === "client" ? (
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
                    setSent(false);
                    setError("");
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Use a different email
                </Button>
              </div>
            ) : mode === "staff" ? (
              /* Staff: email + password */
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
                  <button
                    type="button"
                    className="text-sm text-slate-600 hover:text-slate-900 underline underline-offset-2"
                    onClick={() => {
                      setMode("client");
                      setError("");
                      setPassword("");
                    }}
                  >
                    I'm a customer -- email me a sign-in link
                  </button>
                </div>

                <p className="text-xs text-slate-400 text-center pt-1">
                  <Link href="/" className="hover:text-slate-600">
                    ← Back to home
                  </Link>
                </p>
              </form>
            ) : (
              /* Client: magic-link only */
              <form onSubmit={handleClientMagicLink} className="space-y-5">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Enter your email and we'll send you a secure sign-in link. No password needed.
                </p>

                {error && (
                  <Alert variant="destructive" className="text-sm">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="client-email" className="text-slate-700 font-medium text-sm">
                    Email address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-400 pointer-events-none" />
                    <Input
                      id="client-email"
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
                  <button
                    type="button"
                    className="text-sm text-slate-600 hover:text-slate-900 underline underline-offset-2"
                    onClick={() => {
                      setMode("staff");
                      setError("");
                    }}
                  >
                    Staff sign-in (email + password)
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
