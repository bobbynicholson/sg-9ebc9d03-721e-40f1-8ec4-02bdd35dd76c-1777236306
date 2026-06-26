import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Users, FileText, Receipt, Eye, Mail, Phone, MapPin, Building, ArrowLeft, X } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute"; // Assumed import for ProtectedRoute
import {  UserRole  } from "@/types/app"; // Assumed import for UserRole
import { useTenantHref } from "@/lib/tenantUrl";

export default function ProtectedClientSearchPage() {
  return (
    // CS-A (client-search audit, CS-1 + CS-5): fixed the duplicate
    // COMPANY_ADMIN typo and admitted sales_admin + region_admin who
    // need client lookup pre-quote.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <ClientSearchPage />
    </ProtectedRoute>
  );
}

// View shape the rest of the page reads. Powered by the `clients`
// table - the source of truth for catering customers regardless of
// whether they've created an auth account. (The previous
// implementation queried `profiles` filtered by role='client', which
// only returns auth-signed-up users, so a tenant with 906 imported
// contacts saw 1 row.)
interface ClientView {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  region: string | null;
  role?: string | null;
}

function ClientSearchPage() {
  const router = useRouter();
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const { user } = useAuth() as any;
  const [searchTerm, setSearchTerm] = useState("");
  const [clients, setClients] = useState<ClientView[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState("all");

  useEffect(() => {
    if (user?.company_id) {
      loadClients();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  const loadClients = async () => {
    if (!user?.company_id) return;
    try {
      setLoading(true);
      // Query the clients table - not profiles. Companies have
      // hundreds of imported contacts that never sign up, so they
      // don't get a profiles row. clients holds the canonical record
      // regardless of auth state. Soft-deleted rows excluded.
      const { data, error } = await (supabase as any)
        .from("clients")
        .select(
          "id, client_name, client_type, email, phone, is_active, created_at, region_id, regions:region_id(name)",
        )
        .eq("company_id", user.company_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const mapped: ClientView[] = ((data as any[]) || []).map((c) => ({
        id: c.id,
        full_name: c.client_name,
        email: c.email,
        phone: c.phone,
        // client_type covers "individual" / "company" / "venue" etc.
        // Surface it in the company-name slot only when it's
        // genuinely a non-individual classification, otherwise it's
        // noise.
        company_name:
          c.client_type &&
          c.client_type !== "person" &&
          c.client_type !== "individual"
            ? c.client_type
            : null,
        region: c.regions?.name ?? null,
        role: "client",
      }));
      setClients(mapped);
    } catch (error) {
      console.error("Error loading clients:", error);
    } finally {
      setLoading(false);
    }
  };

  // Region filter applied first so the fuzzy matcher only ranks clients
  // in the region the user has scoped to.
  const regionFilteredClients = useMemo(() => {
    return selectedRegion === "all"
      ? clients
      : clients.filter((c) => c.region === selectedRegion);
  }, [clients, selectedRegion]);

  const filteredClients = useFuzzyItems(
    regionFilteredClients,
    searchTerm,
    [
      { key: "full_name" as any, weight: 3 },
      { key: "email" as any, weight: 2 },
      { key: "phone" as any, weight: 1 },
      { key: "company_name" as any, weight: 2 },
    ],
    { limit: 0 },
  );

  const handleSearch = async (value: string) => {
    setSearchTerm(value);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedRegion("all");
  };

  const getUniqueRegions = () => {
    const regions = clients
      .map(c => c.region)
      .filter((r): r is string => !!r);
    return [...new Set(regions)];
  };

  const handleCreateQuote = (clientId: string) => {
    router.push(withSlug(`/admin/quotes/new?clientId=${clientId}`));
  };

  // Standalone invoice creation doesn't exist - invoices flow from
  // confirmed orders. The button now drops the operator on the
  // invoices list filtered to this client so they can review what's
  // outstanding / paid for them.
  const handleViewInvoices = (clientId: string) => {
    router.push(withSlug(`/admin/invoices?clientId=${clientId}`));
  };

  const handleViewOrders = (clientId: string) => {
    router.push(withSlug(`/admin/orders?clientId=${clientId}`));
  };

  const handleViewProfile = (clientId: string) => {
    router.push(withSlug(`/admin/contacts?clientId=${clientId}`));
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Client search - CateringMS</title>
      </Head>
      
      <AdminNav />
      
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Client Search"
            icon={Search}
            subtitle="Searchable directory of every registered client. Filter by name, email, phone, company, or region. For the merged inbox view including leads and prospects, use Contacts instead."
            actions={
            <>
              <Link href={withSlug("/admin/dashboard")}>
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
            </>
            }
          />
          <PageWorkbench />

          {/* Header */}
          <div className="mb-8">
            {/* Search and Filters */}
            <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Search by name, email, phone, or company..."
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="pl-10 h-12 text-lg"
                  />
                </div>
                <div className="flex gap-2">
                  <select
                    value={selectedRegion}
                    onChange={(e) => setSelectedRegion(e.target.value)}
                    className="border border-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  >
                    <option value="all">All Regions</option>
                    {getUniqueRegions().map((region) => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                  {(searchTerm || selectedRegion !== "all") && (
                    <Button
                      variant="outline"
                      onClick={clearFilters}
                      className="whitespace-nowrap"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>
                  Showing {filteredClients.length} of {clients.length} clients
                </span>
                {searchTerm && (
                  <span className="text-slate-600 font-medium">
                    Search results for "{searchTerm}"
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600 mx-auto"></div>
              <p className="text-slate-600 mt-4">Loading clients...</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <Card className="border-0 shadow-lg">
              <CardContent className="py-12 text-center">
                <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-xl font-semibold text-slate-700 mb-2">
                  {searchTerm ? "No clients found" : "No clients yet"}
                </p>
                <p className="text-slate-600">
                  {searchTerm 
                    ? "Try adjusting your search terms or filters"
                    : "Clients will appear here once they register"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredClients.map((client) => (
                <Card key={client.id} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Client Info */}
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-400 to-rose-400 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                          {client.full_name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-xl font-bold text-slate-900 truncate">
                              {client.full_name || "Unnamed Client"}
                            </h3>
                            {client.role && (
                              <Badge className="bg-slate-100 text-slate-700 border-slate-200">
                                {client.role}
                              </Badge>
                            )}
                          </div>
                          <div className="grid sm:grid-cols-2 gap-2 text-sm text-slate-600">
                            {client.email && (
                              // CS-A (CS-6): mailto: link for tap-to-email.
                              <a
                                href={`mailto:${client.email}`}
                                className="flex items-center gap-2 hover:text-slate-900 hover:underline"
                              >
                                <Mail className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{client.email}</span>
                              </a>
                            )}
                            {client.phone && (
                              // CS-A (CS-6): tel: link for tap-to-call.
                              <a
                                href={`tel:${client.phone}`}
                                className="flex items-center gap-2 hover:text-slate-900 hover:underline"
                              >
                                <Phone className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{client.phone}</span>
                              </a>
                            )}
                            {client.company_name && (
                              <div className="flex items-center gap-2">
                                <Building className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{client.company_name}</span>
                              </div>
                            )}
                            {client.region && (
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{client.region}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Quick Actions */}
                      <div className="flex flex-wrap gap-2 lg:flex-nowrap lg:flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewProfile(client.id)}
                          className="hover:bg-slate-50 hover:border-slate-300"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCreateQuote(client.id)}
                          className="hover:bg-blue-50 hover:border-blue-300"
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Quote
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewInvoices(client.id)}
                          className="hover:bg-brand-primary/10 hover:border-brand-primary/30"
                        >
                          <Receipt className="w-4 h-4 mr-2" />
                          Invoices
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewOrders(client.id)}
                          className="hover:bg-orange-50 hover:border-orange-300"
                        >
                          <Users className="w-4 h-4 mr-2" />
                          Orders
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </PortalShell>
      </div>
    </>
  );
}
