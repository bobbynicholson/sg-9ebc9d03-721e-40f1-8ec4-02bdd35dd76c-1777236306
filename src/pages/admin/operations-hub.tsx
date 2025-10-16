import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { operationsService } from "@/services/operationsService";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  ChefHat, 
  Package, 
  Thermometer, 
  Wrench, 
  Users, 
  ClipboardList, 
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  BookOpen,
  ShieldCheck,
  Truck,
  BarChart3,
  Zap,
  Flame,
  Utensils,
  Shirt,
  Droplets,
  Wine,
  MapPin,
  Sparkles,
  Bug,
  Lightbulb,
  FootprintsIcon,
  Box,
  Snowflake,
  FileCheck,
  PackageCheck,
  Timer,
  Shield
} from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface OperationsDashboard {
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

export default function OperationsHub() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<OperationsDashboard | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (user?.company_id) {
      loadDashboard();
    } else if (user) {
      setLoading(false); // User exists but no company_id, stop loading
    }
  }, [user]);

  const loadDashboard = async () => {
    if (!user?.company_id) return;
    try {
      setLoading(true);
      const data = await operationsService.getOperationsDashboard(user.company_id);
      setDashboard(data);
    } catch (error) {
      console.error("Error loading operations dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  // Standards 1-40 modules
  const coreModules = [
    {
      id: "kitchen",
      title: "Kitchen Operations",
      description: "Menu planning, recipes, allergen management, batch cooking",
      icon: ChefHat,
      color: "bg-orange-500",
      standards: [1, 2, 3, 9, 10, 11, 12, 20, 21, 22, 23],
      href: "/admin/operations/kitchen"
    },
    {
      id: "inventory",
      title: "Inventory & FIFO System",
      description: "FIFO tracking, labeling, storage management, expiry monitoring",
      icon: Package,
      color: "bg-blue-500",
      standards: [6, 7, 8, 10],
      href: "/admin/operations/inventory"
    },
    {
      id: "suppliers",
      title: "Supplier Management",
      description: "Ingredient sourcing, emergency suppliers, substitutions",
      icon: Truck,
      color: "bg-green-500",
      standards: [4, 18, 19],
      href: "/admin/operations/suppliers"
    },
    {
      id: "temperature",
      title: "Temperature Monitoring",
      description: "Fridge/freezer logs, storage capacity, alerts",
      icon: Thermometer,
      color: "bg-cyan-500",
      standards: [6, 7, 17],
      href: "/admin/operations/temperature"
    },
    {
      id: "equipment",
      title: "Equipment & Safety",
      description: "Maintenance schedules, backup equipment, safety checks",
      icon: Wrench,
      color: "bg-purple-500",
      standards: [13, 14, 15],
      href: "/admin/operations/equipment"
    },
    {
      id: "waste",
      title: "Waste Management",
      description: "Waste tracking, cost analysis, reduction strategies",
      icon: TrendingDown,
      color: "bg-red-500",
      standards: [16],
      href: "/admin/operations/waste"
    },
    {
      id: "staff",
      title: "Staff Operations",
      description: "Training, certifications, cross-training, performance reviews",
      icon: Users,
      color: "bg-indigo-500",
      standards: [31, 32, 33, 37, 38],
      href: "/admin/operations/staff"
    },
    {
      id: "daily",
      title: "Daily Operations",
      description: "Prep lists, portion control, briefings, uniforms",
      icon: ClipboardList,
      color: "bg-yellow-500",
      standards: [11, 12, 27, 28],
      href: "/admin/operations/daily"
    }
  ];

  // Standards 41-75 advanced modules
  const advancedModules = [
    {
      id: "electrical-safety",
      title: "Electrical Safety (PAT Testing)",
      description: "PAT testing schedules, certification tracking, compliance alerts",
      icon: Zap,
      color: "bg-yellow-600",
      standards: [43],
      metrics: dashboard?.overduePATTests || 0,
      metricsLabel: "Overdue Tests",
      href: "/admin/operations/electrical-safety"
    },
    {
      id: "backup-power",
      title: "Backup Generators",
      description: "Generator maintenance, auto-start systems, fuel management",
      icon: Zap,
      color: "bg-amber-600",
      standards: [44],
      metrics: dashboard?.activeGenerators || 0,
      metricsLabel: "Active Units",
      href: "/admin/operations/backup-power"
    },
    {
      id: "fuel-stockpile",
      title: "Cooking Fuel Stockpile",
      description: "Gas cylinder tracking, restock alerts, supplier management",
      icon: Flame,
      color: "bg-red-600",
      standards: [46],
      metrics: dashboard?.lowFuelItems || 0,
      metricsLabel: "Low Stock Items",
      href: "/admin/operations/fuel-stockpile"
    },
    {
      id: "utensils-tracking",
      title: "Serving Utensils (QR Tracking)",
      description: "QR code scanning, check-in/out system, loss prevention",
      icon: Utensils,
      color: "bg-slate-600",
      standards: [47],
      metrics: dashboard?.availableUtensils || 0,
      metricsLabel: "Available Items",
      href: "/admin/operations/utensils-tracking"
    },
    {
      id: "linen-management",
      title: "Linen Stock Management",
      description: "Laundry cycles, clean/dirty tracking, color-coded storage",
      icon: Shirt,
      color: "bg-blue-600",
      standards: [49],
      metrics: dashboard?.laundryDue || 0,
      metricsLabel: "Due for Laundry",
      href: "/admin/operations/linen-management"
    },
    {
      id: "dishwasher-cycles",
      title: "Dishwasher Cycle Planning",
      description: "Load scheduling, cycle tracking, efficiency monitoring",
      icon: Droplets,
      color: "bg-cyan-600",
      standards: [50],
      href: "/admin/operations/dishwasher-cycles"
    },
    {
      id: "glassware",
      title: "Glassware Categorization",
      description: "Photo catalog, pre-event checklists, stock management",
      icon: Wine,
      color: "bg-purple-600",
      standards: [51],
      metrics: dashboard?.totalGlassware || 0,
      metricsLabel: "Total Glassware",
      href: "/admin/operations/glassware"
    },
    {
      id: "storage-racks",
      title: "Labelled Storage Racks",
      description: "Rack mapping, numbered shelves, location tracking",
      icon: MapPin,
      color: "bg-green-600",
      standards: [52],
      href: "/admin/operations/storage-racks"
    },
    {
      id: "cleaning-supplies",
      title: "Cleaning Supplies (Auto-Reorder)",
      description: "Stock tracking, reorder triggers, supplier integration",
      icon: Sparkles,
      color: "bg-pink-600",
      standards: [55],
      metrics: dashboard?.lowCleaningSupplies || 0,
      metricsLabel: "Low Stock",
      href: "/admin/operations/cleaning-supplies"
    },
    {
      id: "pest-control",
      title: "Pest Control Schedule",
      description: "Monthly inspections, certification tracking, activity logs",
      icon: Bug,
      color: "bg-orange-600",
      standards: [56],
      metrics: dashboard?.upcomingPestControl || 0,
      metricsLabel: "Upcoming Inspections",
      href: "/admin/operations/pest-control"
    },
    {
      id: "safety-equipment",
      title: "Safety Equipment",
      description: "Fire extinguishers, blankets, first aid kit tracking",
      icon: Shield,
      color: "bg-red-700",
      standards: [57],
      metrics: dashboard?.expiringSafety || 0,
      metricsLabel: "Expiring Soon",
      href: "/admin/operations/safety-equipment"
    },
    {
      id: "lighting-tests",
      title: "Lighting Adequacy",
      description: "Lux measurements, compliance checks, LED upgrades",
      icon: Lightbulb,
      color: "bg-yellow-500",
      standards: [58],
      metrics: dashboard?.lightingIssues || 0,
      metricsLabel: "Non-Compliant Areas",
      href: "/admin/operations/lighting-tests"
    },
    {
      id: "floor-safety",
      title: "Floor Mats & Drainage",
      description: "Slip prevention, mat inspections, drainage checks",
      icon: FootprintsIcon,
      color: "bg-slate-500",
      standards: [59],
      href: "/admin/operations/floor-safety"
    },
    {
      id: "delivery-crates",
      title: "Delivery Crates (Barcode System)",
      description: "Barcode scanning, crate assignment, cleaning schedules",
      icon: Box,
      color: "bg-brown-600",
      standards: [60],
      metrics: dashboard?.availableCrates || 0,
      metricsLabel: "Available Crates",
      href: "/admin/operations/delivery-crates"
    },
    {
      id: "load-planning",
      title: "Load Planning (Hot/Cold)",
      description: "Temperature zone separation, loading sequences, verification",
      icon: Snowflake,
      color: "bg-cyan-700",
      standards: [64],
      href: "/admin/operations/load-planning"
    },
    {
      id: "route-optimization",
      title: "Delivery Route Optimization",
      description: "Traffic monitoring, backup routes, ETA tracking",
      icon: Truck,
      color: "bg-blue-700",
      standards: [65, 66],
      href: "/admin/operations/route-optimization"
    },
    {
      id: "ice-tracking",
      title: "Ice & Cooling Transport",
      description: "Ice consumption, temperature logs, cooler management",
      icon: Snowflake,
      color: "bg-sky-600",
      standards: [71],
      href: "/admin/operations/ice-tracking"
    },
    {
      id: "insurance",
      title: "Insurance Tracking",
      description: "Policy management, expiry alerts, coverage monitoring",
      icon: FileCheck,
      color: "bg-indigo-700",
      standards: [72],
      metrics: dashboard?.expiringInsurance || 0,
      metricsLabel: "Expiring Policies",
      href: "/admin/operations/insurance"
    },
    {
      id: "load-verification",
      title: "Load-off Procedures",
      description: "Manifest verification, signature collection, damage reporting",
      icon: PackageCheck,
      color: "bg-green-700",
      standards: [73],
      href: "/admin/operations/load-verification"
    },
    {
      id: "return-tracking",
      title: "Return Load Tracking",
      description: "Scan-back systems, missing item alerts, verification",
      icon: PackageCheck,
      color: "bg-emerald-700",
      standards: [74],
      href: "/admin/operations/return-tracking"
    },
    {
      id: "driver-rest",
      title: "Driver Rest Compliance",
      description: "Rest hour tracking, fatigue prevention, legal compliance",
      icon: Timer,
      color: "bg-purple-700",
      standards: [75],
      metrics: dashboard?.restViolations || 0,
      metricsLabel: "Violations",
      href: "/admin/operations/driver-rest"
    }
  ];

  const getTotalIssues = () => {
    if (!dashboard) return 0;
    return (
      dashboard.overduePATTests +
      dashboard.lowFuelItems +
      dashboard.laundryDue +
      dashboard.lowCleaningSupplies +
      dashboard.upcomingPestControl +
      dashboard.expiringSafety +
      dashboard.lightingIssues +
      dashboard.expiringInsurance +
      dashboard.restViolations
    );
  };

  const getComplianceStatus = () => {
    const totalIssues = getTotalIssues();
    
    if (totalIssues === 0) {
      return { status: "excellent", count: 0, color: "text-green-600", bg: "bg-green-50" };
    } else if (totalIssues <= 10) {
      return { status: "good", count: totalIssues, color: "text-yellow-600", bg: "bg-yellow-50" };
    } else {
      return { status: "needs-attention", count: totalIssues, color: "text-red-600", bg: "bg-red-50" };
    }
  };

  const complianceStatus = getComplianceStatus();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <AdminNav />
      
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">
                Operations Hub
              </h1>
              <p className="text-slate-600 text-lg">
                Comprehensive operational management covering all 75 catering standards
              </p>
            </div>
            <InfoTooltip content="This hub covers all essential operational standards to help your catering business run smoothly, safely, and profitably. Each module addresses specific industry best practices." />
          </div>

          {/* Compliance Overview Alert */}
          {dashboard && (
            <Alert className={`${complianceStatus.bg} border-none`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {complianceStatus.status === "excellent" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertTriangle className={`h-5 w-5 ${complianceStatus.color}`} />
                  )}
                  <AlertDescription className={complianceStatus.color}>
                    {complianceStatus.status === "excellent" && (
                      <span className="font-semibold">All operational standards are in compliance!</span>
                    )}
                    {complianceStatus.status === "good" && (
                      <span className="font-semibold">{complianceStatus.count} items need attention soon</span>
                    )}
                    {complianceStatus.status === "needs-attention" && (
                      <span className="font-semibold">{complianceStatus.count} items require immediate attention</span>
                    )}
                  </AlertDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setActiveTab("metrics")}
                  className="border-current"
                >
                  View Metrics
                </Button>
              </div>
            </Alert>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white/50 backdrop-blur-sm">
            <TabsTrigger value="overview">Core Standards (1-40)</TabsTrigger>
            <TabsTrigger value="advanced">Advanced Standards (41-75)</TabsTrigger>
            <TabsTrigger value="metrics">Real-Time Metrics</TabsTrigger>
            <TabsTrigger value="quickstart">Quick Start Guide</TabsTrigger>
          </TabsList>

          {/* Core Standards Tab (1-40) */}
          <TabsContent value="overview" className="space-y-6">
            <div className="mb-4">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Core Operations (Standards 1-40)</h2>
              <p className="text-slate-600">Essential modules for kitchen, inventory, staff, and daily operations</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {coreModules.map((module) => {
                const Icon = module.icon;
                return (
                  <Card 
                    key={module.id} 
                    className="hover:shadow-lg transition-all duration-300 cursor-pointer group border-2 hover:border-primary"
                    onClick={() => window.location.href = module.href}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className={`${module.color} p-3 rounded-lg group-hover:scale-110 transition-transform`}>
                          <Icon className="h-6 w-6 text-white" />
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {module.standards.length} Standards
                        </Badge>
                      </div>
                      <CardTitle className="text-xl mt-4 group-hover:text-primary transition-colors">
                        {module.title}
                      </CardTitle>
                      <CardDescription className="text-sm">
                        {module.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1">
                        {module.standards.map(std => (
                          <Badge key={std} variant="outline" className="text-xs">
                            #{std}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Advanced Standards Tab (41-75) */}
          <TabsContent value="advanced" className="space-y-6">
            <div className="mb-4">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Advanced Operations (Standards 41-75)</h2>
              <p className="text-slate-600">Specialized modules for equipment, transport, safety, and compliance</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {advancedModules.map((module) => {
                const Icon = module.icon;
                const hasAlert = module.metrics && module.metrics > 0;
                return (
                  <Card 
                    key={module.id} 
                    className={`hover:shadow-lg transition-all duration-300 cursor-pointer group border-2 hover:border-primary ${
                      hasAlert ? 'border-yellow-400' : ''
                    }`}
                    onClick={() => window.location.href = module.href}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className={`${module.color} p-3 rounded-lg group-hover:scale-110 transition-transform`}>
                          <Icon className="h-6 w-6 text-white" />
                        </div>
                        {hasAlert && (
                          <Badge variant="destructive" className="text-xs">
                            {module.metrics} {module.metricsLabel}
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-xl mt-4 group-hover:text-primary transition-colors">
                        {module.title}
                      </CardTitle>
                      <CardDescription className="text-sm">
                        {module.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1">
                        {module.standards.map(std => (
                          <Badge key={std} variant="outline" className="text-xs">
                            #{std}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Real-Time Metrics Tab */}
          <TabsContent value="metrics" className="space-y-6">
            {loading ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-slate-600">Loading operational metrics...</p>
                </CardContent>
              </Card>
            ) : dashboard ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* PAT Testing */}
                <Card className={dashboard.overduePATTests > 0 ? "border-yellow-500" : "border-green-500"}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Zap className="h-4 w-4" />
                      PAT Testing
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold mb-1">{dashboard.overduePATTests}</div>
                    <p className="text-xs text-slate-600">Overdue tests</p>
                  </CardContent>
                </Card>

                {/* Generators */}
                <Card className="border-green-500">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Zap className="h-4 w-4" />
                      Backup Power
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold mb-1">{dashboard.activeGenerators}</div>
                    <p className="text-xs text-slate-600">Active generators</p>
                  </CardContent>
                </Card>

                {/* Fuel Stock */}
                <Card className={dashboard.lowFuelItems > 0 ? "border-yellow-500" : "border-green-500"}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Flame className="h-4 w-4" />
                      Fuel Stock
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold mb-1">{dashboard.lowFuelItems}</div>
                    <p className="text-xs text-slate-600">Low stock items</p>
                  </CardContent>
                </Card>

                {/* Utensils */}
                <Card className="border-green-500">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Utensils className="h-4 w-4" />
                      Utensils
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold mb-1">{dashboard.availableUtensils}</div>
                    <p className="text-xs text-slate-600">Available items</p>
                  </CardContent>
                </Card>

                {/* Linen */}
                <Card className={dashboard.laundryDue > 0 ? "border-yellow-500" : "border-green-500"}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Shirt className="h-4 w-4" />
                      Linen
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold mb-1">{dashboard.laundryDue}</div>
                    <p className="text-xs text-slate-600">Due for laundry</p>
                  </CardContent>
                </Card>

                {/* Glassware */}
                <Card className="border-green-500">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Wine className="h-4 w-4" />
                      Glassware
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold mb-1">{dashboard.totalGlassware}</div>
                    <p className="text-xs text-slate-600">Total pieces</p>
                  </CardContent>
                </Card>

                {/* Cleaning Supplies */}
                <Card className={dashboard.lowCleaningSupplies > 0 ? "border-yellow-500" : "border-green-500"}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Sparkles className="h-4 w-4" />
                      Cleaning Supplies
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold mb-1">{dashboard.lowCleaningSupplies}</div>
                    <p className="text-xs text-slate-600">Low stock</p>
                  </CardContent>
                </Card>

                {/* Pest Control */}
                <Card className={dashboard.upcomingPestControl > 0 ? "border-yellow-500" : "border-green-500"}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Bug className="h-4 w-4" />
                      Pest Control
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold mb-1">{dashboard.upcomingPestControl}</div>
                    <p className="text-xs text-slate-600">Upcoming inspections</p>
                  </CardContent>
                </Card>

                {/* Safety Equipment */}
                <Card className={dashboard.expiringSafety > 0 ? "border-yellow-500" : "border-green-500"}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Shield className="h-4 w-4" />
                      Safety Equipment
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold mb-1">{dashboard.expiringSafety}</div>
                    <p className="text-xs text-slate-600">Expiring soon</p>
                  </CardContent>
                </Card>

                {/* Lighting */}
                <Card className={dashboard.lightingIssues > 0 ? "border-red-500" : "border-green-500"}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Lightbulb className="h-4 w-4" />
                      Lighting
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold mb-1">{dashboard.lightingIssues}</div>
                    <p className="text-xs text-slate-600">Non-compliant areas</p>
                  </CardContent>
                </Card>

                {/* Delivery Crates */}
                <Card className="border-green-500">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Box className="h-4 w-4" />
                      Delivery Crates
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold mb-1">{dashboard.availableCrates}</div>
                    <p className="text-xs text-slate-600">Available</p>
                  </CardContent>
                </Card>

                {/* Insurance */}
                <Card className={dashboard.expiringInsurance > 0 ? "border-yellow-500" : "border-green-500"}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <FileCheck className="h-4 w-4" />
                      Insurance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold mb-1">{dashboard.expiringInsurance}</div>
                    <p className="text-xs text-slate-600">Expiring policies</p>
                  </CardContent>
                </Card>

                {/* Driver Rest */}
                <Card className={dashboard.restViolations > 0 ? "border-red-500" : "border-green-500"}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Timer className="h-4 w-4" />
                      Driver Rest
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold mb-1">{dashboard.restViolations}</div>
                    <p className="text-xs text-slate-600">Violations</p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-slate-600">No metrics data available</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Quick Start Guide Tab */}
          <TabsContent value="quickstart" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Getting Started with Operations Hub</CardTitle>
                <CardDescription>
                  Follow these steps to set up all 75 operational standards
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex gap-4 p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                        1
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-orange-900 mb-1">Core Operations Setup (Standards 1-40)</h3>
                      <p className="text-sm text-orange-800">
                        Start with kitchen operations, inventory systems, staff management, and daily workflows
                      </p>
                      <Button 
                        size="sm" 
                        className="mt-2 bg-orange-500 hover:bg-orange-600"
                        onClick={() => setActiveTab("overview")}
                      >
                        View Core Standards
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold">
                        2
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-purple-900 mb-1">Advanced Systems (Standards 41-75)</h3>
                      <p className="text-sm text-purple-800">
                        Configure equipment tracking, safety systems, transport logistics, and compliance tools
                      </p>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="mt-2 border-purple-500 text-purple-700 hover:bg-purple-50"
                        onClick={() => setActiveTab("advanced")}
                      >
                        View Advanced Standards
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                        3
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-blue-900 mb-1">Monitor Real-Time Metrics</h3>
                      <p className="text-sm text-blue-800">
                        Track all operational metrics in real-time and receive alerts for items needing attention
                      </p>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="mt-2 border-blue-500 text-blue-700 hover:bg-blue-50"
                        onClick={() => setActiveTab("metrics")}
                      >
                        View Metrics Dashboard
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-bold">
                        ✓
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-green-900 mb-1">Achieve Full Compliance</h3>
                      <p className="text-sm text-green-800">
                        Follow the system prompts and maintain regular updates to keep all 75 standards in compliance
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
