import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Truck,
  ArrowLeft,
  MapPin,
  Clock,
  Users,
  CheckCircle,
  Calendar,
  DollarSign,
  TrendingUp,
  Settings,
  Gamepad2
} from "lucide-react";
import { Quote } from "@/types";
import { DriverEarnings } from "@/components/DriverEarnings";
import { Footer } from "@/components/Footer";
import { mockOrders } from "@/lib/mockData";
import { regionManagement } from "@/lib/regionManagement";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { CateringDashGame } from "@/components/games/CateringDashGame";

interface DeliveryJob extends Quote {
  pickupTime: string;
  deliveryTime: string;
  address: string;
  driverAssigned?: string;
}

export default function DriversPage() {
  const [availableJobs, setAvailableJobs] = useState<DeliveryJob[]>([]);
  const [myJobs, setMyJobs] = useState<DeliveryJob[]>([]);
  const [driverName] = useState("James Wilson");
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showGame, setShowGame] = useState(false);
  
  const [hourlyRate, setHourlyRate] = useState(150);
  const [perKmRate, setPerKmRate] = useState(8);
  const [totalEarnings, setTotalEarnings] = useState(0);

  useEffect(() => {
    const storedRates = localStorage.getItem("driver_rates");
    if (storedRates) {
      const rates = JSON.parse(storedRates);
      setHourlyRate(rates.hourlyRate || 150);
      setPerKmRate(rates.perKmRate || 8);
    }

    // Get order assignments from localStorage or regionManagement
    let assignments = JSON.parse(localStorage.getItem("order_assignments") || "[]");
    
    // If localStorage is empty, use default regionManagement assignments
    if (assignments.length === 0) {
      assignments = regionManagement.orderAssignments;
      localStorage.setItem("order_assignments", JSON.stringify(assignments));
    }
    
    console.log("All assignments:", assignments);
    
    // Get assignments that have been accepted by regions - these are available for drivers
    const availableAssignments = assignments.filter((a: any) => 
      (a.status === "accepted" || a.status === "in_progress") && !a.driverAssigned
    );
    
    console.log("Available for driver pickup:", availableAssignments);
    
    // Get assignments that this driver has booked
    const myAssignments = assignments.filter((a: any) => 
      a.driverAssigned === driverName
    );
    
    console.log("My driver assignments:", myAssignments);
    
    // Map assignments to delivery jobs from mockOrders
    const mapAssignmentToJob = (assignment: any): DeliveryJob | null => {
      const order = mockOrders.find(o => o.id === assignment.orderId);
      console.log(`Mapping assignment ${assignment.orderId}:`, order ? "FOUND ORDER" : "ORDER NOT FOUND");
      
      if (!order) return null;
      
      return {
        ...order,
        id: order.id,
        lead_id: order.quoteId,
        client_name: order.clientName,
        client_email: order.clientName.toLowerCase().replace(/\s+/g, '.') + "@example.com",
        event_date: order.eventDate,
        guest_count: order.guestCount,
        pickupTime: "14:00",
        deliveryTime: "16:00",
        address: order.location,
        driverAssigned: assignment.driverAssigned || undefined,
        menu_items: order.menuItems as any,
        equipment_items: order.equipmentItems as any,
        status: "accepted" as const,
        subtotal: order.totalAmount * 0.87,
        tax: order.totalAmount * 0.13,
        total: order.totalAmount,
        created_at: order.createdAt,
        updated_at: order.createdAt,
        viewed_at: null,
        accepted_at: null,
        client_phone: null,
        currency: "ZAR",
        event_time: "18:00",
        region_id: null,
        sent_at: new Date().toISOString(),
        venue_address: order.location,
      };
    };

    const availableJobsList = availableAssignments
      .map(mapAssignmentToJob)
      .filter(Boolean) as DeliveryJob[];
    
    const myJobsList = myAssignments
      .map(mapAssignmentToJob)
      .filter(Boolean) as DeliveryJob[];

    console.log("Available jobs for driver:", availableJobsList);
    console.log("My booked jobs:", myJobsList);

    setAvailableJobs(availableJobsList);
    setMyJobs(myJobsList);

    // Calculate total earnings
    let total = 0;
    [...availableJobsList, ...myJobsList].forEach(job => {
      const earnings = localStorage.getItem(`earnings_${job.id}`);
      if (earnings) {
        const parsed = JSON.parse(earnings);
        if (parsed.status !== "paid") {
          total += parsed.totalAmount || 0;
        }
      }
    });
    setTotalEarnings(total);
  }, [driverName]);

  const handleBookJob = (jobId: string) => {
    // Update the assignment in localStorage
    const assignments = JSON.parse(localStorage.getItem("order_assignments") || "[]");
    const updatedAssignments = assignments.map((a: any) => {
      if (a.orderId === jobId) {
        return { ...a, driverAssigned: driverName, status: "in_progress" };
      }
      return a;
    });
    localStorage.setItem("order_assignments", JSON.stringify(updatedAssignments));
    
    // Move job from available to my jobs
    setAvailableJobs(prev => prev.filter(j => j.id !== jobId));
    const job = availableJobs.find(j => j.id === jobId);
    if (job) {
      setMyJobs(prev => [...prev, { ...job, driverAssigned: driverName }]);
    }
  };

  const handleCompleteJob = (jobId: string) => {
    setMyJobs(prev => prev.filter(j => j.id !== jobId));
  };

  const handleSaveRates = () => {
    localStorage.setItem("driver_rates", JSON.stringify({ hourlyRate, perKmRate }));
    setShowSettings(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <NoIndexMeta />
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Link href="/">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>

        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg">
                <Truck className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Driver Portal
                </h1>
                <p className="text-slate-600 mt-1">Welcome back, {driverName}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowGame(true)}
                className="gap-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white border-0 hover:from-orange-600 hover:to-pink-600"
              >
                <Gamepad2 className="w-4 h-4" />
                Play Game
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowSettings(!showSettings)}
                className="gap-2"
              >
                <Settings className="w-4 h-4" />
                Payment Settings
              </Button>
            </div>
          </div>
        </div>

        {showSettings && (
          <Card className="border-0 shadow-lg mb-6 bg-gradient-to-br from-purple-50 to-pink-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Payment Rate Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hourlyRate">Hourly Rate (R)</Label>
                  <Input
                    id="hourlyRate"
                    type="number"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(Number(e.target.value))}
                    placeholder="150"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="perKmRate">Per Kilometer Rate (R)</Label>
                  <Input
                    id="perKmRate"
                    type="number"
                    value={perKmRate}
                    onChange={(e) => setPerKmRate(Number(e.target.value))}
                    placeholder="8"
                  />
                </div>
              </div>
              <Button 
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                onClick={handleSaveRates}
              >
                Save Rates
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Available Jobs</p>
                  <p className="text-3xl font-bold text-slate-900">{availableJobs.length}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-xl">
                  <Calendar className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">My Jobs</p>
                  <p className="text-3xl font-bold text-slate-900">{myJobs.length}</p>
                </div>
                <div className="p-3 bg-green-100 rounded-xl">
                  <Truck className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Completed Today</p>
                  <p className="text-3xl font-bold text-slate-900">3</p>
                </div>
                <div className="p-3 bg-purple-100 rounded-xl">
                  <CheckCircle className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-emerald-50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Total Owing</p>
                  <p className="text-3xl font-bold text-green-600">R{totalEarnings.toFixed(2)}</p>
                </div>
                <div className="p-3 bg-green-100 rounded-xl">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Available Jobs</h2>
              <div className="space-y-4">
                {availableJobs.length === 0 ? (
                  <Card className="border-0 shadow-md">
                    <CardContent className="py-12 text-center">
                      <Truck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500">No available jobs at the moment</p>
                    </CardContent>
                  </Card>
                ) : (
                  availableJobs.map((job) => (
                    <Card key={job.id} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">{job.client_name}</CardTitle>
                            <p className="text-sm text-slate-600 mt-1">{new Date(job.event_date).toDateString()}</p>
                          </div>
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                            Available
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Calendar className="w-4 h-4" />
                          <span>{new Date(job.event_date).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Clock className="w-4 h-4" />
                          <span>Pickup: {job.pickupTime} | Delivery: {job.deliveryTime}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <MapPin className="w-4 h-4" />
                          <span>{job.address}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Users className="w-4 h-4" />
                          <span>{job.guest_count} guests</span>
                        </div>
                        <Button 
                          className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                          onClick={() => handleBookJob(job.id)}
                        >
                          Book This Job
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">My Booked Jobs</h2>
              <div className="space-y-4">
                {myJobs.length === 0 ? (
                  <Card className="border-0 shadow-md">
                    <CardContent className="py-12 text-center">
                      <CheckCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500">No booked jobs yet</p>
                      <p className="text-sm text-slate-400 mt-1">Check available jobs to get started</p>
                    </CardContent>
                  </Card>
                ) : (
                  myJobs.map((job) => (
                    <Card key={job.id} className="border-0 shadow-md bg-gradient-to-br from-purple-50 to-pink-50">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">{job.client_name}</CardTitle>
                            <p className="text-sm text-slate-600 mt-1">{new Date(job.event_date).toDateString()}</p>
                          </div>
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            Booked
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Calendar className="w-4 h-4" />
                          <span>{new Date(job.event_date).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Clock className="w-4 h-4" />
                          <span>Pickup: {job.pickupTime} | Delivery: {job.deliveryTime}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <MapPin className="w-4 h-4" />
                          <span>{job.address}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Users className="w-4 h-4" />
                          <span>{job.guest_count} guests</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Link href={`/tracking/driver?orderId=${job.id}`}>
                            <Button variant="outline" className="w-full">
                              Start Tracking
                            </Button>
                          </Link>
                          <Button 
                            variant="outline"
                            className="w-full"
                            onClick={() => setSelectedJob(selectedJob === job.id ? null : job.id)}
                          >
                            {selectedJob === job.id ? "Hide" : "View"} Earnings
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </div>

          <div>
            {selectedJob ? (
              <DriverEarnings
                driverId="driver-1"
                jobId={selectedJob}
                hourlyRate={hourlyRate}
                perKmRate={perKmRate}
                isAdmin={false}
              />
            ) : (
              <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-pink-50">
                <CardContent className="py-12 text-center">
                  <DollarSign className="w-12 h-12 text-purple-300 mx-auto mb-3" />
                  <p className="text-slate-600 font-medium">Select a job to view earnings</p>
                  <p className="text-sm text-slate-500 mt-1">Track your time and distance automatically</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      
      <Footer />
      
      {showGame && <CateringDashGame onClose={() => setShowGame(false)} />}
    </div>
  );
}
