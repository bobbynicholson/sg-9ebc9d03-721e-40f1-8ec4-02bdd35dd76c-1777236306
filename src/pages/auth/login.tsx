import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User } from "lucide-react";
import Link from "next/link";
import { authService } from "@/services/authService";
import { profileService } from "@/services/profileService";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const router = useRouter();
  const { message, redirect } = router.query;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signIn } = useAuth();
  const { toast } = useToast();

  // Show session expiration message if redirected from expired session
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
        description: "You can now sign in with your credentials.",
        duration: 5000,
      });
    }
  }, [message, toast]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email || !password) {
      setError("Please fill in all fields");
      setLoading(false);
      return;
    }

    try {
      // Authenticate with Supabase
      const { user, error: signInError } = await authService.signIn(email, password);

      if (signInError) {
        // Provide more user-friendly error messages
        if (signInError.message.includes("Invalid login credentials")) {
          setError("The email or password you entered is incorrect. Please check your credentials and try again.");
        } else if (signInError.message.includes("Email not confirmed")) {
          setError("Please confirm your email address before signing in. Check your inbox for the confirmation link.");
        } else if (signInError.message.includes("User not found")) {
          setError("No account found with this email address. Please register first or check your email.");
        } else {
          setError(signInError.message);
        }
        setLoading(false);
        return;
      }

      if (!user) {
        setError("Authentication failed. Please try again.");
        setLoading(false);
        return;
      }

      // Get user profile from Supabase
      const profile = await profileService.getProfile(user.id);

      if (!profile) {
        setError("User profile not found. Please contact support.");
        setLoading(false);
        return;
      }

      // Check if redirect URL was provided
      if (redirect && typeof redirect === "string") {
        router.push(redirect);
        return;
      }

      // Redirect based on profile's company_slug and active_role
      const companySlug = profile.company_slug || "my-company";
      const activeRole = profile.active_role || profile.role || "client";

      // Build dashboard URL based on active role
      let dashboardUrl = "/";
      
      switch (activeRole) {
        case "admin":
        case "owner":
          dashboardUrl = `/${companySlug}/admin/dashboard`;
          break;
        case "driver":
          dashboardUrl = `/${companySlug}/driver/dashboard`;
          break;
        case "kitchen":
        case "kitchen_staff":
          dashboardUrl = `/${companySlug}/kitchen/dashboard`;
          break;
        case "shopping":
        case "shopping_staff":
          dashboardUrl = `/${companySlug}/shopping/dashboard`;
          break;
        case "cleaning":
        case "cleaning_staff":
          dashboardUrl = `/${companySlug}/cleaning/dashboard`;
          break;
        case "client":
          dashboardUrl = "/client-portal";
          break;
        case "super_admin":
          dashboardUrl = "/cateringms-platform/dashboard";
          break;
        default:
          dashboardUrl = "/";
      }

      router.push(dashboardUrl);
    } catch (err) {
      console.error("Login error:", err);
      setError("Login failed. Please try again.");
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setGoogleLoading(true);

    try {
      const { error } = await authService.signInWithGoogle();
      
      if (error) {
        setError(error.message);
        setGoogleLoading(false);
      }
      // OAuth will redirect automatically, no need to stop loading
    } catch (err) {
      console.error("Google sign in error:", err);
      setError("Failed to sign in with Google. Please try again.");
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 flex items-center justify-center p-3 sm:p-4">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardHeader className="space-y-3 sm:space-y-4 px-4 sm:px-6 pt-6 sm:pt-8">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 mx-auto flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform">
            <User className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
          </div>
          <CardTitle className="text-2xl sm:text-3xl font-bold text-center text-slate-900">
            Welcome Back
          </CardTitle>
          <CardDescription className="text-center text-slate-600 text-sm sm:text-base">
            Sign in to access your catering management platform
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-6 sm:pb-8">
          <form onSubmit={handleLogin} className="space-y-4 sm:space-y-6">
            {error && (
              <Alert variant="destructive" className="text-sm">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full h-11 sm:h-12 border-2 hover:bg-slate-50 transition-colors text-sm sm:text-base"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2 flex-shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="truncate">{googleLoading ? "Signing in with Google..." : "Continue with Google"}</span>
            </Button>

            <div className="relative">
              <Separator className="my-3 sm:my-4" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="bg-white px-2 text-xs text-muted-foreground">
                  Or sign in with email
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700 font-medium text-sm sm:text-base">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 sm:h-12 text-sm sm:text-base"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 font-medium text-sm sm:text-base">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 sm:h-12 text-sm sm:text-base"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 sm:h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 transition-opacity text-white font-semibold text-sm sm:text-base"
              disabled={loading || googleLoading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>

            <div className="text-center">
              <Link href="/auth/register" className="text-xs sm:text-sm text-purple-600 hover:text-purple-700 font-medium">
                Don&apos;t have an account? Register here
              </Link>
            </div>

            <div className="text-center pt-2">
              <p className="text-xs text-slate-500">
                Having trouble signing in?{" "}
                <Link href="/support" className="text-purple-600 hover:text-purple-700 font-medium">
                  Contact Support
                </Link>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
