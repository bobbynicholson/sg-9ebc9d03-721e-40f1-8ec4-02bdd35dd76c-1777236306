import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, FileText } from "lucide-react";

export default function InvoicePaymentSuccessPage() {
  const router = useRouter();
  const { id } = router.query;
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!id) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push("/");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [id, router]);

  return (
    <>
      <Head>
        <title>Payment Successful</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-6 w-6" />
              Payment Successful!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-lg font-medium mb-2">Thank you for your payment!</p>
              <p className="text-muted-foreground">
                Your invoice payment has been processed successfully. You will receive a confirmation email shortly.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg text-sm text-center">
              <p className="text-muted-foreground">
                Redirecting to homepage in <strong>{countdown}</strong> seconds...
              </p>
            </div>

            <div className="flex gap-3">
              <Button onClick={() => router.push("/")} variant="outline" className="flex-1">
                Return Home
              </Button>
              <Button onClick={() => router.push(`/pay/invoice/${id}`)} className="flex-1">
                <FileText className="h-4 w-4 mr-2" />
                View Invoice
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}