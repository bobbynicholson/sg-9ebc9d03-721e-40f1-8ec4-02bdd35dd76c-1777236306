
import { useState } from "react";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield,
  ChefHat,
  ShoppingCart,
  Truck,
  Sparkles,
  User,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Copy,
  Eye,
  EyeOff
} from "lucide-react";
import { authService } from "@/services/authService";
import { profileService } from "@/services/profileService";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { UserRole } from "@/types";

interface RoleConfig {
  role: UserRole;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  portalUrl: string;
  description: string;
}

interface TestResult {
  role: UserRole;
  email: string;
  registrationSuccess: boolean;
  loginSuccess: boolean;
  portalAccess: boolean;
  error?: string;
  timestamp: string;
}

const roleConfigs: RoleConfig[] = [
  {
    role: "admin",
    name: "Admin",
    icon: Shield,
    color: "purple",
    portalUrl: "/admin/dashboard",
    description: "Full system access and management capabilities"
  },
  {
    role: "kitchen",
    name: "Kitchen Staff",
    icon: ChefHat,
    color: "orange",
    portalUrl: "/kitchen",
    description: "Food preparation and kitchen management"
  },
  {
    role: "shopping",
    name: "Shopping Staff",
    icon: ShoppingCart,
    color: "green",
    portalUrl: "/shopping",
    description: "Inventory and procurement management"
  },
  {
    role: "driver",
    name: "Driver",
    icon: Truck,
    color: "blue",
    portalUrl: "/drivers",
    description: "Delivery and logistics operations"
  },
  {
    role: "cleaning",
    name: "Cleaning Staff",
    icon: Sparkles,
    color: "pink",
    portalUrl: "/cleaning",
    description: "Equipment cleaning and maintenance"
  },
  {
    role: "client",
    name: "Client",
    icon: User,
    color: "slate",
    portalUrl: "/client-portal",
    description: "Client order management and tracking"
  }
];

