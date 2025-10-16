import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { 
  ShoppingCart, 
  Package, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  Users
} from "lucide-react";
import Link from "next/link";

interface PortalComponentProps {
  companySlug: string;
  portal: string;
  currentRoute: string;
}

const ShoppingDashboard: React.FC<PortalComponentProps> = ({ companySlug }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-green-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg">
                <ShoppingCart className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Shopping Portal</h1>
                <p className="text-sm text-slate-600">Manage inventory and procurement</p>
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
                <p className="text-sm text-slate-600">Pending Orders</p>
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <p className="text-3xl font-bold text-slate-900">12</p>
              <p className="text-xs text-orange-600 mt-1">Requires attention</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-600">Low Stock Items</p>
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <p className="text-3xl font-bold text-slate-900">8</p>
              <p className="text-xs text-red-600 mt-1">Reorder needed</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-600">Active Suppliers</p>
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-slate-900">24</p>
              <p className="text-xs text-green-600 mt-1">All verified</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-600">This Month</p>
                <DollarSign className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-3xl font-bold text-slate-900">R 45.2k</p>
              <p className="text-xs text-green-600 mt-1">↑ 12% vs last month</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="border-2 border-green-200 hover:border-green-400 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShoppingCart className="w-5 h-5 text-green-600" />
                Create Purchase Order
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 mb-4">
                Place new orders with suppliers for upcoming events
              </p>
              <Link href={`/${companySlug}/shopping/orders`}>
                <Button className="w-full bg-green-600 hover:bg-green-700">
                  New Order
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-2 border-blue-200 hover:border-blue-400 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="w-5 h-5 text-blue-600" />
                Inventory Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 mb-4">
                Track stock levels and update inventory counts
              </p>
              <Link href={`/${companySlug}/shopping/inventory`}>
                <Button className="w-full bg-blue-600 hover:bg-blue-700">
                  View Inventory
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Low Stock Alerts */}
        <Card className="border-0 shadow-lg mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
                <div>
                  <p className="font-semibold text-slate-900">White Plates (10")</p>
                  <p className="text-sm text-slate-600">Current: 45 | Min: 100</p>
                </div>
                <Button size="sm" variant="outline" className="border-red-600 text-red-600 hover:bg-red-50">
                  Reorder
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-200">
                <div>
                  <p className="font-semibold text-slate-900">Stainless Steel Forks</p>
                  <p className="text-sm text-slate-600">Current: 180 | Min: 250</p>
                </div>
                <Button size="sm" variant="outline" className="border-orange-600 text-orange-600 hover:bg-orange-50">
                  Reorder
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <div>
                  <p className="font-semibold text-slate-900">Chafing Fuel (4hr)</p>
                  <p className="text-sm text-slate-600">Current: 32 | Min: 50</p>
                </div>
                <Button size="sm" variant="outline" className="border-yellow-600 text-yellow-600 hover:bg-yellow-50">
                  Reorder
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Recent Purchase Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                <div>
                  <p className="font-semibold text-slate-900">PO-2025-001 - ABC Suppliers</p>
                  <p className="text-sm text-slate-600">Glassware & Cutlery</p>
                  <p className="text-xs text-slate-500 mt-1">Ordered: 2 days ago</p>
                </div>
                <div className="text-right">
                  <Badge className="bg-green-100 text-green-700 mb-2">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Delivered
                  </Badge>
                  <p className="text-sm font-semibold">R 12,450</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div>
                  <p className="font-semibold text-slate-900">PO-2025-002 - XYZ Catering Supplies</p>
                  <p className="text-sm text-slate-600">Disposables & Linens</p>
                  <p className="text-xs text-slate-500 mt-1">Ordered: 1 day ago</p>
                </div>
                <div className="text-right">
                  <Badge className="bg-blue-100 text-blue-700 mb-2">
                    In Transit
                  </Badge>
                  <p className="text-sm font-semibold">R 8,920</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-200">
                <div>
                  <p className="font-semibold text-slate-900">PO-2025-003 - Premium Events Co</p>
                  <p className="text-sm text-slate-600">Serving Equipment</p>
                  <p className="text-xs text-slate-500 mt-1">Ordered: Today</p>
                </div>
                <div className="text-right">
                  <Badge className="bg-orange-100 text-orange-700 mb-2">
                    <Clock className="w-3 h-3 mr-1" />
                    Processing
                  </Badge>
                  <p className="text-sm font-semibold">R 15,600</p>
                </div>
              </div>
            </div>

            <div className="mt-6 text-center">
              <Link href={`/${companySlug}/shopping/orders`}>
                <Button variant="outline">View All Orders</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Tips Card */}
        <Card className="border-2 border-purple-200 bg-purple-50 mt-6">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Package className="w-6 h-6 text-purple-700 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-purple-900 mb-2">Shopping Team Tips</h3>
                <ul className="text-sm text-purple-800 space-y-1 list-disc list-inside">
                  <li>Always check inventory before placing orders</li>
                  <li>Maintain relationships with at least 2 suppliers per category</li>
                  <li>Track price changes to negotiate better deals</li>
                  <li>Plan purchases 2 weeks ahead for major events</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ShoppingDashboard;