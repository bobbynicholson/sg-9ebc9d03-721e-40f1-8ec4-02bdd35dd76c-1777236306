import { useState } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, CheckCircle, DollarSign } from "lucide-react";
import Link from "next/link";
import { authService } from "@/services/authService";
import { Separator } from "@/components/ui/separator";

const CURRENCIES = [
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" }
];

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    currency: "ZAR"
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!formData.name || !formData.email || !formData.phone || !formData.password || !formData.currency) {
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

    try {
      // Sign up the user - everyone registers as "client" by default
      // Admin can change roles later in the admin panel
      const { user, error: signUpError } = await authService.signUp(
        formData.email,
        formData.password,
        formData.name,
        "client", // Default role for all new registrations
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

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 flex items-center justify-center p-3 sm:p-4">
        <Card className="w-full max-w-md border-0 shadow-2xl">
          <CardContent className="p-8 sm:p-12 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 mx-auto flex items-center justify-center shadow-lg mb-4 sm:mb-6">
              <CheckCircle className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-3 sm:mb-4">Account Created Successfully!</h2>
            <p className="text-sm sm:text-base text-slate-600 mb-3 sm:mb-4">
              Your account has been created for <strong className="break-all">{formData.email}</strong>
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
              <p className="text-xs sm:text-sm text-green-800">
                <strong>Success!</strong> You can now sign in to your account immediately.
              </p>
            </div>
            <p className="text-xs sm:text-sm text-slate-500">
              Your account is set up with {CURRENCIES.find(c => c.code === formData.currency)?.name} as your currency.
            </p>
            <p className="text-xs text-slate-400 mt-4">Redirecting to login in 2 seconds...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 flex items-center justify-center p-3 sm:p-4">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardHeader className="space-y-3 sm:space-y-4 px-4 sm:px-6 pt-6 sm:pt-8">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 mx-auto flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform">
            <UserPlus className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
          </div>
          <CardTitle className="text-2xl sm:text-3xl font-bold text-center text-slate-900">
            Create Account
          </CardTitle>
          <CardDescription className="text-center text-slate-600 text-sm sm:text-base">
            Join your company&apos;s catering management platform
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-6 sm:pb-8">
          <form onSubmit={handleRegister} className="space-y-4 sm:space-y-6">
            {error && (
              <Alert variant="destructive" className="text-sm">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full h-11 sm:h-12 border-2 hover:bg-slate-50 transition-colors text-sm sm:text-base"
              onClick={handleGoogleSignUp}
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
              <span className="truncate">{googleLoading ? "Signing up with Google..." : "Continue with Google"}</span>
            </Button>

            <div className="relative">
              <Separator className="my-3 sm:my-4" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="bg-white px-2 text-xs text-muted-foreground">
                  Or sign up with email
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-700 font-medium text-sm sm:text-base">
                Full Name *
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-11 sm:h-12 text-sm sm:text-base"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700 font-medium text-sm sm:text-base">
                Email Address *
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="h-11 sm:h-12 text-sm sm:text-base"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-slate-700 font-medium text-sm sm:text-base">
                Phone Number *
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+27 12 345 6789"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="h-11 sm:h-12 text-sm sm:text-base"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency" className="text-slate-700 font-medium flex items-center gap-2 text-sm sm:text-base">
                <DollarSign className="w-4 h-4" />
                Preferred Currency *
              </Label>
              <Select
                value={formData.currency}
                onValueChange={(value) => setFormData({ ...formData, currency: value })}
              >
                <SelectTrigger className="h-11 sm:h-12 text-sm sm:text-base">
                  <SelectValue placeholder="Select your currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{currency.symbol}</span>
                        <span className="text-sm">{currency.name} ({currency.code})</span>
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
              <Label htmlFor="password" className="text-slate-700 font-medium text-sm sm:text-base">
                Password *
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="h-11 sm:h-12 text-sm sm:text-base"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-slate-700 font-medium text-sm sm:text-base">
                Confirm Password *
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Re-enter your password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="h-11 sm:h-12 text-sm sm:text-base"
                required
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
              <p className="text-xs sm:text-sm text-blue-800">
                <strong>Note:</strong> Your account will be registered as a standard user. An admin can assign you to specific departments (Kitchen, Cleaning, Driver, etc.) after you register.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full h-11 sm:h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 transition-opacity text-white font-semibold text-sm sm:text-base"
              disabled={loading || googleLoading}
            >
              {loading ? "Creating Account..." : "Create Account"}
            </Button>

            <div className="text-center space-y-2">
              <Link href="/auth/login" className="text-xs sm:text-sm text-purple-600 hover:text-purple-700 font-medium block">
                Already have an account? Sign in here
              </Link>
              <div className="text-xs text-slate-500 pt-2 border-t">
                <p className="mb-1">Are you a catering company looking to sign up?</p>
                <Link href="/company-signup" className="text-purple-600 hover:text-purple-700 font-medium">
                  Register your catering business here
                </Link>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
