import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Calendar,
  ShoppingCart,
  TrendingUp,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Clock,
  DollarSign,
  Package,
} from "lucide-react";
import Link from "next/link";

interface PortalComponentProps {
  companySlug: string;
  portal: string;
  currentRoute: string;
}

export default function AdminDashboard({ companySlug }: PortalComponentProps) {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({
    activeOrders: 0,
    teamMembers: 0,
    upcomingEvents: 0,
    monthlyRevenue: 0,
  });

  useEffect(() => {
    setStats({
      activeOrders: 12,
      teamMembers: 8,
      upcomingEvents: 5,
      monthlyRevenue: 45000,
    });
  }, []);

  const quickActions = [
    {
      title: "Manage Team",
      description: "Add or edit team members and their roles",
      icon: Users,
      href: `/${companySlug}/admin/users`,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "View Calendar",
      description: "Check upcoming events and bookings",
      icon: Calendar,
      href: "/calendar",
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "Manage Orders",
      description: "Track and manage customer orders",
      icon: ShoppingCart,
      href: "/orders",
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "View Reports",
      description: "Access analytics and performance metrics",
      icon: TrendingUp,
      href: `/${companySlug}/admin/reports`,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
  ];

  return (
    <>
      <NoIndexMeta />
      <div className="flex h-screen bg-slate-50">
        <AdminNav />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 lg:ml-64 xl:ml-72">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 mb-2">
                    Welcome back, {profile?.full_name || user?.email?.split('@')[0] || 'Admin'}!
                  </h1>
                  <p className="text-slate-600">
                    Here's what's happening with your catering business today.
                  </p>
                </div>
                <Link href={`/${companySlug}/admin/onboarding`}>
                  <Button variant="outline" className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Onboarding Guide
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Card className="border-2 hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">
                    Active Orders
                  </CardTitle>
                  <ShoppingCart className="h-5 w-5 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-slate-900">{stats.activeOrders}</div>
                  <p className="text-xs text-slate-500 mt-1">
                    <span className="text-green-600 font-medium">+2</span> from yesterday
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">
                    Team Members
                  </CardTitle>
                  <Users className="h-5 w-5 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-slate-900">{stats.teamMembers}</div>
                  <p className="text-xs text-slate-500 mt-1">
                    Across all departments
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">
                    Upcoming Events
                  </CardTitle>
                  <Calendar className="h-5 w-5 text-purple-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-slate-900">{stats.upcomingEvents}</div>
                  <p className="text-xs text-slate-500 mt-1">
                    Next 7 days
                  </p>
                </CardContent>
              </Card>

              <Card className="border-2 hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">
                    Monthly Revenue
                  </CardTitle>
                  <DollarSign className="h-5 w-5 text-orange-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-slate-900">
                    R{stats.monthlyRevenue.toLocaleString()}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    <span className="text-green-600 font-medium">+12%</span> from last month
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    Quick Actions
                  </CardTitle>
                  <CardDescription>
                    Access common tasks and features
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-3">
                    {quickActions.map((action) => (
                      <Link key={action.title} href={action.href}>
                        <div className="flex items-center gap-4 p-3 rounded-lg border hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer group">
                          <div className={`${action.bgColor} p-2 rounded-lg`}>
                            <action.icon className={`w-5 h-5 ${action.color}`} />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                              {action.title}
                            </h4>
                            <p className="text-sm text-slate-500">{action.description}</p>
                          </div>
                          <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    Recent Activity
                  </CardTitle>
                  <CardDescription>
                    Latest updates from your team
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="bg-green-100 p-2 rounded-full">
                        <Package className="w-4 h-4 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          New order received
                        </p>
                        <p className="text-xs text-slate-500">Wedding event for 150 guests</p>
                        <p className="text-xs text-slate-400 mt-1">2 hours ago</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="bg-blue-100 p-2 rounded-full">
                        <Users className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          Team member added
                        </p>
                        <p className="text-xs text-slate-500">John Smith joined as driver</p>
                        <p className="text-xs text-slate-400 mt-1">5 hours ago</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="bg-purple-100 p-2 rounded-full">
                        <Calendar className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          Event scheduled
                        </p>
                        <p className="text-xs text-slate-500">Corporate lunch next Tuesday</p>
                        <p className="text-xs text-slate-400 mt-1">1 day ago</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-2 bg-gradient-to-br from-purple-50 to-pink-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  Getting Started
                </CardTitle>
                <CardDescription>
                  Complete these steps to get the most out of CateringMS
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium text-slate-900">Set up your company profile</span>
                    <Badge className="ml-auto bg-green-100 text-green-700">Complete</Badge>
                  </div>
                  <Link href={`/${companySlug}/admin/users`}>
                    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border hover:border-purple-300 transition-colors cursor-pointer group">
                      <div className="w-5 h-5 rounded-full border-2 border-purple-300" />
                      <span className="text-sm font-medium text-slate-900 group-hover:text-purple-600">Add your first team member</span>
                      <ArrowRight className="ml-auto w-4 h-4 text-slate-400 group-hover:text-purple-600" />
                    </div>
                  </Link>
                  <Link href="/orders">
                    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border hover:border-purple-300 transition-colors cursor-pointer group">
                      <div className="w-5 h-5 rounded-full border-2 border-purple-300" />
                      <span className="text-sm font-medium text-slate-900 group-hover:text-purple-600">Create your first order</span>
                      <ArrowRight className="ml-auto w-4 h-4 text-slate-400 group-hover:text-purple-600" />
                    </div>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </>
  );
}
