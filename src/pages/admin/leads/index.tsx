import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Plus, Search, Phone, Mail, Calendar, DollarSign, TrendingUp,
  ArrowRight, FileText, ShoppingCart, UserCheck, Clock,
} from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";

// Per-lead provenance summary -- which quotes/orders/clients have
// been spawned from this lead. Surfaced on the row so the catering
// team sees at a glance whether the lead is still "in the funnel" or
// already converted downstream.
interface LeadLinks {
  quoteCount: number;
  /** Most recent quote id for this lead -- used for the "View quote" chip. */
  latestQuoteId: string | null;
  latestQuoteStatus: string | null;
  /** Order id if any quote off this lead converted into an order. */
  orderId: string | null;
  clientId: string | null;
}

function deriveLeadSuggestion(lead: any, links: LeadLinks): {
  tone: "urgent" | "warm" | "neutral";
  label: string;
  reason: string;
} {
  const created = lead.created_at ? new Date(lead.created_at) : null;
  const ageDays = created
    ? Math.floor((Date.now() - created.getTime()) / 86_400_000)
    : 0;
  const status = (lead.status || "new") as string;

  if (links.orderId) {
    return { tone: "neutral", label: "Booked", reason: "Order on file" };
  }
  if (links.quoteCount > 0) {
    if (links.latestQuoteStatus === "accepted") {
      return { tone: "urgent", label: "Convert quote to order", reason: "Quote accepted, no order yet" };
    }
    if (links.latestQuoteStatus === "rejected") {
      return { tone: "warm", label: "Win-back nudge", reason: "Quote was rejected" };
    }
    if (links.latestQuoteStatus === "sent" || links.latestQuoteStatus === "viewed") {
      return { tone: "warm", label: "Chase the quote", reason: `${ageDays}d since lead came in` };
    }
    return { tone: "warm", label: "Finish + send the quote", reason: "Draft quote in flight" };
  }
  if (status === "lost") {
    return { tone: "neutral", label: "Door open", reason: "Marked lost -- circle back later" };
  }
  if (status === "qualified") {
    return { tone: "urgent", label: "Send a quote", reason: "Lead qualified, no quote yet" };
  }
  if (ageDays >= 7) {
    return { tone: "urgent", label: `Follow up -- ${ageDays}d quiet`, reason: "Lead is going cold" };
  }
  if (ageDays >= 2) {
    return { tone: "warm", label: "Touch base", reason: `${ageDays}d since enquiry` };
  }
  return { tone: "urgent", label: "Reply ASAP", reason: "New enquiry waiting" };
}

