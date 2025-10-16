
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
  BarChart3
} from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface ComplianceData {
  expiringCertificates: number;
  equipmentDueService: number;
  recentSafetyChecks: any[];
  expiringInventory: number;
  temperatureAlerts: number;
}

export default function OperationsHub() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [compliance, setCompliance] = useState<ComplianceData | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (user?.id) {
      loadComplianceData();
    }
  }, [user]);

  const loadComplianceData = async () => {
    try {
      setLoading(true);
      const data = await operationsService.getComplianceOverview(user!.id);
      setCompliance(data);
    } catch (error) {
      console.error("Error loading compliance data:", error);
    } finally {
      setLoading(false);
    }
  };

  const operationalModules = [
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
    },
    {
      id: "compliance",
      title: "Compliance Dashboard",
      description: "All safety, health, and operational compliance tracking",
      icon: ShieldCheck,
      color: "bg-emerald-500",
      standards: [15, 17, 37],
      href: "/admin/operations/compliance"
    },
    {
      id: "analytics",
      title: "Operations Analytics",
      description: "Labour costs, retention, overtime, performance metrics",
      icon: BarChart3,
      color: "bg-pink-500",
      standards: [30, 39, 40],
      href: "/admin/operations/analytics"
    }
  ];

  const getComplianceStatus = () => {
    if (!compliance) return { status: "unknown", count: 0 };
    
    const totalIssues = 
      compliance.expiringCertificates +
      compliance.equipmentDueService +
      compliance.expiringInventory +
      compliance.temperatureAlerts;

    if (totalIssues === 0) {
      return { status: "excellent", count: 0, color: "text-green-600", bg: "bg-green-50" };
    } else if (totalIssues <= 5) {
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
                Comprehensive operational management covering all 40 catering standards
              </p>
            </div>
            <InfoTooltip content="This hub covers all essential operational standards to help your catering business run smoothly, safely, and profitably. Each module addresses specific industry best practices." />
          </div>

          {/* Compliance Overview Alert */}
          {compliance && (
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
                  onClick={() => setActiveTab("compliance")}
                  className="border-current"
                >
                  View Details
                </Button>
              </div>
            </Alert>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white/50 backdrop-blur-sm">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="compliance">Compliance Status</TabsTrigger>
            <TabsTrigger value="quickstart">Quick Start Guide</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {operationalModules.map((module) => {
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

          {/* Compliance Status Tab */}
          <TabsContent value="compliance" className="space-y-6">
            {loading ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-slate-600">Loading compliance data...</p>
                </CardContent>
              </Card>
            ) : compliance ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Expiring Certificates */}
                <Card className={compliance.expiringCertificates > 0 ? "border-yellow-500" : "border-green-500"}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5" />
                      Health Certificates
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold mb-2">
                      {compliance.expiringCertificates}
                    </div>
                    <p className="text-sm text-slate-600">
                      Expiring in next 30 days
                    </p>
                    {compliance.expiringCertificates > 0 && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-4"
                        onClick={() => window.location.href = "/admin/operations/staff"}
                      >
                        View Details
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {/* Equipment Maintenance */}
                <Card className={compliance.equipmentDueService > 0 ? "border-yellow-500" : "border-green-500"}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wrench className="h-5 w-5" />
                      Equipment Service
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold mb-2">
                      {compliance.equipmentDueService}
                    </div>
                    <p className="text-sm text-slate-600">
                      Due for service in 30 days
                    </p>
                    {compliance.equipmentDueService > 0 && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-4"
                        onClick={() => window.location.href = "/admin/operations/equipment"}
                      >
                        View Details
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {/* Expiring Inventory */}
                <Card className={compliance.expiringInventory > 0 ? "border-yellow-500" : "border-green-500"}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Expiring Inventory
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold mb-2">
                      {compliance.expiringInventory}
                    </div>
                    <p className="text-sm text-slate-600">
                      Items expiring in 7 days
                    </p>
                    {compliance.expiringInventory > 0 && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-4"
                        onClick={() => window.location.href = "/admin/operations/inventory"}
                      >
                        View Details
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {/* Temperature Alerts */}
                <Card className={compliance.temperatureAlerts > 0 ? "border-red-500" : "border-green-500"}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Thermometer className="h-5 w-5" />
                      Temperature Alerts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold mb-2">
                      {compliance.temperatureAlerts}
                    </div>
                    <p className="text-sm text-slate-600">
                      Out-of-range readings
                    </p>
                    {compliance.temperatureAlerts > 0 && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-4"
                        onClick={() => window.location.href = "/admin/operations/temperature"}
                      >
                        View Details
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {/* Recent Safety Checks */}
                <Card className="border-green-500 md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5" />
                      Recent Safety Checks
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {compliance.recentSafetyChecks.length > 0 ? (
                      <div className="space-y-2">
                        {compliance.recentSafetyChecks.map((check, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                            <div>
                              <p className="font-medium">{check.check_type}</p>
                              <p className="text-sm text-slate-600">
                                {new Date(check.check_date).toLocaleDateString()}
                              </p>
                            </div>
                            <Badge variant={check.passed ? "default" : "destructive"}>
                              {check.passed ? "Passed" : "Failed"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-600 text-center py-4">
                        No recent safety checks recorded
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-slate-600">No compliance data available</p>
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
                  Follow these steps to set up your operational standards
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
                      <h3 className="font-semibold text-orange-900 mb-1">Set Up Kitchen Operations</h3>
                      <p className="text-sm text-orange-800">
                        Create your menu items, standardize recipes, and set up allergen tracking
                      </p>
                      <Button 
                        size="sm" 
                        className="mt-2 bg-orange-500 hover:bg-orange-600"
                        onClick={() => window.location.href = "/admin/operations/kitchen"}
                      >
                        Start Here
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                        2
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-blue-900 mb-1">Configure Inventory & FIFO System</h3>
                      <p className="text-sm text-blue-800">
                        Set up storage locations, implement FIFO labeling, and track expiry dates
                      </p>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="mt-2 border-blue-500 text-blue-700 hover:bg-blue-50"
                        onClick={() => window.location.href = "/admin/operations/inventory"}
                      >
                        Configure
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-bold">
                        3
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-green-900 mb-1">Add Suppliers</h3>
                      <p className="text-sm text-green-800">
                        Register your suppliers, including emergency contacts and ingredient sources
                      </p>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="mt-2 border-green-500 text-green-700 hover:bg-green-50"
                        onClick={() => window.location.href = "/admin/operations/suppliers"}
                      >
                        Add Suppliers
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold">
                        4
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-purple-900 mb-1">Register Equipment & Safety</h3>
                      <p className="text-sm text-purple-800">
                        Log all equipment, set maintenance schedules, and record safety checks
                      </p>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="mt-2 border-purple-500 text-purple-700 hover:bg-purple-50"
                        onClick={() => window.location.href = "/admin/operations/equipment"}
                      >
                        Register Equipment
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-indigo-500 text-white rounded-full flex items-center justify-center font-bold">
                        5
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-indigo-900 mb-1">Manage Staff Training</h3>
                      <p className="text-sm text-indigo-800">
                        Upload training materials, track certifications, and manage health certificates
                      </p>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="mt-2 border-indigo-500 text-indigo-700 hover:bg-indigo-50"
                        onClick={() => window.location.href = "/admin/operations/staff"}
                      >
                        Setup Training
                      </Button>
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
