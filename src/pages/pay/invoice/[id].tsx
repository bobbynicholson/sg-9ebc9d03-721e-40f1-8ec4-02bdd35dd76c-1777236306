import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CreditCard, CheckCircle2, AlertCircle, FileText, Calendar, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PayFastService } from "@/lib/payfastService";

interface InvoiceDetails {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  invoice_data: any;
  companies: {
    id: string;
    company_name: string;
    logo_url: string;
    email: string;
    phone_number: string;
    vat_registered: boolean | null;
    vat_number: string | null;
    vat_rate: number | null;
  };
}

export default function InvoicePaymentPage() {
  const router = useRouter();
  const { id } = router.query;
  
  const [invoice, setInvoice] = useState<InvoiceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id && typeof id === "string") {
      loadInvoice(id);
    }
  }, [id]);

  async function loadInvoice(invoiceId: string) {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("invoices")
        .select("*, companies!inner(*)")
        .eq("id", invoiceId)
        .single();

      if (fetchError || !data) {
        setError("Invoice not found");
        return;
      }

      setInvoice(data as unknown as InvoiceDetails);
    } catch (err) {
      setError("Failed to load invoice");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function initiatePayment() {
    if (!invoice) return;

    try {
      setProcessing(true);
      setError(null);

      // Check if PayFast is configured
      const merchantId = process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_ID;
      const merchantKey = process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_KEY;
      const passphrase = process.env.NEXT_PUBLIC_PAYFAST_PASSPHRASE;
      const testMode = process.env.NODE_ENV !== "production";

      if (!merchantId || !merchantKey) {
        setError("Payment gateway not configured. Please contact the company to arrange payment.");
        return;
      }

      // Initialize PayFast service
      const payFastService = new PayFastService({
        merchantId,
        merchantKey,
        passphrase: passphrase || "",
        testMode
      });

      const invoiceData = invoice.invoice_data;
      const clientName = invoiceData.clientName || "Customer";
      const [firstName, ...lastNameParts] = clientName.split(" ");
      const lastName = lastNameParts.join(" ") || "Customer";

      // Generate PayFast payment form
      const paymentParams = {
        merchant_id: merchantId,
        merchant_key: merchantKey,
        return_url: `${window.location.origin}/pay/invoice/${invoice.id}/success`,
        cancel_url: `${window.location.origin}/pay/invoice/${invoice.id}`,
        notify_url: `${window.location.origin}/api/webhooks/payment-confirmation`,
        name_first: firstName,
        name_last: lastName,
        email_address: invoiceData.clientEmail || "customer@email.com",
        amount: invoice.balance_due.toFixed(2),
        item_name: `Invoice ${invoice.invoice_number}`,
        item_description: `Payment for ${invoice.companies.company_name} - Invoice ${invoice.invoice_number}`,
        custom_str1: invoice.id, // Invoice ID for webhook processing
        custom_str2: "invoice", // Payment type identifier
        custom_str3: invoice.companies.id, // Company ID (we'd need to add this)
        custom_str4: "invoice", // Confirms this is invoice payment
        email_confirmation: "1",
        confirmation_address: invoiceData.clientEmail || "",
      };

      // Generate signature
      const signature = payFastService.generateSignature(paymentParams);

      // Create form and auto-submit
      const form = document.createElement("form");
      form.method = "POST";
      form.action = payFastService.getPaymentFormUrl();

      Object.entries({ ...paymentParams, signature }).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();

    } catch (err) {
      console.error("Payment initiation error:", err);
      setError("Failed to initiate payment. Please try again or contact support.");
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error}</p>
            <Button onClick={() => router.push("/")} className="mt-4">
              Return Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!invoice) {
    return null;
  }

  const isPaid = invoice.balance_due <= 0;
  const isOverdue = new Date(invoice.due_date) < new Date() && !isPaid;
  // SARS rule: VAT-registered businesses issue 'Tax Invoice', everyone
  // else issues 'Invoice'. The flag is set on /admin/company-profile.
  const vatRegistered = !!invoice.companies.vat_registered;
  const docTitle = vatRegistered ? "Tax Invoice" : "Invoice";

  return (
    <>
      <Head>
        <title>{docTitle} {invoice.invoice_number} - {invoice.companies.company_name}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 py-12 px-4">
        <div className="container max-w-3xl mx-auto">
          {/* Company Header */}
          <div className="text-center mb-8">
            {invoice.companies.logo_url && (
              <img 
                src={invoice.companies.logo_url} 
                alt={invoice.companies.company_name}
                className="h-16 mx-auto mb-4"
              />
            )}
            <h1 className="text-3xl font-bold text-gray-900">
              {invoice.companies.company_name}
            </h1>
            <p className="text-muted-foreground mt-2">
              {invoice.companies.email} | {invoice.companies.phone_number}
            </p>
            {vatRegistered && invoice.companies.vat_number && (
              <p className="text-xs text-muted-foreground mt-1">
                VAT Reg No: <span className="font-mono">{invoice.companies.vat_number}</span>
              </p>
            )}
          </div>

          {/* Invoice Summary Card */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {docTitle} {invoice.invoice_number}
                  </CardTitle>
                  <CardDescription className="mt-2">
                    Issued {format(new Date(invoice.invoice_date), "MMMM d, yyyy")}
                  </CardDescription>
                </div>
                <Badge variant={isPaid ? "default" : isOverdue ? "destructive" : "secondary"}>
                  {isPaid ? "Paid" : isOverdue ? "Overdue" : "Outstanding"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Amount Breakdown */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Amount</p>
                  <p className="text-2xl font-bold">
                    R {invoice.total_amount.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Amount Paid</p>
                  <p className="text-2xl font-bold text-green-600">
                    R {invoice.amount_paid.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Balance Due */}
              <div className="p-6 bg-primary/5 rounded-lg border-2 border-primary">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Balance Due</p>
                    <p className="text-4xl font-bold text-primary">
                      R {invoice.balance_due.toFixed(2)}
                    </p>
                  </div>
                  <DollarSign className="h-12 w-12 text-primary opacity-20" />
                </div>
                {!isPaid && (
                  <div className="mt-4 flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4" />
                    <span className={isOverdue ? "text-red-600 font-semibold" : "text-muted-foreground"}>
                      Due: {format(new Date(invoice.due_date), "MMMM d, yyyy")}
                      {isOverdue && " (OVERDUE)"}
                    </span>
                  </div>
                )}
              </div>

              {/* Event Details (if available) */}
              {invoice.invoice_data?.eventDate && (
                <div className="p-4 bg-slate-50 rounded-lg">
                  <h4 className="font-semibold mb-2">Event Details</h4>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>Date: {format(new Date(invoice.invoice_data.eventDate), "MMMM d, yyyy")}</p>
                    {invoice.invoice_data.venue && <p>Venue: {invoice.invoice_data.venue}</p>}
                    {invoice.invoice_data.guestCount && <p>Guests: {invoice.invoice_data.guestCount}</p>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Section */}
          {isPaid ? (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <strong>Payment Received!</strong> This invoice has been paid in full. 
                Thank you for your business!
              </AlertDescription>
            </Alert>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Pay Invoice Online
                </CardTitle>
                <CardDescription>
                  Secure payment powered by PayFast
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isOverdue && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      This invoice is overdue. Please make payment as soon as possible.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <span className="font-medium">Amount to Pay:</span>
                    <span className="text-2xl font-bold text-primary">
                      R {invoice.balance_due.toFixed(2)}
                    </span>
                  </div>

                  <Button
                    onClick={initiatePayment}
                    disabled={processing}
                    size="lg"
                    className="w-full"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-5 w-5 mr-2" />
                        Pay R {invoice.balance_due.toFixed(2)} Now
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground">
                    You will be redirected to PayFast to complete your payment securely
                  </p>
                </div>

                {/* Bank Transfer Alternative */}
                {invoice.invoice_data?.bankDetails && (
                  <div className="mt-6 p-4 border rounded-lg">
                    <h4 className="font-semibold mb-3">Prefer Bank Transfer?</h4>
                    <div className="space-y-2 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <span className="text-muted-foreground">Bank:</span>
                        <span className="font-medium">{invoice.invoice_data.bankDetails.bankName}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <span className="text-muted-foreground">Account Name:</span>
                        <span className="font-medium">{invoice.invoice_data.bankDetails.accountName}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <span className="text-muted-foreground">Account #:</span>
                        <span className="font-medium">{invoice.invoice_data.bankDetails.accountNumber}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <span className="text-muted-foreground">Branch Code:</span>
                        <span className="font-medium">{invoice.invoice_data.bankDetails.branchCode}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      Please use invoice number <strong>{invoice.invoice_number}</strong> as reference
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>Questions about this invoice?</p>
            <p className="mt-1">
              Contact {invoice.companies.company_name} at{" "}
              <a href={`mailto:${invoice.companies.email}`} className="text-primary hover:underline">
                {invoice.companies.email}
              </a>
              {" "}or{" "}
              <a href={`tel:${invoice.companies.phone_number}`} className="text-primary hover:underline">
                {invoice.companies.phone_number}
              </a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}