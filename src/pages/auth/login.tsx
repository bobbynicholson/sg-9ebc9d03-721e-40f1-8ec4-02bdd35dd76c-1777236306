import { useState, useEffect } from "react";
import { useRouter, NextRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Lock, Loader2, Crown, UserCog, Shield, ChefHat, Truck, ShoppingCart, SprayCan, Users } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/auth/AuthShell";
import { isValidEmail } from "@/lib/validation/authValidation";

// Dev Mode Test Users
const DEV_USERS = [
  {
    email: "bobby@skylight-digital.co.za",
    role: "super_admin",
    label: "Super Admin",
    description: "Platform Administrator",
    icon: Crown,
    gradient: "from-amber-500 to-orange-500",
  },
  {
    email: "hello@spitbraaidelivery.co.za",
    role: "company_admin",
    label: "Company Admin",
    description: "Company Administrator",
    icon: UserCog,
    gradient: "from-indigo-500 to-purple-500",
  },
  {
    email: "admin@spitbraaidelivery.co.za",
    role: "admin",
    label: "Admin",
    description: "Administrator",
    icon: Shield,
    gradient: "from-purple-500 to-pink-500",
  },
  {
    email: "kitchen@spitbraaidelivery.co.za",
    role: "kitchen_staff",
    label: "Kitchen Staff",
    description: "Kitchen Operations",
    icon: ChefHat,
    gradient: "from-orange-500 to-red-500",
  },
  {
    email: "driver@spitbraaidelivery.co.za",
    role: "driver",
    label: "Driver",
    description: "Driver & Waiter",
    icon: Truck,
    gradient: "from-green-500 to-emerald-500",
  },
  {
    email: "shopping@spitbraaidelivery.co.za",
    role: "shopping_staff",
    label: "Shopping Staff",
    description: "Shopping Operations",
    icon: ShoppingCart,
    gradient: "from-pink-500 to-rose-500",
  },
  {
    email: "cleaning@spitbraaidelivery.co.za",
    role: "cleaning_staff",
    label: "Cleaning Staff",
    description: "Cleaning Operations",
    icon: SprayCan,
    gradient: "from-teal-500 to-cyan-500",
  },
  {
    email: "universalsportmags23@gmail.com",
    role: "client",
    label: "Client",
    description: "Tollie Le Roux, Tollies Marketing",
    icon: Users,
    gradient: "from-blue-500 to-indigo-500",
  },
];

// Route user after successful login. We hard-navigate to "/" and let
// middleware do the slug-aware role landing redirect - single source of truth,
// no duplicated client-side slug lookup.
const routeAfterLogin = async (userId: string, router: NextRouter, redirectTo?: string) => {
  if (redirectTo) {
    window.location.assign(redirectTo);
    return;
  }
  window.location.assign("/");
};

