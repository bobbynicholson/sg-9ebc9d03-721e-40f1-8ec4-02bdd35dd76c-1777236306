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

export default function DriverTrackingPage() {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <NoIndexMeta />
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl shadow-lg">
                <MapPin className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                  Driver Portal
                </h1>
                <p className="text-slate-600 mt-1">Welcome back, {driverName}</p>
              </div>
            </div>
            <Link href="/drivers">
              <Button variant="outline">View Full Dashboard</Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-600">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm mb-1">Today's Earnings</p>
                  <p className="text-3xl font-bold text-white">R{earnings.today}</p>
                </div>
                <DollarSign className="w-12 h-12 text-blue-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-green-500 to-green-600">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm mb-1">This Week</p>
                  <p className="text-3xl font-bold text-white">R{earnings.thisWeek}</p>
                </div>
                <TrendingUp className="w-12 h-12 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-500 to-amber-600">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-100 text-sm mb-1">Pending Payment</p>
                  <p className="text-3xl font-bold text-white">R{earnings.pending}</p>
                </div>
                <Clock className="w-12 h-12 text-amber-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {activeDelivery && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Active Delivery</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <DriverGPSTracker
                  orderId={activeDelivery.order_id}
                  assignmentId={activeDelivery.id}
                  driverId={user.id}
                  driverName={user.user_metadata.full_name}
                  onStatusChange={handleStatusChange}
                />

                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle>Delivery Instructions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Pickup Instructions
                      </h4>
                      <p className="text-sm text-blue-700 mb-2">
                        <span className="font-medium">Address:</span> {activeDelivery.pickupAddress}
                      </p>
                      <p className="text-sm text-blue-700">
                        Collect food from main kitchen. Ring bell at loading dock entrance.
                        Check all items against order list before departure.
                      </p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <h4 className="font-medium text-green-900 mb-2 flex items-center gap-2">
                        <Navigation className="w-4 h-4" />
                        Delivery Instructions
                      </h4>
                      <p className="text-sm text-green-700 mb-2">
                        <span className="font-medium">Destination:</span> {activeDelivery.venue}
                      </p>
                      <p className="text-sm text-green-700">
                        {activeDelivery.specialInstructions}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle>Order Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Badge className={`${getStatusBadge(activeDelivery.status)} border mb-3`}>
                        {typeof activeDelivery.status === 'string' ? activeDelivery.status.replace(/_/g, ' ').toUpperCase() : 'UNKNOWN'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-slate-600" />
                      <div>
                        <p className="text-sm text-slate-600">Client</p>
                        <p className="font-medium text-slate-900">{activeDelivery.clientName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-slate-600" />
                      <div>
                        <p className="text-sm text-slate-600">Contact</p>
                        <a href={`tel:${activeDelivery.clientPhone}`} className="font-medium text-blue-600 hover:text-blue-700">
                          {activeDelivery.clientPhone}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-slate-600" />
                      <div>
                        <p className="text-sm text-slate-600">Event Type</p>
                        <p className="font-medium text-slate-900">{activeDelivery.eventType}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Package className="w-5 h-5 text-slate-600" />
                      <div>
                        <p className="text-sm text-slate-600">Guest Count</p>
                        <p className="font-medium text-slate-900">{activeDelivery.guestCount} guests</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <DollarSign className="w-5 h-5 text-slate-600" />
                      <div>
                        <p className="text-sm text-slate-600">Estimated Earnings</p>
                        <p className="font-medium text-slate-900">R{activeDelivery.estimatedEarnings}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50">
                  <CardHeader>
                    <CardTitle className="text-lg">Safety Reminders</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-700">
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs mt-0.5">1</div>
                      <p>Verify all food items before leaving kitchen</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs mt-0.5">2</div>
                      <p>Maintain proper food temperature during transport</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs mt-0.5">3</div>
                      <p>Call client 15 minutes before arrival</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs mt-0.5">4</div>
                      <p>Update delivery status at each step</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {availableJobs.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Available Jobs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {availableJobs.map((job) => (
                <Card key={job.id} className="border-0 shadow-lg hover:shadow-xl transition-all">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg mb-1">{job.eventType}</CardTitle>
                        <p className="text-sm text-slate-600">Order #{job.id}</p>
                      </div>
                      {job.urgent && (
                        <Badge className="bg-red-100 text-red-700 border-red-200">
                          Urgent
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-slate-600" />
                      <span className="text-slate-700">{job.clientName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-slate-600" />
                      <span className="text-slate-700">{job.venue}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-slate-600" />
                      <span className="text-slate-700">Pickup: {job.pickupTime} | Deliver: {job.deliveryTime}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Package className="w-4 h-4 text-slate-600" />
                      <span className="text-slate-700">{job.guestCount} guests</span>
                    </div>
                    <div className="pt-3 border-t flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-600">Estimated Earnings</p>
                        <p className="text-lg font-bold text-green-600">R{job.estimatedEarnings}</p>
                      </div>
                      <Button 
                        onClick={() => handleAcceptJob(job.id)}
                        size="sm"
                        className="bg-gradient-to-r from-green-500 to-emerald-500"
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
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Recently Completed</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {completedJobs.map((job) => (
                <Card key={job.id} className="border-0 shadow-lg">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-slate-900">{job.clientName}</p>
                        <p className="text-sm text-slate-600">{job.eventType}</p>
                      </div>
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-600">Earned</p>
                        <p className="text-lg font-bold text-green-600">R{job.earnings}</p>
                      </div>
                      <div className="flex gap-1">
                        {[...Array(job.rating)].map((_, i) => (
                          <div key={i} className="w-4 h-4 rounded-full bg-yellow-400" />
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