export default function AdminLeads() {
  const { user } = useAuth();
  const router = useRouter();
  const [leads, setLeads] = useState<any[]>([]);
  const [linksByLeadId, setLinksByLeadId] = useState<Map<string, LeadLinks>>(new Map());
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

      // Build the lead-id -> linked-records index. Two queries: one
      // for quotes off these leads, one for the converted_to_client_id
      // we already have on the lead rows. Keeps it cheap.
      const leadIds = data.map((l: any) => l.id).filter(Boolean);
      const map = new Map<string, LeadLinks>();
      data.forEach((l: any) => {
        map.set(l.id, {
          quoteCount: 0,
          latestQuoteId: null,
          latestQuoteStatus: null,
          orderId: null,
          clientId: l.converted_to_client_id ?? null,
        });
      });
      if (leadIds.length > 0) {
        const { data: quoteRows } = await supabase
          .from("quotes")
          .select("id, lead_id, status, converted_to_order_id, created_at")
          .eq("company_id", user.company_id)
          .in("lead_id", leadIds)
          .order("created_at", { ascending: false });
        for (const q of quoteRows || []) {
          if (!q.lead_id) continue;
          const cur = map.get(q.lead_id);
          if (!cur) continue;
          cur.quoteCount += 1;
          if (!cur.latestQuoteId) {
            cur.latestQuoteId = q.id;
            cur.latestQuoteStatus = q.status;
          }
          if (q.converted_to_order_id && !cur.orderId) {
            cur.orderId = q.converted_to_order_id;
          }
        }
      }
      setLinksByLeadId(map);
    } catch (error) {
      console.error("Error loading leads:", error);
    } finally {
      setLoading(false);
    }
  };

  // Apply status filter first, then fuzzy-rank the remainder. Searches
  // across name, email, company, event type and notes so a query like
  // "wedding 25" still surfaces a lead with that event type + guest count.
  const statusFilteredLeads = useMemo(() => {
    return statusFilter === "all" ? leads : leads.filter((l) => l.status === statusFilter);
  }, [leads, statusFilter]);

  const filteredLeads = useFuzzyItems(
    statusFilteredLeads,
    searchTerm,
    [
      { key: "client_name" as any, weight: 3 },
      { key: "client_email" as any, weight: 2 },
      { key: "company_name" as any, weight: 2 },
      { key: "event_type" as any, weight: 1 },
      { key: "notes" as any, weight: 1 },
    ],
    { limit: 0 },
  );

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
                    placeholder="Search by name, company, email, event type..."
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
                  {filteredLeads.map((lead) => {
                    const links = linksByLeadId.get(lead.id) || {
                      quoteCount: 0,
                      latestQuoteId: null,
                      latestQuoteStatus: null,
                      orderId: null,
                      clientId: lead.converted_to_client_id ?? null,
                    };
                    const suggestion = deriveLeadSuggestion(lead, links);
                    const ageDays = lead.created_at
                      ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86_400_000)
                      : null;
                    return (
                    <div
                      key={lead.id}
                      className={`p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors ${
                        suggestion.tone === "urgent" ? "ring-2 ring-rose-200" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <h3 className="font-semibold text-slate-900">{lead.client_name}</h3>
                            <Badge className={getStatusColor(lead.status || "new")}>
                              {lead.status || "new"}
                            </Badge>
                            {/* Provenance / conversion pills */}
                            {links.quoteCount > 0 && links.latestQuoteId && (
                              <Link
                                href={`/admin/quotes/${links.latestQuoteId}`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-100"
                              >
                                <FileText className="w-3 h-3" />
                                {links.quoteCount} quote{links.quoteCount === 1 ? "" : "s"}
                              </Link>
                            )}
                            {links.orderId && (
                              <Link
                                href={`/admin/orders?orderId=${links.orderId}`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 hover:bg-emerald-100"
                              >
                                <ShoppingCart className="w-3 h-3" />
                                booked
                              </Link>
                            )}
                            {links.clientId && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5">
                                <UserCheck className="w-3 h-3" />
                                client
                              </span>
                            )}
                            {ageDays !== null && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                                <Clock className="w-3 h-3" />
                                {ageDays}d old
                              </span>
                            )}
                          </div>
                          {/* Suggested action strip */}
                          <div className={`flex items-center gap-1.5 text-sm font-semibold mb-2 ${
                            suggestion.tone === "urgent"
                              ? "text-rose-600"
                              : suggestion.tone === "warm"
                                ? "text-amber-600"
                                : "text-slate-600"
                          }`}>
                            <ArrowRight className="w-4 h-4 flex-shrink-0" />
                            <span>{suggestion.label}</span>
                            <span className="font-normal text-xs text-slate-500">-- {suggestion.reason}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-600 flex-wrap">
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
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setExpandedLeadId(expandedLeadId === lead.id ? null : lead.id)}
                          >
                            {expandedLeadId === lead.id ? "Hide Details" : "View Details"}
                          </Button>
                          {links.quoteCount > 0 && links.latestQuoteId ? (
                            <Link href={`/admin/quotes/${links.latestQuoteId}`}>
                              <Button size="sm" variant="outline">
                                Open quote
                              </Button>
                            </Link>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => router.push(`/admin/quotes/new?leadId=${lead.id}`)}
                            >
                              Convert to Quote
                            </Button>
                          )}
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
                          {/*
                            Menu picks from the client portal's rebook
                            form (requested_items JSONB). Displays as a
                            checklist the catering team can use as the
                            spine of the formal quote.
                          */}
                          {Array.isArray(lead.requested_items) && lead.requested_items.length > 0 && (
                            <div className="col-span-2 md:col-span-4">
                              <p className="text-slate-500 text-xs mb-1.5 flex items-center gap-1.5">
                                Items requested by client
                                <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                                  client portal
                                </span>
                              </p>
                              <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                                {lead.requested_items.map((it: any, i: number) => (
                                  <li
                                    key={`${it.menu_item_id || i}-${i}`}
                                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <span className="font-medium text-slate-900 truncate">
                                        {it.item_name}
                                      </span>
                                      {it.category && (
                                        <span className="ml-2 text-xs text-slate-400">
                                          {it.category}
                                        </span>
                                      )}
                                      {Array.isArray(it.dietary_tags) && it.dietary_tags.length > 0 && (
                                        <span className="ml-2 text-[11px] text-slate-500 capitalize">
                                          {it.dietary_tags.slice(0, 3).join(", ")}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-sm font-semibold text-slate-700 flex-shrink-0">
                                      x{it.quantity}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                              <p className="text-[11px] text-slate-400 mt-1.5">
                                Pricing not set yet -- use these as the starting line items when you build the quote.
                              </p>
                            </div>
                          )}
                          {/*
                            Provenance: link back to the past order this
                            rebook came from, if any. Helps the team
                            replay context: who they are, what they
                            ordered last time.
                          */}
                          {lead.source_order_id && (
                            <div className="col-span-2 md:col-span-4">
                              <p className="text-[11px] text-slate-500">
                                Rebooked from past order
                                <Link
                                  href={`/admin/orders?orderId=${lead.source_order_id}`}
                                  className="ml-1.5 text-purple-600 hover:underline font-medium"
                                >
                                  view original
                                </Link>
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                  })}
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