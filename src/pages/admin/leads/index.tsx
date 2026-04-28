import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Phone, Mail, Calendar, DollarSign, TrendingUp } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { leadService } from "@/services/leadService";
import { InfoTooltip } from "@/components/ui/info-tooltip";

export default function AdminLeads() {
  const { user } = useAuth();
  const router = useRouter();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadLeads();
    }
  }, [user]);

  const loadLeads = async () => {
    if (!user?.company_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await leadService.getLeads(user.company_id);
      setLeads(data);
    } catch (error) {
      console.error("Error loading leads:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         lead.client_email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    const colors = {
      new: "bg-blue-100 text-blue-800",
      contacted: "bg-yellow-100 text-yellow-800",
      qualified: "bg-purple-100 text-purple-800",
      converted: "bg-green-100 text-green-800",
      lost: "bg-slate-100 text-slate-800"
    };
    return colors[status as keyof typeof colors] || colors.new;
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Lead Management - CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-6 md:py-8 lg:py-12 max-w-full">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Lead Management</h1>
                <p className="text-slate-600">Track and convert potential customers</p>
              </div>
            </div>
            <Link href="/admin/leads/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Lead
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 flex items-center gap-1.5">Total Leads <InfoTooltip content={"Every lead on file for your company, across every status."} /></p>
                    <p className="text-2xl font-bold text-slate-900">{leads.length}</p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 flex items-center gap-1.5">New <InfoTooltip content={"Fresh leads that have just come in and have not been worked yet."} /></p>
                    <p className="text-2xl font-bold text-blue-600">
                      {leads.filter(l => l.status === "new").length}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Plus className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 flex items-center gap-1.5">Qualified <InfoTooltip content={"Real opportunities that have been worked but not yet quoted."} /></p>
                    <p className="text-2xl font-bold text-purple-600">
                      {leads.filter(l => l.status === "qualified").length}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 flex items-center gap-1.5">Won / Converted <InfoTooltip content={"Leads that turned into a confirmed booking."} /></p>
                    <p className="text-2xl font-bold text-green-600">
                      {leads.filter(l => l.status === "won" || l.status === "converted").length}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search leads..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="all">All Status</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="quoted">Quoted</option>
                  <option value="won">Won</option>
                  <option value="converted">Converted</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-12 text-slate-600">Loading leads...</div>
              ) : filteredLeads.length === 0 ? (
                <div className="text-center py-12 text-slate-600">
                  <TrendingUp className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p>No leads found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className="p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-slate-900">{lead.client_name}</h3>
                            <Badge className={getStatusColor(lead.status || "new")}>
                              {lead.status || "new"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-600">
                            {lead.company_name && (
                              <span className="flex items-center gap-1">
                                {lead.company_name}
                              </span>
                            )}
                            {lead.client_email && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {lead.client_email}
                              </span>
                            )}
                            {lead.client_phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {lead.client_phone}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setExpandedLeadId(expandedLeadId === lead.id ? null : lead.id)}
                          >
                            {expandedLeadId === lead.id ? "Hide Details" : "View Details"}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => router.push(`/admin/quotes/new?leadId=${lead.id}`)}
                          >
                            Convert to Quote
                          </Button>
                        </div>
                      </div>
                      {expandedLeadId === lead.id && (
                        <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-slate-500 text-xs mb-1">Event Date</p>
                            <p className="text-slate-900 font-medium">
                              {lead.event_date ? new Date(lead.event_date).toLocaleDateString() : "TBD"}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs mb-1">Guests</p>
                            <p className="text-slate-900 font-medium">{lead.guest_count || "TBD"}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs mb-1">Event Type</p>
                            <p className="text-slate-900 font-medium">{lead.event_type || "Not specified"}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs mb-1">Estimated Value</p>
                            <p className="text-slate-900 font-medium">
                              {lead.estimated_value ? `R${Number(lead.estimated_value).toLocaleString()}` : "TBD"}
                            </p>
                          </div>
                          {lead.notes && (
                            <div className="col-span-2 md:col-span-4">
                              <p className="text-slate-500 text-xs mb-1">Notes</p>
                              <p className="text-slate-700">{lead.notes}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />
    </>
  );
}