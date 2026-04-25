import { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Users, 
  FileText, 
  Receipt,
  Eye,
  Mail,
  Phone,
  MapPin,
  Building,
  ArrowLeft,
  Filter,
  X,
  UserCircle
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { profileService, Profile } from "@/services/profileService";
import { useAuth } from "@/contexts/AuthContext";

export default function ClientSearchPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [clients, setClients] = useState<Profile[]>([]);
  const [filteredClients, setFilteredClients] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState("all");

  useEffect(() => {
    if (user) {
      loadClients();
    }
  }, [user]);

  useEffect(() => {
    filterClients();
  }, [searchTerm, selectedRegion, clients]);

  const loadClients = async () => {
    try {
      setLoading(true);
      const data = await profileService.getAllClients();
      setClients(data);
      setFilteredClients(data);
    } catch (error) {
      console.error("Error loading clients:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterClients = () => {
    let filtered = [...clients];

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(client => 
        client.full_name?.toLowerCase().includes(term) ||
        client.email?.toLowerCase().includes(term) ||
        client.phone?.toLowerCase().includes(term) ||
        client.company_name?.toLowerCase().includes(term)
      );
    }

    // Filter by region
    if (selectedRegion !== "all") {
      filtered = filtered.filter(client => client.region === selectedRegion);
    }

    setFilteredClients(filtered);
  };

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
    router.push(`/quotes/new?clientId=${clientId}`);
  };

  const handleCreateInvoice = (clientId: string) => {
    // Navigate to invoice creation with pre-filled client
    router.push(`/admin/invoices/new?clientId=${clientId}`);
  };

  const handleViewOrders = (clientId: string) => {
    router.push(`/orders?clientId=${clientId}`);
  };

  const handleViewProfile = (clientId: string) => {
    router.push(`/admin/clients/${clientId}`);
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Client Search | CateringMS Admin</title>
      </Head>
      
      <AdminNav />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 lg:pl-64">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <Link href="/admin/dashboard">
            <Button variant="ghost" className="mb-4" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-lg">
                <Search className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Client Search
                </h1>
                <p className="text-slate-600 mt-1">Find and manage your clients</p>
              </div>
            </div>

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
                    className="border border-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                  <span className="text-purple-600 font-medium">
                    Search results for "{searchTerm}"
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
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
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                          {client.full_name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-xl font-bold text-slate-900 truncate">
                              {client.full_name || "Unnamed Client"}
                            </h3>
                            {client.role && (
                              <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                                {client.role}
                              </Badge>
                            )}
                          </div>
                          <div className="grid sm:grid-cols-2 gap-2 text-sm text-slate-600">
                            {client.email && (
                              <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{client.email}</span>
                              </div>
                            )}
                            {client.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{client.phone}</span>
                              </div>
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
                          className="hover:bg-purple-50 hover:border-purple-300"
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
                          onClick={() => handleCreateInvoice(client.id)}
                          className="hover:bg-green-50 hover:border-green-300"
                        >
                          <Receipt className="w-4 h-4 mr-2" />
                          Invoice
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
        </div>
      </div>
    </>
  );
}