export default function RoleTestingPage() {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [testing, setTesting] = useState(false);
  const [currentTest, setCurrentTest] = useState<string>("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [manualEmail, setManualEmail] = useState("");
  const [manualPassword, setManualPassword] = useState("");
  const [manualRole, setManualRole] = useState<UserRole>("admin");
  const [manualTesting, setManualTesting] = useState(false);

  const testPassword = "Test123!@#";
  const baseEmail = "test";

  const generateTestEmail = (role: UserRole) => {
    return `${baseEmail}+${role}@cateringms.com`;
  };

  const runSingleRoleTest = async (config: RoleConfig) => {
    const email = generateTestEmail(config.role);
    const result: TestResult = {
      role: config.role,
      email,
      registrationSuccess: false,
      loginSuccess: false,
      portalAccess: false,
      timestamp: new Date().toISOString()
    };

    try {
      setCurrentTest(`Testing ${config.name}...`);

      // Step 1: Try to register
      setCurrentTest(`Registering ${config.name} user...`);
      const { user: regUser, error: regError } = await authService.signUp(
        email,
        testPassword,
        `Test ${config.name}`,
        config.role,
        "ZAR",
        "+27123456789"
      );

      if (regUser) {
        result.registrationSuccess = true;
        
        // Step 2: Sign out after registration
        await authService.signOut();
        
        // Step 3: Try to login
        setCurrentTest(`Logging in as ${config.name}...`);
        const { user: loginUser, error: loginError } = await authService.signIn(email, testPassword);

        if (loginUser) {
          result.loginSuccess = true;

          // Step 4: Verify profile has correct role
          setCurrentTest(`Verifying ${config.name} profile...`);
          const profile = await profileService.getProfile(loginUser.id);

          if (profile && profile.role === config.role) {
            result.portalAccess = true;
          } else {
            result.error = `Profile role mismatch: expected ${config.role}, got ${profile?.role}`;
          }

          // Sign out after testing
          await authService.signOut();
        } else {
          result.error = loginError?.message || "Login failed";
        }
      } else if (regError?.message.includes("already exists")) {
        // User already exists, try to login directly
        result.registrationSuccess = true;
        result.error = "User already exists (expected for retests)";

        setCurrentTest(`User exists, testing login for ${config.name}...`);
        const { user: loginUser, error: loginError } = await authService.signIn(email, testPassword);

        if (loginUser) {
          result.loginSuccess = true;

          const profile = await profileService.getProfile(loginUser.id);
          if (profile && profile.role === config.role) {
            result.portalAccess = true;
          } else {
            result.error = `Profile role mismatch: expected ${config.role}, got ${profile?.role}`;
          }

          await authService.signOut();
        } else {
          result.error = loginError?.message || "Login failed";
        }
      } else {
        result.error = regError?.message || "Registration failed";
      }
    } catch (error: any) {
      result.error = error.message || "Unexpected error";
    }

    return result;
  };

  const runAllTests = async () => {
    setTesting(true);
    setTestResults([]);

    for (const config of roleConfigs) {
      const result = await runSingleRoleTest(config);
      setTestResults(prev => [...prev, result]);
    }

    setCurrentTest("");
    setTesting(false);
  };

  const runManualTest = async () => {
    if (!manualEmail || !manualPassword) {
      alert("Please enter email and password");
      return;
    }

    setManualTesting(true);
    const config = roleConfigs.find(c => c.role === manualRole)!;

    const result: TestResult = {
      role: manualRole,
      email: manualEmail,
      registrationSuccess: false,
      loginSuccess: false,
      portalAccess: false,
      timestamp: new Date().toISOString()
    };

    try {
      // Try to login with manual credentials
      const { user, error } = await authService.signIn(manualEmail, manualPassword);

      if (user) {
        result.loginSuccess = true;

        const profile = await profileService.getProfile(user.id);
        if (profile && profile.role === manualRole) {
          result.portalAccess = true;
          result.registrationSuccess = true;
        } else {
          result.error = `Profile role mismatch: expected ${manualRole}, got ${profile?.role}`;
        }

        await authService.signOut();
      } else {
        result.error = error?.message || "Login failed";
      }
    } catch (error: any) {
      result.error = error.message || "Unexpected error";
    }

    setTestResults(prev => [...prev, result]);
    setManualTesting(false);
  };

  const copyCredentials = (role: UserRole) => {
    const text = `Email: ${generateTestEmail(role)}\nPassword: ${testPassword}`;
    navigator.clipboard.writeText(text);
    alert("Credentials copied to clipboard!");
  };

  const getResultIcon = (result: TestResult) => {
    if (result.portalAccess && result.loginSuccess && result.registrationSuccess) {
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    }
    if (result.error) {
      return <XCircle className="h-5 w-5 text-red-600" />;
    }
    return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
  };

  const getResultColor = (result: TestResult) => {
    if (result.portalAccess && result.loginSuccess && result.registrationSuccess) {
      return "border-green-200 bg-green-50";
    }
    if (result.error) {
      return "border-red-200 bg-red-50";
    }
    return "border-yellow-200 bg-yellow-50";
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Role Testing - CateringMS Admin</title>
      </Head>

      <AdminNav />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 lg:ml-64 xl:ml-72">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-4xl font-bold mb-2">Role Testing Dashboard</h1>
            <p className="text-muted-foreground">
              Test user registration, authentication, and portal access for all roles
            </p>
          </div>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This testing page will create test users for each role. Test users use the format: test+[role]@cateringms.com
            </AlertDescription>
          </Alert>

          <Tabs defaultValue="auto" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="auto">Automated Testing</TabsTrigger>
              <TabsTrigger value="manual">Manual Testing</TabsTrigger>
            </TabsList>

            <TabsContent value="auto" className="space-y-6">
              {/* Test All Button */}
              <Card>
                <CardHeader>
                  <CardTitle>Run Complete Role Test Suite</CardTitle>
                  <CardDescription>
                    This will test registration, login, and portal access for all 6 roles
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    onClick={runAllTests}
                    disabled={testing}
                    className="w-full"
                    size="lg"
                  >
                    {testing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Running Tests...
                      </>
                    ) : (
                      "Run All Role Tests"
                    )}
                  </Button>

                  {currentTest && (
                    <Alert className="border-blue-200 bg-blue-50">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      <AlertDescription className="text-blue-900">
                        {currentTest}
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* Test Credentials */}
              <Card>
                <CardHeader>
                  <CardTitle>Test User Credentials</CardTitle>
                  <CardDescription>
                    Generated test accounts for each role
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-4">
                      <Label>Show Passwords</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPasswords(!showPasswords)}
                      >
                        {showPasswords ? (
                          <><EyeOff className="h-4 w-4 mr-2" />Hide</>
                        ) : (
                          <><Eye className="h-4 w-4 mr-2" />Show</>
                        )}
                      </Button>
                    </div>

                    {roleConfigs.map((config) => {
                      const Icon = config.icon;
                      return (
                        <div
                          key={config.role}
                          className="flex items-center justify-between p-4 border rounded-lg bg-white"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 bg-${config.color}-100 rounded-lg`}>
                              <Icon className={`h-5 w-5 text-${config.color}-600`} />
                            </div>
                            <div>
                              <div className="font-medium">{config.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {generateTestEmail(config.role)}
                              </div>
                              {showPasswords && (
                                <div className="text-xs text-slate-500 mt-1">
                                  Password: {testPassword}
                                </div>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyCredentials(config.role)}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Test Results */}
              {testResults.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Test Results</CardTitle>
                    <CardDescription>
                      Results from the latest test run
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {testResults.map((result) => {
                        const config = roleConfigs.find(c => c.role === result.role)!;
                        const Icon = config.icon;

                        return (
                          <div
                            key={result.role}
                            className={`p-4 border rounded-lg ${getResultColor(result)}`}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <Icon className="h-5 w-5" />
                                <div>
                                  <div className="font-medium">{config.name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {result.email}
                                  </div>
                                </div>
                              </div>
                              {getResultIcon(result)}
                            </div>

                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <div className="text-muted-foreground mb-1">Registration</div>
                                <Badge
                                  variant={result.registrationSuccess ? "default" : "destructive"}
                                  className="text-xs"
                                >
                                  {result.registrationSuccess ? "Success" : "Failed"}
                                </Badge>
                              </div>
                              <div>
                                <div className="text-muted-foreground mb-1">Login</div>
                                <Badge
                                  variant={result.loginSuccess ? "default" : "destructive"}
                                  className="text-xs"
                                >
                                  {result.loginSuccess ? "Success" : "Failed"}
                                </Badge>
                              </div>
                              <div>
                                <div className="text-muted-foreground mb-1">Portal Access</div>
                                <Badge
                                  variant={result.portalAccess ? "default" : "destructive"}
                                  className="text-xs"
                                >
                                  {result.portalAccess ? "Success" : "Failed"}
                                </Badge>
                              </div>
                            </div>

                            {result.error && (
                              <Alert className="mt-3 border-red-200 bg-red-50">
                                <AlertDescription className="text-sm text-red-900">
                                  {result.error}
                                </AlertDescription>
                              </Alert>
                            )}

                            <div className="text-xs text-muted-foreground mt-3">
                              Tested: {new Date(result.timestamp).toLocaleString()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="manual" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Manual Login Test</CardTitle>
                  <CardDescription>
                    Test login with your own credentials
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="manual-email">Email</Label>
                    <Input
                      id="manual-email"
                      type="email"
                      value={manualEmail}
                      onChange={(e) => setManualEmail(e.target.value)}
                      placeholder="user@example.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="manual-password">Password</Label>
                    <Input
                      id="manual-password"
                      type="password"
                      value={manualPassword}
                      onChange={(e) => setManualPassword(e.target.value)}
                      placeholder="Enter password"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="manual-role">Expected Role</Label>
                    <select
                      id="manual-role"
                      value={manualRole}
                      onChange={(e) => setManualRole(e.target.value as UserRole)}
                      className="w-full p-2 border rounded-md"
                    >
                      {roleConfigs.map(config => (
                        <option key={config.role} value={config.role}>
                          {config.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button
                    onClick={runManualTest}
                    disabled={manualTesting}
                    className="w-full"
                  >
                    {manualTesting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      "Test Login"
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Portal URLs Reference */}
          <Card>
            <CardHeader>
              <CardTitle>Portal URLs Reference</CardTitle>
              <CardDescription>
                Where each role should be redirected after login
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {roleConfigs.map((config) => {
                  const Icon = config.icon;
                  return (
                    <div
                      key={config.role}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5" />
                        <div>
                          <div className="font-medium">{config.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {config.description}
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="font-mono text-xs">
                        {config.portalUrl}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
