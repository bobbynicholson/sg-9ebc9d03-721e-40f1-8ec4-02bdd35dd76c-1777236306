import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Truck,
  ChefHat,
  ShoppingCart,
  Sparkles,
  User,
  Copy,
  Check,
  Play,
  ArrowRight,
  Building2,
  Clock,
  Lock,
  Mail
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";

export default function TestCompanyPage() {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const testAccounts = [
    {
      role: "admin",
      title: "Company Admin",
      icon: Shield,
      username: "test+admin@cateringms.com",
      password: "demo123",
      description: "Full system access - manage orders, staff, finances, and settings",
      color: "from-purple-500 to-purple-600",
      features: ["Full Dashboard", "User Management", "Financial Reports", "System Settings"]
    },
    {
      role: "driver",
      title: "Driver Portal",
      icon: Truck,
      username: "test+driver@cateringms.com",
      password: "demo123",
      description: "View deliveries, track earnings, and manage your schedule",
      color: "from-blue-500 to-blue-600",
      features: ["GPS Tracking", "Earnings Dashboard", "Job Management", "Route Planning"]
    },
    {
      role: "kitchen",
      title: "Kitchen Team",
      icon: ChefHat,
      username: "test+kitchen@cateringms.com",
      password: "demo123",
      description: "Manage prep schedules, production, and kitchen operations",
      color: "from-orange-500 to-orange-600",
      features: ["Prep Lists", "Production Tracking", "Duty Roster", "Inventory Status"]
    },
    {
      role: "shopping",
      title: "Shopping Team",
      icon: ShoppingCart,
      username: "test+shopping@cateringms.com",
      password: "demo123",
      description: "Track inventory, manage purchases, and supplier orders",
      color: "from-green-500 to-green-600",
      features: ["Inventory Management", "Purchase Orders", "Supplier Database", "Stock Alerts"]
    },
    {
      role: "cleaning",
      title: "Cleaning Team",
      icon: Sparkles,
      username: "test+cleaning@cateringms.com",
      password: "demo123",
      description: "Equipment verification, cleaning schedules, and damage tracking",
      color: "from-cyan-500 to-cyan-600",
      features: ["Equipment Verification", "Cleaning Workflows", "Damage Reports", "Task Management"]
    },
    {
      role: "client",
      title: "Client Portal",
      icon: User,
      username: "test+client@cateringms.com",
      password: "demo123",
      description: "Book events, view quotes, and track your orders",
      color: "from-slate-500 to-slate-600",
      features: ["Order Tracking", "Quote Requests", "Payment History", "Event Calendar"]
    }
  ];

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Test Company Demo - Try CateringMS</title>
        <meta name="description" content="Test drive CateringMS with sample data across all user roles" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50">
        <div className="container mx-auto px-4 py-12 max-w-7xl">
          {/* Header */}
          <div className="text-center mb-12">
            <Badge className="mb-4 bg-green-100 text-green-700 border-green-200 text-sm px-4 py-1">
              <Play className="w-4 h-4 mr-2" />
              Interactive Demo
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Test Drive CateringMS
            </h1>
            <p className="text-xl text-slate-600 mb-2">
              Explore all features with pre-loaded sample data
            </p>
            <p className="text-slate-500">
              Login as any role below to see the platform in action
            </p>
          </div>

          {/* Info Banner */}
          <Card className="border-2 border-blue-200 shadow-lg mb-8 bg-gradient-to-br from-blue-50 to-indigo-50">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-blue-900 mb-2">
                    Welcome to "Test Company" - Your Demo Environment
                  </h3>
                  <p className="text-blue-800 mb-4">
                    This is a fully functional demo company with sample data including orders, clients, inventory, and staff. 
                    Try any role below to see how CateringMS works for different team members.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center gap-2 text-sm text-blue-700">
                      <Clock className="w-4 h-4" />
                      <span>Unlimited access</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-blue-700">
                      <Lock className="w-4 h-4" />
                      <span>Safe sandbox environment</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-blue-700">
                      <Mail className="w-4 h-4" />
                      <span>All features enabled</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Test Accounts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {testAccounts.map((account) => (
              <Card key={account.role} className="border-0 shadow-xl hover:shadow-2xl transition-all">
                <CardHeader className={`bg-gradient-to-r ${account.color} text-white p-6`}>
                  <div className="flex items-center justify-between mb-4">
                    <account.icon className="w-8 h-8" />
                    <Badge className="bg-white/20 text-white border-white/30">
                      {account.role}
                    </Badge>
                  </div>
                  <CardTitle className="text-2xl text-white">{account.title}</CardTitle>
                  <p className="text-white/90 text-sm mt-2">{account.description}</p>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {/* Features List */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      What you can test:
                    </p>
                    {account.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm text-slate-700">
                        <Check className="w-4 h-4 text-green-600" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  {/* Login Credentials */}
                  <div className="pt-4 border-t space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1">Username</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={account.username}
                          readOnly
                          className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded px-3 py-2"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyToClipboard(account.username, `${account.role}-username`)}
                          className="flex-shrink-0"
                        >
                          {copiedField === `${account.role}-username` ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1">Password</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={account.password}
                          readOnly
                          className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded px-3 py-2"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyToClipboard(account.password, `${account.role}-password`)}
                          className="flex-shrink-0"
                        >
                          {copiedField === `${account.role}-password` ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Login Button */}
                  <Link href={`/auth/login?role=${account.role}`}>
                    <Button className={`w-full h-12 bg-gradient-to-r ${account.color} hover:opacity-90 text-white font-semibold`}>
                      <Play className="w-5 h-5 mr-2" />
                      Login as {account.title}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* CTA Section */}
          <Card className="border-0 shadow-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 text-white">
            <CardContent className="p-8 md:p-12 text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Ready to Start Your Own Company?
              </h2>
              <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
                Create your free account and get 14 days of full access with all premium features unlocked
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/auth/register">
                  <Button className="bg-white text-purple-600 hover:bg-white/90 h-14 px-8 text-lg font-semibold shadow-xl">
                    Start Free Trial
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button variant="outline" className="h-14 px-8 text-lg bg-white/10 border-white/30 text-white hover:bg-white/20">
                    View Pricing
                  </Button>
                </Link>
              </div>
              <div className="mt-6 flex items-center justify-center gap-6 text-sm text-white/80">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>14-day free trial</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>Cancel anytime</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Back to Home */}
          <div className="mt-8 text-center">
            <Link href="/">
              <Button variant="ghost" className="text-slate-600 hover:text-slate-900">
                ← Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}