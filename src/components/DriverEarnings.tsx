
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign,
  Clock,
  Navigation,
  TrendingUp,
  Play,
  Square,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { DriverEarnings as DriverEarningsType } from "@/types";

interface DriverEarningsProps {
  driverId: string;
  jobId: string;
  hourlyRate: number;
  perKmRate: number;
  isAdmin?: boolean;
}

export function DriverEarnings({ driverId, jobId, hourlyRate, perKmRate, isAdmin = false }: DriverEarningsProps) {
  const [earnings, setEarnings] = useState<DriverEarningsType>({
    driverId,
    jobId,
    startTime: undefined,
    endTime: undefined,
    totalHours: 0,
    totalKm: 0,
    hourlyEarnings: 0,
    kmEarnings: 0,
    totalAmount: 0,
    status: "active"
  });

  const [isTracking, setIsTracking] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem(`earnings_${jobId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      setEarnings(parsed);
      if (parsed.status === "active" && parsed.startTime) {
        setIsTracking(true);
        const elapsed = Math.floor((Date.now() - new Date(parsed.startTime).getTime()) / 1000);
        setElapsedSeconds(elapsed);
      }
    }
  }, [jobId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTracking) {
      interval = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
        
        const hours = elapsedSeconds / 3600;
        const simulatedKm = (elapsedSeconds / 3600) * 45;
        
        setEarnings(prev => {
          const updated = {
            ...prev,
            totalHours: hours,
            totalKm: simulatedKm,
            hourlyEarnings: hours * hourlyRate,
            kmEarnings: simulatedKm * perKmRate,
            totalAmount: (hours * hourlyRate) + (simulatedKm * perKmRate)
          };
          localStorage.setItem(`earnings_${jobId}`, JSON.stringify(updated));
          return updated;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTracking, elapsedSeconds, hourlyRate, perKmRate, jobId]);

  const handleStartJob = () => {
    const now = new Date().toISOString();
    const updated = {
      ...earnings,
      startTime: now,
      status: "active" as const
    };
    setEarnings(updated);
    setIsTracking(true);
    localStorage.setItem(`earnings_${jobId}`, JSON.stringify(updated));
  };

  const handleStopJob = () => {
    const now = new Date().toISOString();
    const updated = {
      ...earnings,
      endTime: now,
      status: "completed" as const
    };
    setEarnings(updated);
    setIsTracking(false);
    localStorage.setItem(`earnings_${jobId}`, JSON.stringify(updated));
  };

  const handleMarkPaid = () => {
    const updated = {
      ...earnings,
      status: "paid" as const,
      paidAt: new Date().toISOString(),
      totalAmount: 0,
      hourlyEarnings: 0,
      kmEarnings: 0
    };
    setEarnings(updated);
    localStorage.setItem(`earnings_${jobId}`, JSON.stringify(updated));
    
    const notification = {
      id: Date.now().toString(),
      type: "payment",
      message: `Payment of R${earnings.totalAmount.toFixed(2)} has been processed`,
      timestamp: new Date().toISOString(),
      read: false
    };
    const notifications = JSON.parse(localStorage.getItem("notifications") || "[]");
    notifications.unshift(notification);
    localStorage.setItem("notifications", JSON.stringify(notifications));
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusBadge = () => {
    switch (earnings.status) {
      case "active":
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Active</Badge>;
      case "completed":
        return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Awaiting Payment</Badge>;
      case "paid":
        return <Badge className="bg-green-100 text-green-700 border-green-200">Paid</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Job Earnings
          </CardTitle>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-slate-600">Hourly Rate</p>
            <p className="text-2xl font-bold text-slate-900">R{hourlyRate}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-slate-600">Per Km Rate</p>
            <p className="text-2xl font-bold text-slate-900">R{perKmRate}</p>
          </div>
        </div>

        {earnings.startTime && (
          <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <div>
                  <p className="text-xs text-slate-600">Time</p>
                  <p className="text-lg font-bold text-slate-900">
                    {isTracking ? formatTime(elapsedSeconds) : `${earnings.totalHours?.toFixed(2)}h`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-green-600" />
                <div>
                  <p className="text-xs text-slate-600">Distance</p>
                  <p className="text-lg font-bold text-slate-900">{earnings.totalKm?.toFixed(1)} km</p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Time earnings:</span>
                <span className="font-semibold">R{earnings.hourlyEarnings.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Distance earnings:</span>
                <span className="font-semibold">R{earnings.kmEarnings.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-300">
                <span className="text-slate-900">Total Owing:</span>
                <span className="text-green-600">R{earnings.totalAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {!earnings.startTime && earnings.status === "active" && (
            <Button 
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
              onClick={handleStartJob}
            >
              <Play className="w-4 h-4 mr-2" />
              Start Job
            </Button>
          )}

          {isTracking && earnings.status === "active" && (
            <Button 
              className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700"
              onClick={handleStopJob}
            >
              <Square className="w-4 h-4 mr-2" />
              Stop Job
            </Button>
          )}

          {earnings.status === "completed" && isAdmin && (
            <Button 
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              onClick={handleMarkPaid}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Mark as Paid (R{earnings.totalAmount.toFixed(2)})
            </Button>
          )}

          {earnings.status === "paid" && (
            <div className="flex items-center justify-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-green-700 font-medium">Payment Completed</span>
            </div>
          )}
        </div>

        {earnings.status === "completed" && !isAdmin && (
          <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-orange-900">Payment Pending</p>
              <p className="text-xs text-orange-700 mt-1">
                Admin will process your payment of R{earnings.totalAmount.toFixed(2)} shortly
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
