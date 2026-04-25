import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, ArrowRight, Loader2, Building2, Lock } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function CompanyLoginPage() {
  const router = useRouter();
  const { company_slug } = router.query;
  const { message } = router.query;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<{ name: string; logo?: string } | null>(null);
  const { toast } = useToast();

  // Fetch company info based on slug
  useEffect(() => {
    if (!company_slug || typeof company_slug !== "string") return;

    const fetchCompanyInfo = async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("company_name, logo_url")
        .eq("company_slug", company_slug)
        .single();

      if (data) {
        setCompanyInfo({ name: data.company_name, logo: data.logo_url });
      } else {
        console.error("Company not found:", error);
        setError("Company not found. Please check the URL.");
      }
    };

    fetchCompanyInfo();
  }, [company_slug]);

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
    }
  }, [message, toast]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email || !company_slug) {
      setError("Please enter your email address");
      setLoading(false);
      return;
    }

    const slugString = company_slug as string;

    try {
      console.log("🔐 Company login attempt for:", email, "at", slugString);
      
      // Check if user exists in profiles (case-insensitive)
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select(`
          *,
          companies!inner(
            company_slug,
            company_name
          )
        `)
        .ilike("email", email.trim())
        .single();

      console.log("👤 Profile found:", profiles);
      console.log("🎭 User role:", profiles?.active_role);
      console.log("🏢 User company:", profiles?.companies);

      if (profileError || !profiles) {
        console.error("❌ No profile found:", profileError);
        setError("No account found with this email address. Please check your email or contact support.");
        setLoading(false);
        return;
      }

      // Verify user belongs to this company (unless super admin)
      const userCompanySlug = Array.isArray(profiles.companies) 
        ? profiles.companies[0]?.company_slug 
        : profiles.companies?.company_slug;

      if (profiles.active_role !== "super_admin" && userCompanySlug !== slugString) {
        console.error("❌ User belongs to different company:", userCompanySlug, "vs", slugString);
        setError("This account does not belong to this company. Please use the correct login page.");
        setLoading(false);
        return;
      }

      // Try to login with bypass password
      console.log("🔑 Attempting authentication...");
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: "BYPASS_2026",
      });

      if (signInError) {
        console.error("Authentication failed:", signInError);
        setError("Authentication failed. Please try again.");
        setLoading(false);
        return;
      }

      // Redirect based on role
      const activeRole = profiles.active_role;
      console.log("🎯 Redirecting user with role:", activeRole);
      
      let dashboardUrl = "/";

      switch (activeRole) {
        case "company_admin":
          dashboardUrl = `/${company_slug}/admin/dashboard`;
          break;
        case "driver":
          dashboardUrl = `/${company_slug}/team-portal/driver/dashboard`;
          break;
        case "kitchen_staff":
          dashboardUrl = `/${company_slug}/team-portal/kitchen/dashboard`;
          break;
        case "shopping_staff":
          dashboardUrl = `/${company_slug}/team-portal/shopping/dashboard`;
          break;
        case "cleaning_staff":
          dashboardUrl = `/${company_slug}/team-portal/cleaning/dashboard`;
          break;
        case "client":
          dashboardUrl = `/${company_slug}/client-portal/dashboard`;
          break;
        default:
          dashboardUrl = "/";
      }

      console.log("🚀 Redirect URL:", dashboardUrl);
      router.push(dashboardUrl);
    } catch (err) {
      console.error("💥 Login error:", err);
      setError("Login failed. Please try again.");
      setLoading(false);
    }
  };

  if (!company_slug) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50">
        <Card className="w-full max-w-md">
          <CardContent className="p-12 text-center">
            <Loader2 className="w-12 h-12 mx-auto mb-4 text-purple-600 animate-spin" />
            <p className="text-slate-600">Loading...</p>
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
              {companyInfo?.logo ? (
                <img src={companyInfo.logo} alt="Company Logo" className="w-12 h-12 object-contain" />
              ) : (
                <Building2 className="w-8 h-8 text-white" />
              )}
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-slate-900">
                {companyInfo?.name || "Company"} Portal
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
              Need access?{" "}
              <span className="text-purple-600 font-medium">
                Contact your administrator
              </span>
            </p>
            <p className="text-xs text-slate-400">
              <Link href="/" className="text-purple-600 hover:text-purple-700 font-medium">
                ← Back to Home
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}