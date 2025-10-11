
import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ChefHat, 
  Calendar, 
  Users, 
  Package, 
  Truck, 
  DollarSign,
  ClipboardList,
  ShoppingCart,
  CheckCircle2,
  Clock,
  TrendingUp,
  AlertCircle
} from "lucide-react";

export default function HomePage() {
  const [userRole] = useState<"admin" | "kitchen" | "buyer" | "driver" | "client">("admin");

  const stats = [
    { label: "Active Orders", value: "12", icon: ClipboardList, trend: "+3", color: "text-blue-600" },
    { label: "Pending Quotes", value: "8", icon: DollarSign, trend: "+2", color: "text-green-600" },
    { label: "Today's Deliveries", value: "5", icon: Truck, trend: "2 completed", color: "text-purple-600" },
    { label: "Low Stock Items", value: "4", icon: AlertCircle, trend: "Action needed", color: "text-orange-600" }
  ];

  const quickActions = [
    { title: "New Lead", description: "Add a new catering inquiry", icon: Users, href: "/leads/new", color: "bg-blue-50 hover:bg-blue-100" },
    { title: "Create Quote", description: "Generate a quote for a client", icon: DollarSign, href: "/quotes/new", color: "bg-green-50 hover:bg-green-100" },
    { title: "View Calendar", description: "Check bookings and availability", icon: Calendar, href: "/calendar", color: "bg-purple-50 hover:bg-purple-100" },
    { title: "Manage Inventory", description: "Update stock levels", icon: Package, href: "/inventory", color: "bg-orange-50 hover:bg-orange-100" },
    { title: "Kitchen Orders", description: "View preparation tasks", icon: ChefHat, href: "/kitchen", color: "bg-red-50 hover:bg-red-100" },
    { title: "Shopping List", description: "Items to purchase", icon: ShoppingCart, href: "/shopping", color: "bg-teal-50 hover:bg-teal-100" }
  ];

  const recentActivity = [
    { type: "quote", client: "Sarah Johnson", action: "Quote sent", time: "2 hours ago", status: "pending" },
    { type: "payment", client: "Michael Chen", action: "Payment received", time: "3 hours ago", status: "completed" },
    { type: "order", client: "Emma Davis", action: "Order confirmed", time: "5 hours ago", status: "confirmed" },
    { type: "delivery", client: "Robert Brown", action: "Delivery completed", time: "1 day ago", status: "completed" }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl shadow-lg">
                <ChefHat className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                  Catering Management Platform
                </h1>
                <p className="text-slate-600 mt-1">Complete catering operations in one place</p>
              </div>
            </div>
            <Badge variant="outline" className="px-4 py-2 text-sm">
              {userRole.charAt(0).toUpperCase() + userRole.slice(1)} Dashboard
            </Badge>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-xl ${stat.color} bg-opacity-10`}>
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {stat.trend}
                  </Badge>
                </div>
                <p className="text-3xl font-bold text-slate-900 mb-1">{stat.value}</p>
                <p className="text-sm text-slate-600">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <Card className="mb-8 border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-600" />
              Quick Actions
            </CardTitle>
            <CardDescription>Common tasks to get you started</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {quickActions.map((action, index) => (
                <Link key={index} href={action.href}>
                  <div className={`p-6 rounded-xl ${action.color} border border-slate-200 transition-all duration-300 hover:scale-105 cursor-pointer group`}>
                    <action.icon className="w-8 h-8 text-slate-700 mb-3 group-hover:scale-110 transition-transform" />
                    <h3 className="font-semibold text-slate-900 mb-1">{action.title}</h3>
                    <p className="text-sm text-slate-600">{action.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-600" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest updates across your catering operations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center justify-between p-4 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full ${
                      activity.status === "completed" ? "bg-green-500" :
                      activity.status === "confirmed" ? "bg-blue-500" :
                      "bg-orange-500"
                    }`} />
                    <div>
                      <p className="font-medium text-slate-900">{activity.client}</p>
                      <p className="text-sm text-slate-600">{activity.action}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">{activity.time}</span>
                    {activity.status === "completed" && (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Getting Started Section */}
        <Card className="mt-8 border-2 border-dashed border-slate-300 bg-gradient-to-br from-orange-50 to-red-50">
          <CardContent className="p-8 text-center">
            <ChefHat className="w-16 h-16 text-orange-600 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Ready to Get Started?</h3>
            <p className="text-slate-600 mb-6 max-w-2xl mx-auto">
              This platform manages your entire catering workflow: from lead capture and quote generation, 
              through kitchen preparation and inventory management, to driver delivery and client confirmation.
            </p>
            <div className="flex gap-4 justify-center">
              <Link href="/leads/new">
                <Button size="lg" className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700">
                  <Users className="w-5 h-5 mr-2" />
                  Add Your First Lead
                </Button>
              </Link>
              <Link href="/calendar">
                <Button size="lg" variant="outline">
                  <Calendar className="w-5 h-5 mr-2" />
                  View Calendar
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
