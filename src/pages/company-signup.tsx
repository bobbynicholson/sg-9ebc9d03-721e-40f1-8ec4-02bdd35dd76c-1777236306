import { useState } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, CheckCircle, DollarSign, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { companyService } from "@/services/companyService";
import { roleService } from "@/services/roleService";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/types/app";

/**
 * BUG FIX: Retry profile operations with exponential backoff
 * The database trigger creates profiles asynchronously, causing race conditions
 */
async function retryProfileOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 5,
  operationName: string = "operation"
): Promise<T> {
  let lastError: any = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await operation();
      if (result) {
        console.log(`✅ ${operationName} succeeded on attempt ${attempt + 1}`);
        return result;
      }
      
      if (attempt < maxRetries - 1) {
        const delay = Math.min(100 * Math.pow(2, attempt), 2000);
        console.log(`⏳ ${operationName} returned null, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      lastError = error;
      console.error(`❌ ${operationName} failed (attempt ${attempt + 1}/${maxRetries}):`, error);
      
      if (attempt < maxRetries - 1) {
        const delay = Math.min(100 * Math.pow(2, attempt), 2000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error(`${operationName} failed after ${maxRetries} attempts`);
}

const CURRENCIES = [
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" }
];

export default function CompanySignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    companyName: "",
    ownerName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    currency: "ZAR",
    customSlug: "" // Allow custom slug selection
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validation
    if (!formData.companyName || !formData.ownerName || !formData.email || !formData.phone || !formData.password || !formData.currency) {
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

    let userId: string | null = null;
    let companyId: string | null = null;

    try {
      console.log("🚀 Starting company registration process...");

      // Step 1: Create auth user
      console.log("📝 Step 1: Creating auth user...");
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.ownerName,
            role: "admin",
            currency: formData.currency,
            phone_number: formData.phone,
            company_name: formData.companyName
          }
        }
      });

      if (signUpError) {
        console.error("❌ Signup error:", signUpError);
        
        if (signUpError.message.includes("already registered") || signUpError.message.includes("already exists")) {
          setError("An account with this email already exists. Please use a different email or try logging in.");
        } else if (signUpError.message.includes("email") && signUpError.message.includes("confirm")) {
          setError("Email confirmation is required. Please check your email inbox and verify your account before logging in.");
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

      // Step 2: Wait for profile to be created by database trigger (with retry)
      console.log("⏳ Step 2: Waiting for profile creation...");
      try {
        await retryProfileOperation(
          async () => {
            const { data: profileCheck, error: profileError } = await supabase
              .from("profiles")
              .select("id")
              .eq("id", userId)
              .maybeSingle();
            
            if (profileError) throw profileError;
            return profileCheck;
          },
          5,
          "Profile verification"
        );
        console.log("✅ Profile exists and verified");
      } catch (profileError) {
        console.error("❌ Profile verification failed:", profileError);
        setError("Account created but profile setup failed. Please contact support with your email address.");
        setLoading(false);
        return;
      }

      // Step 3: Create company record
      console.log("🏢 Step 3: Creating company record...");
      const companySlug = formData.customSlug || formData.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      
      const companyResult = await companyService.createCompany({
        name: formData.companyName,
        owner_id: userId,
        currency: formData.currency,
        phone: formData.phone,
        email: formData.email,
        company_slug: companySlug,
      });

      if (!companyResult.success || !companyResult.company) {
        console.error("❌ Company creation failed:", companyResult.error);
        setError(companyResult.error || "Failed to create company. Please contact support.");
        setLoading(false);
        return;
      }

      companyId = companyResult.company.id;
      console.log("✅ Company created:", companyId);

      // Step 4: Link profile to company (with retry)
      console.log("🔗 Step 4: Linking profile to company...");
      try {
        await retryProfileOperation(
          async () => {
            const { data: updateResult, error: profileUpdateError } = await supabase
              .from("profiles")
              .update({
                company_id: companyId,
                active_role: "admin",
                full_name: formData.ownerName,
                phone: formData.phone
              })
              .eq("id", userId)
              .select()
              .single();

            if (profileUpdateError) throw profileUpdateError;
            return updateResult;
          },
          5,
          "Profile company linkage"
        );
        console.log("✅ Profile linked to company");
      } catch (linkError) {
        console.error("❌ Profile linking failed:", linkError);
        setError("Company created but failed to link your account. Please contact support.");
        setLoading(false);
        return;
      }

      // Step 5: Assign admin role (non-blocking - can fail without breaking flow)
      console.log("👤 Step 5: Assigning admin role...");
      try {
        await roleService.assignRole(userId, UserRole.ADMIN, userId, true);
        console.log("✅ Admin role assigned");
      } catch (roleError) {
        console.warn("⚠️ Admin role assignment failed (non-critical):", roleError);
      }

      // Step 6: Attempt auto-login (non-blocking)
      console.log("🔐 Step 6: Attempting auto-login...");
      try {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password
        });

        if (signInError) {
          console.warn("⚠️ Auto-login failed:", signInError);
          if (signInError.message.includes("email") && (signInError.message.includes("confirm") || signInError.message.includes("verified"))) {
            console.log("📧 Email confirmation required - user will need to verify email first");
          }
        } else {
          console.log("✅ User auto-logged in");
        }
      } catch (loginError) {
        console.warn("⚠️ Auto-login error (non-critical):", loginError);
      }

      // Step 7: Show success page
      console.log("🎉 Step 7: Registration complete!");
      setSuccess(true);

    } catch (err) {
      console.error("💥 Unexpected registration error:", err);
      
      let errorMessage = "Registration failed. ";
      
      if (userId && !companyId) {
        errorMessage += "Your account was created but company setup failed. Please contact support with your email address.";
      } else if (userId && companyId) {
        errorMessage += "Your company was created but there was an issue with the final setup. Please try logging in or contact support.";
      } else {
        errorMessage += "Please try again or contact support if the problem persists.";
      }
      
      setError(errorMessage);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl border-0 shadow-2xl">
          <CardContent className="p-8 md:p-12">
            <div className="text-center mb-8">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 mx-auto flex items-center justify-center shadow-lg mb-6 animate-pulse">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                🎉 Welcome to CateringMS!
              </h2>
              <p className="text-lg text-slate-600 mb-2">
                <strong>{formData.companyName}</strong> has been successfully registered!
              </p>
              <p className="text-sm text-slate-500">
                Your account is ready and you're now logged in.
              </p>
            </div>

            <div className="space-y-4 mb-8">
              <h3 className="text-lg font-semibold text-slate-900">What's Next?</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200">
                  <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-purple-600">1</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Complete Your Onboarding</p>
                    <p className="text-sm text-slate-600">Set up your company profile and preferences</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200">
                  <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-purple-600">2</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Invite Your Team</p>
                    <p className="text-sm text-slate-600">Add drivers, kitchen staff, and other team members</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200">
                  <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-purple-600">3</span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Start Managing Orders</p>
                    <p className="text-sm text-slate-600">Create your first quote or order</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white h-12"
                onClick={() => router.push("/admin/onboarding")}
              >
                Start Onboarding
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="flex-1 h-12"
                onClick={() => router.push("/admin/dashboard")}
              >
                Go to Dashboard
              </Button>
            </div>

            <div className="mt-6 text-center">
              <p className="text-sm text-slate-500">
                Need help? Contact us at{" "}
                <a href="tel:+27836525755" className="text-purple-600 hover:text-purple-700 underline">
                  083 652 5755
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl border-0 shadow-2xl">
        <CardHeader className="space-y-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 mx-auto flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform">
            <Building2 className="w-10 h-10 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold text-center text-slate-900">
            Register Your Catering Business
          </CardTitle>
          <CardDescription className="text-center text-slate-600">
            Join CateringMS and transform how you manage your catering operations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>For Catering Companies Only:</strong> This form is for catering businesses to register their company. If you're an employee or client, please use the regular registration link provided by your company.
              </p>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-900">Company Information</h3>
              
              <div className="space-y-2">
                <Label htmlFor="companyName" className="text-slate-700 font-medium">
                  Company Name *
                </Label>
                <Input
                  id="companyName"
                  type="text"
                  placeholder="Spit Braai Delivery"
                  value={formData.companyName}
                  onChange={(e) => {
                    setFormData({ ...formData, companyName: e.target.value });
                    // Auto-generate slug from company name if custom slug is empty
                    if (!formData.customSlug) {
                      const autoSlug = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                      setFormData({ ...formData, companyName: e.target.value, customSlug: autoSlug });
                    }
                  }}
                  className="h-12"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customSlug" className="text-slate-700 font-medium">
                  Custom URL Slug (Optional)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-sm text-slate-500">yourcompany.com/</span>
                  <Input
                    id="customSlug"
                    type="text"
                    placeholder="spit-braai-delivery"
                    value={formData.customSlug}
                    onChange={(e) => {
                      const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                      setFormData({ ...formData, customSlug: slug });
                    }}
                    className="h-12 pl-40"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  This will be your company's login URL: /{formData.customSlug || 'your-company'}/login
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency" className="text-slate-700 font-medium flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Business Currency *
                </Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData({ ...formData, currency: value })}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select your currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((currency) => (
                      <SelectItem key={currency.code} value={currency.code}>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{currency.symbol}</span>
                          <span>{currency.name} ({currency.code})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-900">Owner Information</h3>

              <div className="space-y-2">
                <Label htmlFor="ownerName" className="text-slate-700 font-medium">
                  Your Full Name *
                </Label>
                <Input
                  id="ownerName"
                  type="text"
                  placeholder="John Doe"
                  value={formData.ownerName}
                  onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
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
                  placeholder="owner@yourcompany.com"
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
              className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 transition-opacity text-white font-semibold"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creating Your Company...
                </>
              ) : (
                "Register Company"
              )}
            </Button>

            <div className="text-center space-y-2">
              <p className="text-sm text-slate-500">
                Already have a company account? Contact support for login assistance
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
