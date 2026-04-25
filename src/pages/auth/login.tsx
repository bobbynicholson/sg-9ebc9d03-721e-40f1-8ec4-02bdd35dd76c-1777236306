import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, ArrowRight, Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { profileService } from "@/services/profileService";
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
      console.log("🎭 User role:", profiles?.active_role);

      if (profileError || !profiles) {
        console.error("❌ No profile found:", profileError);
        setError("No account found with this email address. Please check your email or contact support.");
        setLoading(false);
        return;
      }

      // Try to login with bypass password
      console.log("🔑 Attempting authentication...");
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: "BYPASS_2026",
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
      const activeRole = profiles.active_role;
      console.log("🎯 Redirecting user with role:", activeRole);
      
      let dashboardUrl = "/";

      switch (activeRole) {
        case "super_admin":
          dashboardUrl = `/super-admin`;
          console.log("🌟 Super Admin detected - redirecting to:", dashboardUrl);
          break;
        case "company_admin":
          dashboardUrl = `/admin/dashboard`;
          break;
        case "driver":
          dashboardUrl = `/team-portal/driver/dashboard`;
          break;
        case "kitchen_staff":
          dashboardUrl = `/team-portal/kitchen/dashboard`;
          break;
        case "shopping_staff":
          dashboardUrl = `/team-portal/shopping/dashboard`;
          break;
        case "cleaning_staff":
          dashboardUrl = `/team-portal/cleaning/dashboard`;
          break;
        case "client":
          dashboardUrl = "/client-portal/dashboard";
          break;
        default:
          dashboardUrl = "/";
      }

      console.log("🚀 Final redirect URL:", dashboardUrl);
      
      if (redirect && typeof redirect === "string") {
        router.push(redirect);
      } else {
        router.push(dashboardUrl);
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
                Password (Optional)
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password (optional for now)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-12 text-base"
                  disabled={loading}
                />
              </div>
              <p className="text-xs text-slate-500">
                Password authentication coming soon. Use email only for now.
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
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-8 text-center space-y-3">
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