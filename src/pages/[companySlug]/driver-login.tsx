import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Truck, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { authService } from "@/services/authService";
import { profileService } from "@/services/profileService";
import { useToast } from "@/hooks/use-toast";

export default function DriverLoginPage() {
  const router = useRouter();
  const { companySlug } = router.query;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email || !password) {
      setError("Please enter your email and password");
      setLoading(false);
      return;
    }

    try {
      const { user, error: signInError } = await authService.signIn(email, password);

      if (signInError) {
        if (signInError.message.includes("Invalid login credentials")) {
          setError("The email or password you entered is incorrect. Please try again.");
        } else if (signInError.message.includes("Email not confirmed")) {
          setError("Please confirm your email address before signing in.");
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

      const profile = await profileService.getProfile(user.id);

      if (!profile) {
        setError("Driver profile not found. Please contact your administrator.");
        setLoading(false);
        return;
      }

      if (profile.role !== "driver") {
        setError("This login is for drivers only. Your account has a different role.");
        setLoading(false);
        return;
      }

      toast({
        title: "Welcome back!",
        description: "Successfully signed in as driver",
        duration: 3000,
      });

      router.push("/drivers");
    } catch (err) {
      console.error("Login error:", err);
      setError("Login failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardHeader className="space-y-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 mx-auto flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform">
            <Truck className="w-10 h-10 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold text-center text-slate-900">
            Driver Portal
          </CardTitle>
          <CardDescription className="text-center text-slate-600">
            {companySlug ? `Sign in to ${companySlug} driver portal` : "Sign in to your driver account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700 font-medium">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12"
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12"
                required
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-blue-500 to-blue-600 hover:opacity-90 transition-opacity text-white font-semibold"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>New driver?</strong> Contact your administrator to get your account set up.
              </p>
            </div>

            <div className="text-center pt-2">
              <p className="text-xs text-slate-500">
                Having trouble signing in?{" "}
                <Link href="/support" className="text-blue-600 hover:text-blue-700 font-medium">
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
