import { useState } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, CheckCircle, DollarSign, Shield, ChefHat, ShoppingCart, Truck, Sparkles, User } from "lucide-react";
import Link from "next/link";
import { authService } from "@/services/authService";
import { profileService } from "@/services/profileService";
import { Separator } from "@/components/ui/separator";
import { UserRole } from "@/types";
import { userManagementService } from "@/services/userManagementService";

const CURRENCIES = [
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" }
];

const ROLES = [
  { value: "admin", label: "Admin", icon: Shield, description: "Full system access" },
  { value: "kitchen", label: "Kitchen Team", icon: ChefHat, description: "Kitchen operations" },
  { value: "shopping", label: "Shopping Team", icon: ShoppingCart, description: "Purchasing & inventory" },
  { value: "driver", label: "Driver", icon: Truck, description: "Deliveries & logistics" },
  { value: "cleaning", label: "Cleaning Team", icon: Sparkles, description: "Equipment cleaning" },
  { value: "client", label: "Client", icon: User, description: "Client access" }
];

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    currency: "ZAR",
    role: "client" as UserRole,
    companyName: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [companySlug, setCompanySlug] = useState("");

  // Generate company slug when company name changes
  const handleCompanyNameChange = (value: string) => {
    setFormData({ ...formData, companyName: value });
    
    // Generate URL-friendly slug
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim();
    
    setCompanySlug(slug);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!formData.name || !formData.email || !formData.phone || !formData.password || !formData.currency || !formData.role) {
      setError("Please fill in all required fields");
      setLoading(false);
      return;
    }

    // Require company name for non-client roles (catering companies signing up)
    if (formData.role === "admin" && !formData.companyName) {
      setError("Please provide your company name");
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

    try {
      // Step 1: Sign up the user with selected role
      const { user, error: signUpError } = await authService.signUp(
        formData.email,
        formData.password,
        formData.name,
        formData.role,
        formData.currency,
        formData.phone
      );

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      if (!user) {
        setError("Registration failed. Please try again.");
        setLoading(false);
        return;
      }

      // Step 2: Create/update the profile with correct data including company_slug
      try {
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 14);

        await profileService.createProfile({
          id: user.id,
          email: formData.email,
          full_name: formData.name,
          role: formData.role,
          currency: formData.currency,
          phone_number: formData.phone,
          company_name: formData.companyName || formData.name,
          subscription_status: "trial",
          subscription_plan: "trial",
          trial_ends_at: trialEndsAt.toISOString(),
          is_active: true,
        });

        // If company slug exists, update it via SQL
        if (companySlug && formData.role === "admin") {
          await fetch('/api/update-company-slug', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              companySlug: companySlug
            })
          });
        }
      } catch (profileError: any) {
        console.error("Profile creation error:", profileError);
      }

      // Show success message
      setSuccess(true);

      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push("/auth/login?message=account_created");
      }, 2000);
    } catch (err) {
      console.error("Registration error:", err);
      setError("Registration failed. Please try again.");
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setError("");
    setGoogleLoading(true);

    try {
      const { error } = await authService.signInWithGoogle();
      
      if (error) {
        setError(error.message);
        setGoogleLoading(false);
      }
      // OAuth will redirect automatically
    } catch (err) {
      console.error("Google sign up error:", err);
      setError("Failed to sign up with Google. Please try again.");
      setGoogleLoading(false);
    }
  };

  const selectedRole = ROLES.find(r => r.value === formData.role);
  const RoleIcon = selectedRole?.icon || User;

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 shadow-2xl">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 mx-auto flex items-center justify-center shadow-lg mb-6">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Account Created Successfully!</h2>
            <p className="text-slate-600 mb-4">
              Your <strong>{selectedRole?.label}</strong> account has been created for <strong>{formData.email}</strong>
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-green-800">
                <strong>Success!</strong> You can now sign in to your account immediately.
              </p>
            </div>
            <p className="text-sm text-slate-500">
              Your account is set up with {CURRENCIES.find(c => c.code === formData.currency)?.name} as your currency and includes a 14-day free trial.
            </p>
            <p className="text-xs text-slate-400 mt-4">Redirecting to login in 2 seconds...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardHeader className="space-y-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 mx-auto flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform">
            <UserPlus className="w-10 h-10 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold text-center text-slate-900">
            Create Account
          </CardTitle>
          <CardDescription className="text-center text-slate-600">
            Join the catering management platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full h-12 border-2 hover:bg-slate-50 transition-colors"
              onClick={handleGoogleSignUp}
              disabled={googleLoading || loading}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
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
              {googleLoading ? "Signing up with Google..." : "Continue with Google"}
            </Button>

            <div className="relative">
              <Separator className="my-4" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="bg-white px-2 text-xs text-muted-foreground">
                  Or sign up with email
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role" className="text-slate-700 font-medium">
                Account Role *
              </Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value as UserRole })}
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select your role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => {
                    const Icon = role.icon;
                    return (
                      <SelectItem key={role.value} value={role.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" />
                          <div>
                            <div className="font-semibold">{role.label}</div>
                            <div className="text-xs text-slate-500">{role.description}</div>
                          </div>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">
                Choose the role that matches your access level
              </p>
            </div>

            {formData.role === "admin" && (
              <div className="space-y-2">
                <Label htmlFor="companyName" className="text-slate-700 font-medium">
                  Company Name * <span className="text-xs text-slate-500">(Required for admin accounts)</span>
                </Label>
                <Input
                  id="companyName"
                  type="text"
                  placeholder="Spit Braai Delivery"
                  value={formData.companyName}
                  onChange={(e) => handleCompanyNameChange(e.target.value)}
                  className="h-12"
                  required={formData.role === "admin"}
                />
                {companySlug && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
                    <p className="text-xs text-blue-800">
                      <strong>Your portal URL:</strong> /{companySlug}/
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      Your team and clients will access your portal at this URL
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-700 font-medium">
                Full Name *
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                placeholder="your.email@example.com"
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
              <Label htmlFor="currency" className="text-slate-700 font-medium flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Preferred Currency *
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
              <p className="text-xs text-slate-500 mt-1">
                All pricing in your account will be displayed in this currency
              </p>
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

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Your account will be created with <strong>{selectedRole?.label}</strong> access and a 14-day free trial. An admin can modify roles after registration if needed.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 transition-opacity text-white font-semibold"
              disabled={loading || googleLoading}
            >
              {loading ? "Creating Account..." : "Create Account"}
            </Button>

            <div className="text-center">
              <Link href="/auth/login" className="text-sm text-purple-600 hover:text-purple-700 font-medium">
                Already have an account? Sign in here
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
