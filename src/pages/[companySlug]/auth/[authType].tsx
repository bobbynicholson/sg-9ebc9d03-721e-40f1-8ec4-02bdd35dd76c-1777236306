import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { roleService } from "@/services/roleService";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";

export default function AuthPage() {
  const router = useRouter();
  const { companySlug, authType } = router.query;
  const { user, signIn, signUp, userRoles, activeRole } = useAuth();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Redirect if already authenticated - USE NEW MULTI-ROLE SYSTEM
  useEffect(() => {
    if (user && userRoles.length > 0) {
      const redirect = router.query.redirect as string;
      if (redirect) {
        router.push(redirect);
      } else {
        // Find primary role or use active role
        const primaryRole = userRoles.find(r => r.isPrimary);
        const roleToUse = primaryRole?.department || activeRole || userRoles[0].department;
        
        // Use roleService to get the correct dashboard URL
        const dashboardUrl = roleService.getRoleDashboardUrl(
          roleToUse as any,
          companySlug as string
        );
        
        router.push(dashboardUrl);
      }
    }
  }, [user, userRoles, activeRole, router, companySlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (authType === "login") {
        await signIn(email, password);
      } else if (authType === "register") {
        // Everyone registers as "client" by default - admin assigns roles later
        await signUp(email, password, fullName, "client", "ZAR", phone);
      } else if (authType === "forgot-password") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/${companySlug}/auth/reset-password`,
        });
        if (error) throw error;
        alert("Password reset email sent! Check your inbox.");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (authType) {
      case "login": return "Sign In";
      case "register": return "Create Account";
      case "forgot-password": return "Reset Password";
      case "reset-password": return "Set New Password";
      default: return "Authentication";
    }
  };

  const getDescription = () => {
    switch (authType) {
      case "login": return "Sign in to your account";
      case "register": return "Create a new account to get started";
      case "forgot-password": return "Enter your email to receive a password reset link";
      case "reset-password": return "Enter your new password";
      default: return "";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 px-4 py-8">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1">
          <Link href="/" className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Home
          </Link>
          <CardTitle className="text-2xl font-bold">{getTitle()}</CardTitle>
          <CardDescription>{getDescription()}</CardDescription>
          {companySlug && (
            <p className="text-xs text-slate-500 mt-2">
              Company: <span className="font-semibold">{companySlug}</span>
            </p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {authType !== "forgot-password" && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            )}

            {authType === "register" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+27 12 345 6789"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
                  <p className="text-xs text-blue-800">
                    <strong>Note:</strong> Your account will be created as a standard user. An admin can assign you to specific departments after registration.
                  </p>
                </div>
              </>
            )}

            <Button 
              type="submit" 
              className="w-full h-11"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                getTitle()
              )}
            </Button>

            <div className="space-y-2 pt-4 border-t">
              {authType === "login" && (
                <>
                  <Link href={`/${companySlug}/auth/forgot-password`}>
                    <Button variant="link" className="w-full text-sm">
                      Forgot your password?
                    </Button>
                  </Link>
                  <Link href={`/${companySlug}/auth/register`}>
                    <Button variant="link" className="w-full text-sm">
                      Don't have an account? Sign up
                    </Button>
                  </Link>
                </>
              )}
              {authType === "register" && (
                <Link href={`/${companySlug}/auth/login`}>
                  <Button variant="link" className="w-full text-sm">
                    Already have an account? Sign in
                  </Button>
                </Link>
              )}
              {authType === "forgot-password" && (
                <Link href={`/${companySlug}/auth/login`}>
                  <Button variant="link" className="w-full text-sm">
                    Back to Sign In
                  </Button>
                </Link>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
