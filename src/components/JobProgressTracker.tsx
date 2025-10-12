import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  CheckCircle2, 
  CreditCard,
  ChefHat, 
  Truck, 
  Navigation, 
  PackageCheck, 
  Utensils,
  Clock,
  CheckCircle,
  Info,
  AlertTriangle,
  Shield,
  ArrowRight
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface JobStep {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "completed" | "current" | "pending";
  timestamp?: string;
  description: string;
  visibleToRoles: ("admin" | "staff" | "client")[];
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
  eventTime?: string;
  orderNumber: string;
  isPriority?: boolean;
  isBehindSchedule?: boolean;
  userRole?: "admin" | "staff" | "client";
  onOverrideComplete?: (orderId: string) => void;
  onMakeProgress?: (orderId: string, nextStatus: string) => void;
}

export function JobProgressTracker({ 
  currentStatus, 
  orderData, 
  clientName, 
  eventDate,
  eventTime = "12:00",
  orderNumber,
  isPriority = false,
  isBehindSchedule = false,
  userRole = "admin",
  onOverrideComplete,
  onMakeProgress
}: JobProgressTrackerProps) {
  
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const { toast } = useToast();

  // Parse event date and time to create full datetime
  const eventDateTime = new Date(`${eventDate}T${eventTime}`);
  const formattedDeliveryTime = format(eventDateTime, "EEEE, MMMM d, yyyy 'at' h:mm a");
  const timeUntilEvent = eventDateTime.getTime() - new Date().getTime();
  const hoursUntilEvent = Math.floor(timeUntilEvent / (1000 * 60 * 60));
  const daysUntilEvent = Math.floor(hoursUntilEvent / 24);

  const allSteps: JobStep[] = [
    {
      id: "quote",
      label: "Quote Sent",
      icon: FileText,
      status: orderData.quote_sent ? "completed" : "pending",
      timestamp: orderData.quote_sent,
      description: "Initial quote has been sent to the client via email. Waiting for client review and response.",
      visibleToRoles: ["admin"]
    },
    {
      id: "accepted",
      label: "Quote Accepted",
      icon: CheckCircle2,
      status: orderData.quote_accepted ? "completed" : currentStatus === "quote_sent" ? "current" : "pending",
      timestamp: orderData.quote_accepted,
      description: "Client has accepted the quote. Awaiting payment confirmation to proceed with booking.",
      visibleToRoles: ["admin"]
    },
    {
      id: "payment",
      label: "Payment Received",
      icon: CreditCard,
      status: orderData.payment_confirmed ? "completed" : currentStatus === "quote_accepted" ? "current" : "pending",
      timestamp: orderData.payment_confirmed,
      description: "Deposit or full payment has been received and verified. Order is now confirmed and locked in the system.",
      visibleToRoles: ["admin", "staff", "client"]
    },
    {
      id: "confirmed",
      label: "Order Confirmed",
      icon: CheckCircle,
      status: orderData.payment_confirmed ? "completed" : "pending",
      timestamp: orderData.payment_confirmed,
      description: "Payment confirmed! Your order is now officially booked. Our team will begin preparations.",
      visibleToRoles: ["admin", "staff", "client"]
    },
    {
      id: "kitchen",
      label: "Kitchen Prep",
      icon: ChefHat,
      status: orderData.kitchen_assigned ? "completed" : currentStatus === "payment_confirmed" ? "current" : "pending",
      timestamp: orderData.kitchen_assigned,
      description: "Order has been assigned to kitchen team. Prep will begin 24-48 hours before the event date.",
      visibleToRoles: ["admin", "staff", "client"]
    },
    {
      id: "driver",
      label: "Driver Assigned",
      icon: Truck,
      status: orderData.driver_assigned ? "completed" : currentStatus === "kitchen_assigned" ? "current" : "pending",
      timestamp: orderData.driver_assigned,
      description: "Delivery driver has been assigned and notified. Driver can see pickup time and venue details.",
      visibleToRoles: ["admin", "staff", "client"]
    },
    {
      id: "transit",
      label: "In Transit",
      icon: Navigation,
      status: orderData.in_transit ? "completed" : currentStatus === "driver_assigned" ? "current" : "pending",
      timestamp: orderData.in_transit,
      description: "Driver has picked up food and equipment from kitchen. GPS tracking active for real-time location updates.",
      visibleToRoles: ["admin", "staff", "client"]
    },
    {
      id: "delivered",
      label: "Delivered",
      icon: PackageCheck,
      status: orderData.delivered ? "completed" : currentStatus === "in_transit" ? "current" : "pending",
      timestamp: orderData.delivered,
      description: "Food and equipment delivered to venue. Client confirmation received. Event is now in progress.",
      visibleToRoles: ["admin", "staff", "client"]
    },
    {
      id: "equipment",
      label: "Equipment Return",
      icon: Utensils,
      status: orderData.equipment_returned ? "completed" : currentStatus === "delivered" ? "current" : "pending",
      timestamp: orderData.equipment_returned,
      description: "Driver collects equipment from venue. All items checked and returned to kitchen for cleaning.",
      visibleToRoles: ["admin", "staff"]
    }
  ];

  const visibleSteps = allSteps.filter(step => step.visibleToRoles.includes(userRole));
  
  const completedSteps = visibleSteps.filter(s => s.status === "completed").length;
  const progressPercentage = (completedSteps / visibleSteps.length) * 100;

  const handleOverrideComplete = () => {
    if (onOverrideComplete) {
      onOverrideComplete(orderNumber);
    }
    setShowOverrideConfirm(false);
  };

  const getNextStatus = (): string | null => {
    const currentStep = allSteps.find(s => s.status === "current");
    if (!currentStep) return null;

    const currentIndex = allSteps.findIndex(s => s.id === currentStep.id);
    const nextStep = allSteps[currentIndex + 1];
    
    return nextStep ? nextStep.id : null;
  };

  const handleMakeProgress = () => {
    const nextStatus = getNextStatus();
    if (nextStatus && onMakeProgress) {
      onMakeProgress(orderNumber, nextStatus);
      
      toast({
        title: "Progress Updated",
        description: `Order ${orderNumber} moved to next stage: ${allSteps.find(s => s.id === nextStatus)?.label}`,
        duration: 3000,
      });
    }
  };

  const nextStatus = getNextStatus();

  const cardClassName = isBehindSchedule 
    ? "w-full shadow-lg border-2 border-orange-500 animate-pulse"
    : isPriority
    ? "w-full shadow-lg border-4 border-purple-500"
    : "w-full shadow-lg border-2 border-purple-100";

  return (
    <Card className={cardClassName}>
      <CardContent className="pt-6 pb-8">
        {/* PROMINENT DELIVERY TIME SECTION - New Feature */}
        <div className="mb-6 p-6 rounded-xl border-4 border-orange-500 bg-gradient-to-r from-orange-50 to-amber-50 shadow-lg">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-600 to-red-600 flex items-center justify-center shadow-lg">
                <Clock className="w-9 h-9 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-orange-900 uppercase tracking-wider mb-1">
                  🚨 Client Delivery Time
                </p>
                <p className="text-2xl font-bold text-orange-900 mb-1">
                  {formattedDeliveryTime}
                </p>
                <p className="text-sm text-orange-700">
                  Food must arrive at venue by this time
                </p>
              </div>
            </div>
            <div className="text-right">
              {daysUntilEvent > 0 ? (
                <>
                  <div className="text-4xl font-bold text-orange-900 mb-1">
                    {daysUntilEvent}
                  </div>
                  <p className="text-sm text-orange-700 font-medium">
                    {daysUntilEvent === 1 ? "day" : "days"} until event
                  </p>
                </>
              ) : hoursUntilEvent > 0 ? (
                <>
                  <div className="text-4xl font-bold text-orange-900 mb-1 animate-pulse">
                    {hoursUntilEvent}h
                  </div>
                  <p className="text-sm text-orange-700 font-medium">
                    until delivery
                  </p>
                </>
              ) : (
                <>
                  <div className="text-3xl font-bold text-red-900 mb-1 animate-pulse">
                    NOW!
                  </div>
                  <p className="text-sm text-red-700 font-medium">
                    Event in progress
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
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
                {userRole === "admin" && (
                  <Badge className="bg-blue-600 text-white">
                    <Shield className="w-3 h-3 mr-1" />
                    Admin View
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-600">Order #{orderNumber}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <Badge className="bg-purple-600 text-white mb-2">
                  {completedSteps} of {visibleSteps.length} Complete
                </Badge>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="w-4 h-4" />
                  <span>{new Date(eventDate).toLocaleDateString()}</span>
                </div>
              </div>

              {userRole === "admin" && completedSteps < visibleSteps.length && (
                <>
                  {nextStatus && (
                    <Button 
                      variant="default" 
                      className="bg-blue-600 hover:bg-blue-700"
                      size="sm"
                      onClick={handleMakeProgress}
                    >
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Make Progress
                    </Button>
                  )}
                  
                  <AlertDialog open={showOverrideConfirm} onOpenChange={setShowOverrideConfirm}>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        className="border-green-500 text-green-700 hover:bg-green-50"
                        size="sm"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Mark as DONE
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-orange-600" />
                          Override Job Progress?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This will mark Order #{orderNumber} for {clientName} as 100% complete, skipping all remaining steps.
                          <br/><br/>
                          <strong>This action:</strong>
                          <ul className="list-disc list-inside mt-2 space-y-1">
                            <li>Marks all stages as completed</li>
                            <li>Closes the job in the system</li>
                            <li>Cannot be easily undone</li>
                          </ul>
                          <br/>
                          Only use this if the job is genuinely complete or needs to be manually closed for exceptional circumstances.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={handleOverrideComplete}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Yes, Mark as Complete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
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

        <div className={`grid gap-4 ${
          visibleSteps.length <= 4 
            ? "grid-cols-2 md:grid-cols-4" 
            : visibleSteps.length <= 6
            ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
            : "grid-cols-2 md:grid-cols-4 lg:grid-cols-9"
        }`}>
          {visibleSteps.map((step) => {
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
                      {new Date(step.timestamp).toLocaleString([], { 
                        month: 'short', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
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
          <div className="flex items-center justify-between flex-wrap gap-4">
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
                  {completedSteps === visibleSteps.length 
                    ? "Job Complete! 🎉" 
                    : `${visibleSteps.length - completedSteps} steps remaining`
                  }
                </p>
              </div>
            </div>

            {completedSteps < visibleSteps.length && (
              <div className="text-right">
                <p className={`text-sm font-semibold ${isBehindSchedule ? "text-orange-700" : "text-purple-700"}`}>
                  Next Step:
                </p>
                <p className="text-xs text-gray-600">
                  {visibleSteps.find(s => s.status === "current")?.label || visibleSteps.find(s => s.status === "pending")?.label}
                </p>
              </div>
            )}
          </div>
        </div>

        {userRole !== "admin" && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-700">
              <Info className="w-3 h-3 inline mr-1" />
              {userRole === "client" 
                ? "You're viewing your order's progress. You'll receive notifications at each stage."
                : "You're viewing stages from Payment Confirmed onwards. Contact admin for full order history."
              }
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
