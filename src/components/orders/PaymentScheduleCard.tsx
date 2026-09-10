import { useState } from "react";
import { Calendar, CreditCard, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { PaymentSchedule } from "@/services/paymentProcessingService";
import { formatCurrency } from "@/lib/payfastService";

interface PaymentScheduleCardProps {
  schedule: PaymentSchedule;
  onPayDeposit?: () => void;
  onPayBalance?: () => void;
}

export function PaymentScheduleCard({
  schedule,
  onPayDeposit,
  onPayBalance,
}: PaymentScheduleCardProps) {
  const depositPercentage = (schedule.depositAmount / schedule.totalAmount) * 100;
  const balancePercentage = (schedule.balanceAmount / schedule.totalAmount) * 100;
  
  const totalPaidAmount = 
    (schedule.depositPaid ? schedule.depositAmount : 0) +
    (schedule.balancePaid ? schedule.balanceAmount : 0);
  
  const paymentProgress = (totalPaidAmount / schedule.totalAmount) * 100;

  const getDaysUntil = (dateString: string): number => {
    const targetDate = new Date(dateString);
    const today = new Date();
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const balanceDaysRemaining = getDaysUntil(schedule.balanceDueDate);
  const modificationDaysRemaining = getDaysUntil(schedule.finalOrderChangeDate);

  const isBalanceOverdue = balanceDaysRemaining < 0 && !schedule.balancePaid;
  const isBalanceDueSoon = balanceDaysRemaining <= 3 && balanceDaysRemaining >= 0 && !schedule.balancePaid;
  const isModificationDeadlineSoon = modificationDaysRemaining <= 3 && modificationDaysRemaining >= 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Payment Schedule</CardTitle>
            <CardDescription>Track your payment milestones</CardDescription>
          </div>
          <Badge variant={schedule.balancePaid ? "default" : "secondary"}>
            {schedule.balancePaid ? "Fully Paid" : "Payment Pending"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Payment Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Payment Progress</span>
            <span className="font-semibold">
              {formatCurrency(totalPaidAmount, schedule.currency)} / {formatCurrency(schedule.totalAmount, schedule.currency)}
            </span>
          </div>
          <Progress value={paymentProgress} className="h-2" />
          <p className="text-xs text-muted-foreground text-right">
            {paymentProgress.toFixed(0)}% Complete
          </p>
        </div>

        {/* Deposit Section */}
        <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {schedule.depositPaid ? (
                <CheckCircle className="h-5 w-5 text-brand-primary" />
              ) : (
                <Clock className="h-5 w-5 text-orange-500" />
              )}
              <div>
                <h4 className="font-semibold">Deposit Payment</h4>
                <p className="text-xs text-muted-foreground">
                  {depositPercentage.toFixed(0)}% of total
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold">
                {formatCurrency(schedule.depositAmount, schedule.currency)}
              </p>
            </div>
          </div>

          {schedule.depositPaid ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4" />
              <span>
                Paid on {format(new Date(schedule.depositPaidAt!), "MMM dd, yyyy")}
              </span>
            </div>
          ) : (
            <Button onClick={onPayDeposit} className="w-full" size="sm">
              <CreditCard className="h-4 w-4 mr-2" />
              Pay Deposit Now
            </Button>
          )}
        </div>

        {/* Balance Section */}
        <div className={`space-y-3 p-4 rounded-lg border ${
          isBalanceOverdue 
            ? "bg-rose-50 border-rose-200"
            : isBalanceDueSoon 
            ? "bg-orange-50 border-orange-200"
            : "bg-muted/30"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {schedule.balancePaid ? (
                <CheckCircle className="h-5 w-5 text-brand-primary" />
              ) : isBalanceOverdue ? (
                <AlertCircle className="h-5 w-5 text-rose-500" />
              ) : (
                <Clock className="h-5 w-5 text-blue-500" />
              )}
              <div>
                <h4 className="font-semibold">Balance Payment</h4>
                <p className="text-xs text-muted-foreground">
                  {balancePercentage.toFixed(0)}% of total
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold">
                {formatCurrency(schedule.balanceAmount, schedule.currency)}
              </p>
            </div>
          </div>

          {schedule.balancePaid ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4" />
              <span>
                Paid on {format(new Date(schedule.balancePaidAt!), "MMM dd, yyyy")}
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4" />
                <span>
                  Due: {format(new Date(schedule.balanceDueDate), "MMM dd, yyyy")}
                  {balanceDaysRemaining >= 0 && (
                    <span className={`ml-2 font-semibold ${
                      isBalanceDueSoon ? "text-orange-600" : ""
                    }`}>
                      ({balanceDaysRemaining} {balanceDaysRemaining === 1 ? "day" : "days"} remaining)
                    </span>
                  )}
                  {isBalanceOverdue && (
                    <span className="ml-2 font-semibold text-rose-600">
                      (Overdue by {Math.abs(balanceDaysRemaining)} {Math.abs(balanceDaysRemaining) === 1 ? "day" : "days"})
                    </span>
                  )}
                </span>
              </div>
              
              {schedule.depositPaid && (
                <Button 
                  onClick={onPayBalance} 
                  className="w-full" 
                  size="sm"
                  variant={isBalanceOverdue ? "destructive" : "default"}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Pay Balance Now
                </Button>
              )}
            </>
          )}
        </div>

        {/* Order Modification Deadline */}
        {!schedule.balancePaid && (
          <div className={`p-4 rounded-lg border ${
            isModificationDeadlineSoon 
              ? "bg-orange-50 border-orange-200"
              : "bg-blue-50 border-blue-200"
          }`}>
            <div className="flex items-center gap-2">
              {isModificationDeadlineSoon ? (
                <AlertCircle className="h-5 w-5 text-orange-500" />
              ) : (
                <Calendar className="h-5 w-5 text-blue-500" />
              )}
              <div className="flex-1">
                <h4 className="font-semibold text-sm">Order Modification Deadline</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {schedule.canModifyOrder ? (
                    <>
                      You can modify your order until{" "}
                      <span className="font-semibold">
                        {format(new Date(schedule.finalOrderChangeDate), "MMM dd, yyyy")}
                      </span>
                      {modificationDaysRemaining >= 0 && (
                        <span className={`ml-1 ${isModificationDeadlineSoon ? "font-semibold text-orange-600" : ""}`}>
                          ({modificationDaysRemaining} {modificationDaysRemaining === 1 ? "day" : "days"} remaining)
                        </span>
                      )}
                    </>
                  ) : (
                    <>Order modifications are no longer allowed</>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Event Date */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>
            Event Date: <span className="font-semibold text-foreground">
              {format(new Date(schedule.eventDate), "MMMM dd, yyyy")}
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
