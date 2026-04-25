import { useState, useEffect } from "react";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  MapPin,
  Plus,
  Edit,
  Trash2,
  Globe,
  CheckCircle,
  XCircle,
  DollarSign,
  ArrowLeft,
  AlertCircle,
  Settings,
  Clock,
  TrendingUp,
  Users,
  Building2,
  Eye,
  Truck,
  ChefHat,
  Package
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { regionService } from "@/services/regionService";
import { regionManagement } from "@/lib/regionManagement";
import type { Region } from "@/types/regions";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";

export default function RegionsPage() {
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
    regionManagement.createRegion(newRegion);
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
        return <CheckCircle className="w-3 h-3 md:w-4 md:h-4" />;
      case "inactive":
        return <XCircle className="w-3 h-3 md:w-4 md:h-4" />;
      case "pending":
        return <Clock className="w-3 h-3 md:w-4 md:h-4" />;
      default:
        return null;
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Regional Settings | CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-64">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Header - Mobile Optimized */}
          <div className="mb-6 md:mb-8">
            <div className="flex flex-col gap-4 mb-4 md:mb-6">
              <div>
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-slate-900 mb-1 md:mb-2">Regional Operations</h1>
                <p className="text-sm md:text-base text-slate-600">Manage franchises and regional fulfillment centers across South Africa</p>
              </div>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-purple-600 to-pink-600 text-white w-full sm:w-auto" size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Create New Region
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-lg md:text-xl">Create New Regional Operation</DialogTitle>
                    <DialogDescription className="text-sm">
                      Set up a new franchise or regional fulfillment center. Once created, you can assign staff and start fulfilling orders.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 md:space-y-6 py-4">
                    <div className="space-y-3 md:space-y-4">
                      <h3 className="font-semibold text-sm md:text-base text-slate-900">Basic Information</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        <div>
                          <Label htmlFor="name" className="text-sm">Region Name</Label>
                          <Input
                            id="name"
                            placeholder="e.g., Durban Operations"
                            value={newRegion.name}
                            onChange={(e) => setNewRegion({ ...newRegion, name: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label htmlFor="code" className="text-sm">Region Code</Label>
                          <Input
                            id="code"
                            placeholder="e.g., DBN"
                            value={newRegion.code}
                            onChange={(e) => setNewRegion({ ...newRegion, code: e.target.value.toUpperCase() })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        <div>
                          <Label htmlFor="province" className="text-sm">Province</Label>
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
                          <Label htmlFor="country" className="text-sm">Country</Label>
                          <Input
                            id="country"
                            value={newRegion.country}
                            onChange={(e) => setNewRegion({ ...newRegion, country: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 md:space-y-4">
                      <h3 className="font-semibold text-sm md:text-base text-slate-900">Regional Manager Contact</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        <div>
                          <Label htmlFor="managerName" className="text-sm">Manager Name</Label>
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
                          <Label htmlFor="managerEmail" className="text-sm">Email</Label>
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
                        <Label htmlFor="managerPhone" className="text-sm">Phone</Label>
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

                    <div className="space-y-3 md:space-y-4">
                      <h3 className="font-semibold text-sm md:text-base text-slate-900">Location Details</h3>
                      <div>
                        <Label htmlFor="address" className="text-sm">Street Address</Label>
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        <div>
                          <Label htmlFor="city" className="text-sm">City</Label>
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
                          <Label htmlFor="postalCode" className="text-sm">Postal Code</Label>
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

                    <div className="space-y-3 md:space-y-4">
                      <h3 className="font-semibold text-sm md:text-base text-slate-900">Operational Settings</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                        <div>
                          <Label htmlFor="operatingStart" className="text-sm">Operating Hours Start</Label>
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
                          <Label htmlFor="operatingEnd" className="text-sm">Operating Hours End</Label>
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
                        <Label htmlFor="deliveryRadius" className="text-sm">Delivery Radius (km)</Label>
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

                    <div className="flex flex-col sm:flex-row justify-end gap-2 md:gap-3 pt-4">
                      <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} className="w-full sm:w-auto" size="sm">
                        Cancel
                      </Button>
                      <Button onClick={handleCreateRegion} className="bg-gradient-to-r from-purple-600 to-pink-600 text-white w-full sm:w-auto" size="sm">
                        Create Region
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Stats Cards - Mobile Optimized Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6 mb-6 md:mb-8">
              <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Globe className="w-6 h-6 md:w-8 md:h-8" />
                      <div className="text-2xl md:text-3xl font-bold">{consolidatedStats.totalRegions}</div>
                    </div>
                    <div className="text-purple-100 text-xs md:text-sm">Active Regions</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <TrendingUp className="w-6 h-6 md:w-8 md:h-8 text-green-500" />
                      <div className="text-2xl md:text-3xl font-bold text-slate-900">{consolidatedStats.totalOrders}</div>
                    </div>
                    <div className="text-slate-600 text-xs md:text-sm">Total Orders</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Users className="w-6 h-6 md:w-8 md:h-8 text-blue-500" />
                      <div className="text-2xl md:text-3xl font-bold text-slate-900">
                        {consolidatedStats.totalDrivers + consolidatedStats.totalKitchenStaff}
                      </div>
                    </div>
                    <div className="text-slate-600 text-xs md:text-sm">Total Staff</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <DollarSign className="w-6 h-6 md:w-8 md:h-8 text-amber-500" />
                      <div className="text-2xl md:text-3xl font-bold text-slate-900">
                        R{(consolidatedStats.totalRevenue / 1000).toFixed(0)}k
                      </div>
                    </div>
                    <div className="text-slate-600 text-xs md:text-sm">Monthly Revenue</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Regions List - Mobile Optimized Cards */}
          <div className="grid gap-4 md:gap-6">
            {regions.map((region) => (
              <Card key={region.id} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                <CardHeader className="bg-gradient-to-r from-slate-50 to-purple-50 border-b px-4 md:px-6 py-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 md:gap-4 flex-1 min-w-0">
                        <div className="p-2 md:p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg md:rounded-xl flex-shrink-0">
                          <Building2 className="w-4 h-4 md:w-6 md:h-6 text-white" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-lg md:text-2xl truncate">{region.name}</CardTitle>
                          <div className="flex flex-wrap items-center gap-1 md:gap-2 mt-1">
                            <Badge variant="outline" className="font-mono text-xs">{region.code}</Badge>
                            <span className="text-xs md:text-sm text-slate-600 truncate">{region.province}, {region.country}</span>
                          </div>
                        </div>
                      </div>
                      <Badge className={`${getStatusColor(region.status)} flex-shrink-0 text-xs`}>
                        {getStatusIcon(region.status)}
                        <span className="ml-1 capitalize hidden sm:inline">{region.status}</span>
                      </Badge>
                    </div>
                    
                    {/* Action Buttons - Mobile Stacked */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedRegion(region);
                          setIsViewDialogOpen(true);
                        }}
                        className="w-full sm:w-auto text-xs md:text-sm"
                      >
                        <Eye className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                        View Details
                      </Button>
                      <Link href={`/admin/regions/${region.id}`} className="w-full sm:w-auto">
                        <Button size="sm" className="bg-gradient-to-r from-purple-600 to-pink-600 text-white w-full text-xs md:text-sm">
                          <Settings className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                          Manage
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 md:pt-6 px-4 md:px-6">
                  {/* Stats Grid - Mobile 2 columns, Desktop 4 */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6 mb-4 md:mb-6">
                    <div className="flex items-center gap-2 md:gap-3">
                      <div className="p-1.5 md:p-2 bg-blue-100 rounded-lg flex-shrink-0">
                        <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-lg md:text-2xl font-bold text-slate-900">{region.stats.totalOrders}</div>
                        <div className="text-xs md:text-sm text-slate-600 truncate">Orders</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3">
                      <div className="p-1.5 md:p-2 bg-green-100 rounded-lg flex-shrink-0">
                        <Truck className="w-4 h-4 md:w-5 md:h-5 text-green-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-lg md:text-2xl font-bold text-slate-900">{region.stats.activeDrivers}</div>
                        <div className="text-xs md:text-sm text-slate-600 truncate">Drivers</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3">
                      <div className="p-1.5 md:p-2 bg-purple-100 rounded-lg flex-shrink-0">
                        <ChefHat className="w-4 h-4 md:w-5 md:h-5 text-purple-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-lg md:text-2xl font-bold text-slate-900">{region.stats.kitchenStaff}</div>
                        <div className="text-xs md:text-sm text-slate-600 truncate">Kitchen Staff</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3">
                      <div className="p-1.5 md:p-2 bg-amber-100 rounded-lg flex-shrink-0">
                        <Package className="w-4 h-4 md:w-5 md:h-5 text-amber-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-lg md:text-2xl font-bold text-slate-900">
                          R{(region.stats.inventoryValue / 1000).toFixed(0)}k
                        </div>
                        <div className="text-xs md:text-sm text-slate-600 truncate">Inventory</div>
                      </div>
                    </div>
                  </div>

                  {/* Manager Info - Mobile Stacked */}
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4 p-3 md:p-4 bg-slate-50 rounded-lg">
                    <div className="min-w-0">
                      <div className="text-xs md:text-sm text-slate-600 mb-1">Regional Manager</div>
                      <div className="font-semibold text-sm md:text-base text-slate-900 truncate">{region.contact.managerName}</div>
                      <div className="text-xs md:text-sm text-slate-600 truncate">{region.contact.managerEmail}</div>
                    </div>
                    <div className="text-left md:text-right flex-shrink-0">
                      <div className="text-xs md:text-sm text-slate-600 mb-1">Monthly Revenue</div>
                      <div className="text-xl md:text-2xl font-bold text-green-600">
                        R{(region.stats.monthlyRevenue / 1000).toFixed(0)}k
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Empty State */}
          {regions.length === 0 && (
            <Card className="border-0 shadow-lg">
              <CardContent className="py-12 md:py-16 text-center px-4">
                <MapPin className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 text-slate-300" />
                <h3 className="text-lg md:text-xl font-semibold text-slate-900 mb-2">No regions yet</h3>
                <p className="text-sm md:text-base text-slate-600 mb-4 md:mb-6">Create your first regional operation to start scaling across South Africa</p>
                <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-gradient-to-r from-purple-600 to-pink-600 text-white" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Region
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* View Region Dialog - Mobile Optimized */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg md:text-xl">Region Details: {selectedRegion?.name}</DialogTitle>
              <DialogDescription className="text-sm">Complete information about this regional operation</DialogDescription>
            </DialogHeader>
            {selectedRegion && (
              <div className="space-y-4 md:space-y-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <div>
                    <Label className="text-slate-600 text-sm">Region Code</Label>
                    <div className="font-semibold text-sm md:text-base">{selectedRegion.code}</div>
                  </div>
                  <div>
                    <Label className="text-slate-600 text-sm">Status</Label>
                    <Badge className={`${getStatusColor(selectedRegion.status)} mt-1 text-xs`}>
                      {getStatusIcon(selectedRegion.status)}
                      <span className="ml-1 capitalize">{selectedRegion.status}</span>
                    </Badge>
                  </div>
                </div>

                <div>
                  <Label className="text-slate-600 text-sm">Location</Label>
                  <div className="font-semibold text-sm md:text-base">
                    {selectedRegion.contact.address}, {selectedRegion.contact.city}, {selectedRegion.province} {selectedRegion.contact.postalCode}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <div>
                    <Label className="text-slate-600 text-sm">Operating Hours</Label>
                    <div className="font-semibold text-sm md:text-base">
                      {selectedRegion.settings.operatingHours.start} - {selectedRegion.settings.operatingHours.end}
                    </div>
                  </div>
                  <div>
                    <Label className="text-slate-600 text-sm">Delivery Radius</Label>
                    <div className="font-semibold text-sm md:text-base">{selectedRegion.settings.deliveryRadius} km</div>
                  </div>
                </div>

                <div>
                  <Label className="text-slate-600 mb-2 block text-sm">Regional Manager</Label>
                  <Card>
                    <CardContent className="pt-3 md:pt-4 px-3 md:px-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Name:</span>
                          <span className="font-semibold truncate ml-2">{selectedRegion.contact.managerName}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Email:</span>
                          <span className="font-semibold truncate ml-2">{selectedRegion.contact.managerEmail}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Phone:</span>
                          <span className="font-semibold">{selectedRegion.contact.managerPhone}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div>
                  <Label className="text-slate-600 mb-2 block text-sm">Performance Statistics</Label>
                  <div className="grid grid-cols-2 gap-2 md:gap-3">
                    <Card>
                      <CardContent className="pt-3 md:pt-4 px-3">
                        <div className="text-xl md:text-2xl font-bold text-slate-900 mb-1">{selectedRegion.stats.totalOrders}</div>
                        <div className="text-xs md:text-sm text-slate-600">Total Orders</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-3 md:pt-4 px-3">
                        <div className="text-xl md:text-2xl font-bold text-slate-900 mb-1">
                          R{(selectedRegion.stats.monthlyRevenue / 1000).toFixed(0)}k
                        </div>
                        <div className="text-xs md:text-sm text-slate-600">Monthly Revenue</div>
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
