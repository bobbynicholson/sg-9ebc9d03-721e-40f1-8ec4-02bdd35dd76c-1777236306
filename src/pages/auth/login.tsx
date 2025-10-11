
import { useState } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UserRole } from "@/types";
import { ChefHat, Truck, ShoppingCart, Sparkles, Shield, User } from "lucide-react";
import Link from "next/link";

const roleIcons = {
  admin: Shield,
  kitchen: ChefHat,
  buyer: ShoppingCart,
  driver: Truck,
  cleaning: Sparkles,
  client: User,
};

const roleColors = {
  admin: "from-purple-500 to-purple-600",
  kitchen: "from-orange-500 to-orange-600",
  buyer: "from-green-500 to-green-600",
  driver: "from-blue-500 to-blue-600",
  cleaning: "from-pink-500 to-pink-600",
  client: "from-slate-500 to-slate-600",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email || !password || !role) {
      setError("Please fill in all fields");
      setLoading(false);
      return;
    }

    try {
      const user = {
        id: Math.random().toString(36).substring(7),
        email,
        name: email.split("@")[0],
        role: role as UserRole,
      };

      localStorage.setItem("current_user", JSON.stringify(user));
      localStorage.setItem("auth_token", Math.random().toString(36).substring(2));

      setTimeout(() => {
        switch (role) {
          case "admin":
            router.push("/");
            break;
          case "kitchen":
            router.push("/kitchen");
            break;
          case "buyer":
            router.push("/shopping");
            break;
          case "driver":
            router.push("/drivers");
            break;
          case "cleaning":
            router.push("/cleaning");
            break;
          case "client":
            router.push("/client-portal");
            break;
          default:
            router.push("/");
        }
      }, 500);
    } catch (err) {
      setError("Login failed. Please try again.");
      setLoading(false);
    }
  };

  const RoleIcon = role ? roleIcons[role as keyof typeof roleIcons] : User;
  const gradientClass = role ? roleColors[role as keyof typeof roleColors] : "from-slate-500 to-slate-600";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardHeader className="space-y-4">
          <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${gradientClass} mx-auto flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform`}>
            <RoleIcon className="w-10 h-10 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold text-center text-slate-900">
            Welcome Back
          </CardTitle>
          <CardDescription className="text-center text-slate-600">
            Sign in to access your catering management platform
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
              <Label htmlFor="role" className="text-slate-700 font-medium">
                Select Role
              </Label>
              <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
                <SelectTrigger id="role" className="h-12">
                  <SelectValue placeholder="Choose your role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Admin
                    </div>
                  </SelectItem>
                  <SelectItem value="kitchen">
                    <div className="flex items-center gap-2">
                      <ChefHat className="w-4 h-4" />
                      Kitchen Team
                    </div>
                  </SelectItem>
                  <SelectItem value="buyer">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4" />
                      Shopping Team
                    </div>
                  </SelectItem>
                  <SelectItem value="driver">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4" />
                      Driver
                    </div>
                  </SelectItem>
                  <SelectItem value="cleaning">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      Cleaning Team
                    </div>
                  </SelectItem>
                  <SelectItem value="client">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Client
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

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
              />
            </div>

            <Button
              type="submit"
              className={`w-full h-12 bg-gradient-to-r ${gradientClass} hover:opacity-90 transition-opacity text-white font-semibold`}
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>

            <div className="text-center">
              <Link href="/auth/register" className="text-sm text-purple-600 hover:text-purple-700 font-medium">
                Don&apos;t have an account? Register here
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
