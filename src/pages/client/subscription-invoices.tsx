import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2, FileText } from "lucide-react";
import { invoiceService } from "@/services/invoiceService";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import { ClientNav } from "@/components/navigation/ClientNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import type { Tables } from "@/integrations/supabase/types";

type Subscription = Tables<'subscriptions'>;

function SubscriptionInvoicesPage() {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      loadSubscriptions();
    }
  }, [user]);

  const loadSubscriptions = async () => {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSubscriptions((data as any as Subscription[]) || []);
    } catch (error) {
      console.error("Error loading subscriptions:", error);
      toast({
        title: "Error",
        description: "Failed to load subscription history",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadInvoice = async (subscriptionId: string, planName: string) => {
    try {
      setDownloadingId(subscriptionId);
      const blob = await invoiceService.generateSubscriptionInvoice(subscriptionId);
      const filename = `CateringMS-Invoice-${subscriptionId.substring(0, 8)}.pdf`;
      invoiceService.downloadInvoice(blob, filename);
      
      toast({
        title: "Success",
        description: "Invoice downloaded successfully"
      });
    } catch (error) {
      console.error("Error downloading invoice:", error);
      toast({
        title: "Error",
        description: "Failed to download invoice",
        variant: "destructive"
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-ZA", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  };

  const formatCurrency = (amount: number, currency: string) => {
    return `${currency} ${amount.toFixed(2)}`;
  };

  if (!user) {
    return (
      <>
        <NoIndexMeta />
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-grow flex items-center justify-center">
            <Card className="w-full max-w-md">
              <CardContent className="pt-6">
                <p className="text-center text-slate-600">
                  Please sign in to view your subscription invoices
                </p>
              </CardContent>
            </Card>
          </main>
          <Footer />
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>My subscriptions and invoices - CateringMS</title>
      </Head>
      <NoIndexMeta />
      <ClientNav />
      <div className="min-h-screen bg-gray-50 lg:pl-72 xl:pl-80">
        <main className="container mx-auto p-4 md:p-8">
          <h1 className="text-3xl font-bold mb-6 text-gray-800">
            Subscriptions & Invoices
          </h1>
          <div className="max-w-4xl mx-auto">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-slate-900 mb-2">
                Subscription Invoices
              </h1>
              <p className="text-slate-600">
                Download tax invoices for your CateringMS subscription
              </p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
              </div>
            ) : subscriptions.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                    <p className="text-slate-600">No subscription invoices available</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {subscriptions.map((subscription) => (
                  <Card key={subscription.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">
                            {subscription.plan_name} Plan
                          </CardTitle>
                          <p className="text-sm text-slate-600 mt-1">
                            Invoice Date: {formatDate(subscription.created_at)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-purple-600">
                            {formatCurrency(subscription.amount * 1.15, subscription.currency)}
                          </p>
                          <p className="text-xs text-slate-500">Including VAT</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1 text-sm text-slate-600">
                          <p>
                            Period: {formatDate(subscription.current_period_start)} - {formatDate(subscription.current_period_end)}
                          </p>
                          <p>
                            Status: <span className="font-medium text-green-600">
                              {subscription.status}
                            </span>
                          </p>
                        </div>
                        <Button
                          onClick={() => handleDownloadInvoice(subscription.id, subscription.plan_name)}
                          disabled={downloadingId === subscription.id}
                          size="sm"
                        >
                          {downloadingId === subscription.id ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : (
                            <Download className="w-4 h-4 mr-2" />
                          )}
                          Download Invoice
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}

export default function ClientSubscriptionInvoicesPage() {
  // This page is CateringMS billing the catering company (SaaS
  // subscription invoices), so the audience is the tenant owner /
  // company admin - not the catering company's end-clients. Old
  // guard was UserRole.CLIENT which exposed CateringMS's own billing
  // history to every client of every tenant.
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.SUPER_ADMIN,
        UserRole.COMPANY_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <SubscriptionInvoicesPage />
    </ProtectedRoute>
  );
}
