import { useState } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UserPlus, CheckCircle } from "lucide-react";
import Link from "next/link";
import { authService } from "@/services/authService";
import { Separator } from "@/components/ui/separator";
import { AuthShell } from "@/components/auth/AuthShell";

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!formData.name || !formData.email || !formData.phone || !formData.password) {
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
      const { user, error: signUpError } = await authService.signUp(
        formData.email,
        formData.password,
        {
          full_name: formData.name,
          role: "client",
          phone: formData.phone
        }
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
      <AuthShell
        headline="Welcome to CateringMS."
        subcopy="Your account is ready — sign in and let's get your events rolling."
      >
        <Card className="w-full max-w-md border border-slate-200/80 shadow-xl rounded-2xl">
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
            <p className="text-xs text-slate-400 mt-4">Redirecting to login in 2 seconds...</p>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      headline="Create your account."
      subcopy="Join your company's catering platform and pick up where the team left off."
    >
      <Card className="w-full max-w-md border border-slate-200/80 shadow-xl rounded-2xl">
        <CardHeader className="space-y-3 px-4 sm:px-6 pt-6 sm:pt-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 mx-auto flex items-center justify-center shadow-lg">
            <UserPlus className="w-7 h-7 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-center text-slate-900">
            Create account
          </CardTitle>
          <CardDescription className="text-center text-slate-600 text-sm">
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
                <strong>Note:</strong> Your account will be registered as a client user. An admin can assign you to specific departments (Kitchen, Cleaning, Driver, etc.) after registration.
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
    </AuthShell>
  );
}