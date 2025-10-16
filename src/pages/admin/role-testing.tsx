import { useState, useEffect } from "react";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Shield,
  ChefHat,
  ShoppingCart,
  Truck,
  Sparkles,
  User,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { UserRole } from "@/types";

interface TestAccount {
  role: UserRole;
  name: string;
  email: string;
  password: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  loginUrl: string;
  portalUrl: string;
  description: string;
  created: boolean;
}

const testAccounts: TestAccount[] = [
  {
    role: "admin",
    name: "Admin User",
    email: "admin@test.cateringms.com",
    password: "TestAdmin123!",
    icon: Shield,
    color: "purple",
    loginUrl: "https://cateringms.com/spit-braai-delivery/auth/login",
    portalUrl: "https://cateringms.com/spit-braai-delivery/admin/dashboard",
    description: "Full system access - manage all aspects of the catering business",
    created: false
  },
  {
    role: "driver",
    name: "Driver User",
    email: "driver@test.cateringms.com",
    password: "TestDriver123!",
    icon: Truck,
    color: "blue",
    loginUrl: "https://cateringms.com/spit-braai-delivery/auth/login",
    portalUrl: "https://cateringms.com/spit-braai-delivery/driver/dashboard",
    description: "Delivery operations - view routes, deliveries, and update status",
    created: false
  },
  {
    role: "shopping",
    name: "Shopping Manager",
    email: "shopping@test.cateringms.com",
    password: "TestShopping123!",
    icon: ShoppingCart,
    color: "green",
    loginUrl: "https://cateringms.com/spit-braai-delivery/auth/login",
    portalUrl: "https://cateringms.com/spit-braai-delivery/shopping/dashboard",
    description: "Procurement - manage orders, suppliers, and inventory",
    created: false
  },
  {
    role: "kitchen",
    name: "Kitchen Staff",
    email: "kitchen@test.cateringms.com",
    password: "TestKitchen123!",
    icon: ChefHat,
    color: "orange",
    loginUrl: "https://cateringms.com/spit-braai-delivery/auth/login",
    portalUrl: "https://cateringms.com/spit-braai-delivery/kitchen/dashboard",
    description: "Kitchen operations - manage menu, stock, and prep lists",
    created: false
  },
  {
    role: "cleaning",
    name: "Cleaning Staff",
    email: "cleaning@test.cateringms.com",
    password: "TestCleaning123!",
    icon: Sparkles,
    color: "pink",
    loginUrl: "https://cateringms.com/spit-braai-delivery/auth/login",
    portalUrl: "https://cateringms.com/spit-braai-delivery/cleaning/dashboard",
    description: "Equipment cleaning - manage tasks, schedules, and supplies",
    created: false
  },
  {
    role: "client",
    name: "Multi-Role User",
    email: "multirole@test.cateringms.com",
    password: "TestMulti123!",
    icon: User,
    color: "slate",
    loginUrl: "https://cateringms.com/spit-braai-delivery/auth/login",
    portalUrl: "https://cateringms.com/spit-braai-delivery/admin/dashboard",
    description: "Has access to ALL portals - perfect for testing role switching",
    created: false
  }
];

