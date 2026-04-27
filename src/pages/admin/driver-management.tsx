import { UserRole } from "@/types/app";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Truck, UserPlus, Mail, Phone, CheckCircle, XCircle, Search, MoreVertical } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { authService } from "@/services/authService";
import { profileService } from "@/services/profileService";
import { userManagementService } from "@/services/userManagementService";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";

interface Driver {
  id: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  is_active: boolean;
  created_at: string;
  drive_time_to_kitchen_minutes: number | null;
}

export default function ProtectedDriverManagementPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <DriverManagementPage />
    </ProtectedRoute>
  );
}

function DriverManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addDriverLoading, setAddDriverLoading] = useState(false);
  const [newDriver, setNewDriver] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      loadDrivers();
    }
  }, [user]);

  const loadDrivers = async () => {
    try {
      setLoading(true);
      const allUsers = await userManagementService.getAllUsers();
      const driverUsers = allUsers.filter(u => u.role === "driver");
      setDrivers(driverUsers as Driver[]);
    } catch (err) {
      console.error("Error loading drivers:", err);
      toast({
        title: "Error",
        description: "Failed to load drivers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setAddDriverLoading(true);

    if (!newDriver.name || !newDriver.email || !newDriver.phone || !newDriver.password) {
      setError("Please fill in all fields");
      setAddDriverLoading(false);
      return;
    }

    if (newDriver.password.length < 6) {
      setError("Password must be at least 6 characters long");
      setAddDriverLoading(false);
      return;
    }

    try {
      const { user: newUser, error: signUpError } = await authService.signUp(
        newDriver.email,
        newDriver.password,
        {
          full_name: newDriver.name,
          role: "driver",
          currency: user?.currency || "ZAR",
          phone_number: newDriver.phone,
          company_name: user?.company_name || undefined,
        }
      );

      if (signUpError) {
        setError(signUpError.message);
        setAddDriverLoading(false);
        return;
      }

      if (!newUser) {
        setError("Failed to create driver account");
        setAddDriverLoading(false);
        return;
      }

      await profileService.createProfile({
        id: newUser.id,
        email: newDriver.email,
        full_name: newDriver.name,
        role: "driver",
        currency: user?.currency || "ZAR",
        phone_number: newDriver.phone,
        is_active: true,
      });

      toast({
        title: "Success!",
        description: `Driver ${newDriver.name} has been added successfully`,
        duration: 3000,
      });

      setIsAddDialogOpen(false);
      setNewDriver({ name: "", email: "", phone: "", password: "" });
      loadDrivers();
    } catch (err) {
      console.error("Error adding driver:", err);
      setError("Failed to add driver. Please try again.");
    } finally {
      setAddDriverLoading(false);
    }
  };

  const handleToggleDriverStatus = async (driverId: string, currentStatus: boolean) => {
    try {
      await userManagementService.updateUserStatus(driverId, !currentStatus);

      toast({
        title: "Success",
        description: `Driver ${currentStatus ? "deactivated" : "activated"} successfully`,
        duration: 3000,
      });

      loadDrivers();
    } catch (err) {
      console.error("Error toggling driver status:", err);
      toast({
        title: "Error",
        description: "Failed to update driver status",
        variant: "destructive",
      });
    }
  };

  const filteredDrivers = drivers.filter(driver =>
    driver.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    driver.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeDrivers = drivers.filter(d => d.is_active).length;
  const inactiveDrivers = drivers.filter(d => !d.is_active).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <NoIndexMeta />
      <AdminNav />
      
      <div className="container mx-auto px-4 py-8 max-w-screen-2xl lg:pl-64 xl:pl-72">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <Truck className="w-6 h-6 text-white" />
                </div>
                Driver Management
              </h1>
              <p className="text-slate-600">Manage your delivery drivers and their accounts</p>
            </div>

            <div className="flex items-center gap-2">
              <InfoTooltip 
                content="Create a new driver account with login credentials. The driver will be able to access their portal immediately."
                side="left"
              />
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add New Driver
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Driver</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddDriver} className="space-y-4">
                    {error && (
                      <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name *</Label>
                      <Input
                        id="name"
                        value={newDriver.name}
                        onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })}
                        placeholder="John Doe"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newDriver.email}
                        onChange={(e) => setNewDriver({ ...newDriver, email: e.target.value })}
                        placeholder="john.doe@example.com"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number *</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={newDriver.phone}
                        onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })}
                        placeholder="+27 12 345 6789"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password *</Label>
                      <Input
                        id="password"
                        type="password"
                        value={newDriver.password}
                        onChange={(e) => setNewDriver({ ...newDriver, password: e.target.value })}
                        placeholder="At least 6 characters"
                        required
                      />
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-800">
                        <strong>Note:</strong> The driver will receive their login credentials and can access the driver portal immediately.
                      </p>
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={addDriverLoading}
                    >
                      {addDriverLoading ? "Adding Driver..." : "Add Driver"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-0 shadow-md bg-gradient-to-br from-blue-50 to-blue-100">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-700 mb-1">Total Drivers</p>
                    <p className="text-3xl font-bold text-blue-900">{drivers.length}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center">
                    <Truck className="w-6 h-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md bg-gradient-to-br from-green-50 to-emerald-100">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-700 mb-1">Active</p>
                    <p className="text-3xl font-bold text-green-900">{activeDrivers}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md bg-gradient-to-br from-slate-50 to-slate-100">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-700 mb-1">Inactive</p>
                    <p className="text-3xl font-bold text-slate-900">{inactiveDrivers}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-slate-500 flex items-center justify-center">
                    <XCircle className="w-6 h-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search drivers by name or email..."
              className="pl-10 h-12"
            />
          </div>
        </div>

        {/* Drivers List */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>All Drivers</CardTitle>
            <CardDescription>
              Manage your delivery drivers and their account status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <p className="text-slate-500">Loading drivers...</p>
              </div>
            ) : filteredDrivers.length === 0 ? (
              <div className="text-center py-12">
                <Truck className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">
                  {searchQuery ? "No drivers found" : "No drivers yet"}
                </h3>
                <p className="text-slate-500 mb-6">
                  {searchQuery ? "Try adjusting your search" : "Add your first driver to get started"}
                </p>
                {!searchQuery && (
                  <Button onClick={() => setIsAddDialogOpen(true)}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add First Driver
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDrivers.map((driver) => (
                  <Card key={driver.id} className="border shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold">
                            {driver.full_name.charAt(0).toUpperCase()}
                          </div>
                          
                          <div className="flex-1">
                            <h3 className="font-semibold text-slate-900">{driver.full_name}</h3>
                            <div className="flex items-center gap-4 mt-1 text-sm text-slate-600">
                              <div className="flex items-center gap-1">
                                <Mail className="w-4 h-4" />
                                <span>{driver.email}</span>
                              </div>
                              {driver.phone_number && (
                                <div className="flex items-center gap-1">
                                  <Phone className="w-4 h-4" />
                                  <span>{driver.phone_number}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Badge
                            variant={driver.is_active ? "default" : "secondary"}
                            className={driver.is_active ? "bg-green-100 text-green-700 border-green-200" : ""}
                          >
                            {driver.is_active ? "Active" : "Inactive"}
                          </Badge>

                          <InfoTooltip 
                            content={driver.is_active ? "Deactivate this driver to prevent them from logging in and seeing jobs." : "Activate this driver to allow them to login and access jobs."}
                            side="left"
                          />
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleToggleDriverStatus(driver.id, driver.is_active)}
                              >
                                {driver.is_active ? "Deactivate" : "Activate"} Driver
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Links */}
        <Card className="border-0 shadow-lg mt-6 bg-gradient-to-br from-blue-50 to-indigo-50">
          <CardHeader>
            <CardTitle className="text-blue-900">Driver Portal Access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <h4 className="font-semibold text-blue-900 mb-2">Driver Login URL</h4>
              <p className="text-sm text-blue-700 mb-2">
                Share this URL with your drivers so they can easily bookmark and access their portal:
              </p>
              <code className="block bg-blue-100 text-blue-900 px-3 py-2 rounded text-sm">
                {typeof window !== "undefined" ? `${window.location.origin}/auth/login` : "/auth/login"}
              </code>
            </div>

            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <h4 className="font-semibold text-blue-900 mb-2">Driver Signup URL</h4>
              <p className="text-sm text-blue-700 mb-2">
                Share this URL if you want drivers to self-register:
              </p>
              <code className="block bg-blue-100 text-blue-900 px-3 py-2 rounded text-sm">
                {typeof window !== "undefined" ? `${window.location.origin}/auth/register` : "/auth/register"}
              </code>
            </div>
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  );
}