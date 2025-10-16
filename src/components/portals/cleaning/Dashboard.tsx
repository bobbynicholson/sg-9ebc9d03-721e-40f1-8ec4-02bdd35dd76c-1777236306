import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { 
  Sparkles, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  Package,
  Droplets,
  Shield,
  Calendar
} from "lucide-react";
import Link from "next/link";

interface PortalComponentProps {
  companySlug: string;
  portal: string;
  currentRoute: string;
}

const CleaningDashboard: React.FC<PortalComponentProps> = ({ companySlug }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-cyan-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Cleaning Portal</h1>
                <p className="text-sm text-slate-600">Equipment cleaning and maintenance tracking</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Stats Cards */}
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-600">Pending Tasks</p>
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <p className="text-3xl font-bold text-slate-900">5</p>
              <p className="text-xs text-orange-600 mt-1">Equipment returns</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-600">In Progress</p>
                <Droplets className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-slate-900">3</p>
              <p className="text-xs text-blue-600 mt-1">Being cleaned</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-600">Completed Today</p>
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-3xl font-bold text-slate-900">12</p>
              <p className="text-xs text-green-600 mt-1">Ready for use</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-600">Damaged Items</p>
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <p className="text-3xl font-bold text-slate-900">2</p>
              <p className="text-xs text-red-600 mt-1">Needs attention</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="border-2 border-cyan-200 hover:border-cyan-400 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="w-5 h-5 text-cyan-600" />
                Today's Cleaning Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 mb-4">
                View equipment that needs cleaning after today's events
              </p>
              <Link href={`/${companySlug}/cleaning/schedules`}>
                <Button className="w-full bg-cyan-600 hover:bg-cyan-700">
                  View Schedule
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-2 border-blue-200 hover:border-blue-400 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="w-5 h-5 text-blue-600" />
                Equipment Verification
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 mb-4">
                Confirm returned equipment counts and log damages
              </p>
              <Link href={`/${companySlug}/cleaning/tasks`}>
                <Button className="w-full bg-blue-600 hover:bg-blue-700">
                  Verify Equipment
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Equipment Returns Awaiting Cleaning */}
        <Card className="border-0 shadow-lg mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Equipment Returns - Awaiting Cleaning
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-200">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-orange-600 flex items-center justify-center">
                    <Package className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">Wedding - Smith Event</p>
                    <p className="text-sm text-slate-600">150 plates, 150 cutlery sets, 8 chafing dishes</p>
                    <p className="text-xs text-slate-500 mt-1">Returned: 2 hours ago</p>
                  </div>
                </div>
                <Badge className="bg-orange-100 text-orange-700">
                  Urgent
                </Badge>
              </div>

              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center">
                    <Droplets className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">Corporate Lunch - ABC Corp</p>
                    <p className="text-sm text-slate-600">75 plates, 75 cutlery sets, 4 serving trays</p>
                    <p className="text-xs text-slate-500 mt-1">In Progress - Started 30 mins ago</p>
                  </div>
                </div>
                <Badge className="bg-blue-100 text-blue-700">
                  <Droplets className="w-3 h-3 mr-1" />
                  Cleaning
                </Badge>
              </div>

              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">Birthday Party - Jones Family</p>
                    <p className="text-sm text-slate-600">50 plates, 50 cutlery sets, 2 cooler boxes</p>
                    <p className="text-xs text-slate-500 mt-1">Cleaned & Ready - 1 hour ago</p>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-700">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Complete
                </Badge>
              </div>
            </div>

            <div className="mt-6 text-center">
              <Link href={`/${companySlug}/cleaning/tasks`}>
                <Button variant="outline">View All Tasks</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Damaged Equipment Report */}
        <Card className="border-2 border-red-200 bg-red-50 mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-900">
              <AlertTriangle className="w-5 h-5" />
              Damaged Equipment Report
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-red-200">
                <div>
                  <p className="font-semibold text-slate-900">White Plates (10") - Cracked</p>
                  <p className="text-sm text-slate-600">Quantity: 3 plates</p>
                  <p className="text-xs text-slate-500">From: Smith Wedding Event</p>
                </div>
                <Badge variant="outline" className="border-red-600 text-red-600">
                  Reported
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-red-200">
                <div>
                  <p className="font-semibold text-slate-900">Stainless Steel Forks - Bent</p>
                  <p className="text-sm text-slate-600">Quantity: 1 fork</p>
                  <p className="text-xs text-slate-500">From: ABC Corp Lunch</p>
                </div>
                <Badge variant="outline" className="border-red-600 text-red-600">
                  Reported
                </Badge>
              </div>
            </div>

            <div className="mt-4 text-center">
              <p className="text-sm text-red-800">
                Damaged items have been logged and admin has been notified
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Cleaning Standards Card */}
        <Card className="border-2 border-purple-200 bg-purple-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Shield className="w-6 h-6 text-purple-700 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-purple-900 mb-2">Cleaning Standards Checklist</h3>
                <ul className="text-sm text-purple-800 space-y-1 list-disc list-inside">
                  <li>Verify equipment count matches return manifest</li>
                  <li>Inspect all items for damage before cleaning</li>
                  <li>Use appropriate sanitizers for food contact surfaces</li>
                  <li>Ensure complete drying before storage</li>
                  <li>Report all damaged items immediately to admin</li>
                  <li>Update system status after completing each batch</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CleaningDashboard;