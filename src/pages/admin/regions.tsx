import { useState } from "react";
import Link from "next/link";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MapPin,
  Plus,
  Building2,
  Users,
  TrendingUp,
  Package,
  DollarSign,
  Truck,
  ChefHat,
  Settings,
  Eye,
  Edit,
  CheckCircle,
  XCircle,
  Clock,
  Globe,
  BarChart3,
  ArrowRight
} from "lucide-react";
import { regionManagement } from "@/lib/regionManagement";
import { Region } from "@/types/regions";
import { Footer } from "@/components/Footer";

export default function RegionsManagementPage() {
  const [regions, setRegions] = useState(regionManagement.regions);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  const [newRegion, setNewRegion] = useState({
    name: "",
    code: "",
    province: "",
    country: "South Africa",
    status: "active" as const,
    settings: {
      timezone: "Africa/Johannesburg",
      currency: "ZAR",
      language: "en",
      operatingHours: { start: "06:00", end: "22:00" },
      deliveryRadius: 50,
      autoAssignOrders: true
    },
    contact: {
      managerName: "",
      managerEmail: "",
      managerPhone: "",
      address: "",
      city: "",
      postalCode: ""
    }
  });

  const consolidatedStats = regionManagement.getConsolidatedStats();

  const provinces = [
    "Gauteng",
    "Western Cape",
    "KwaZulu-Natal",
    "Eastern Cape",
    "Free State",
    "Limpopo",
    "Mpumalanga",
    "Northern Cape",
    "North West"
  ];

  const handleCreateRegion = () => {
    const created = regionManagement.createRegion(newRegion);
    setRegions([...regionManagement.regions]);
    setIsCreateDialogOpen(false);
    setNewRegion({
      name: "",
      code: "",
      province: "",
      country: "South Africa",
      status: "active",
      settings: {
        timezone: "Africa/Johannesburg",
        currency: "ZAR",
        language: "en",
        operatingHours: { start: "06:00", end: "22:00" },
        deliveryRadius: 50,
        autoAssignOrders: true
      },
      contact: {
        managerName: "",
        managerEmail: "",
        managerPhone: "",
        address: "",
        city: "",
        postalCode: ""
      }
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-700 border-green-200";
      case "inactive":
        return "bg-gray-100 text-gray-700 border-gray-200";
      case "pending":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle className="w-4 h-4" />;
      case "inactive":
        return <XCircle className="w-4 h-4" />;
      case "pending":
        return <Clock className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Regional Operations - CaterOS Admin</title>
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-4xl font-bold text-slate-900 mb-2">Regional Operations</h1>
                <p className="text-slate-600">Manage franchises and regional fulfillment centers across South Africa</p>
              </div>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
                    <Plus className="w-5 h-5 mr-2" />
                    Create New Region
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create New Regional Operation</DialogTitle>
                    <DialogDescription>
                      Set up a new franchise or regional fulfillment center. Once created, you can assign staff and start fulfilling orders.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6 py-4">
                    <div className="space-y-4">
                      <h3 className="font-semibold text-slate-900">Basic Information</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="name">Region Name</Label>
                          <Input
                            id="name"
                            placeholder="e.g., Durban Operations"
                            value={newRegion.name}
                            onChange={(e) => setNewRegion({ ...newRegion, name: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label htmlFor="code">Region Code</Label>
                          <Input
                            id="code"
                            placeholder="e.g., DBN"
                            value={newRegion.code}
                            onChange={(e) => setNewRegion({ ...newRegion, code: e.target.value.toUpperCase() })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="province">Province</Label>
                          <Select
                            value={newRegion.province}
                            onValueChange={(value) => setNewRegion({ ...newRegion, province: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select province" />
                            </SelectTrigger>
                            <SelectContent>
                              {provinces.map((province) => (
                                <SelectItem key={province} value={province}>
                                  {province}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="country">Country</Label>
                          <Input
                            id="country"
                            value={newRegion.country}
                            onChange={(e) => setNewRegion({ ...newRegion, country: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-semibold text-slate-900">Regional Manager Contact</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="managerName">Manager Name</Label>
                          <Input
                            id="managerName"
                            placeholder="Full name"
                            value={newRegion.contact.managerName}
                            onChange={(e) => setNewRegion({
                              ...newRegion,
                              contact: { ...newRegion.contact, managerName: e.target.value }
                            })}
                          />
                        </div>
                        <div>
                          <Label htmlFor="managerEmail">Email</Label>
                          <Input
                            id="managerEmail"
                            type="email"
                            placeholder="manager@example.com"
                            value={newRegion.contact.managerEmail}
                            onChange={(e) => setNewRegion({
                              ...newRegion,
                              contact: { ...newRegion.contact, managerEmail: e.target.value }
                            })}
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="managerPhone">Phone</Label>
                        <Input
                          id="managerPhone"
                          placeholder="+27 XX XXX XXXX"
                          value={newRegion.contact.managerPhone}
                          onChange={(e) => setNewRegion({
                            ...newRegion,
                            contact: { ...newRegion.contact, managerPhone: e.target.value }
                          })}
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-semibold text-slate-900">Location Details</h3>
                      <div>
                        <Label htmlFor="address">Street Address</Label>
                        <Input
                          id="address"
                          placeholder="123 Main Street"
                          value={newRegion.contact.address}
                          onChange={(e) => setNewRegion({
                            ...newRegion,
                            contact: { ...newRegion.contact, address: e.target.value }
                          })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="city">City</Label>
                          <Input
                            id="city"
                            placeholder="City name"
                            value={newRegion.contact.city}
                            onChange={(e) => setNewRegion({
                              ...newRegion,
                              contact: { ...newRegion.contact, city: e.target.value }
                            })}
                          />
                        </div>
                        <div>
                          <Label htmlFor="postalCode">Postal Code</Label>
                          <Input
                            id="postalCode"
                            placeholder="0000"
                            value={newRegion.contact.postalCode}
                            onChange={(e) => setNewRegion({
                              ...newRegion,
                              contact: { ...newRegion.contact, postalCode: e.target.value }
                            })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-semibold text-slate-900">Operational Settings</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="operatingStart">Operating Hours Start</Label>
                          <Input
                            id="operatingStart"
                            type="time"
                            value={newRegion.settings.operatingHours.start}
                            onChange={(e) => setNewRegion({
                              ...newRegion,
                              settings: {
                                ...newRegion.settings,
                                operatingHours: {
                                  ...newRegion.settings.operatingHours,
                                  start: e.target.value
                                }
                              }
                            })}
                          />
                        </div>
                        <div>
                          <Label htmlFor="operatingEnd">Operating Hours End</Label>
                          <Input
                            id="operatingEnd"
                            type="time"
                            value={newRegion.settings.operatingHours.end}
                            onChange={(e) => setNewRegion({
                              ...newRegion,
                              settings: {
                                ...newRegion.settings,
                                operatingHours: {
                                  ...newRegion.settings.operatingHours,
                                  end: e.target.value
                                }
                              }
                            })}
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="deliveryRadius">Delivery Radius (km)</Label>
                        <Input
                          id="deliveryRadius"
                          type="number"
                          value={newRegion.settings.deliveryRadius}
                          onChange={(e) => setNewRegion({
                            ...newRegion,
                            settings: {
                              ...newRegion.settings,
                              deliveryRadius: parseInt(e.target.value) || 0
                            }
                          })}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                      <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateRegion} className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
                        Create Region
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <Globe className="w-8 h-8" />
                    <div className="text-3xl font-bold">{consolidatedStats.totalRegions}</div>
                  </div>
                  <div className="text-purple-100">Active Regions</div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <TrendingUp className="w-8 h-8 text-green-500" />
                    <div className="text-3xl font-bold text-slate-900">{consolidatedStats.totalOrders}</div>
                  </div>
                  <div className="text-slate-600">Total Orders</div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <Users className="w-8 h-8 text-blue-500" />
                    <div className="text-3xl font-bold text-slate-900">
                      {consolidatedStats.totalDrivers + consolidatedStats.totalKitchenStaff}
                    </div>
                  </div>
                  <div className="text-slate-600">Total Staff</div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <DollarSign className="w-8 h-8 text-amber-500" />
                    <div className="text-3xl font-bold text-slate-900">
                      R{(consolidatedStats.totalRevenue / 1000).toFixed(0)}k
                    </div>
                  </div>
                  <div className="text-slate-600">Monthly Revenue</div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid gap-6">
            {regions.map((region) => (
              <Card key={region.id} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                <CardHeader className="bg-gradient-to-r from-slate-50 to-purple-50 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
                        <Building2 className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-2xl">{region.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="font-mono">{region.code}</Badge>
                          <span className="text-sm text-slate-600">{region.province}, {region.country}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={getStatusColor(region.status)}>
                        {getStatusIcon(region.status)}
                        <span className="ml-1 capitalize">{region.status}</span>
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedRegion(region);
                          setIsViewDialogOpen(true);
                        }}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View Details
                      </Button>
                      <Link href={`/admin/regions/${region.id}`}>
                        <Button size="sm" className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
                          <Settings className="w-4 h-4 mr-1" />
                          Manage
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <TrendingUp className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-slate-900">{region.stats.totalOrders}</div>
                        <div className="text-sm text-slate-600">Orders</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <Truck className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-slate-900">{region.stats.activeDrivers}</div>
                        <div className="text-sm text-slate-600">Drivers</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <ChefHat className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-slate-900">{region.stats.kitchenStaff}</div>
                        <div className="text-sm text-slate-600">Kitchen Staff</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-100 rounded-lg">
                        <Package className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-slate-900">
                          R{(region.stats.inventoryValue / 1000).toFixed(0)}k
                        </div>
                        <div className="text-sm text-slate-600">Inventory Value</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div>
                      <div className="text-sm text-slate-600 mb-1">Regional Manager</div>
                      <div className="font-semibold text-slate-900">{region.contact.managerName}</div>
                      <div className="text-sm text-slate-600">{region.contact.managerEmail}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-slate-600 mb-1">Monthly Revenue</div>
                      <div className="text-2xl font-bold text-green-600">
                        R{(region.stats.monthlyRevenue / 1000).toFixed(0)}k
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {regions.length === 0 && (
            <Card className="border-0 shadow-lg">
              <CardContent className="py-16 text-center">
                <MapPin className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">No regions yet</h3>
                <p className="text-slate-600 mb-6">Create your first regional operation to start scaling across South Africa</p>
                <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
                  <Plus className="w-5 h-5 mr-2" />
                  Create First Region
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Region Details: {selectedRegion?.name}</DialogTitle>
              <DialogDescription>Complete information about this regional operation</DialogDescription>
            </DialogHeader>
            {selectedRegion && (
              <div className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-600">Region Code</Label>
                    <div className="font-semibold">{selectedRegion.code}</div>
                  </div>
                  <div>
                    <Label className="text-slate-600">Status</Label>
                    <Badge className={getStatusColor(selectedRegion.status)}>
                      {getStatusIcon(selectedRegion.status)}
                      <span className="ml-1 capitalize">{selectedRegion.status}</span>
                    </Badge>
                  </div>
                </div>

                <div>
                  <Label className="text-slate-600">Location</Label>
                  <div className="font-semibold">
                    {selectedRegion.contact.address}, {selectedRegion.contact.city}, {selectedRegion.province} {selectedRegion.contact.postalCode}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-600">Operating Hours</Label>
                    <div className="font-semibold">
                      {selectedRegion.settings.operatingHours.start} - {selectedRegion.settings.operatingHours.end}
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-600">Delivery Radius</Label>
                    <div className="font-semibold">{selectedRegion.settings.deliveryRadius} km</div>
                  </div>
                </div>

                <div>
                  <Label className="text-slate-600 mb-2 block">Regional Manager</Label>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Name:</span>
                          <span className="font-semibold">{selectedRegion.contact.managerName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Email:</span>
                          <span className="font-semibold">{selectedRegion.contact.managerEmail}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Phone:</span>
                          <span className="font-semibold">{selectedRegion.contact.managerPhone}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div>
                  <Label className="text-slate-600 mb-2 block">Performance Statistics</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-slate-900 mb-1">{selectedRegion.stats.totalOrders}</div>
                        <div className="text-sm text-slate-600">Total Orders</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-slate-900 mb-1">
                          R{(selectedRegion.stats.monthlyRevenue / 1000).toFixed(0)}k
                        </div>
                        <div className="text-sm text-slate-600">Monthly Revenue</div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Footer />
      </div>
    </>
  );
}
