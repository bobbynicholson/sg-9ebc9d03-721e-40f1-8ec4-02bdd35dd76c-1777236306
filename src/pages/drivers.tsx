import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Truck,
  MapPin,
  Clock,
  Calendar,
  DollarSign,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  PlayCircle,
  Sparkles,
  Phone,
  Navigation,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Quote } from "@/types";
import { DriverEarnings } from "@/components/DriverEarnings";
import { Footer } from "@/components/Footer";
import { mockOrders } from "@/lib/mockData";
import { regionManagement } from "@/lib/regionManagement";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { CateringDashGame } from "@/components/games/CateringDashGame";
import { useAuth } from "@/contexts/AuthContext";

interface DeliveryJob extends Quote {
  pickupTime: string;
  deliveryTime: string;
  address: string;
  driverAssigned?: string;
}

export default function DriversPage() {
  const { user } = useAuth();
  const [availableJobs, setAvailableJobs] = useState<DeliveryJob[]>([]);
  const [myJobs, setMyJobs] = useState<DeliveryJob[]>([]);
  const [completedToday, setCompletedToday] = useState(3);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [showGame, setShowGame] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  
  const driverName = user?.full_name || "Driver";

  useEffect(() => {
    const onboardingShown = localStorage.getItem("driver_onboarding_shown");
    if (onboardingShown) {
      setShowOnboarding(false);
    }
  }, []);

  const dismissOnboarding = () => {
    localStorage.setItem("driver_onboarding_shown", "true");
    setShowOnboarding(false);
  };

  useEffect(() => {
    let assignments = JSON.parse(localStorage.getItem("order_assignments") || "[]");
    
    if (assignments.length === 0) {
      assignments = regionManagement.orderAssignments;
      localStorage.setItem("order_assignments", JSON.stringify(assignments));
    }
    
    const availableAssignments = assignments.filter((a: any) => 
      (a.status === "accepted" || a.status === "in_progress") && !a.driverAssigned
    );
    
    const myAssignments = assignments.filter((a: any) => 
      a.driverAssigned === driverName
    );
    
    const mapAssignmentToJob = (assignment: any): DeliveryJob | null => {
      const order = mockOrders.find(o => o.id === assignment.orderId);
      if (!order) return null;
      
      return {
        ...order,
        id: order.id,
        lead_id: `L-${order.id}`,
        user_id: "mock-user-id",
        client_name: order.client_name,
        client_email: order.client_name.toLowerCase().replace(/\s+/g, '.') + "@example.com",
        event_date: order.event_date,
        guest_count: order.guest_count,
        pickupTime: "14:00",
        deliveryTime: "16:00",
        address: order.venue_address,
        driverAssigned: assignment.driverAssigned || undefined,
        menu_items: order.menu_items as any,
        equipment_items: order.equipment_items as any,
        status: "accepted" as const,
        subtotal: (order.total ?? 0) * 0.87,
        tax: (order.total ?? 0) * 0.13,
        total: order.total ?? 0,
        created_at: order.created_at,
        updated_at: order.created_at,
        viewed_at: null,
        accepted_at: null,
        client_phone: null,
        currency: "ZAR",
        event_time: "18:00",
        region_id: null,
        sent_at: order.created_at,
        venue_address: order.venue_address,
        notes: "Mock order, driver assignment pending.",
        quote_number: `QT-${order.id}`,
        terms: "Standard mock terms.",
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
    };

    const availableJobsList = availableAssignments
      .map(mapAssignmentToJob)
      .filter(Boolean) as DeliveryJob[];
    
    const myJobsList = myAssignments
      .map(mapAssignmentToJob)
      .filter(Boolean) as DeliveryJob[];

    setAvailableJobs(availableJobsList);
    setMyJobs(myJobsList);

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
    const assignments = JSON.parse(localStorage.getItem("order_assignments") || "[]");
    const updatedAssignments = assignments.map((a: any) => {
      if (a.orderId === jobId) {
        return { ...a, driverAssigned: driverName, status: "in_progress" };
      }
      return a;
    });
    localStorage.setItem("order_assignments", JSON.stringify(updatedAssignments));
    
    setAvailableJobs(prev => prev.filter(j => j.id !== jobId));
    const job = availableJobs.find(j => j.id === jobId);
    if (job) {
      setMyJobs(prev => [...prev, { ...job, driverAssigned: driverName }]);
    }
  };

  const todaysJobs = myJobs.filter(job => {
    const today = new Date().toDateString();
    return new Date(job.event_date).toDateString() === today;
  });

  const upcomingJobs = myJobs.filter(job => {
    const today = new Date();
    return new Date(job.event_date) > today;
  });

  const openNavigation = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50">
      <NoIndexMeta />
      <div className="container mx-auto px-4 py-4 sm:py-6 max-w-7xl">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1">
                Welcome back, {driverName.split(' ')[0]}! 👋
              </h1>
              <p className="text-sm sm:text-base text-slate-600">Here's what's happening today</p>
            </div>
            <Button
              onClick={() => setShowGame(true)}
              className="bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white h-12 px-6"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Play Game
            </Button>
          </div>

          {/* Quick Stats - Mobile Optimized */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <Card className="border-0 shadow-md bg-gradient-to-br from-blue-50 to-blue-100">
              <CardContent className="p-4 sm:pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-500 flex items-center justify-center mb-2 sm:mb-3">
                    <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-900">{todaysJobs.length}</p>
                  <p className="text-xs sm:text-sm text-blue-700 mt-1">Today's Jobs</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md bg-gradient-to-br from-purple-50 to-purple-100">
              <CardContent className="p-4 sm:pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-purple-500 flex items-center justify-center mb-2 sm:mb-3">
                    <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-purple-900">{availableJobs.length}</p>
                  <p className="text-xs sm:text-sm text-purple-700 mt-1">Available</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md bg-gradient-to-br from-green-50 to-emerald-100">
              <CardContent className="p-4 sm:pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-green-500 flex items-center justify-center mb-2 sm:mb-3">
                    <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-green-900">{completedToday}</p>
                  <p className="text-xs sm:text-sm text-green-700 mt-1">Completed</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md bg-gradient-to-br from-amber-50 to-orange-100">
              <CardContent className="p-4 sm:pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-amber-500 flex items-center justify-center mb-2 sm:mb-3">
                    <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-amber-900">R{totalEarnings.toFixed(0)}</p>
                  <p className="text-xs sm:text-sm text-amber-700 mt-1">Owing</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quick Start Guide for New Drivers */}
        {showOnboarding && myJobs.length === 0 && (
          <Card className="border-2 border-blue-200 shadow-lg mb-6 bg-gradient-to-br from-blue-50 to-indigo-50">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-blue-900 text-lg sm:text-xl">
                    <PlayCircle className="w-5 h-5" />
                    Quick Start Guide
                  </CardTitle>
                  <CardDescription className="text-blue-700 mt-2">
                    Welcome to the driver portal! Here's how to get started:
                  </CardDescription>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={dismissOnboarding}
                  className="h-8 w-8 p-0"
                >
                  ✕
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0 text-sm">1</div>
                <div>
                  <p className="font-semibold text-blue-900 text-sm sm:text-base">Browse Available Jobs</p>
                  <p className="text-xs sm:text-sm text-blue-700">Check the "Available Jobs" tab below to see delivery opportunities</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0 text-sm">2</div>
                <div>
                  <p className="font-semibold text-blue-900 text-sm sm:text-base">Accept a Job</p>
                  <p className="text-xs sm:text-sm text-blue-700">Click "Book This Job" to accept a delivery assignment</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0 text-sm">3</div>
                <div>
                  <p className="font-semibold text-blue-900 text-sm sm:text-base">Start GPS Tracking</p>
                  <p className="text-xs sm:text-sm text-blue-700">Enable GPS tracking when you begin your delivery</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0 text-sm">4</div>
                <div>
                  <p className="font-semibold text-blue-900 text-sm sm:text-base">Get Paid!</p>
                  <p className="text-xs sm:text-sm text-blue-700">Track your earnings and get paid for completed deliveries</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content - Tabbed Interface */}
        <Tabs defaultValue="today" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-md h-12">
            <TabsTrigger value="today" className="text-sm sm:text-base">Today</TabsTrigger>
            <TabsTrigger value="available" className="text-sm sm:text-base">Available</TabsTrigger>
            <TabsTrigger value="upcoming" className="text-sm sm:text-base">Upcoming</TabsTrigger>
          </TabsList>

          {/* Today's Jobs */}
          <TabsContent value="today" className="space-y-4">
            {todaysJobs.length === 0 ? (
              <Card className="border-0 shadow-md">
                <CardContent className="py-12 sm:py-16 text-center px-4">
                  <Calendar className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">No jobs scheduled for today</h3>
                  <p className="text-sm sm:text-base text-slate-500 mb-6">Check the Available Jobs tab to find new opportunities</p>
                  <Button 
                    onClick={() => document.querySelector('[value="available"]')?.dispatchEvent(new MouseEvent('click'))}
                    className="h-12 px-6"
                  >
                    Browse Available Jobs
                  </Button>
                </CardContent>
              </Card>
            ) : (
              todaysJobs.map((job) => (
                <Card key={job.id} className="border-0 shadow-md hover:shadow-lg transition-all">
                  <CardHeader className="pb-3 sm:pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base sm:text-lg mb-2 truncate">{job.client_name}</CardTitle>
                        <div className="space-y-1.5 text-xs sm:text-sm text-slate-600">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 flex-shrink-0" />
                            <span className="font-medium">{job.pickupTime}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{job.address}</span>
                          </div>
                        </div>
                      </div>
                      <Badge className="bg-green-100 text-green-700 border-green-200 flex-shrink-0">
                        Today
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Primary Action - Large Button */}
                    <Link href={`/tracking/driver?orderId=${job.id}`} className="block">
                      <Button className="w-full h-14 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-base sm:text-lg font-semibold shadow-md">
                        <PlayCircle className="w-5 h-5 mr-2" />
                        Start Delivery
                      </Button>
                    </Link>
                    
                    {/* Secondary Actions - Grid */}
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      <Button 
                        variant="outline"
                        onClick={() => openNavigation(job.address)}
                        className="h-12 border-2"
                      >
                        <Navigation className="w-4 h-4 mr-2" />
                        Navigate
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                        className="h-12 border-2"
                      >
                        {expandedJob === job.id ? (
                          <ChevronUp className="w-4 h-4 mr-2" />
                        ) : (
                          <ChevronDown className="w-4 h-4 mr-2" />
                        )}
                        Details
                      </Button>
                    </div>

                    {/* Expandable Details */}
                    {expandedJob === job.id && (
                      <div className="mt-4 pt-4 border-t space-y-3">
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-600">Guests:</span>
                            <span className="font-semibold">{job.guest_count}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Event Time:</span>
                            <span className="font-semibold">{job.event_time || "TBD"}</span>
                          </div>
                        </div>
                        
                        <Button 
                          variant="outline"
                          onClick={() => setSelectedJob(selectedJob === job.id ? null : job.id)}
                          className="w-full h-11"
                        >
                          <TrendingUp className="w-4 h-4 mr-2" />
                          {selectedJob === job.id ? "Hide" : "View"} Earnings
                        </Button>
                        
                        {selectedJob === job.id && (
                          <div className="pt-3 border-t">
                            <DriverEarnings
                              driverId="driver-1"
                              jobId={job.id}
                              hourlyRate={150}
                              perKmRate={8}
                              isAdmin={false}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Available Jobs */}
          <TabsContent value="available" className="space-y-4">
            {availableJobs.length === 0 ? (
              <Card className="border-0 shadow-md">
                <CardContent className="py-12 sm:py-16 text-center px-4">
                  <CheckCircle className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">No available jobs right now</h3>
                  <p className="text-sm sm:text-base text-slate-500">Check back soon for new delivery opportunities</p>
                </CardContent>
              </Card>
            ) : (
              availableJobs.map((job) => (
                <Card key={job.id} className="border-0 shadow-md hover:shadow-lg transition-all">
                  <CardHeader className="pb-3 sm:pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base sm:text-lg mb-2 truncate">{job.client_name}</CardTitle>
                        <div className="space-y-1.5 text-xs sm:text-sm text-slate-600">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 flex-shrink-0" />
                            <span>{new Date(job.event_date).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 flex-shrink-0" />
                            <span>Pickup: {job.pickupTime} | Delivery: {job.deliveryTime}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{job.address}</span>
                          </div>
                        </div>
                      </div>
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 flex-shrink-0">
                        Available
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      onClick={() => handleBookJob(job.id)}
                      className="w-full h-14 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-base sm:text-lg font-semibold shadow-md"
                    >
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Book This Job
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Upcoming Jobs */}
          <TabsContent value="upcoming" className="space-y-4">
            {upcomingJobs.length === 0 ? (
              <Card className="border-0 shadow-md">
                <CardContent className="py-12 sm:py-16 text-center px-4">
                  <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">No upcoming jobs</h3>
                  <p className="text-sm sm:text-base text-slate-500">Jobs scheduled for future dates will appear here</p>
                </CardContent>
              </Card>
            ) : (
              upcomingJobs.map((job) => (
                <Card key={job.id} className="border-0 shadow-md">
                  <CardHeader className="pb-3 sm:pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base sm:text-lg mb-2 truncate">{job.client_name}</CardTitle>
                        <div className="space-y-1.5 text-xs sm:text-sm text-slate-600">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 flex-shrink-0" />
                            <span>{new Date(job.event_date).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{job.address}</span>
                          </div>
                        </div>
                      </div>
                      <Badge className="bg-purple-100 text-purple-700 border-purple-200 flex-shrink-0">
                        Upcoming
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
      
      <Footer />
      
      {showGame && <CateringDashGame onClose={() => setShowGame(false)} />}
    </div>
  );
}
