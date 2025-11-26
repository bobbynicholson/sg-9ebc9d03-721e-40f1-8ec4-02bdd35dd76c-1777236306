import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PaymentScheduleCard } from "@/components/orders/PaymentScheduleCard";
import { paymentProcessingService, PaymentSchedule } from "@/services/paymentProcessingService";
import { ClientNav } from "@/components/client/ClientNav";
import Head from "next/head";
import { Footer } from "@/components/Footer";

function PaymentSchedulePage() {
  const router = useRouter();
  const { orderId } = router.query;
  const [schedule, setSchedule] = useState<PaymentSchedule | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orderId && typeof orderId === "string") {
      loadPaymentSchedule(orderId);
    }
  }, [orderId]);

  const loadPaymentSchedule = async (id: string) => {
    setLoading(true);
    const data = await paymentProcessingService.getPaymentSchedule(id);
    setSchedule(data);
    setLoading(false);
  };

  const handlePayDeposit = async () => {
    if (!schedule) return;
    const paymentLink = await paymentProcessingService.generatePaymentLink(
      schedule.orderId,
      "deposit"
    );
    if (paymentLink) {
      router.push(paymentLink);
    }
  };

  const handlePayBalance = async () => {
    if (!schedule) return;
    const paymentLink = await paymentProcessingService.generatePaymentLink(
      schedule.orderId,
      "balance"
    );
    if (paymentLink) {
      router.push(paymentLink);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : schedule ? (
          <PaymentScheduleCard
            schedule={schedule}
            onPayDeposit={handlePayDeposit}
            onPayBalance={handlePayBalance}
          />
        ) : (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">
              No payment schedule found for this order
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function ClientPaymentSchedulePage() {
  return (
    <>
      <Head>
        <title>Payment Schedule</title>
      </Head>
      <PaymentSchedulePage />
      <Footer />
    </>
  );
}
