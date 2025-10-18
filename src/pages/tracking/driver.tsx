import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  MapPin,
  User,
  Calendar,
  Clock,
  Package,
  DollarSign,
  TrendingUp,
  CheckCircle,
  Navigation,
  Phone,
  Mail
} from "lucide-react";
import { DriverGPSTracker } from "@/components/tracking/DriverGPSTracker";
import { DeliveryStatus } from "@/types/tracking";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/Header";
import { RouteStopManager } from "@/components/driver/RouteStopManager";

export default function DriverTrackingPage() {
  const { user } = useAuth();
  const [driverId] = useState("driver_001");
  const [driverName] = useState("John Smith");
  const [activeDelivery, setActiveDelivery] = useState<any>(null);
  const [availableJobs, setAvailableJobs] = useState<any[]>([]);
  const [completedJobs, setCompletedJobs] = useState<any[]>([]);
  const [earnings, setEarnings] = useState({ today: 450, thisWeek: 2100, pending: 850 });

  useEffect(() => {
    loadDriverData();
  }, []);

  const loadDriverData = () => {
    // Active delivery
    const active = {
      id: "ORD-2025-001",
      clientName: "Sarah Johnson",
      clientPhone: "+27 82 555 1234",
      eventType: "Corporate Lunch",
      eventDate: new Date().toISOString(),
      guestCount: 50,
      venue: "123 Business Park, Sandton",
      pickupAddress: "456 Kitchen Street, Randburg",
      status: "en_route",
      estimatedEarnings: 280,
      distance: 15,
      specialInstructions: "Ring bell at loading dock. Check all items before departure. Client prefers delivery at side entrance."
    };
    setActiveDelivery(active);

    // Available jobs
    const available = [
      {
        id: "ORD-2025-002",
        clientName: "Michael Chen",
        eventType: "Wedding Reception",
        eventDate: new Date(Date.now() + 3600000 * 4).toISOString(),
        guestCount: 120,
        venue: "The Grand Hotel, Cape Town",
        pickupTime: "14:00",
        deliveryTime: "16:00",
        estimatedEarnings: 450,
        distance: 22,
        urgent: false
      },
      {
        id: "ORD-2025-003",
        clientName: "Linda van der Merwe",
        eventType: "Birthday Party",
        eventDate: new Date(Date.now() + 3600000 * 2).toISOString(),
        guestCount: 40,
        venue: "789 Residential Ave, Durbanville",
        pickupTime: "11:00",
        deliveryTime: "12:30",
        estimatedEarnings: 220,
        distance: 12,
        urgent: true
      },
      {
        id: "ORD-2025-004",
        clientName: "David Mokoena",
        eventType: "Corporate Event",
        eventDate: new Date(Date.now() + 3600000 * 6).toISOString(),
        guestCount: 80,
        venue: "Convention Center, Century City",
        pickupTime: "17:00",
        deliveryTime: "18:30",
        estimatedEarnings: 350,
        distance: 18,
        urgent: false
      }
    ];
    setAvailableJobs(available);

    // Completed jobs
    const completed = [
      {
        id: "ORD-2025-100",
        clientName: "Emma Watson",
        eventType: "Baby Shower",
        completedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        earnings: 180,
        rating: 5
      },
      {
        id: "ORD-2025-099",
        clientName: "James Brown",
        eventType: "Business Meeting",
        completedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
        earnings: 240,
        rating: 5
      },
      {
        id: "ORD-2025-098",
        clientName: "Sophie Anderson",
        eventType: "Family Gathering",
        completedAt: new Date(Date.now() - 86400000).toISOString(),
        earnings: 320,
        rating: 4
      }
    ];
    setCompletedJobs(completed);
  };

  const handleAcceptJob = (jobId: string) => {
    const job = availableJobs.find(j => j.id === jobId);
    if (job) {
      setActiveDelivery({
        ...job,
        status: "pending",
        clientPhone: "+27 82 555 9876",
        pickupAddress: "456 Kitchen Street, Randburg",
        specialInstructions: "Verify all items against checklist. Client expects early arrival if possible."
      });
      setAvailableJobs(availableJobs.filter(j => j.id !== jobId));
    }
  };

  const handleStatusChange = (status: DeliveryStatus) => {
    if (activeDelivery) {
      setActiveDelivery({ ...activeDelivery, status });
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: "bg-blue-100 text-blue-700 border-blue-200",
      en_route: "bg-purple-100 text-purple-700 border-purple-200",
      driver_arrived: "bg-orange-100 text-orange-700 border-orange-200",
      delivered: "bg-green-100 text-green-700 border-green-200"
    };
    return styles[status as keyof typeof styles] || styles.pending;
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <NoIndexMeta />
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-slate-600">Please log in to view the driver portal.</p>
            <Link href="/auth/login?role=driver">
              <Button className="w-full mt-4">Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <NoIndexMeta />
      <Header />
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-7xl">
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 sm:p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl shadow-lg">
                <MapPin className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                  Driver Portal
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">Welcome back, {driverName}</p>
              </div>
            </div>
            <Link href="/drivers">
              <Button variant="outline" className="w-full sm:w-auto h-11">
                <span className="hidden sm:inline">View Full Dashboard</span>
                <span className="sm:hidden">Dashboard</span>
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 mb-6 sm:mb-8">
          <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-600">
            <CardContent className="p-4 sm:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-xs sm:text-sm mb-1">Today's Earnings</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white">R{earnings.today}</p>
                </div>
                <DollarSign className="w-10 h-10 sm:w-12 sm:h-12 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-green-500 to-green-600">
            <CardContent className="p-4 sm:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-xs sm:text-sm mb-1">This Week</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white">R{earnings.thisWeek}</p>
                </div>
                <TrendingUp className="w-10 h-10 sm:w-12 sm:h-12 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-500 to-amber-600">
            <CardContent className="p-4 sm:pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-100 text-xs sm:text-sm mb-1">Pending Payment</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white">R{earnings.pending}</p>
                </div>
                <Clock className="w-10 h-10 sm:w-12 sm:h-12 text-amber-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {activeDelivery && (
          <div className="mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4">Active Delivery</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                <DriverGPSTracker
                  orderId={activeDelivery.id}
                  assignmentId={activeDelivery.assignmentId || "assign-mock-001"}
                  driverId={user.id}
                  driverName={user.user_metadata?.full_name || driverName}
                  onStatusChange={handleStatusChange}
                />

                <RouteStopManager
                  orderId={activeDelivery.id}
                  driverId={user.id}
                  isAdmin={false}
                />

                <Card className="border-0 shadow-lg">
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-lg sm:text-xl">Delivery Instructions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 p-4 sm:p-6 pt-0">
                    <div className="p-3 sm:p-4 bg-blue-50 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2 text-sm sm:text-base">
                        <MapPin className="w-4 h-4 flex-shrink-0" />
                        Pickup Instructions
                      </h4>
                      <p className="text-xs sm:text-sm text-blue-700 mb-2 break-words">
                        <span className="font-medium">Address:</span> {activeDelivery.pickupAddress}
                      </p>
                      <p className="text-xs sm:text-sm text-blue-700 break-words">
                        Collect food from main kitchen. Ring bell at loading dock entrance.
                        Check all items against order list before departure.
                      </p>
                    </div>
                    <div className="p-3 sm:p-4 bg-green-50 rounded-lg">
                      <h4 className="font-medium text-green-900 mb-2 flex items-center gap-2 text-sm sm:text-base">
                        <Navigation className="w-4 h-4 flex-shrink-0" />
                        Delivery Instructions
                      </h4>
                      <p className="text-xs sm:text-sm text-green-700 mb-2 break-words">
                        <span className="font-medium">Destination:</span> {activeDelivery.venue}
                      </p>
                      <p className="text-xs sm:text-sm text-green-700 break-words">
                        {activeDelivery.specialInstructions}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <Card className="border-0 shadow-lg">
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-lg sm:text-xl">Order Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
                    <div>
                      <Badge className={`${getStatusBadge(activeDelivery.status)} border mb-3 text-xs`}>
                        {typeof activeDelivery.status === 'string' ? activeDelivery.status.replace(/_/g, ' ').toUpperCase() : 'UNKNOWN'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <User className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm text-slate-600">Client</p>
                        <p className="font-medium text-sm sm:text-base text-slate-900 truncate">{activeDelivery.clientName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm text-slate-600">Contact</p>
                        <a href={`tel:${activeDelivery.clientPhone}`} className="font-medium text-sm sm:text-base text-blue-600 hover:text-blue-700 break-all">
                          {activeDelivery.clientPhone}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm text-slate-600">Event Type</p>
                        <p className="font-medium text-sm sm:text-base text-slate-900 truncate">{activeDelivery.eventType}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Package className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 flex-shrink-0" />
                      <div>
                        <p className="text-xs sm:text-sm text-slate-600">Guest Count</p>
                        <p className="font-medium text-sm sm:text-base text-slate-900">{activeDelivery.guestCount} guests</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 flex-shrink-0" />
                      <div>
                        <p className="text-xs sm:text-sm text-slate-600">Estimated Earnings</p>
                        <p className="font-medium text-sm sm:text-base text-slate-900">R{activeDelivery.estimatedEarnings}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50">
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-base sm:text-lg">Safety Reminders</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs sm:text-sm text-slate-700 p-4 sm:p-6 pt-0">
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs mt-0.5 flex-shrink-0">1</div>
                      <p className="break-words">Verify all food items before leaving kitchen</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs mt-0.5 flex-shrink-0">2</div>
                      <p className="break-words">Maintain proper food temperature during transport</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs mt-0.5 flex-shrink-0">3</div>
                      <p className="break-words">Call client 15 minutes before arrival</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs mt-0.5 flex-shrink-0">4</div>
                      <p className="break-words">Update delivery status at each step</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {availableJobs.length > 0 && (
          <div className="mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4">Available Jobs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {availableJobs.map((job) => (
                <Card key={job.id} className="border-0 shadow-lg hover:shadow-xl transition-all">
                  <CardHeader className="p-4 sm:p-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base sm:text-lg mb-1 truncate">{job.eventType}</CardTitle>
                        <p className="text-xs sm:text-sm text-slate-600 truncate">Order #{job.id}</p>
                      </div>
                      {job.urgent && (
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-xs flex-shrink-0">
                          Urgent
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 sm:space-y-3 p-4 sm:p-6 pt-0">
                    <div className="flex items-center gap-2 text-xs sm:text-sm">
                      <User className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <span className="text-slate-700 truncate">{job.clientName}</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs sm:text-sm">
                      <MapPin className="w-4 h-4 text-slate-600 flex-shrink-0 mt-0.5" />
                      <span className="text-slate-700 break-words">{job.venue}</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs sm:text-sm">
                      <Clock className="w-4 h-4 text-slate-600 flex-shrink-0 mt-0.5" />
                      <span className="text-slate-700 break-words">Pickup: {job.pickupTime} | Deliver: {job.deliveryTime}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs sm:text-sm">
                      <Package className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <span className="text-slate-700">{job.guestCount} guests</span>
                    </div>
                    <div className="pt-3 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <p className="text-xs text-slate-600">Estimated Earnings</p>
                        <p className="text-lg font-bold text-green-600">R{job.estimatedEarnings}</p>
                      </div>
                      <Button 
                        onClick={() => handleAcceptJob(job.id)}
                        size="sm"
                        className="bg-gradient-to-r from-green-500 to-emerald-500 w-full sm:w-auto h-11"
                      >
                        Accept Job
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {completedJobs.length > 0 && (
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4">Recently Completed</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {completedJobs.map((job) => (
                <Card key={job.id} className="border-0 shadow-lg">
                  <CardContent className="p-4 sm:pt-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm sm:text-base text-slate-900 truncate">{job.clientName}</p>
                        <p className="text-xs sm:text-sm text-slate-600 truncate">{job.eventType}</p>
                      </div>
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-600">Earned</p>
                        <p className="text-base sm:text-lg font-bold text-green-600">R{job.earnings}</p>
                      </div>
                      <div className="flex gap-1">
                        {[...Array(job.rating)].map((_, i) => (
                          <div key={i} className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-yellow-400" />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Completed {new Date(job.completedAt).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
      
      <Footer />
    </div>
  );
}