export default function LoginPage() {
  const router = useRouter();
  const { message, redirect } = router.query;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const { toast } = useToast();

  // Clear stale auth on mount
  useEffect(() => {
    const supabase = createClient();
    // Remove all sb- localStorage keys
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("sb-")) {
        localStorage.removeItem(key);
      }
    });
    // Remove legacy auth token
    localStorage.removeItem("supabase.auth.token");
    // Clear session storage
    sessionStorage.clear();
    // Sign out silently
    supabase.auth.signOut().catch(() => {});
  }, []);

  useEffect(() => {
    if (message === "session_expired") {
      toast({
        title: "Session Expired",
        description: "Your session has expired. Please sign in again.",
        variant: "destructive",
        duration: 5000,
      });
    } else if (message === "login_required") {
      toast({
        title: "Authentication Required",
        description: "Please sign in to access this page.",
        variant: "destructive",
        duration: 4000,
      });
    } else if (message === "account_created") {
      toast({
        title: "Account Created Successfully!",
        description: "Please check your email to sign in.",
        duration: 5000,
      });
    } else if (message === "company_not_found") {
      // Sent here by the tenant login page when the company slug in the
      // URL didn't exist. Reassure rather than alarm - they don't need
      // the URL, just their email + password.
      toast({
        title: "We couldn't find that company link",
        description: "No problem - just sign in with your email and we'll take you to the right place.",
        duration: 6000,
      });
    }
  }, [message, toast]);

  // Check if dev mode should be available
  const showDevMode =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_DEV_MODE === "true";

  const handleDevLogin = async (userEmail: string, userRole: string) => {
    setLoading(true);
    setError("");

    try {
      const devPassword = process.env.NEXT_PUBLIC_DEV_USER_PASSWORD || "Test123!";
      const supabase = createClient();
      const { data: { user }, error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: devPassword,
      });

      if (signInError || !user) {
        throw new Error(signInError?.message || "Dev login failed");
      }

      // Set dev mode flags
      localStorage.setItem("dev_mode_active", "true");
      localStorage.setItem("dev_mode_role", userRole);

      toast({
        title: "Dev Login Successful",
        description: `Logged in as ${userRole}`,
        duration: 2000,
      });

      await routeAfterLogin(user.id, router, redirect as string);
    } catch (err: any) {
      console.error("Dev login error:", err);
      setError(err.message || "Dev login failed");
      setLoading(false);
    }
  };

  const handleNormalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Collect all input problems together rather than stopping at the
    // first, and surface them as one summary.
    const problems: string[] = [];
    if (!email) {
      problems.push("Enter your email address.");
    } else if (!isValidEmail(email)) {
      problems.push("Enter a valid email address (e.g. name@company.co.za).");
    }
    if (!password) problems.push("Enter your password.");
    if (problems.length > 0) {
      setError(problems.join("\n"));
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data: { user }, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError || !user) {
        // Map the opaque Supabase auth errors to something a human can
        // act on, instead of "Invalid login credentials".
        const raw = (signInError?.message || "").toLowerCase();
        if (raw.includes("invalid login credentials")) {
          throw new Error("That email and password don't match. Check both and try again, or reset your password.");
        }
        if (raw.includes("email not confirmed")) {
          throw new Error("Your email isn't verified yet. Check your inbox for the confirmation link, then sign in.");
        }
        if (raw.includes("rate limit") || raw.includes("too many")) {
          throw new Error("Too many attempts. Please wait a minute and try again.");
        }
        throw new Error(signInError?.message || "Couldn't sign you in. Please try again.");
      }

      // Remove dev mode flags for normal login
      localStorage.removeItem("dev_mode_active");
      localStorage.removeItem("dev_mode_role");

      toast({
        title: "Login Successful",
        description: "Welcome back!",
        duration: 2000,
      });

      await routeAfterLogin(user.id, router, redirect as string);
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || "Login failed");
      setLoading(false);
    }
  };

  // Dev mode keeps the old wide full-screen layout (the role grid needs
  // the space). Normal sign-in uses the AuthShell split-panel for a
  // polished, branded look. Brand gradient unchanged.
  if (devMode) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4 py-10 relative"
        style={{
          background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
          paddingTop: "max(2.5rem, env(safe-area-inset-top, 2.5rem))",
          paddingBottom: "max(2.5rem, env(safe-area-inset-bottom, 2.5rem))",
        }}
      >
        {showDevMode && (
          <Button
            variant="default"
            onClick={() => setDevMode(false)}
            className="absolute top-4 right-4 bg-amber-500 hover:bg-amber-600"
          >
            Normal login
          </Button>
        )}
        <Card className="w-full max-w-4xl border-0 shadow-2xl rounded-3xl overflow-hidden">
          <div className="px-7 pt-7 pb-6 bg-gradient-to-br from-amber-500 to-orange-500">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shadow-lg flex-shrink-0">
                <Mail className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-white truncate">Welcome back</h1>
                <p className="text-xs sm:text-sm text-white/80">Sign in and we'll route you to your portal</p>
              </div>
            </div>
          </div>
          <CardContent className="p-7 sm:p-8">
            <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-2">
                  <p className="text-sm text-amber-900 font-semibold">
                    🔧 Dev mode active
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    Click a role to sign in instantly. All passwords: Test123!
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {DEV_USERS.map((user) => {
                    const Icon = user.icon;
                    return (
                      <button
                        key={user.email}
                        onClick={() => handleDevLogin(user.email, user.role)}
                        disabled={loading}
                        className="group relative overflow-hidden rounded-xl border-2 border-slate-200 hover:border-slate-300 bg-white p-6 text-left transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${user.gradient} flex items-center justify-center mb-3`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <h3 className="font-semibold text-slate-900 mb-1">
                          {user.label}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {user.description}
                        </p>
                        {loading && (
                          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 animate-spin text-slate-900" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {error && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Normal sign-in: branded split-panel layout ──────────────────
  return (
    <AuthShell>
      <div className="w-full max-w-md">
        {showDevMode && (
          <div className="mb-3 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDevMode(true)}
              className="text-xs"
            >
              Dev mode
            </Button>
          </div>
        )}
        <Card className="w-full border border-slate-200/70 shadow-2xl shadow-slate-200/60 rounded-2xl">
          <CardContent className="p-6 sm:p-8">
            <div className="mb-7">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-stone-900">Welcome back</h1>
              <p className="text-sm text-stone-500 mt-1.5">
                Sign in and we'll route you straight to your portal.
              </p>
            </div>
              <form onSubmit={handleNormalLogin} className="space-y-5">
                {error && (() => {
                  const lines = error.split("\n").filter(Boolean);
                  return (
                    <Alert variant="destructive" className="text-sm">
                      <AlertDescription>
                        {lines.length > 1 ? (
                          <>
                            <p className="font-semibold mb-1">Please fix {lines.length} things:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              {lines.map((l, i) => <li key={i}>{l}</li>)}
                            </ul>
                          </>
                        ) : (
                          lines[0]
                        )}
                      </AlertDescription>
                    </Alert>
                  );
                })()}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-700 font-medium text-sm">
                    Email address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="your.email@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-12 text-base"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-700 font-medium text-sm">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 h-12 text-base"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-95 hover:shadow-lg hover:shadow-amber-500/25 text-white font-semibold text-base rounded-xl"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>

                <div className="mt-2 text-center space-y-3">
                  <p className="text-sm text-slate-500">
                    Don't have an account?{" "}
                    <Link href="/company-signup" className="text-amber-700 hover:text-amber-800 font-medium">
                      Sign up for free
                    </Link>
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Tip: bookmark the URL in your browser bar after you sign in. It includes your company name and takes you straight to the right portal next time.
                  </p>
                  <p className="text-xs text-slate-400">
                    Need help?{" "}
                    <Link href="/support" className="text-amber-700 hover:text-amber-800 font-medium">
                      Contact support
                    </Link>
                  </p>
                </div>
              </form>
          </CardContent>
        </Card>
      </div>
    </AuthShell>
  );
}