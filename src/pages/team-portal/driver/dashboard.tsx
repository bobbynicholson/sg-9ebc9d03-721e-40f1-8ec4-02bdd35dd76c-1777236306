import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Truck,
  MapPin,
  Clock,
  CheckCircle,
  Navigation,
  TrendingUp,
  DollarSign,
  Sparkles,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { DriverNav } from "@/components/navigation/DriverNav";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { CateringDashGame } from "@/components/games/CateringDashGame";
import { ChatBot } from "@/components/ChatBot";
import Link from "next/link";

interface Job {
  id: string;
  client_name: string;
  address: string;
  guest_count: number;
  pickupTime: string;
  status: string;
  eventDate: string;
}

export default function DriverDashboard() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showGame, setShowGame] = useState(false);

  const driverName = user?.user_metadata?.full_name || "Driver";

  useEffect(() => {
    // Mock jobs data
    const mockJobs: Job[] = [
      {
        id: "JOB-001",
        client_name: "Sarah Johnson",
        address: "123 Main Street, Johannesburg",
        guest_count: 150,
        pickupTime: "14:30",
        status: "pending",
        eventDate: new Date().toISOString().split("T")[0],
      },
      {
        id: "JOB-002",
        client_name: "Corporate Event",
        address: "456 Business Park, Sandton",
        guest_count: 200,
        pickupTime: "18:00",
        status: "pending",
        eventDate: new Date().toISOString().split("T")[0],
      },
      {
        id: "JOB-003",
        client_name: "Wedding Reception",
        address: "789 Venue Road, Pretoria",
        guest_count: 180,
        pickupTime: "16:00",
        status: "completed",
        eventDate: new Date(Date.now() - 86400000).toISOString().split("T")[0],
      },
    ];

    setJobs(mockJobs);
  }, []);

  const todaysJobs = jobs.filter(
    (j) => j.eventDate === new Date().toISOString().split("T")[0]
  );
  const completedToday = todaysJobs.filter((j) => j.status === "completed").length;
  const totalEarnings = 3850; // Mock earnings

  const openNavigation = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`, "_blank");
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Driver Dashboard - CateringMS</title>
      </Head>

      <DriverNav />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-6 sm:py-8 lg:py-12 max-w-7xl">
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

            {/* Today's Earnings Summary - NEW */}
            <Card className="border-0 shadow-lg bg-gradient-to-r from-green-50 to-emerald-50 mb-6">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Today's Potential Earnings</p>
                    <div className="text-4xl font-bold text-green-600">
                      R{(todaysJobs.length * 250).toFixed(0)}
                    </div>
                    <p className="text-sm text-slate-600 mt-2">
                      {todaysJobs.length} {todaysJobs.length === 1 ? 'delivery' : 'deliveries'} scheduled • 
                      {completedToday} completed
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mb-2">
                      <TrendingUp className="w-10 h-10 text-white" />
                    </div>
                    <p className="text-xs text-slate-600">Outstanding</p>
                    <p className="text-lg font-bold text-slate-900">R{totalEarnings.toFixed(0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Today's Route Overview - SIMPLIFIED */}
            {todaysJobs.length > 0 && (
              <Card className="border-0 shadow-lg mb-6">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Navigation className="w-5 h-5 text-blue-600" />
                      Today's Route Overview
                    </CardTitle>
                    <Link href="/team-portal/driver/routes">
                      <Button size="sm" variant="outline">
                        View Full Route
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {todaysJobs.slice(0, 3).map((job, index) => (
                      <div key={job.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{job.client_name}</p>
                          <p className="text-xs text-slate-600 truncate">{job.address}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-slate-900">{job.pickupTime}</p>
                          <p className="text-xs text-slate-600">{job.guest_count} pax</p>
                        </div>
                      </div>
                    ))}
                    {todaysJobs.length > 3 && (
                      <p className="text-sm text-slate-600 text-center">
                        +{todaysJobs.length - 3} more stops
                      </p>
                    )}
                  </div>
                  <Link href="/team-portal/driver/routes">
                    <Button className="w-full mt-4">
                      <Navigation className="w-4 h-4 mr-2" />
                      View Optimized Route
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 md:pt-6 px-3 md:px-6 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600">Today's Jobs</p>
                    <p className="text-xl md:text-2xl font-bold text-slate-900">{todaysJobs.length}</p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-blue-100 flex items-center justify-center self-end md:self-auto">
                    <Truck className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 md:pt-6 px-3 md:px-6 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600">Completed</p>
                    <p className="text-xl md:text-2xl font-bold text-green-600">{completedToday}</p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-green-100 flex items-center justify-center self-end md:self-auto">
                    <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 md:pt-6 px-3 md:px-6 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600">Pending</p>
                    <p className="text-xl md:text-2xl font-bold text-orange-600">
                      {todaysJobs.length - completedToday}
                    </p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-orange-100 flex items-center justify-center self-end md:self-auto">
                    <Clock className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-4 md:pt-6 px-3 md:px-6 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs md:text-sm text-slate-600">Earnings</p>
                    <p className="text-xl md:text-2xl font-bold text-green-600">
                      R{totalEarnings}
                    </p>
                  </div>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-green-100 flex items-center justify-center self-end md:self-auto">
                    <DollarSign className="w-5 h-5 md:w-6 md:h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Deliveries List */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="px-4 md:px-6">
              <CardTitle className="text-lg md:text-xl">My Deliveries</CardTitle>
            </CardHeader>
            <CardContent className="px-4 md:px-6">
              <div className="space-y-3">
                {jobs.length === 0 ? (
                  <div className="text-center py-8 text-slate-600">No deliveries scheduled</div>
                ) : (
                  jobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 md:p-4 rounded-lg border-2 border-slate-200 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h4 className="font-semibold text-sm md:text-base text-slate-900">
                            {job.client_name}
                          </h4>
                          <Badge
                            className={
                              job.status === "completed"
                                ? "bg-green-100 text-green-800"
                                : "bg-orange-100 text-orange-800"
                            }
                          >
                            {job.status}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-xs md:text-sm text-slate-600">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{job.address}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 flex-shrink-0" />
                            <span>Pickup: {job.pickupTime}</span>
                            <span>•</span>
                            <span>{job.guest_count} guests</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openNavigation(job.address)}
                          className="flex-1 sm:flex-none"
                        >
                          <Navigation className="w-4 h-4 sm:mr-2" />
                          <span className="hidden sm:inline">Navigate</span>
                        </Button>
                        {job.status === "pending" && (
                          <Button size="sm" className="flex-1 sm:flex-none">
                            Start Job
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Footer />
      </div>

      {showGame && <CateringDashGame onClose={() => setShowGame(false)} />}
      
      {/* AI Chatbot */}
      <ChatBot userRole="driver" companyId={user?.user_metadata?.company_id} />
    </>
  );
}