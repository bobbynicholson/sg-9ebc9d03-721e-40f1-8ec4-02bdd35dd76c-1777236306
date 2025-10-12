import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  CheckCircle2, 
  ChefHat, 
  Truck, 
  Navigation, 
  PackageCheck, 
  Utensils,
  Clock,
  CheckCircle
} from "lucide-react";

interface JobStep {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "completed" | "current" | "pending";
  timestamp?: string;
}

interface JobProgressTrackerProps {
  currentStatus: string;
  orderData: {
    quote_sent?: string;
    quote_accepted?: string;
    payment_confirmed?: string;
    kitchen_assigned?: string;
    driver_assigned?: string;
    in_transit?: string;
    delivered?: string;
    equipment_returned?: string;
    completed?: string;
  };
  clientName: string;
  eventDate: string;
  orderNumber: string;
}

export function JobProgressTracker({ 
  currentStatus, 
  orderData, 
  clientName, 
  eventDate,
  orderNumber 
}: JobProgressTrackerProps) {
  
  const steps: JobStep[] = [
    {
      id: "quote",
      label: "Quote Sent",
      icon: FileText,
      status: orderData.quote_sent ? "completed" : "pending",
      timestamp: orderData.quote_sent
    },
    {
      id: "confirmed",
      label: "Confirmed",
      icon: CheckCircle2,
      status: orderData.quote_accepted ? "completed" : currentStatus === "quote_sent" ? "current" : "pending",
      timestamp: orderData.quote_accepted
    },
    {
      id: "payment",
      label: "Payment Received",
      icon: CheckCircle,
      status: orderData.payment_confirmed ? "completed" : currentStatus === "quote_accepted" ? "current" : "pending",
      timestamp: orderData.payment_confirmed
    },
    {
      id: "kitchen",
      label: "Kitchen Prep",
      icon: ChefHat,
      status: orderData.kitchen_assigned ? "completed" : currentStatus === "payment_confirmed" ? "current" : "pending",
      timestamp: orderData.kitchen_assigned
    },
    {
      id: "driver",
      label: "Driver Assigned",
      icon: Truck,
      status: orderData.driver_assigned ? "completed" : currentStatus === "kitchen_assigned" ? "current" : "pending",
      timestamp: orderData.driver_assigned
    },
    {
      id: "transit",
      label: "In Transit",
      icon: Navigation,
      status: orderData.in_transit ? "completed" : currentStatus === "driver_assigned" ? "current" : "pending",
      timestamp: orderData.in_transit
    },
    {
      id: "delivered",
      label: "Delivered",
      icon: PackageCheck,
      status: orderData.delivered ? "completed" : currentStatus === "in_transit" ? "current" : "pending",
      timestamp: orderData.delivered
    },
    {
      id: "equipment",
      label: "Equipment Return",
      icon: Utensils,
      status: orderData.equipment_returned ? "completed" : currentStatus === "delivered" ? "current" : "pending",
      timestamp: orderData.equipment_returned
    }
  ];

  const completedSteps = steps.filter(s => s.status === "completed").length;
  const progressPercentage = (completedSteps / steps.length) * 100;

  return (
    <Card className="w-full shadow-lg border-2 border-purple-100">
      <CardContent className="pt-6 pb-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">{clientName}</h3>
              <p className="text-sm text-gray-600">Order #{orderNumber}</p>
            </div>
            <div className="text-right">
              <Badge className="bg-purple-600 text-white mb-2">
                {completedSteps} of {steps.length} Complete
              </Badge>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="w-4 h-4" />
                <span>{new Date(eventDate).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute top-1/2 left-0 w-full h-2 bg-gray-200 rounded-full -translate-y-1/2" />
            <div 
              className="absolute top-1/2 left-0 h-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full -translate-y-1/2 transition-all duration-1000"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            
            return (
              <div key={step.id} className="flex flex-col items-center relative">
                <div 
                  className={`
                    w-16 h-16 rounded-full flex items-center justify-center mb-3 relative z-10 transition-all duration-300
                    ${step.status === "completed" 
                      ? "bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/50 scale-110" 
                      : step.status === "current"
                      ? "bg-gradient-to-br from-purple-600 to-pink-600 shadow-lg shadow-purple-500/50 animate-pulse scale-110"
                      : "bg-gray-200"
                    }
                  `}
                >
                  <Icon 
                    className={`
                      w-8 h-8
                      ${step.status === "completed" || step.status === "current" 
                        ? "text-white" 
                        : "text-gray-400"
                      }
                    `} 
                  />
                  
                  {step.status === "completed" && (
                    <div className="absolute -top-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-lg">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                  )}
                  
                  {step.status === "current" && (
                    <div className="absolute inset-0 rounded-full border-4 border-purple-600 animate-ping opacity-75" />
                  )}
                </div>

                <div className="text-center">
                  <p 
                    className={`
                      text-xs font-semibold mb-1
                      ${step.status === "completed" 
                        ? "text-green-700" 
                        : step.status === "current"
                        ? "text-purple-700"
                        : "text-gray-500"
                      }
                    `}
                  >
                    {step.label}
                  </p>
                  
                  {step.timestamp && (
                    <p className="text-xs text-gray-500">
                      {new Date(step.timestamp).toLocaleString()}
                    </p>
                  )}
                  
                  {step.status === "current" && !step.timestamp && (
                    <Badge className="bg-purple-100 text-purple-700 text-xs mt-1 border-purple-200">
                      In Progress
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">
                  {Math.round(progressPercentage)}%
                </span>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Overall Progress</p>
                <p className="text-sm text-gray-600">
                  {completedSteps === steps.length 
                    ? "Job Complete! 🎉" 
                    : `${steps.length - completedSteps} steps remaining`
                  }
                </p>
              </div>
            </div>

            {completedSteps < steps.length && (
              <div className="text-right">
                <p className="text-sm font-semibold text-purple-700">Next Step:</p>
                <p className="text-xs text-gray-600">
                  {steps.find(s => s.status === "current")?.label || steps.find(s => s.status === "pending")?.label}
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
