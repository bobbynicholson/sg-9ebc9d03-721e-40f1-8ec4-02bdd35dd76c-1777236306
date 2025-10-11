import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  FileText, 
  Calendar,
  DollarSign,
  ChefHat,
  Package,
  Truck,
  ClipboardList,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  ShoppingCart,
  Sparkles,
  UserCircle,
  Shield,
  Mail,
  Settings
} from "lucide-react";
import { NotificationCenter } from "@/components/tracking/NotificationCenter";
import { Footer } from "@/components/Footer";

export default function HomePage() {
  const stats = [
    { 
      label: "Active Leads", 
      value: "12", 
      icon: Users, 
      color: "from-blue-500 to-cyan-500",
      bgColor: "bg-blue-100",
      textColor: "text-blue-600"
    },
    { 
      label: "Pending Quotes", 
      value: "8", 
      icon: FileText, 
      color: "from-purple-500 to-pink-500",
      bgColor: "bg-purple-100",
      textColor: "text-purple-600"
    },
    { 
      label: "Confirmed Events", 
      value: "15", 
      icon: Calendar, 
      color: "from-green-500 to-emerald-500",
      bgColor: "bg-green-100",
      textColor: "text-green-600"
    },
    { 
      label: "Monthly Revenue", 
      value: "R 245K", 
      icon: TrendingUp, 
      color: "from-orange-500 to-red-500",
      bgColor: "bg-orange-100",
      textColor: "text-orange-600"
    },
  ];

  const adminActions = [
    { 
      title: "Lead Management", 
      description: "Capture and manage incoming leads",
      icon: Users, 
      href: "/leads",
      color: "from-blue-500 to-cyan-500"
    },
    { 
      title: "Create Quote", 
      description: "Generate professional catering quotes",
      icon: FileText, 
      href: "/quotes/new",
      color: "from-purple-500 to-pink-500"
    },
    { 
      title: "Event Calendar", 
      description: "View all scheduled events",
      icon: Calendar, 
      href: "/calendar",
      color: "from-green-500 to-emerald-500"
    },
    { 
      title: "All Quotes", 
      description: "Manage quote pipeline",
      icon: ClipboardList, 
      href: "/quotes",
      color: "from-violet-500 to-purple-500"
    },
    { 
      title: "Orders Management", 
      description: "Track confirmed orders",
      icon: Package, 
      href: "/orders",
      color: "from-orange-500 to-red-500"
    },
    { 
      title: "Inventory & Equipment", 
      description: "Manage stock and equipment",
      icon: Package, 
      href: "/inventory",
      color: "from-indigo-500 to-purple-500"
    },
    { 
      title: "Driver Management", 
      description: "Oversee delivery team",
      icon: Truck, 
      href: "/drivers",
      color: "from-teal-500 to-cyan-500"
    },
    { 
      title: "User Management", 
      description: "Assign roles and manage access",
      icon: Users, 
      href: "/admin/users",
      color: "from-blue-600 to-indigo-600"
    },
    { 
      title: "Admin Tracking", 
      description: "Monitor all active deliveries",
      icon: Shield, 
      href: "/tracking/admin",
      color: "from-slate-500 to-slate-600"
    },
    { 
      title: "Email Templates", 
      description: "Customize automated emails",
      icon: Mail, 
      href: "/admin/email-templates",
      color: "from-pink-500 to-rose-500"
    },
    { 
      title: "System Settings", 
      description: "Configure platform preferences",
      icon: Settings, 
      href: "/admin/settings",
      color: "from-slate-500 to-slate-600"
    },
  ];

  const teamPortals = [
    {
      title: "Kitchen Team Portal",
      description: "View orders, manage prep schedules",
      icon: ChefHat,
      href: "/kitchen",
      color: "from-red-500 to-orange-500",
      badge: "Staff"
    },
    {
      title: "Cleaning Team Portal",
      description: "Track equipment cleaning schedules",
      icon: Sparkles,
      href: "/cleaning",
      color: "from-blue-500 to-cyan-500",
      badge: "Staff"
    },
    {
      title: "Shopping Team Portal",
      description: "Manage ingredient purchases",
      icon: ShoppingCart,
      href: "/shopping",
      color: "from-green-500 to-emerald-500",
      badge: "Staff"
    },
    {
      title: "Driver Portal",
      description: "Accept jobs and track deliveries",
      icon: Truck,
      href: "/tracking/driver",
      color: "from-purple-500 to-pink-500",
      badge: "Driver"
    },
    {
      title: "Client Portal",
      description: "Track your event orders",
      icon: UserCircle,
      href: "/client-portal",
      color: "from-indigo-500 to-blue-500",
      badge: "Client"
    },
  ];

  const recentActivity = [
    { 
      type: "quote", 
      message: "New quote created for Sarah Johnson", 
      time: "2 hours ago",
      status: "pending"
    },
    { 
      type: "payment", 
      message: "Payment received for Event #Q003", 
      time: "4 hours ago",
      status: "success"
    },
    { 
      type: "order", 
      message: "Kitchen order completed for tomorrow", 
      time: "5 hours ago",
      status: "success"
    },
    { 
      type: "alert", 
      message: "Low stock alert: Chicken Breast", 
      time: "6 hours ago",
      status: "warning"
    },
  ];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "quote": return <FileText className="w-4 h-4" />;
      case "payment": return <DollarSign className="w-4 h-4" />;
      case "order": return <ChefHat className="w-4 h-4" />;
      case "alert": return <AlertCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success": return "bg-green-100 text-green-700 border-green-200";
      case "warning": return "bg-orange-100 text-orange-700 border-orange-200";
      case "pending": return "bg-blue-100 text-blue-700 border-blue-200";
      default: return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
                Catering Management Platform
              </h1>
              <p className="text-slate-600">Complete solution for South African catering businesses</p>
            </div>
            <div className="flex gap-3">
              <Badge className="px-4 py-2 text-sm bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0">
                <CheckCircle className="w-4 h-4 mr-2" />
                All Systems Active
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 group">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">{stat.label}</p>
                    <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-xl ${stat.bgColor} group-hover:scale-110 transition-transform`}>
                    <stat.icon className={`w-6 h-6 ${stat.textColor}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Admin Dashboard</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {adminActions.map((action, index) => (
                  <Link key={index} href={action.href}>
                    <Card className="border-0 shadow-md hover:shadow-xl transition-all duration-300 group cursor-pointer h-full">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className={`p-3 bg-gradient-to-br ${action.color} rounded-2xl shadow-lg group-hover:scale-110 transition-transform`}>
                            <action.icon className="w-6 h-6 text-white" />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-purple-600 transition-colors">
                          {action.title}
                        </h3>
                        <p className="text-sm text-slate-600">{action.description}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-slate-900">Team Portals</h2>
                <Badge className="bg-purple-100 text-purple-700">Role-Based Access</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {teamPortals.map((portal, index) => (
                  <Link key={index} href={portal.href}>
                    <Card className="border-0 shadow-md hover:shadow-xl transition-all duration-300 group cursor-pointer h-full">
                      <CardContent className="pt-6">
                        <div className="flex flex-col items-center text-center space-y-3">
                          <div className={`p-4 bg-gradient-to-br ${portal.color} rounded-2xl shadow-lg group-hover:scale-110 transition-transform`}>
                            <portal.icon className="w-8 h-8 text-white" />
                          </div>
                          <div>
                            <Badge className="mb-2 bg-slate-100 text-slate-700">{portal.badge}</Badge>
                            <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-purple-600 transition-colors">
                              {portal.title}
                            </h3>
                            <p className="text-xs text-slate-600">{portal.description}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <NotificationCenter />

            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Recent Activity</h2>
              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6 space-y-4">
                  {recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-start gap-3 pb-4 border-b last:border-b-0 last:pb-0">
                      <div className={`p-2 rounded-lg ${getStatusColor(activity.status)}`}>
                        {getActivityIcon(activity.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900 mb-1">{activity.message}</p>
                        <p className="text-xs text-slate-500">{activity.time}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-pink-50">
              <CardHeader>
                <CardTitle className="text-lg">System Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Email Notifications</span>
                  <Badge className="bg-green-100 text-green-700 border-green-200">Active</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">GPS Tracking</span>
                  <Badge className="bg-green-100 text-green-700 border-green-200">Online</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Equipment Calc</span>
                  <Badge className="bg-green-100 text-green-700 border-green-200">Running</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Auto Cleaning</span>
                  <Badge className="bg-green-100 text-green-700 border-green-200">Enabled</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="border-0 shadow-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white">
          <CardContent className="py-8 px-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold mb-2">Built for South African Catering Excellence</h3>
                <p className="text-purple-100">From lead capture to delivery tracking, everything you need to run a profitable catering business</p>
              </div>
              <Link href="/auth/register">
                <Button variant="secondary" size="lg" className="bg-white text-purple-600 hover:bg-purple-50">
                  Get Started
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Footer />
    </div>
  );
}
