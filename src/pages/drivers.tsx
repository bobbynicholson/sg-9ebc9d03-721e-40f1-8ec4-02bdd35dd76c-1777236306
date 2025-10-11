import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Truck,
  ArrowLeft,
  MapPin,
  Clock,
  Users,
  CheckCircle,
  Calendar
} from "lucide-react";
import { Quote } from "@/types";

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

  useEffect(() => {
    const storedQuotes = JSON.parse(localStorage.getItem("quotes") || "[]");
    const confirmedQuotes = storedQuotes.filter((q: Quote) => q.status === "accepted");
    
    const jobs: DeliveryJob[] = confirmedQuotes.map((quote: Quote) => ({
      ...quote,
      pickupTime: "14:00",
      deliveryTime: "16:00",
      address: "123 Event Street, City",
      driverAssigned: Math.random() > 0.5 ? driverName : undefined
    }));

    setAvailableJobs(jobs.filter(j => !j.driverAssigned));
    setMyJobs(jobs.filter(j => j.driverAssigned === driverName));
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
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl shadow-lg">
              <Truck className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                Driver Portal
              </h1>
              <p className="text-slate-600 mt-1">Welcome back, {driverName}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                        className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
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
                  <Card key={job.id} className="border-0 shadow-md bg-gradient-to-br from-green-50 to-emerald-50">
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
                          className="w-full bg-green-600 hover:bg-green-700"
                          onClick={() => handleCompleteJob(job.id)}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Complete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
