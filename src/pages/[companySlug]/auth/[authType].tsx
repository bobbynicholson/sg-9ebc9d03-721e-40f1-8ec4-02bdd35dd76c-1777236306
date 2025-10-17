import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { roleService } from "@/services/roleService";
import { companyService } from "@/services/companyService";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ArrowLeft, AlertCircle } from "lucide-react";
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
  const [companyInfo, setCompanyInfo] = useState<{id: string; name: string; currency: string} | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(true);

  // **NEW: Auto-fill demo credentials from sessionStorage**
  useEffect(() => {
    if (typeof window !== "undefined" && authType === "login") {
      const demoEmail = sessionStorage.getItem("demo_email");
      const demoPassword = sessionStorage.getItem("demo_password");
      
      if (demoEmail && demoPassword) {
        setEmail(demoEmail);
        setPassword(demoPassword);
        
        // Clear sessionStorage after using
        sessionStorage.removeItem("demo_email");
        sessionStorage.removeItem("demo_password");
        sessionStorage.removeItem("demo_role");
      }
    }
  }, [authType]);

  // Load company information when component mounts
  useEffect(() => {
    async function loadCompanyInfo() {
      if (!companySlug || typeof companySlug !== "string") {
        setLoadingCompany(false);
        return;
      }

      try {
        const company = await companyService.getCompanyBySlug(companySlug);
        if (company) {
          setCompanyInfo({
            id: company.id,
            name: company.name,
            currency: company.currency || "ZAR"
          });
        } else {
          setError("Company not found. Please check the URL.");
        }
      } catch (err) {
        console.error("Error loading company:", err);
        setError("Failed to load company information.");
      } finally {
        setLoadingCompany(false);
      }
    }

    if (authType === "register" || authType === "login") {
      loadCompanyInfo();
    } else {
      setLoadingCompany(false);
    }
  }, [companySlug, authType]);

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
        const result = await signIn(email, password);
        if (result.error) {
          throw new Error(result.error.message);
        }
      } else if (authType === "register") {
        // CRITICAL FIX #1, #2, #3: Ensure company context is loaded
        if (!companyInfo) {
          throw new Error("Company information not loaded. Please refresh the page.");
        }

        // Register user as "client" with company context
        const result = await signUp(
          email, 
          password, 
          fullName, 
          "client", 
          companyInfo.currency, 
          phone
        );

        if (result.error) {
          throw new Error(result.error.message);
        }

        if (!result.user) {
          throw new Error("Registration failed. Please try again.");
        }

        // CRITICAL FIX: Link user to company immediately after signup
        try {
          await companyService.updateUserCompany(result.user.id, companySlug as string);
          console.log(`User ${result.user.id} linked to company ${companySlug}`);
        } catch (companyLinkError) {
          console.error("Error linking user to company:", companyLinkError);
          // Don't fail the signup, but log the error
        }

        // CRITICAL FIX: Assign "client" role to user_departments table
        try {
          await roleService.assignRole(result.user.id, "client", result.user.id, true);
          console.log(`Client role assigned to user ${result.user.id}`);
        } catch (roleError) {
          console.error("Error assigning client role:", roleError);
          // Don't fail the signup, but log the error
        }

        // Success message - admin will assign proper roles
        setError("");
        alert("Registration successful! An admin will assign you to the appropriate departments.");

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

  // Show loading state while fetching company info for registration
  if (loadingCompany && (authType === "register" || authType === "login")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 px-4 py-8">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="p-12 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
            <p className="text-slate-600">Loading company information...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          {companyInfo && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mt-3">
              <p className="text-xs text-purple-800">
                <strong>Company:</strong> {companyInfo.name}
              </p>
              <p className="text-xs text-purple-600 mt-1">
                URL: {companySlug}
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
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
                <Alert className="bg-blue-50 border-blue-200">
                  <AlertDescription className="text-xs text-blue-800">
                    <strong>👤 Registration Process:</strong>
                    <ul className="mt-2 ml-4 space-y-1 list-disc">
                      <li>You'll be registered as a team member</li>
                      <li>An admin will assign you to specific departments</li>
                      <li>You'll receive access to your assigned portals</li>
                      <li>Contact your admin if you need role assignments</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </>
            )}

            <Button 
              type="submit" 
              className="w-full h-11"
              disabled={loading || (authType === "register" && !companyInfo)}
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
