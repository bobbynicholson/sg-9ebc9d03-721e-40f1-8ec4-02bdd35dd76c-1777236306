import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Search, 
  Plus, 
  Calendar,
  Mail,
  Phone,
  DollarSign,
  Filter,
  ArrowLeft,
  Loader2,
  ChevronDown
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { leadService } from "@/services/leadService";
import { DisplayLead } from "@/types";
import { Alert, AlertDescription } from "@/components/ui/alert";

type LeadStatus = "new" | "contacted" | "quoted" | "converted" | "lost";

const statusColors: { [key: string]: string } = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-yellow-100 text-yellow-800",
  quoted: "bg-orange-100 text-orange-700",
  converted: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700"
};

const statusLabels: { [key: string]: string } = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  converted: "Converted",
  lost: "Lost"
};

export default function LeadsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [leads, setLeads] = useState<DisplayLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [stats, setStats] = useState({
    new: 0,
    contacted: 0,
    quoted: 0,
    converted: 0,
    lost: 0
  });

  useEffect(() => {
    if (user) {
      fetchLeadsAndStats();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchLeadsAndStats = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const [leadsData, statsData] = await Promise.all([
        leadService.getLeads(user.id),
        leadService.getLeadStats(user.id)
      ]);
      setLeads(leadsData);
      setStats(statsData);
    } catch (err) {
      console.error("Error fetching leads:", err);
      setError("Failed to fetch leads. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!searchTerm) {
      fetchLeadsAndStats();
      return;
    }
    
    try {
      setLoading(true);
      const searchResults = await leadService.searchLeads(user.id, searchTerm);
      setLeads(searchResults);
    } catch (err) {
      console.error("Error searching leads:", err);
      setError("Failed to search leads. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const filteredLeads = leads.filter(lead => {
    const term = searchTerm.toLowerCase();
    return (
      lead.clientName.toLowerCase().includes(term) ||
      lead.clientEmail.toLowerCase().includes(term) ||
      (lead.clientPhone && lead.clientPhone.includes(term))
    );
  });

  const groupedLeads = filteredLeads.reduce((acc, lead) => {
    const status = lead.status || "new";
    if (!acc[status]) {
      acc[status] = [];
    }
    acc[status].push(lead);
    return acc;
  }, {} as { [key: string]: DisplayLead[] });

  const statusOrder = ["new", "contacted", "quoted", "converted", "lost"];

  if (!user && !loading) {
    return (
      <>
        <NoIndexMeta />
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="p-8 text-center">
              <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Authentication Required</h3>
              <p className="text-slate-600 mb-6">Please sign in to access lead management.</p>
              <Link href="/auth/login">
                <Button>Sign In</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <NoIndexMeta />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="mb-8">
            <Link href="/">
              <Button variant="ghost" className="mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl shadow-lg">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Lead Management
                  </h1>
                  <p className="text-slate-600 mt-1">Track and manage all your catering inquiries</p>
                </div>
              </div>
              <Link href="/leads/new">
                <Button size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                  <Plus className="w-5 h-5 mr-2" />
                  New Lead
                </Button>
              </Link>
            </div>
          </div>

          {error && (
            <Alert className="mb-6 border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {Object.entries(stats).map(([status, count]) => (
              <Card 
                key={status}
                className={`cursor-pointer transition-all hover:shadow-lg ${
                  filterStatus === status ? "ring-2 ring-blue-500" : ""
                }`}
                onClick={() => setFilterStatus(status)}
              >
                <CardContent className="p-4">
                  <p className="text-sm text-slate-600 capitalize mb-1">{statusLabels[status] || status} Leads</p>
                  <p className={`text-2xl font-bold ${statusColors[status] || 'text-slate-900'}`}>{count}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mb-6 border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <Input
                    placeholder="Search by client name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button variant="outline">
                  <Filter className="w-4 h-4 mr-2" />
                  More Filters
                </Button>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <Card className="border-0 shadow-lg">
              <CardContent className="p-12 text-center">
                <Loader2 className="w-16 h-16 text-slate-300 mx-auto mb-4 animate-spin" />
                <p className="text-slate-600">Loading leads...</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredLeads.length === 0 ? (
                <Card className="border-2 border-dashed">
                  <CardContent className="p-12 text-center">
                    <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-slate-900 mb-2">No leads found</h3>
                    <p className="text-slate-600 mb-6">
                      {searchTerm || filterStatus !== "all" 
                        ? "Try adjusting your search or filters" 
                        : "Get started by adding your first lead"}
                    </p>
                    <Link href="/leads/new">
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Add New Lead
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                statusOrder.map((status) => (
                  groupedLeads[status] && groupedLeads[status].length > 0 && (
                    <div key={status}>
                      <h2 className={`text-lg font-semibold mb-3 flex items-center gap-2 ${statusColors[status] || 'text-slate-900'}`}>
                        <span className={`w-3 h-3 rounded-full ${statusColors[status] || 'bg-slate-200'}`}></span>
                        {statusLabels[status]} ({groupedLeads[status].length})
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {groupedLeads[status].map((lead) => (
                          <Card key={lead.id} className="border-0 shadow-lg hover:shadow-xl transition-all">
                            <CardContent className="p-4">
                              <div className="flex justify-between items-start">
                                <h3 className="font-bold text-slate-900">{lead.clientName}</h3>
                                <Badge className={statusColors[lead.status]}>
                                  {statusLabels[lead.status]}
                                </Badge>
                              </div>
                              <p className="text-sm text-slate-500 mb-2">{lead.clientEmail}</p>
                              <div className="text-sm space-y-1 text-slate-600">
                                <p><strong>Event:</strong> {lead.eventType} on {new Date(lead.eventDate).toLocaleDateString()}</p>
                                <p><strong>Guests:</strong> {lead.guestCount}</p>
                                <p><strong>Budget:</strong> {lead.budget ? `R${lead.budget.toFixed(2)}` : 'N/A'}</p>
                              </div>
                              <div className="flex justify-end mt-4">
                                <Link href={`/quotes/new?leadId=${lead.id}`} passHref>
                                  <Button size="sm">
                                    Create Quote
                                  </Button>
                                </Link>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )
                ))
              )}
            </div>
          )}
        </div>
        
        <Footer />
      </div>
    </>
  );
}
