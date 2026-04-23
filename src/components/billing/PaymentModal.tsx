import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { CreditCard, Building2, Smartphone, Loader2, Lock, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { paymentProcessingService } from "@/services/paymentProcessingService";
import { supabase } from "@/integrations/supabase/client";

interface Invoice {
  id: string;
  invoice_number: string;
  order_id: string;
  order_number: string;
  amount: number;
  currency: string;
  status: string;
}

interface PaymentModalProps {
  invoice: Invoice;
  open: boolean;
  onClose: () => void;
  onPaymentSuccess: () => void;
}

export function PaymentModal({ invoice, open, onClose, onPaymentSuccess }: PaymentModalProps) {
  const { toast } = useToast();
  const [paymentMethod, setPaymentMethod] = useState<"card" | "eft" | "payfast">("payfast");
  const [processing, setProcessing] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);

  const handlePayment = async () => {
    try {
      setProcessing(true);

      // Determine payment type (deposit or balance)
      const isDeposit = invoice.invoice_number.includes("DEP");
      const paymentType = isDeposit ? "deposit" : "balance";

      if (paymentMethod === "payfast") {
        // Generate PayFast payment link
        const paymentLink = await paymentProcessingService.generatePaymentLink(
          invoice.order_id,
          paymentType
        );

        if (paymentLink) {
          // If it's HTML form, create a temporary container and submit
          if (paymentLink.includes("<form")) {
            const div = document.createElement("div");
            div.innerHTML = paymentLink;
            document.body.appendChild(div);
            const form = div.querySelector("form") as HTMLFormElement;
            if (form) {
              form.submit();
            }
          } else {
            // Otherwise redirect to payment URL
            window.location.href = paymentLink;
          }
        } else {
          throw new Error("Failed to generate payment link");
        }
      } else {
        // Mock payment for other methods
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Update payment status
        const transactionId = `TXN-${Date.now()}`;
        const { data: userData } = await supabase.auth.getUser();

        if (isDeposit) {
          await paymentProcessingService.processDepositPayment(
            invoice.order_id,
            transactionId,
            paymentMethod,
            userData?.user?.id || ""
          );
        } else {
          await paymentProcessingService.processBalancePayment(
            invoice.order_id,
            transactionId,
            paymentMethod,
            userData?.user?.id || ""
          );
        }

        setPaymentComplete(true);
        
        toast({
          title: "Payment Successful",
          description: `Your payment of ${invoice.currency}${invoice.amount.toLocaleString()} has been processed.`,
        });

        setTimeout(() => {
          onPaymentSuccess();
        }, 2000);
      }
    } catch (error) {
      console.error("Payment error:", error);
      toast({
        title: "Payment Failed",
        description: "There was an error processing your payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  if (paymentComplete) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Payment Successful!</h3>
            <p className="text-slate-600 mb-4">
              Your payment of {invoice.currency}{invoice.amount.toLocaleString()} has been processed.
            </p>
            <p className="text-sm text-slate-500 mb-6">
              A receipt has been sent to your email address.
            </p>
            <Button onClick={onClose} className="w-full">
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Make Payment</DialogTitle>
          <DialogDescription>
            Choose your payment method for invoice {invoice.invoice_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Payment Summary */}
          <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-slate-600">Invoice Number</span>
              <span className="font-semibold text-slate-900">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-slate-600">Order</span>
              <span className="font-semibold text-slate-900">{invoice.order_number}</span>
            </div>
            <Separator className="my-3" />
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-900">Total Amount</span>
              <span className="text-2xl font-bold text-blue-600">
                {invoice.currency}{invoice.amount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Payment Method Selection */}
          <div>
            <Label className="text-base font-semibold mb-3 block">Select Payment Method</Label>
            <RadioGroup value={paymentMethod} onValueChange={(val) => setPaymentMethod(val as any)}>
              <div className="space-y-3">
                {/* PayFast */}
                <div
                  className={`flex items-center space-x-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    paymentMethod === "payfast"
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                  onClick={() => setPaymentMethod("payfast")}
                >
                  <RadioGroupItem value="payfast" id="payfast" />
                  <Label htmlFor="payfast" className="flex items-center gap-2 cursor-pointer flex-1">
                    <CreditCard className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="font-medium">PayFast (Recommended)</p>
                      <p className="text-xs text-slate-500">Secure online payment gateway</p>
                    </div>
                  </Label>
                </div>

                {/* Credit Card */}
                <div
                  className={`flex items-center space-x-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    paymentMethod === "card"
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                  onClick={() => setPaymentMethod("card")}
                >
                  <RadioGroupItem value="card" id="card" />
                  <Label htmlFor="card" className="flex items-center gap-2 cursor-pointer flex-1">
                    <CreditCard className="w-5 h-5 text-slate-600" />
                    <div>
                      <p className="font-medium">Credit/Debit Card</p>
                      <p className="text-xs text-slate-500">Visa, Mastercard, Amex</p>
                    </div>
                  </Label>
                </div>

                {/* EFT */}
                <div
                  className={`flex items-center space-x-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    paymentMethod === "eft"
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                  onClick={() => setPaymentMethod("eft")}
                >
                  <RadioGroupItem value="eft" id="eft" />
                  <Label htmlFor="eft" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Building2 className="w-5 h-5 text-slate-600" />
                    <div>
                      <p className="font-medium">Bank Transfer (EFT)</p>
                      <p className="text-xs text-slate-500">Manual bank transfer</p>
                    </div>
                  </Label>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Security Notice */}
          <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg">
            <Lock className="w-4 h-4 text-slate-500 mt-0.5" />
            <p className="text-xs text-slate-600">
              Your payment information is encrypted and secure. We never store your card details.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1" disabled={processing}>
              Cancel
            </Button>
            <Button
              onClick={handlePayment}
              className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600"
              disabled={processing}
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Pay {invoice.currency}{invoice.amount.toLocaleString()}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}