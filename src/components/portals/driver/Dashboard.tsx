import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { Truck, MapPin, Clock, Package, CheckCircle, AlertCircle, Calendar, Navigation, Home } from "lucide-react";
import Link from "next/link";

interface PortalComponentProps {
  companySlug: string;
  portal: string;
  currentRoute: string;
}

const DriverDashboard: React.FC<PortalComponentProps> = ({ companySlug }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header with Portal Context */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
                <Truck className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-slate-900">Driver Portal</h1>
                  <Badge className="bg-blue-100 text-blue-700 border-blue-300">
                    <Truck className="w-3 h-3 mr-1" />
                    Driver Dashboard
                  </Badge>
                </div>
                <p className="text-sm text-slate-600">Manage your deliveries and routes</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href={`/${companySlug}/admin/dashboard`}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Home className="w-4 h-4" />
                  <span className="hidden sm:inline">Admin Dashboard</span>
                </Button>
              </Link>
              <Badge variant="outline" className="text-sm">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </Badge>
              <RoleSwitcher variant="compact" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Stats Cards */}
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-600">Today's Deliveries</p>
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-slate-900">8</p>
              <p className="text-xs text-green-600 mt-1">3 completed</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-600">Active Routes</p>
                <Navigation className="w-5 h-5 text-orange-600" />
              </div>
              <p className="text-3xl font-bold text-slate-900">2</p>
              <p className="text-xs text-blue-600 mt-1">Morning & Afternoon</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-600">Distance Today</p>
                <MapPin className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-3xl font-bold text-slate-900">124 km</p>
              <p className="text-xs text-slate-600 mt-1">Est. 2.5 hours</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="border-2 border-blue-200 hover:border-blue-400 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="w-5 h-5 text-blue-600" />
                Today's Routes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 mb-4">
                View and manage your assigned delivery routes for today
              </p>
              <Link href={`/${companySlug}/driver/routes`}>
                <Button className="w-full bg-blue-600 hover:bg-blue-700">
                  View Routes
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-2 border-orange-200 hover:border-orange-400 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="w-5 h-5 text-orange-600" />
                Active Deliveries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 mb-4">
                Track your current and upcoming delivery stops
              </p>
              <Link href={`/${companySlug}/driver/deliveries`}>
                <Button className="w-full bg-orange-600 hover:bg-orange-700">
                  View Deliveries
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Deliveries */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Upcoming Deliveries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Sample Delivery Items */}
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center">
                    <Package className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">Wedding - Smith Family</p>
                    <p className="text-sm text-slate-600">123 Oak Street, Sandton</p>
                    <p className="text-xs text-slate-500 mt-1">Setup: 14:00 | Event: 16:00</p>
                  </div>
                </div>
                <Badge className="bg-orange-100 text-orange-700">
                  Next Up
                </Badge>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-slate-400 flex items-center justify-center">
                    <Package className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">Corporate Event - ABC Corp</p>
                    <p className="text-sm text-slate-600">456 Business Park, Rosebank</p>
                    <p className="text-xs text-slate-500 mt-1">Setup: 17:30 | Event: 18:30</p>
                  </div>
                </div>
                <Badge className="bg-blue-100 text-blue-700">
                  Scheduled
                </Badge>
              </div>

              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">Birthday Party - Jones</p>
                    <p className="text-sm text-slate-600">789 Park Avenue, Fourways</p>
                    <p className="text-xs text-slate-500 mt-1">Completed: 11:30</p>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-700">
                  Delivered
                </Badge>
              </div>
            </div>

            <div className="mt-6 text-center">
              <Link href={`/${companySlug}/driver/deliveries`}>
                <Button variant="outline">View All Deliveries</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Important Notes */}
        <Card className="border-2 border-yellow-200 bg-yellow-50 mt-6">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-yellow-700 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-yellow-900 mb-2">Important Reminders</h3>
                <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
                  <li>Always confirm equipment count with kitchen before departure</li>
                  <li>Take photos of setup for quality control</li>
                  <li>Notify admin immediately if any equipment is damaged</li>
                  <li>Complete all delivery confirmations in the system</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DriverDashboard;
