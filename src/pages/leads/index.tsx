import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ArrowLeft
} from "lucide-react";
import { mockLeads } from "@/lib/mockData";
import { Lead } from "@/types";
import { Footer } from "@/components/Footer";

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>(mockLeads);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         lead.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || lead.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: Lead["status"]) => {
    switch (status) {
      case "new": return "bg-blue-100 text-blue-700 border-blue-200";
      case "quoted": return "bg-purple-100 text-purple-700 border-purple-200";
      case "revised": return "bg-orange-100 text-orange-700 border-orange-200";
      case "confirmed": return "bg-green-100 text-green-700 border-green-200";
      case "cancelled": return "bg-red-100 text-red-700 border-red-200";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const statusCounts = {
    all: leads.length,
    new: leads.filter(l => l.status === "new").length,
    quoted: leads.filter(l => l.status === "quoted").length,
    confirmed: leads.filter(l => l.status === "confirmed").length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
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
                <p className="text-slate-600 mt-1">Track and manage catering inquiries</p>
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

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {Object.entries(statusCounts).map(([status, count]) => (
            <Card 
              key={status}
              className={`cursor-pointer transition-all hover:shadow-lg ${
                filterStatus === status ? "ring-2 ring-blue-500" : ""
              }`}
              onClick={() => setFilterStatus(status)}
            >
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 capitalize mb-1">{status} Leads</p>
                <p className="text-2xl font-bold text-slate-900">{count}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search and Filter */}
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

        {/* Leads List */}
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
            filteredLeads.map((lead) => (
              <Card key={lead.id} className="border-0 shadow-lg hover:shadow-xl transition-all">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-xl font-semibold text-slate-900">{lead.clientName}</h3>
                        <Badge className={`${getStatusColor(lead.status)} border`}>
                          {lead.status}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        <div className="flex items-center gap-2 text-slate-600">
                          <Mail className="w-4 h-4" />
                          <span className="text-sm">{lead.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <Phone className="w-4 h-4" />
                          <span className="text-sm">{lead.phone}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <Calendar className="w-4 h-4" />
                          <span className="text-sm">{new Date(lead.eventDate).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <DollarSign className="w-4 h-4" />
                          <span className="text-sm">${lead.budget.toLocaleString()} budget</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-sm">
                        <span className="px-3 py-1 bg-slate-100 rounded-full text-slate-700">
                          {lead.eventType}
                        </span>
                        <span className="text-slate-600">
                          {lead.guestCount} guests
                        </span>
                        {lead.specialRequests && (
                          <span className="text-slate-500 italic">
                            "{lead.specialRequests}"
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      {lead.status === "new" && (
                        <Link href={`/quotes/new?leadId=${lead.id}`}>
                          <Button>Create Quote</Button>
                        </Link>
                      )}
                      {lead.status === "quoted" && (
                        <Link href={`/quotes/${lead.id}`}>
                          <Button variant="outline">View Quote</Button>
                        </Link>
                      )}
                      <Link href={`/leads/${lead.id}`}>
                        <Button variant="outline">Details</Button>
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
  );
}
