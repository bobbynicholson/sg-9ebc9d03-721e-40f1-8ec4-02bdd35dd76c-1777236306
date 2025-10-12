import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Settings
} from "lucide-react";
import { Quote } from "@/types";
import { DriverEarnings } from "@/components/DriverEarnings";
import { Footer } from "@/components/Footer";
import { mockOrders } from "@/lib/mockData";

interface DeliveryJob extends Quote {
  pickupTime: string;
  deliveryTime: string;
  address: string;
  driverAssigned?: string;
}

export default function DriversPage() {
  const [availableJobs, setAvailableJobs] = useState<DeliveryJob[]>([]);
  const [myJobs, setMyJobs] = useState<DeliveryJob[]>([]);
  const [driverName] = useState("John Driver");
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  
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

    // Get order assignments from regionManagement
    const assignments = JSON.parse(localStorage.getItem("order_assignments") || "[]");
    
    // Get accepted/confirmed assignments that drivers can pick up
    const acceptedAssignments = assignments.filter((a: any) => 
      a.status === "accepted" || a.status === "in_progress"
    );
    
    // Map assignments to orders from mockOrders
    const jobs: DeliveryJob[] = acceptedAssignments.map((assignment: any) => {
      const order = mockOrders.find(o => o.id === assignment.orderId);
      if (!order) return null;
      
      return {
        ...order,
        id: order.id,
        clientName: order.clientName,
        eventDate: order.eventDate,
        eventType: order.menuItems[0]?.name || "Catering Event",
        guestCount: order.guestCount,
        pickupTime: "14:00",
        deliveryTime: "16:00",
        address: order.eventLocation || order.location,
        driverAssigned: order.assignedDriver === "D001" ? driverName : undefined,
        menuItems: order.menuItems,
        equipmentItems: order.equipmentItems,
        status: order.status,
        total: order.totalAmount,
      };
    }).filter(Boolean);

    // Separate into available and assigned jobs
    setAvailableJobs(jobs.filter(j => !j.driverAssigned));
    setMyJobs(jobs.filter(j => j.driverAssigned === driverName));

    // Calculate total earnings
    let total = 0;
    jobs.forEach(job => {
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
                            <CardTitle className="text-lg">{job.clientName}</CardTitle>
                            <p className="text-sm text-slate-600 mt-1">{job.eventType}</p>
                          </div>
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                            Available
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Calendar className="w-4 h-4" />
                          <span>{new Date(job.eventDate).toLocaleDateString()}</span>
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
                          <span>{job.guestCount} guests</span>
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
                            <CardTitle className="text-lg">{job.clientName}</CardTitle>
                            <p className="text-sm text-slate-600 mt-1">{job.eventType}</p>
                          </div>
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            Booked
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Calendar className="w-4 h-4" />
                          <span>{new Date(job.eventDate).toLocaleDateString()}</span>
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
                          <span>{job.guestCount} guests</span>
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
    </div>
  );
}
