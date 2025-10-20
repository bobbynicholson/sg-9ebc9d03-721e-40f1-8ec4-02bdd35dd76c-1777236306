
import { useRouter } from "next/router";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Truck, Plus, Filter, MapPin, Phone, Mail } from "lucide-react";
import Link from "next/link";

export default function DriversPage() {
  const router = useRouter();
  const { companySlug } = router.query;

  const mockDrivers = [
    {
      id: "1",
      name: "John Driver",
      email: "john@example.com",
      phone: "+1 234 567 8900",
      status: "available",
      activeJobs: 2,
      totalDeliveries: 45
    }
  ];

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      available: "bg-green-100 text-green-700",
      busy: "bg-orange-100 text-orange-700",
      offline: "bg-slate-100 text-slate-700",
    };
    return colors[status] || "bg-gray-100 text-gray-700";
  };

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
                <div className="text-2xl font-bold">{mockDrivers.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Available</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{mockDrivers.filter(d => d.status === "available").length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Active Jobs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {mockDrivers.reduce((sum, d) => sum + d.activeJobs, 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Total Deliveries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">
                  {mockDrivers.reduce((sum, d) => sum + d.totalDeliveries, 0)}
                </div>
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
                <Button variant="outline" className="gap-2">
                  <Filter className="w-4 h-4" />
                  Filter
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockDrivers.map((driver) => (
                  <div
                    key={driver.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:border-purple-300 hover:shadow-sm transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white font-bold">
                        <Truck className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-slate-900">{driver.name}</h3>
                          <Badge className={getStatusColor(driver.status)}>{driver.status}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            {driver.email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone className="w-4 h-4" />
                            {driver.phone}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-slate-900">
                        {driver.activeJobs} active jobs
                      </div>
                      <div className="text-xs text-slate-500">
                        {driver.totalDeliveries} total deliveries
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
