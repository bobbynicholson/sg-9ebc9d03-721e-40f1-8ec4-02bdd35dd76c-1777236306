import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Loader2, Users, CheckCircle } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { companyService } from "@/services/companyService";
import { roleService } from "@/services/roleService";

const STAFF_ROLES = [
  { value: "kitchen", label: "Kitchen Staff", description: "Access kitchen management and prep tasks" },
  { value: "driver", label: "Driver", description: "Access delivery routes and GPS tracking" },
  { value: "shopping", label: "Shopping Staff", description: "Manage ingredient purchasing" },
  { value: "cleaning", label: "Cleaning Staff", description: "Handle equipment and venue cleaning" }
];

export default function StaffSignupPage() {
  const router = useRouter();
  const { companySlug } = router.query;
  
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    role: ""
  });
  
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifyingCompany, setVerifyingCompany] = useState(true);
  const [company, setCompany] = useState<any>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (companySlug && typeof companySlug === "string") {
      verifyCompany(companySlug);
    }
  }, [companySlug]);

  const verifyCompany = async (slug: string) => {
    try {
      setVerifyingCompany(true);
      const companyData = await companyService.getCompanyBySlug(slug);
      
      if (!companyData) {
        setError("Company not found. Please check the URL and try again.");
        setVerifyingCompany(false);
        return;
      }
      
      if (!companyData.is_active) {
        setError("This company is currently inactive. Please contact support.");
        setVerifyingCompany(false);
        return;
      }
      
      setCompany(companyData);
    } catch (err) {
      console.error("Error verifying company:", err);
      setError("Failed to verify company. Please try again.");
    } finally {
      setVerifyingCompany(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validation
    if (!formData.fullName || !formData.email || !formData.phone || !formData.password || !formData.role) {
      setError("Please fill in all required fields");
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters long");
      setLoading(false);
      return;
    }

    if (!company) {
      setError("Company information not loaded. Please refresh the page.");
      setLoading(false);
      return;
    }

    let userId: string | null = null;

    try {
      console.log("🚀 Starting staff registration process...");

      // Step 1: Create auth user
      console.log("📝 Step 1: Creating auth user...");
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: formData.fullName,
            role: formData.role,
            phone_number: formData.phone,
            company_id: company.id,
            company_slug: companySlug
          }
        }
      });

      if (signUpError) {
        console.error("❌ Signup error:", signUpError);
        
        if (signUpError.message.includes("already registered") || signUpError.message.includes("already exists")) {
          setError("An account with this email already exists. Please use a different email or try logging in.");
        } else if (signUpError.message.includes("email") && signUpError.message.includes("confirm")) {
          setError("Email confirmation is required. Please check your email inbox to verify your account.");
        } else {
          setError(signUpError.message);
        }
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError("Failed to create user account. Please try again.");
        setLoading(false);
        return;
      }

      userId = authData.user.id;
      console.log("✅ User created:", userId);

      // Step 2: Wait for profile creation (with retry logic)
      console.log("⏳ Step 2: Waiting for profile creation...");
      let profileCreated = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise(resolve => setTimeout(resolve, Math.min(100 * Math.pow(2, attempt), 2000)));
        
        const { data: profileCheck, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", userId)
          .maybeSingle();
        
        if (profileCheck) {
          profileCreated = true;
          console.log("✅ Profile exists");
          break;
        }
      }

      if (!profileCreated) {
        setError("Account created but profile setup is taking longer than expected. Please try logging in shortly.");
        setLoading(false);
        return;
      }

      // Step 3: Update profile with company and role information
      console.log("🔗 Step 3: Linking staff member to company...");
      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({
          company_id: company.id,
          company_slug: companySlug as string,
          active_role: formData.role,
          full_name: formData.fullName,
          phone: formData.phone
        })
        .eq("id", userId);

      if (profileUpdateError) {
        console.error("❌ Profile update failed:", profileUpdateError);
        setError("Account created but failed to link to company. Please contact your manager.");
        setLoading(false);
        return;
      }

      console.log("✅ Profile linked to company");

      // Step 4: Assign role
      console.log("👤 Step 4: Assigning role...");
      try {
        await roleService.assignRole(userId, formData.role as any, userId, true);
        console.log("✅ Role assigned");
      } catch (roleError) {
        console.warn("⚠️ Role assignment failed (non-critical):", roleError);
      }

      // Step 5: Success!
      console.log("🎉 Step 5: Staff registration complete!");
      setSuccess(true);

    } catch (err) {
      console.error("💥 Unexpected registration error:", err);
      setError("Registration failed. Please try again or contact your manager for assistance.");
      setLoading(false);
    }
  };

  if (verifyingCompany) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-600" />
            <p className="text-slate-600">Verifying company...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !company) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-red-200">
          <CardContent className="p-8">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div className="mt-6 text-center">
              <Link href="/" className="text-blue-600 hover:text-blue-700 underline">
                Return to homepage
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl border-0 shadow-2xl">
          <CardContent className="p-8 md:p-12">
            <div className="text-center mb-8">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 mx-auto flex items-center justify-center shadow-lg mb-6 animate-pulse">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                🎉 Welcome to the Team!
              </h2>
              <p className="text-lg text-slate-600 mb-2">
                Your account has been created successfully at <strong>{company?.name}</strong>
              </p>
              <p className="text-sm text-slate-500">
                You're registered as: <strong>{STAFF_ROLES.find(r => r.value === formData.role)?.label}</strong>
              </p>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 mb-6 border-2 border-blue-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">What's Next?</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-blue-600">1</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Check Your Email</p>
                    <p className="text-sm text-slate-600">
                      You may need to verify your email before logging in
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-blue-600">2</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Login to Your Portal</p>
                    <p className="text-sm text-slate-600">
                      Use the button below to access your role-specific dashboard
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-blue-600">3</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Start Working</p>
                    <p className="text-sm text-slate-600">
                      Access your tasks and responsibilities
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white h-12"
                onClick={() => router.push(`/${companySlug}/auth/login`)}
              >
                Login to Your Portal
              </Button>
            </div>

            <div className="mt-6 text-center">
              <p className="text-sm text-slate-500">
                Need help? Contact your manager or{" "}
                <a href={`tel:${company?.phone}`} className="text-blue-600 hover:text-blue-700 underline">
                  {company?.phone}
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl border-0 shadow-2xl">
        <CardHeader className="space-y-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 mx-auto flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform">
            <Users className="w-10 h-10 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold text-center text-slate-900">
            Join {company?.name}
          </CardTitle>
          <CardDescription className="text-center text-slate-600">
            Register as a staff member to access your work portal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>For Staff Members:</strong> This form is for employees joining {company?.name}. 
                If you're a company owner, please use the company registration page.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-slate-700 font-medium">
                  Full Name *
                </Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="h-12"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700 font-medium">
                  Email Address *
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="h-12"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-slate-700 font-medium">
                  Phone Number *
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+27 12 345 6789"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="h-12"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role" className="text-slate-700 font-medium">
                  Your Role *
                </Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select your role" />
                  </SelectTrigger>
                  <SelectContent>
                    {STAFF_ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        <div className="flex flex-col">
                          <span className="font-semibold">{role.label}</span>
                          <span className="text-xs text-slate-500">{role.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700 font-medium">
                  Password *
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="h-12"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-slate-700 font-medium">
                  Confirm Password *
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Re-enter your password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="h-12"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-blue-500 to-indigo-500 hover:opacity-90 transition-opacity text-white font-semibold"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creating Your Account...
                </>
              ) : (
                "Register as Staff Member"
              )}
            </Button>

            <div className="text-center space-y-2">
              <Link 
                href={`/${companySlug}/auth/login`} 
                className="text-sm text-blue-600 hover:text-blue-700 font-medium block"
              >
                Already have an account? Sign in here
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}