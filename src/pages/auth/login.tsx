import { useState, useEffect } from "react";
import { useRouter, NextRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Lock, Loader2, Crown, UserCog, Shield, ChefHat, Truck, ShoppingCart, SprayCan, Users } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { profileService } from "@/services/profileService";
import { createClient } from "@/lib/supabase/client";
import { getLandingPageForRoleString } from "@/lib/authGuards";

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
    description: "Tollie Le Roux -- Tollies Marketing",
    icon: Users,
    gradient: "from-blue-500 to-indigo-500",
  },
];

// Route user after successful login based on active_role
const routeAfterLogin = async (userId: string, router: NextRouter, redirectTo?: string) => {
  try {
    const profile = await profileService.getProfile(userId);
    if (!profile) throw new Error("Profile not found");

    // Honor redirectTo if provided
    if (redirectTo) {
      window.location.assign(redirectTo);
      return;
    }

    // Route based on active_role — landing map lives in lib/authGuards
    const role = profile.active_role || profile.role;

    // Look up company slug so multi-tenant URLs include /[company_slug]
    let companySlug: string | undefined;
    if (profile.company_id) {
      const sb = createClient();
      const { data: company } = await sb
        .from("companies")
        .select("slug")
        .eq("id", profile.company_id)
        .maybeSingle();
      companySlug = company?.slug ?? undefined;
    }

    const destination = getLandingPageForRoleString(role, companySlug);

    // Use hard navigation to ensure component swap
    window.location.assign(destination);
  } catch (error) {
    console.error("Error routing after login:", error);
    window.location.assign("/admin/leads"); // fallback
  }
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

    if (!email || !password) {
      setError("Please enter your email and password");
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
        throw new Error(signInError?.message || "Authentication failed");
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl border-0 shadow-2xl">
        <CardHeader className="space-y-4 px-6 pt-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                <Mail className="w-8 h-8 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold text-slate-900">
                  Welcome Back
                </CardTitle>
                <CardDescription className="text-sm text-slate-600">
                  Sign in to your account
                </CardDescription>
              </div>
            </div>
            {showDevMode && (
              <Button
                variant={devMode ? "default" : "outline"}
                onClick={() => setDevMode(!devMode)}
                className={devMode ? "bg-amber-500 hover:bg-amber-600" : ""}
              >
                {devMode ? "Normal Login" : "Dev Mode"}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="px-6 pb-8">
          {devMode ? (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-amber-900 font-semibold">
                  🔧 Dev Mode Active
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
          ) : (
            <form onSubmit={handleNormalLogin} className="space-y-6">
              {error && (
                <Alert variant="destructive" className="text-sm">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700 font-medium text-base">
                  Email Address
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
                <Label htmlFor="password" className="text-slate-700 font-medium text-base">
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
                className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 transition-opacity text-white font-semibold text-base"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>

              <div className="mt-6 text-center space-y-3">
                <p className="text-sm text-slate-500">
                  Don't have an account?{" "}
                  <Link href="/company-signup" className="text-purple-600 hover:text-purple-700 font-medium">
                    Sign up for free
                  </Link>
                </p>
                <p className="text-xs text-slate-400">
                  Need help?{" "}
                  <Link href="/support" className="text-purple-600 hover:text-purple-700 font-medium">
                    Contact Support
                  </Link>
                </p>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}