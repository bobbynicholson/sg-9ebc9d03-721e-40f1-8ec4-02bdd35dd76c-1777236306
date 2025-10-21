import { useRouter } from "next/router";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Truck, Plus, Filter, Phone, Mail, Loader2 } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { userManagementService } from "@/services/userManagementService";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Driver {
  id: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  is_active: boolean;
  vehicle_details?: string | null;
  drive_time_to_kitchen_minutes?: number | null;
}

export default function DriversPage() {
  const router = useRouter();
  const { companySlug } = router.query;
  const { user } = useAuth();
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && router.isReady) {
      loadDrivers();
    }
  }, [user, router.asPath, router.isReady]); // Add router.isReady to ensure page is fully loaded

  const loadDrivers = async () => {
    try {
      setLoading(true);
      
      // First, get the current user's company_id
      const { data: currentUserProfile, error: profileError } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user!.id)
        .single();

      if (profileError || !currentUserProfile) {
        console.error("Error fetching user profile:", profileError);
        toast({
          title: "Error",
          description: "Failed to load your profile",
          variant: "destructive",
        });
        return;
      }

      // Now fetch all drivers in the same company
      const { data: driverProfiles, error: driversError } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone_number, is_active, vehicle_details, drive_time_to_kitchen_minutes")
        .eq("company_id", currentUserProfile.company_id)
        .eq("role", "driver")
        .order("created_at", { ascending: false });

      if (driversError) {
        console.error("Error fetching drivers:", driversError);
        toast({
          title: "Error",
          description: "Failed to load drivers",
          variant: "destructive",
        });
        return;
      }

      setDrivers(driverProfiles as Driver[]);
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

  const getStatusColor = (isActive: boolean) => {
    return isActive 
      ? "bg-green-100 text-green-700" 
      : "bg-slate-100 text-slate-700";
  };

  const getStatusText = (isActive: boolean) => {
    return isActive ? "Active" : "Inactive";
  };

  const activeDrivers = drivers.filter(d => d.is_active).length;
  const inactiveDrivers = drivers.filter(d => !d.is_active).length;

  return (
    <>
      <AdminNav companySlug={companySlug as string} />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Driver Management</h1>
              <p className="text-slate-600">Manage delivery drivers and assignments</p>
            </div>
            <Link href={`/${companySlug}/admin/drivers/new`}>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Driver
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Total Drivers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{loading ? "-" : drivers.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Active</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{loading ? "-" : activeDrivers}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Inactive</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-600">{loading ? "-" : inactiveDrivers}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Total Deliveries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">-</div>
                <p className="text-xs text-slate-500 mt-1">Coming soon</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>All Drivers</CardTitle>
                  <CardDescription>Manage driver accounts and assignments</CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={loadDrivers}
                  disabled={loading}
                  className="gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Filter className="w-4 h-4" />
                  )}
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                  <span className="ml-3 text-slate-500">Loading drivers...</span>
                </div>
              ) : drivers.length === 0 ? (
                <div className="text-center py-12">
                  <Truck className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">No drivers yet</h3>
                  <p className="text-slate-500 mb-6">Add your first driver to get started</p>
                  <Link href={`/${companySlug}/admin/drivers/new`}>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Add First Driver
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {drivers.map((driver) => (
                    <div
                      key={driver.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:border-purple-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white font-bold">
                          {driver.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="font-semibold text-slate-900">{driver.full_name}</h3>
                            <Badge className={getStatusColor(driver.is_active)}>
                              {getStatusText(driver.is_active)}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-500">
                            <span className="flex items-center gap-1">
                              <Mail className="w-4 h-4" />
                              {driver.email}
                            </span>
                            {driver.phone_number && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-4 h-4" />
                                {driver.phone_number}
                              </span>
                            )}
                          </div>
                          {driver.vehicle_details && (
                            <div className="text-xs text-slate-500 mt-1">
                              <Truck className="w-3 h-3 inline mr-1" />
                              {driver.vehicle_details}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        {driver.drive_time_to_kitchen_minutes && (
                          <div className="text-sm text-slate-600">
                            {driver.drive_time_to_kitchen_minutes} min to kitchen
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
