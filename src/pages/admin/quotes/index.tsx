import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, 
  Plus,
  Calendar,
  Mail,
  Users,
  FileText,
  Edit,
  Send
} from "lucide-react";
import { Quote } from "@/types";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";

export default function AdminQuotes() {
  const { user } = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);

  useEffect(() => {
    const storedQuotes = JSON.parse(localStorage.getItem("quotes") || "[]");
    setQuotes(storedQuotes);
  }, []);

  const getStatusColor = (status: Quote["status"]) => {
    switch (status) {
      case "draft": return "bg-gray-100 text-gray-700 border-gray-200";
      case "sent": return "bg-blue-100 text-blue-700 border-blue-200";
      case "revised": return "bg-orange-100 text-orange-700 border-orange-200";
      case "accepted": return "bg-green-100 text-green-700 border-green-200";
      case "rejected": return "bg-red-100 text-red-700 border-red-200";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Quote Management - CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-6 md:py-8 lg:py-12 max-w-7xl">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl shadow-lg">
                  <DollarSign className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                    Quote Management
                  </h1>
                  <p className="text-slate-600 mt-1">Create and manage client quotes</p>
                </div>
              </div>
              <Link href="/admin/quotes/new">
                <Button size="lg" className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700">
                  <Plus className="w-5 h-5 mr-2" />
                  New Quote
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 mb-1">Total Quotes</p>
                <p className="text-2xl font-bold text-slate-900">{quotes.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 mb-1">Sent</p>
                <p className="text-2xl font-bold text-blue-600">
                  {quotes.filter(q => q.status === "sent").length}
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 mb-1">Accepted</p>
                <p className="text-2xl font-bold text-green-600">
                  {quotes.filter(q => q.status === "accepted").length}
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 mb-1">Total Value</p>
                <p className="text-2xl font-bold text-emerald-600">
                  R{quotes.reduce((sum, q) => sum + q.total, 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {quotes.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="p-12 text-center">
                  <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">No quotes yet</h3>
                  <p className="text-slate-600 mb-6">Create your first quote from a lead</p>
                  <Link href="/admin/leads">
                    <Button>View Leads</Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              quotes.map((quote) => (
                <Card key={quote.id} className="border-0 shadow-lg hover:shadow-xl transition-all">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <h3 className="text-xl font-semibold text-slate-900">{quote.client_name}</h3>
                          <Badge className={`${getStatusColor(quote.status)} border`}>
                            {quote.status}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                          <div className="flex items-center gap-2 text-slate-600">
                            <Mail className="w-4 h-4" />
                            <span className="text-sm">{quote.client_email}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-600">
                            <Calendar className="w-4 h-4" />
                            <span className="text-sm">{new Date(quote.event_date).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-600">
                            <Users className="w-4 h-4" />
                            <span className="text-sm">{quote.guest_count} guests</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-600">
                            <DollarSign className="w-4 h-4" />
                            <span className="text-sm font-semibold text-green-600">
                              R{quote.total.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-slate-600">
                            {Array.isArray(quote.menu_items) ? quote.menu_items.length : 0} menu items
                          </span>
                          <span className="text-slate-600">
                            {Array.isArray(quote.equipment_items) ? quote.equipment_items.length : 0} equipment items
                          </span>
                        </div>

                        <div className="space-y-2 mt-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Subtotal</span>
                            <span className="font-medium">R{quote.subtotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">VAT (15%)</span>
                            <span className="font-medium">R{quote.tax.toFixed(2)}</span>
                          </div>
                          <div className="h-px bg-slate-200" />
                          <div className="flex justify-between font-bold">
                            <span>Total</span>
                            <span className="text-green-600">R{quote.total.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 ml-4">
                        {quote.status === "draft" && (
                          <Button size="sm">
                            <Send className="w-4 h-4 mr-2" />
                            Send
                          </Button>
                        )}
                        <Link href={`/admin/quotes/${quote.id}`}>
                          <Button variant="outline" size="sm">
                            <Edit className="w-4 h-4 mr-2" />
                            View
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
        
        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />
    </>
  );
}