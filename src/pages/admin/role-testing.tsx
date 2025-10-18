import { useState } from "react";
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
  Copy,
  ExternalLink,
  AlertCircle
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { useAuth } from "@/contexts/AuthContext";
import { roleService } from "@/services/roleService";
import { UserRole } from "@/types/app";

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
  departments?: string[];
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
    departments: ["admin"]
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
    departments: ["driver"]
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
    departments: ["shopping"]
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
    departments: ["kitchen"]
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
    departments: ["cleaning"]
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
    departments: ["admin", "driver", "shopping", "kitchen", "cleaning"]
  }
];

const sqlScript = `-- ROLE ASSIGNMENT SQL SCRIPT
-- Run this script AFTER registering the test users
-- This will assign the correct roles/departments to each test user

-- 1. Admin User (admin@test.cateringms.com)
INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'admin', true
FROM profiles
WHERE email = 'admin@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

UPDATE profiles
SET role = 'admin', active_role = 'admin'
WHERE email = 'admin@test.cateringms.com';

-- 2. Driver User (driver@test.cateringms.com)
INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'driver', true
FROM profiles
WHERE email = 'driver@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

UPDATE profiles
SET role = 'driver', active_role = 'driver'
WHERE email = 'driver@test.cateringms.com';

-- 3. Shopping Manager (shopping@test.cateringms.com)
INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'shopping', true
FROM profiles
WHERE email = 'shopping@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

UPDATE profiles
SET role = 'shopping', active_role = 'shopping'
WHERE email = 'shopping@test.cateringms.com';

-- 4. Kitchen Staff (kitchen@test.cateringms.com)
INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'kitchen', true
FROM profiles
WHERE email = 'kitchen@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

UPDATE profiles
SET role = 'kitchen', active_role = 'kitchen'
WHERE email = 'kitchen@test.cateringms.com';

-- 5. Cleaning Staff (cleaning@test.cateringms.com)
INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'cleaning', true
FROM profiles
WHERE email = 'cleaning@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

UPDATE profiles
SET role = 'cleaning', active_role = 'cleaning'
WHERE email = 'cleaning@test.cateringms.com';

-- 6. Multi-Role User (multirole@test.cateringms.com)
-- Add all departments for multi-role testing
INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'admin', true
FROM profiles
WHERE email = 'multirole@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'driver', false
FROM profiles
WHERE email = 'multirole@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'shopping', false
FROM profiles
WHERE email = 'multirole@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'kitchen', false
FROM profiles
WHERE email = 'multirole@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

INSERT INTO user_departments (user_id, department, is_primary)
SELECT id, 'cleaning', false
FROM profiles
WHERE email = 'multirole@test.cateringms.com'
ON CONFLICT (user_id, department) DO NOTHING;

UPDATE profiles
SET role = 'admin', active_role = 'admin'
WHERE email = 'multirole@test.cateringms.com';

-- Verify the setup
SELECT 
  p.email,
  p.role,
  p.active_role,
  array_agg(ud.department) as departments
FROM profiles p
LEFT JOIN user_departments ud ON p.id = ud.user_id
WHERE p.email LIKE '%@test.cateringms.com'
GROUP BY p.id, p.email, p.role, p.active_role
ORDER BY p.email;`;

export default function RoleTestingPage() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [sqlCopied, setSqlCopied] = useState(false);

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

  const copySqlScript = () => {
    navigator.clipboard.writeText(sqlScript);
    setSqlCopied(true);
    setTimeout(() => setSqlCopied(false), 2000);
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
            <h1 className="text-4xl font-bold mb-2">🧪 Role Testing Setup</h1>
            <p className="text-muted-foreground">
              Complete guide to creating and testing all portal roles
            </p>
          </div>

          {/* Setup Instructions */}
          <Card className="border-2 border-orange-200 bg-orange-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-600" />
                ⚠️ Setup Required
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Before you can test the portals, you need to create the test users and assign their roles. Follow these steps:
              </p>
              <div className="grid gap-4 text-sm">
                <div className="flex gap-3 p-3 bg-white rounded-lg border">
                  <Badge variant="outline" className="shrink-0 h-6">Step 1</Badge>
                  <div>
                    <strong className="block mb-1">Register Each Test User</strong>
                    <p className="text-muted-foreground">
                      Go to the registration page and create accounts for each test user using the emails and passwords shown below.
                      Register URL: <code className="px-1 py-0.5 bg-slate-100 rounded">https://cateringms.com/spit-braai-delivery/auth/register</code>
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 p-3 bg-white rounded-lg border">
                  <Badge variant="outline" className="shrink-0 h-6">Step 2</Badge>
                  <div>
                    <strong className="block mb-1">Run the SQL Script</strong>
                    <p className="text-muted-foreground mb-2">
                      After registering all users, copy and run the SQL script below to assign the correct roles and departments.
                    </p>
                    <Button variant="outline" size="sm" onClick={copySqlScript}>
                      <Copy className="h-4 w-4 mr-2" />
                      {sqlCopied ? "SQL Copied!" : "Copy SQL Script"}
                    </Button>
                  </div>
                </div>
                <div className="flex gap-3 p-3 bg-white rounded-lg border">
                  <Badge variant="outline" className="shrink-0 h-6">Step 3</Badge>
                  <div>
                    <strong className="block mb-1">Start Testing!</strong>
                    <p className="text-muted-foreground">
                      Login with each test account and verify that the correct portal appears with appropriate permissions.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SQL Script Display */}
          <Card>
            <CardHeader>
              <CardTitle>SQL Role Assignment Script</CardTitle>
              <CardDescription>
                Run this in your Supabase SQL Editor after registering all test users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <pre className="bg-slate-900 text-slate-50 p-4 rounded-lg overflow-x-auto text-xs max-h-96 overflow-y-auto">
                  <code>{sqlScript}</code>
                </pre>
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={copySqlScript}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {sqlCopied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Alert>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                Ready to test? Use the credentials below to login to each portal
              </span>
              <Button variant="outline" size="sm" onClick={copyAllCredentials}>
                <Copy className="h-4 w-4 mr-2" />
                Copy All Credentials
              </Button>
            </AlertDescription>
          </Alert>

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
                    </div>
                  </CardHeader>
                  <CardContent className="pl-6 space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {account.description}
                    </p>

                    {account.departments && account.departments.length > 1 && (
                      <div className="flex flex-wrap gap-1">
                        {account.departments.map((dept) => (
                          <Badge key={dept} variant="outline" className="text-xs">
                            {dept}
                          </Badge>
                        ))}
                      </div>
                    )}

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
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 border-2 border-slate-300 rounded mt-0.5"></div>
                  <div>
                    <strong>Department Access</strong> - Multi-role user can see RoleSwitcher and toggle between portals
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
