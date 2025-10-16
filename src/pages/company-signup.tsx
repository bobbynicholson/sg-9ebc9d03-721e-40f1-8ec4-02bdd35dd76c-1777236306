import { useState } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, CheckCircle, DollarSign, AlertCircle } from "lucide-react";
import Link from "next/link";
import { authService } from "@/services/authService";
import { companyService } from "@/services/companyService";
import { Separator } from "@/components/ui/separator";

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
    currency: "ZAR"
  });
  const [companySlug, setCompanySlug] = useState("");
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Generate slug from company name
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  // Check if slug is available
  const checkSlugAvailability = async (slug: string) => {
    if (!slug || slug.length < 3) {
      setSlugAvailable(null);
      return;
    }

    setCheckingSlug(true);
    try {
      const available = await companyService.checkSlugAvailability(slug);
      setSlugAvailable(available);
    } catch (err) {
      console.error("Error checking slug:", err);
      setSlugAvailable(null);
    } finally {
      setCheckingSlug(false);
    }
  };

  // Handle company name change and auto-generate slug
  const handleCompanyNameChange = (name: string) => {
    setFormData({ ...formData, companyName: name });
    const newSlug = generateSlug(name);
    setCompanySlug(newSlug);
    
    // Check slug availability after a short delay
    if (newSlug.length >= 3) {
      const timeoutId = setTimeout(() => {
        checkSlugAvailability(newSlug);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  };

  // Handle manual slug change
  const handleSlugChange = (slug: string) => {
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setCompanySlug(cleanSlug);
    
    if (cleanSlug.length >= 3) {
      const timeoutId = setTimeout(() => {
        checkSlugAvailability(cleanSlug);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  };

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

    if (!companySlug || companySlug.length < 3) {
      setError("Company URL slug must be at least 3 characters");
      setLoading(false);
      return;
    }

    if (slugAvailable === false) {
      setError("This company URL is already taken. Please choose a different one.");
      setLoading(false);
      return;
    }

    try {
      // 1. Create user account with "admin" role
      const { user, error: signUpError } = await authService.signUp(
        formData.email,
        formData.password,
        formData.ownerName,
        "admin", // Company owners are admins
        formData.currency,
        formData.phone
      );

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      if (!user) {
        setError("Failed to create user account. Please try again.");
        setLoading(false);
        return;
      }

      // 2. Create company record
      const companyResult = await companyService.createCompany({
        name: formData.companyName,
        slug: companySlug,
        owner_id: user.id,
        currency: formData.currency,
        phone: formData.phone,
        email: formData.email,
        status: "active"
      });

      if (!companyResult.success) {
        setError(companyResult.error || "Failed to create company. Please contact support.");
        setLoading(false);
        return;
      }

      // 3. Update user profile with company_slug
      await companyService.updateUserCompany(user.id, companySlug);

      // Show success message
      setSuccess(true);

      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push(`/${companySlug}/auth/login?message=company_created`);
      }, 3000);
    } catch (err) {
      console.error("Company registration error:", err);
      setError("Registration failed. Please try again or contact support.");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 shadow-2xl">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 mx-auto flex items-center justify-center shadow-lg mb-6">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Company Created Successfully!</h2>
            <p className="text-slate-600 mb-4">
              <strong>{formData.companyName}</strong> has been registered!
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-green-800 mb-2">
                <strong>Your company URL:</strong>
              </p>
              <p className="text-lg font-mono font-bold text-green-900">
                cateringms.com/{companySlug}
              </p>
            </div>
            <p className="text-sm text-slate-600 mb-2">
              You can now sign in and start managing your catering business!
            </p>
            <p className="text-xs text-slate-400 mt-4">Redirecting to login in 3 seconds...</p>
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
                  onChange={(e) => handleCompanyNameChange(e.target.value)}
                  className="h-12"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="companySlug" className="text-slate-700 font-medium">
                  Company URL Slug *
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">cateringms.com/</span>
                  <Input
                    id="companySlug"
                    type="text"
                    placeholder="your-company-name"
                    value={companySlug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    className="h-12 flex-1"
                    required
                  />
                </div>
                {checkingSlug && (
                  <p className="text-xs text-slate-500">Checking availability...</p>
                )}
                {slugAvailable === true && companySlug.length >= 3 && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    This URL is available!
                  </p>
                )}
                {slugAvailable === false && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    This URL is already taken. Please choose a different one.
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  This will be your unique company URL. Use lowercase letters, numbers, and hyphens only.
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
              disabled={loading || slugAvailable === false}
            >
              {loading ? "Creating Your Company..." : "Register Company"}
            </Button>

            <div className="text-center space-y-2">
              <Link href="/auth/login" className="text-sm text-purple-600 hover:text-purple-700 font-medium block">
                Already have a company account? Sign in here
              </Link>
              <div className="text-xs text-slate-500 pt-2 border-t">
                <p>Are you an employee looking to join a company?</p>
                <Link href="/auth/register" className="text-purple-600 hover:text-purple-700 font-medium">
                  Use employee registration instead
                </Link>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