export default function RoleTestingPage() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyCredentials = (account: TestAccount, index: number) => {
    const text = `Email: ${account.email}\nPassword: ${account.password}\nLogin URL: ${account.loginUrl}`;
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const copyAllCredentials = () => {
    const allText = testAccounts.map(acc => 
      `${acc.name}:\nEmail: ${acc.email}\nPassword: ${acc.password}\nPortal: ${acc.portalUrl}\n`
    ).join("\n");
    navigator.clipboard.writeText(allText);
    alert("All credentials copied to clipboard!");
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Role Testing Credentials - CateringMS Admin</title>
      </Head>

      <AdminNav />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 lg:ml-64 xl:ml-72">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-4xl font-bold mb-2">🧪 Role Testing Credentials</h1>
            <p className="text-muted-foreground">
              Test user accounts for all portal roles - use these to verify each portal's functionality
            </p>
          </div>

          <Alert>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                All test accounts are ready to use! Simply copy the credentials and login.
              </span>
              <Button variant="outline" size="sm" onClick={copyAllCredentials}>
                <Copy className="h-4 w-4 mr-2" />
                Copy All
              </Button>
            </AlertDescription>
          </Alert>

          {/* Quick Start Guide */}
          <Card className="border-2 border-blue-200 bg-blue-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                🚀 Quick Start Guide
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 text-sm">
                <div className="flex gap-3">
                  <Badge variant="outline" className="shrink-0">1</Badge>
                  <div>
                    <strong>Choose a role to test</strong> from the cards below
                  </div>
                </div>
                <div className="flex gap-3">
                  <Badge variant="outline" className="shrink-0">2</Badge>
                  <div>
                    <strong>Copy the credentials</strong> or click the login URL
                  </div>
                </div>
                <div className="flex gap-3">
                  <Badge variant="outline" className="shrink-0">3</Badge>
                  <div>
                    <strong>Login with the provided email and password</strong>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Badge variant="outline" className="shrink-0">4</Badge>
                  <div>
                    <strong>Verify the portal loads correctly</strong> and role-specific features appear
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Test Account Cards */}
          <div className="grid gap-6 md:grid-cols-2">
            {testAccounts.map((account, index) => {
              const Icon = account.icon;
              return (
                <Card key={account.role} className="relative overflow-hidden">
                  <div className={`absolute top-0 left-0 w-2 h-full bg-${account.color}-500`}></div>
                  <CardHeader className="pl-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 bg-${account.color}-100 rounded-lg`}>
                          <Icon className={`h-6 w-6 text-${account.color}-600`} />
                        </div>
                        <div>
                          <CardTitle>{account.name}</CardTitle>
                          <Badge variant="secondary" className="mt-1">
                            {account.role}
                          </Badge>
                        </div>
                      </div>
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    </div>
                  </CardHeader>
                  <CardContent className="pl-6 space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {account.description}
                    </p>

                    <div className="space-y-3">
                      <div className="p-3 bg-slate-100 rounded-lg space-y-2 font-mono text-sm">
                        <div>
                          <span className="text-muted-foreground">Email:</span>
                          <div className="font-medium text-xs break-all">{account.email}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Password:</span>
                          <div className="font-medium">{account.password}</div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => copyCredentials(account, index)}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          {copiedIndex === index ? "Copied!" : "Copy"}
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => window.open(account.loginUrl, "_blank")}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Login
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Portal URLs Reference */}
          <Card>
            <CardHeader>
              <CardTitle>Portal URLs After Login</CardTitle>
              <CardDescription>
                Each role will be redirected to their respective portal
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {testAccounts.map((account) => {
                  const Icon = account.icon;
                  return (
                    <div
                      key={account.role}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{account.name}</span>
                      </div>
                      <a
                        href={account.portalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {account.portalUrl}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Testing Checklist */}
          <Card>
            <CardHeader>
              <CardTitle>Testing Checklist</CardTitle>
              <CardDescription>
                Verify these points for each role
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 border-2 border-slate-300 rounded mt-0.5"></div>
                  <div>
                    <strong>Authentication</strong> - User can login successfully
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 border-2 border-slate-300 rounded mt-0.5"></div>
                  <div>
                    <strong>Portal Access</strong> - Correct portal dashboard loads
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 border-2 border-slate-300 rounded mt-0.5"></div>
                  <div>
                    <strong>Navigation</strong> - Portal-specific menu appears
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 border-2 border-slate-300 rounded mt-0.5"></div>
                  <div>
                    <strong>Role Switching</strong> - Multi-role user can switch between portals
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 border-2 border-slate-300 rounded mt-0.5"></div>
                  <div>
                    <strong>Permissions</strong> - Only authorized actions are available
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Important Notes */}
          <Alert>
            <AlertDescription>
              <strong>Note:</strong> These are test accounts for the <strong>spit-braai-delivery</strong> company.
              To test with a different company, you'll need to create users through the normal registration process
              and assign them to the appropriate company.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </>
  );
}