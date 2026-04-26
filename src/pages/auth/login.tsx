import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, ArrowRight, Loader2, Lock, Zap } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const router = useRouter();
  const { message, redirect } = router.query;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

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

  // DEV MODE AUTO LOGIN - Bypasses all authentication
  const handleDevAutoLogin = async () => {
    setLoading(true);
    console.log("🔧 DEV MODE: Auto-login activated - bypassing all auth");
    
    try {
      // Just redirect directly to super admin dashboard
      // No auth check, no profile check, just go
      toast({
        title: "🔧 DEV MODE ACTIVATED",
        description: "Super Admin Access Granted",
        duration: 2000,
      });

      // Small delay to show the toast
      setTimeout(() => {
        router.push("/super-admin/dashboard");
      }, 500);
    } catch (err) {
      console.error("💥 DEV LOGIN ERROR:", err);
      setError("DEV MODE: Redirect failed. Try refreshing the page.");
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email) {
      setError("Please enter your email address");
      setLoading(false);
      return;
    }

    try {
      console.log("🔐 Login attempt for:", email);
      
      // Check if user exists in profiles (case-insensitive)
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .ilike("email", email.trim())
        .single();

      console.log("👤 Profile found:", profiles);
      console.log("🎭 User role:", profiles?.role);

      if (profileError || !profiles) {
        console.error("❌ No profile found:", profileError);
        setError("No account found with this email address. Please check your email or contact support.");
        setLoading(false);
        return;
      }

      // Try to login with the provided password or default password
      const loginPassword = password || "BYPASS_2026";
      console.log("🔑 Attempting authentication...");
      
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: loginPassword,
      });

      console.log("✅ Auth result:", authData);
      console.log("❌ Auth error:", signInError);

      if (signInError) {
        console.error("Authentication failed:", signInError);
        setError("Invalid email or password. Please try again.");
        setLoading(false);
        return;
      }

      // Successfully logged in - redirect based on role
      const userRole = profiles.role;
      const userCompanySlug = profiles.company_slug;
      console.log("🎯 Redirecting user with role:", userRole);
      console.log("🏢 User company slug:", userCompanySlug);
      
      let dashboardUrl = "/";

      switch (profiles.role || profiles.active_role) {
        case "super_admin":
          dashboardUrl = "/super-admin/dashboard";
          console.log("🌟 Super Admin detected - redirecting to:", dashboardUrl);
          break;
        case "company_admin":
        case "admin":
          dashboardUrl = userCompanySlug ? `/${userCompanySlug}/admin/dashboard` : "/admin/dashboard";
          console.log("👔 Company Admin detected - redirecting to:", dashboardUrl);
          break;
        case "driver":
          dashboardUrl = userCompanySlug ? `/${userCompanySlug}/team-portal/driver/dashboard` : "/team-portal/driver/dashboard";
          console.log("🚗 Driver detected - redirecting to:", dashboardUrl);
          break;
        case "kitchen_staff":
          dashboardUrl = userCompanySlug ? `/${userCompanySlug}/team-portal/kitchen/dashboard` : "/team-portal/kitchen/dashboard";
          console.log("👨‍🍳 Kitchen Staff detected - redirecting to:", dashboardUrl);
          break;
        case "shopping_staff":
          dashboardUrl = userCompanySlug ? `/${userCompanySlug}/team-portal/shopping/dashboard` : "/team-portal/shopping/dashboard";
          console.log("🛒 Shopping Staff detected - redirecting to:", dashboardUrl);
          break;
        case "cleaning_staff":
          dashboardUrl = userCompanySlug ? `/${userCompanySlug}/team-portal/cleaning/dashboard` : "/team-portal/cleaning/dashboard";
          console.log("🧹 Cleaning Staff detected - redirecting to:", dashboardUrl);
          break;
        case "client":
          dashboardUrl = userCompanySlug ? `/${userCompanySlug}/client-portal/dashboard` : "/client-portal/dashboard";
          console.log("👤 Client detected - redirecting to:", dashboardUrl);
          break;
        default:
          dashboardUrl = "/";
          console.log("⚠️ Unknown role, redirecting to home");
      }

      console.log("🚀 Final redirect URL:", dashboardUrl);
      
      // Use custom redirect if provided, otherwise use role-based redirect
      if (redirect && typeof redirect === "string") {
        await router.push(redirect);
      } else {
        await router.push(dashboardUrl);
      }
    } catch (err) {
      console.error("💥 Login error:", err);
      setError("Login failed. Please try again.");
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 shadow-2xl">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-6">
              <Mail className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Check Your Email</h2>
            <p className="text-slate-600 mb-6">
              We've sent a login link to <strong>{email}</strong>
            </p>
            <p className="text-sm text-slate-500 mb-8">
              Click the link in your email to sign in. The link will expire in 1 hour.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setEmailSent(false);
                setEmail("");
              }}
              className="w-full"
            >
              Use a different email
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardHeader className="space-y-4 px-6 pt-8">
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
        </CardHeader>
        <CardContent className="px-6 pb-8">
          {/* DEV MODE AUTO LOGIN BUTTON */}
          <div className="mb-6">
            <Button
              onClick={handleDevAutoLogin}
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-yellow-500 to-orange-500 hover:opacity-90 transition-opacity text-white font-semibold text-base"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Logging in...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-5 w-5" />
                  DEV AUTO LOGIN (Super Admin)
                </>
              )}
            </Button>
            <p className="text-xs text-center text-slate-500 mt-2">
              🔧 Development Mode - Instant Super Admin Access
            </p>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-500">Or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-6">
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
                  disabled={loading}
                />
              </div>
              <p className="text-xs text-slate-500">
                Leave blank to use default credentials for testing.
              </p>
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
                <>
                  Sign In
                </>
              )}
            </Button>
          </form>

          {/* Dev Mode Notice - Only on localhost */}
          {typeof window !== "undefined" && 
           (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && (
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-4">
                <p className="text-sm text-purple-900 dark:text-purple-100 font-semibold mb-1">
                  🔧 DEV MODE ACTIVE
                </p>
                <p className="text-xs text-purple-700 dark:text-purple-300">
                  Running on localhost - you can access any page without login. Just navigate directly to dashboards.
                </p>
              </div>
              
              <Button
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  
                  // Set a timeout for the login attempt
                  const timeoutId = setTimeout(() => {
                    setError("Login timeout - please check your connection and try again");
                    setLoading(false);
                  }, 10000); // 10 second timeout
                  
                  try {
                    const { error } = await supabase.auth.signInWithPassword({
                      email: "hello@spitbraaidelivery.co.za",
                      password: "Password123!",
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (error) throw error;
                    router.push("/super-admin/dashboard");
                  } catch (err: any) {
                    clearTimeout(timeoutId);
                    setError(err.message || "Failed to sign in");
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
                variant="outline"
                className="w-full border-2 border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-950"
                type="button"
              >
                <span className="text-purple-600 dark:text-purple-400 font-semibold">
                  Quick Test Login (Super Admin)
                </span>
              </Button>
              <p className="text-xs text-center text-slate-500 dark:text-slate-400 mt-2">
                hello@spitbraaidelivery.co.za / Password123!
              </p>
            </div>
          )}

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
        </CardContent>
      </Card>
    </div>
  );
}