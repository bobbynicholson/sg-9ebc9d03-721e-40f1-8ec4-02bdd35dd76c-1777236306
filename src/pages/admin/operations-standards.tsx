import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { operationsService } from "@/services/operationsService";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
  Package,
  Utensils,
  Truck,
  ShieldCheck,
  Flame,
  Droplet,
  Wind,
  Lightbulb,
  FileText,
  Zap,
  Loader2
} from "lucide-react";

interface DashboardMetrics {
  overduePATTests: number;
  activeGenerators: number;
  lowFuelItems: number;
  availableUtensils: number;
  laundryDue: number;
  totalGlassware: number;
  lowCleaningSupplies: number;
  upcomingPestControl: number;
  expiringSafety: number;
  lightingIssues: number;
  availableCrates: number;
  expiringInsurance: number;
  restViolations: number;
}

export default function OperationsStandardsPage() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    if (profile?.active_role !== "admin") {
      router.push("/");
      return;
    }

    loadDashboardMetrics();
  }, [user, profile, router]);

  const loadDashboardMetrics = async () => {
    if (!profile?.company_id) return;

    try {
      setLoading(true);
      const data = await operationsService.getOperationsDashboard(profile.company_id);
      setMetrics(data);
    } catch (error) {
      console.error("Error loading operations dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (value: number, threshold: number, inverse: boolean = false) => {
    if (inverse) {
      if (value >= threshold) return "text-green-600 bg-green-50 border-green-200";
      if (value > 0) return "text-yellow-600 bg-yellow-50 border-yellow-200";
      return "text-red-600 bg-red-50 border-red-200";
    }
    if (value === 0) return "text-green-600 bg-green-50 border-green-200";
    if (value <= threshold) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  const operationalStandards = {
    equipment: [
      { id: 41, name: "Comprehensive Equipment List", description: "Live database of all equipment with QR codes", icon: Package },
      { id: 42, name: "Event Equipment Kits", description: "Pre-packed labeled crates for events", icon: Package },
      { id: 43, name: "PAT Testing", description: "Annual electrical safety certification", icon: Zap, metric: "overduePATTests" },
      { id: 44, name: "Backup Generators", description: "Power backup with auto-start capability", icon: Zap, metric: "activeGenerators", inverse: true },
      { id: 45, name: "Refrigerated Transport", description: "Temperature-controlled delivery vehicles", icon: Truck },
      { id: 46, name: "Cooking Fuel Stockpile", description: "Spare cylinders tracking", icon: Flame, metric: "lowFuelItems" },
      { id: 47, name: "Serving Utensils Tracking", description: "QR scan-in/out system", icon: Utensils, metric: "availableUtensils", inverse: true },
      { id: 48, name: "Cutlery & Crockery Inventory", description: "110% headcount buffer tracking", icon: Utensils },
      { id: 49, name: "Linen Stock Management", description: "Laundry cycle tracking", icon: Package, metric: "laundryDue" },
      { id: 50, name: "Dishwasher Load-Cycle Planning", description: "Continuous wash rotation scheduling", icon: Droplet },
      { id: 51, name: "Glassware Categorisation", description: "Type-specific inventory with photos", icon: Package, metric: "totalGlassware", inverse: true },
      { id: 52, name: "Labelled Storage Racks", description: "Numbered shelf mapping system", icon: Package }
    ],
    maintenance: [
      { id: 53, name: "Equipment Maintenance Log", description: "Zero-breakdown target tracking", icon: FileText },
      { id: 54, name: "Replacement Budget", description: "10% annual depreciation reserve", icon: TrendingUp },
      { id: 55, name: "Cleaning Supplies Inventory", description: "Auto-reorder at threshold", icon: Droplet, metric: "lowCleaningSupplies" },
      { id: 56, name: "Pest Control Schedule", description: "Monthly certified inspections", icon: ShieldCheck, metric: "upcomingPestControl" },
      { id: 57, name: "Safety Equipment", description: "Fire blankets & extinguishers tracking", icon: ShieldCheck, metric: "expiringSafety" },
      { id: 58, name: "Lighting Adequacy", description: "500 lux minimum in prep areas", icon: Lightbulb, metric: "lightingIssues" },
      { id: 59, name: "Floor Mats & Drainage", description: "Monthly slip-prevention checks", icon: ShieldCheck },
      { id: 60, name: "Delivery Crates System", description: "Barcode tracked insulated crates", icon: Package, metric: "availableCrates", inverse: true }
    ],
    fleet: [
      { id: 61, name: "Fleet Management System", description: "Mileage, service & booking dashboard", icon: Truck },
      { id: 62, name: "Vehicle Maintenance Logs", description: "Zero roadside failures target", icon: Truck },
      { id: 63, name: "GPS Tracking", description: "Live ETA with 5-minute accuracy", icon: Truck },
      { id: 64, name: "Load Planning", description: "Hot/cold zone separation", icon: Truck },
      { id: 65, name: "Delivery Schedules", description: "Route optimization for fuel savings", icon: Truck },
      { id: 66, name: "Traffic Contingency", description: "Backup routes pre-loaded", icon: Truck },
      { id: 67, name: "Driver Communication", description: "Instant message confirmation", icon: Truck },
      { id: 68, name: "Fuel Efficiency Tracking", description: "Per-vehicle consumption monitoring", icon: Flame },
      { id: 69, name: "Vehicle Cleaning Policy", description: "Post-event hygiene checklist", icon: Droplet },
      { id: 70, name: "Event Setup Gear Checklist", description: "Digital tick-off system", icon: FileText },
      { id: 71, name: "Ice & Cooling Transport", description: "Solid-ice arrival guarantee", icon: Droplet },
      { id: 72, name: "Insurance for Transport", description: "Goods-in-transit coverage", icon: ShieldCheck, metric: "expiringInsurance" },
      { id: 73, name: "Load-Off Procedure", description: "Venue arrival verification", icon: FileText },
      { id: 74, name: "Return Load Tracking", description: "100% equipment return rate", icon: Truck },
      { id: 75, name: "Driver Rest Compliance", description: "Fatigue law enforcement", icon: ShieldCheck, metric: "restViolations" }
    ]
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <AdminNav />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminNav />
      
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Operational Standards (41-75)
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Comprehensive compliance tracking for catering excellence
            </p>
          </div>
          <Button onClick={loadDashboardMetrics} variant="outline">
            Refresh Data
          </Button>
        </div>

        {/* Overall Health Score */}
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Operations Health Score
            </CardTitle>
            <CardDescription>
              Real-time compliance across all 35 operational standards
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">
                  {metrics ? Math.round(((13 - (metrics.overduePATTests + metrics.lowFuelItems + metrics.laundryDue + metrics.lowCleaningSupplies + metrics.upcomingPestControl + metrics.expiringSafety + metrics.lightingIssues + metrics.expiringInsurance + metrics.restViolations)) / 13) * 100) : 0}%
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Compliance Rate</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {metrics ? (metrics.overduePATTests + metrics.lowFuelItems + metrics.laundryDue + metrics.lowCleaningSupplies + metrics.upcomingPestControl + metrics.expiringSafety + metrics.lightingIssues + metrics.expiringInsurance + metrics.restViolations) : 0}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Action Items</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">35</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Standards Tracked</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-orange-600">
                  {metrics ? (metrics.activeGenerators + metrics.availableUtensils + metrics.totalGlassware + metrics.availableCrates) : 0}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Active Assets</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Categorized Standards */}
        <Tabs defaultValue="equipment" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="equipment">Equipment & Inventory</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance & Safety</TabsTrigger>
            <TabsTrigger value="fleet">Fleet & Delivery</TabsTrigger>
          </TabsList>

          <TabsContent value="equipment" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {operationalStandards.equipment.map((standard) => {
                const Icon = standard.icon;
                const metricValue = metrics && standard.metric ? metrics[standard.metric as keyof DashboardMetrics] : null;
                const statusClass = metricValue !== null 
                  ? getStatusColor(metricValue, 5, standard.inverse) 
                  : "text-gray-600 bg-gray-50 border-gray-200";

                return (
                  <Card key={standard.id} className={`border-2 ${statusClass}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="w-5 h-5" />
                          <Badge variant="outline">#{standard.id}</Badge>
                        </div>
                        <InfoTooltip content={standard.description} />
                      </div>
                      <CardTitle className="text-base mt-2">
                        {standard.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {metricValue !== null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {standard.inverse ? "Available" : "Issues"}:
                          </span>
                          <span className="text-2xl font-bold">{metricValue}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="maintenance" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {operationalStandards.maintenance.map((standard) => {
                const Icon = standard.icon;
                const metricValue = metrics && standard.metric ? metrics[standard.metric as keyof DashboardMetrics] : null;
                const statusClass = metricValue !== null 
                  ? getStatusColor(metricValue, 5, standard.inverse) 
                  : "text-gray-600 bg-gray-50 border-gray-200";

                return (
                  <Card key={standard.id} className={`border-2 ${statusClass}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="w-5 h-5" />
                          <Badge variant="outline">#{standard.id}</Badge>
                        </div>
                        <InfoTooltip content={standard.description} />
                      </div>
                      <CardTitle className="text-base mt-2">
                        {standard.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {metricValue !== null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {standard.inverse ? "Available" : "Issues"}:
                          </span>
                          <span className="text-2xl font-bold">{metricValue}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="fleet" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {operationalStandards.fleet.map((standard) => {
                const Icon = standard.icon;
                const metricValue = metrics && standard.metric ? metrics[standard.metric as keyof DashboardMetrics] : null;
                const statusClass = metricValue !== null 
                  ? getStatusColor(metricValue, 5, standard.inverse) 
                  : "text-gray-600 bg-gray-50 border-gray-200";

                return (
                  <Card key={standard.id} className={`border-2 ${statusClass}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="w-5 h-5" />
                          <Badge variant="outline">#{standard.id}</Badge>
                        </div>
                        <InfoTooltip content={standard.description} />
                      </div>
                      <CardTitle className="text-base mt-2">
                        {standard.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {metricValue !== null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {standard.inverse ? "Available" : "Issues"}:
                          </span>
                          <span className="text-2xl font-bold">{metricValue}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        {/* Quick Action Guide */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-blue-500" />
              What These Standards Mean for You
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>Green Status:</strong> Standards are being met. Equipment is tracked, services are up-to-date, and operations are compliant.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>Yellow Status:</strong> Attention needed soon. Some items require scheduling or restocking within the next 30 days.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>Red Status:</strong> Immediate action required. Expired certifications, overdue maintenance, or depleted stock levels.
            </p>
            <div className="pt-3 border-t">
              <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                💡 Pro Tip: Click on any standard card to access detailed management tools and tracking features.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
