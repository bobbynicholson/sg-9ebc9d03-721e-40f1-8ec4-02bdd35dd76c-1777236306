import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Mail, Users, DollarSign, MapPin, FileText } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { quoteService } from "@/services/quoteService";
import { Quote } from "@/types";

const STATUS_COLOURS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-amber-100 text-amber-700",
};

export default function AdminQuoteDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || typeof id !== "string") return;
    let cancelled = false;
    (async () => {
      const data = await quoteService.getQuote(id);
      if (!cancelled) {
        setQuote(data);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <>
      <Head>
        <title>Quote Details | CateringMS</title>
      </Head>
      <NoIndexMeta />

      <div className="min-h-screen bg-slate-50">
        <AdminNav />

        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="mb-6">
            <Link href="/admin/quotes">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Quotes
              </Button>
            </Link>
          </div>

          {loading ? (
            <Card className="border-0 shadow-lg">
              <CardContent className="p-12 text-center text-slate-500">Loading quote...</CardContent>
            </Card>
          ) : !quote ? (
            <Card className="border-0 shadow-lg">
              <CardContent className="p-12 text-center">
                <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-900 mb-2">Quote not found</h2>
                <p className="text-slate-600 mb-6">This quote may have been deleted or never existed.</p>
                <Link href="/admin/quotes">
                  <Button>Back to Quotes</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-2xl mb-2">{quote.client_name}</CardTitle>
                      <p className="text-sm text-slate-500">Quote #{quote.id?.slice(0, 8)}</p>
                    </div>
                    <Badge className={STATUS_COLOURS[quote.status as string] ?? STATUS_COLOURS.draft}>
                      {quote.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex items-start gap-3">
                      <Mail className="w-5 h-5 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Client Email</p>
                        <p className="text-slate-900 font-medium">{quote.client_email || "—"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Calendar className="w-5 h-5 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Event Date</p>
                        <p className="text-slate-900 font-medium">
                          {quote.event_date ? new Date(quote.event_date).toLocaleDateString() : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Users className="w-5 h-5 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Guests</p>
                        <p className="text-slate-900 font-medium">{quote.guest_count ?? "—"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Delivery Address</p>
                        <p className="text-slate-900 font-medium">
                          {(quote as any).delivery_address || "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Pricing</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Subtotal</span>
                      <span className="font-medium">R{Number(quote.subtotal ?? 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">VAT (15%)</span>
                      <span className="font-medium">R{Number(quote.tax ?? 0).toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div className="flex justify-between text-lg">
                      <span className="font-semibold">Total</span>
                      <span className="font-bold text-green-600 flex items-center gap-1">
                        <DollarSign className="w-5 h-5" />
                        R{Number(quote.total ?? 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-3">
                <Link href="/admin/quotes" className="flex-1">
                  <Button variant="outline" className="w-full">Back to List</Button>
                </Link>
                <Link href="/admin/orders" className="flex-1">
                  <Button className="w-full">View Orders</Button>
                </Link>
              </div>
            </div>
          )}
        </div>

        <Footer />
      </div>
    </>
  );
}
