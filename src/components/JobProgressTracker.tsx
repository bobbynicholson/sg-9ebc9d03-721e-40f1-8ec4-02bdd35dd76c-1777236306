import React, { useState } from "react";
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
  CheckCircle,
  Info,
  AlertTriangle
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface JobStep {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "completed" | "current" | "pending";
  timestamp?: string;
  description: string;
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
  isPriority?: boolean;
  isBehindSchedule?: boolean;
}

export function JobProgressTracker({ 
  currentStatus, 
  orderData, 
  clientName, 
  eventDate,
  orderNumber,
  isPriority = false,
  isBehindSchedule = false
}: JobProgressTrackerProps) {
  
  const steps: JobStep[] = [
    {
      id: "quote",
      label: "Quote Sent",
      icon: FileText,
      status: orderData.quote_sent ? "completed" : "pending",
      timestamp: orderData.quote_sent,
      description: "Initial quote has been sent to the client via email. Waiting for client review and response."
    },
    {
      id: "confirmed",
      label: "Confirmed",
      icon: CheckCircle2,
      status: orderData.quote_accepted ? "completed" : currentStatus === "quote_sent" ? "current" : "pending",
      timestamp: orderData.quote_accepted,
      description: "Client has accepted the quote and confirmed their booking. Order is now locked in the system."
    },
    {
      id: "payment",
      label: "Payment Received",
      icon: CheckCircle,
      status: orderData.payment_confirmed ? "completed" : currentStatus === "quote_accepted" ? "current" : "pending",
      timestamp: orderData.payment_confirmed,
      description: "Deposit or full payment has been received and verified. Order is financially secured."
    },
    {
      id: "kitchen",
      label: "Kitchen Prep",
      icon: ChefHat,
      status: orderData.kitchen_assigned ? "completed" : currentStatus === "payment_confirmed" ? "current" : "pending",
      timestamp: orderData.kitchen_assigned,
      description: "Order has been assigned to kitchen team. Prep will begin 24-48 hours before the event date."
    },
    {
      id: "driver",
      label: "Driver Assigned",
      icon: Truck,
      status: orderData.driver_assigned ? "completed" : currentStatus === "kitchen_assigned" ? "current" : "pending",
      timestamp: orderData.driver_assigned,
      description: "Delivery driver has been assigned and notified. Driver can see pickup time and venue details."
    },
    {
      id: "transit",
      label: "In Transit",
      icon: Navigation,
      status: orderData.in_transit ? "completed" : currentStatus === "driver_assigned" ? "current" : "pending",
      timestamp: orderData.in_transit,
      description: "Driver has picked up food and equipment from kitchen. GPS tracking active for client visibility."
    },
    {
      id: "delivered",
      label: "Delivered",
      icon: PackageCheck,
      status: orderData.delivered ? "completed" : currentStatus === "in_transit" ? "current" : "pending",
      timestamp: orderData.delivered,
      description: "Food and equipment delivered to venue. Client confirmation received. Event is now in progress."
    },
    {
      id: "equipment",
      label: "Equipment Return",
      icon: Utensils,
      status: orderData.equipment_returned ? "completed" : currentStatus === "delivered" ? "current" : "pending",
      timestamp: orderData.equipment_returned,
      description: "Driver collects equipment from venue. All items checked and returned to kitchen for cleaning."
    }
  ];

  const completedSteps = steps.filter(s => s.status === "completed").length;
  const progressPercentage = (completedSteps / steps.length) * 100;

  const cardClassName = isBehindSchedule 
    ? "w-full shadow-lg border-2 border-orange-500 animate-pulse"
    : isPriority
    ? "w-full shadow-lg border-4 border-purple-500"
    : "w-full shadow-lg border-2 border-purple-100";

  return (
    <Card className={cardClassName}>
      <CardContent className="pt-6 pb-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-2xl font-bold text-gray-900">{clientName}</h3>
                {isBehindSchedule && (
                  <Badge className="bg-orange-500 text-white animate-pulse">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Behind Schedule
                  </Badge>
                )}
                {isPriority && !isBehindSchedule && (
                  <Badge className="bg-purple-600 text-white">
                    Priority Task
                  </Badge>
                )}
              </div>
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
              className={`absolute top-1/2 left-0 h-2 rounded-full -translate-y-1/2 transition-all duration-1000 ${
                isBehindSchedule 
                  ? "bg-gradient-to-r from-orange-600 to-red-600" 
                  : "bg-gradient-to-r from-purple-600 to-pink-600"
              }`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            
            return (
              <div key={step.id} className="flex flex-col items-center relative">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div 
                        className={`
                          w-16 h-16 rounded-full flex items-center justify-center mb-3 relative z-10 transition-all duration-300 cursor-help
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

                        <div className="absolute -bottom-2 -right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow-lg">
                          <Info className="w-3 h-3 text-white" />
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-semibold mb-1">{step.label}</p>
                      <p className="text-sm">{step.description}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

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

        <div className={`mt-8 p-4 rounded-lg border ${
          isBehindSchedule
            ? "bg-gradient-to-r from-orange-50 to-red-50 border-orange-200"
            : "bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                isBehindSchedule
                  ? "bg-gradient-to-br from-orange-600 to-red-600"
                  : "bg-gradient-to-br from-purple-600 to-pink-600"
              }`}>
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
                <p className={`text-sm font-semibold ${isBehindSchedule ? "text-orange-700" : "text-purple-700"}`}>
                  Next Step:
                </p>
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
