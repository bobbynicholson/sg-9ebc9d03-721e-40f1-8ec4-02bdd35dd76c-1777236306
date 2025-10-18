import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  Search,
  Plus,
  Eye,
  Trash2,
  Mail,
  Phone,
  Calendar,
  AlertCircle,
  RefreshCw,
  ShoppingCart,
  FileText,
  UserPlus,
  TrendingUp,
  DollarSign,
} from "lucide-react";
import {
  clientManagementService,
  type ClientWithActivity,
} from "@/services/clientManagementService";
import { companyService } from "@/services/companyService";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { toast } from "@/hooks/use-toast";

export default function ClientDatabase() {
  const { user } = useAuth();
  const router = useRouter();
  const { companySlug } = router.query;
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientWithActivity[]>([]);
  const [filteredClients, setFilteredClients] = useState<ClientWithActivity[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [stats, setStats] = useState({
    totalClients: 0,
    activeClients: 0,
    totalOrders: 0,
    totalRevenue: 0,
    totalQuotes: 0,
    totalLeads: 0,
    averageOrderValue: 0,
  });
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientWithActivity | null>(null);
  const [clientDetails, setClientDetails] = useState<any>(null);
  const [newClient, setNewClient] = useState({
    email: "",
    full_name: "",
    phone: "",
  });

  useEffect(() => {
    if (user && companySlug) {
      initializePage();
    }
  }, [user, companySlug]);

  useEffect(() => {
    filterClients();
  }, [clients, searchTerm]);

  const initializePage = async () => {
    try {
      setLoading(true);
      const company = await companyService.getCompanyBySlug(companySlug as string);
      
      if (!company) {
        toast({
          title: "Error",
          description: "Company not found",
          variant: "destructive",
        });
        router.push("/");
        return;
      }

      setCompanyId(company.id);
      await loadClients(company.id);
      await loadStats(company.id);
    } catch (error) {
      console.error("Error initializing page:", error);
      toast({
        title: "Error",
        description: "Failed to load client database",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadClients = async (compId: string) => {
    try {
      const data = await clientManagementService.getCompanyClients(compId);
      setClients(data);
    } catch (error) {
      console.error("Error loading clients:", error);
      toast({
        title: "Error",
        description: "Failed to load clients",
        variant: "destructive",
      });
    }
  };

  const loadStats = async (compId: string) => {
    try {
      const statsData = await clientManagementService.getClientStats(compId);
      setStats(statsData);
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const filterClients = () => {
    if (!searchTerm) {
      setFilteredClients(clients);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = clients.filter(
      (client) =>
        client.full_name?.toLowerCase().includes(term) ||
        client.email?.toLowerCase().includes(term) ||
        client.phone?.toLowerCase().includes(term)
    );

    setFilteredClients(filtered);
  };

  const handleAddClient = async () => {
    if (!companyId || !newClient.email || !newClient.full_name || !user) {
      toast({
        title: "Missing Information",
        description: "Client name, email, and user session are required.",
        variant: "destructive",
      });
      return;
    }

    try {
      await clientManagementService.addClient(companyId, user.id, newClient);
      await loadClients(companyId);
      await loadStats(companyId);
      setAddDialogOpen(false);
      setNewClient({ email: "", full_name: "", phone: "" });
      toast({
        title: "Success",
        description: "Client added successfully",
      });
    } catch (error) {
      console.error("Error adding client:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add client",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClient = async () => {
    if (!selectedClient || !companyId) return;

    try {
      await clientManagementService.removeClient(selectedClient.id, companyId);
      await loadClients(companyId);
      await loadStats(companyId);
      setDeleteDialogOpen(false);
      setSelectedClient(null);
      toast({
        title: "Success",
        description: "Client deactivated successfully",
      });
    } catch (error) {
      console.error("Error removing client:", error);
      toast({
        title: "Error",
        description: "Failed to deactivate client",
        variant: "destructive",
      });
    }
  };

  const handleViewDetails = async (client: ClientWithActivity) => {
    if (!companyId) return;

    try {
      setSelectedClient(client);
      const details = await clientManagementService.getClientDetails(client.id, companyId);
      setClientDetails(details);
      setDetailsDialogOpen(true);
    } catch (error) {
      console.error("Error loading client details:", error);
      toast({
        title: "Error",
        description: "Failed to load client details",
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <NoIndexMeta />
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-purple-600" />
          <p className="text-slate-600">Loading client database...</p>
        </div>
      </div>
    );
  }

  const StatCard = ({
    title,
    value,
    subtitle,
    icon: Icon,
    color,
  }: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: any;
    color: string;
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-600">{title}</CardTitle>
        <div className={`h-10 w-10 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <NoIndexMeta />
      <Head>
        <title>Client Database - {companySlug}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Client Database</h1>
            <p className="text-slate-600">Manage all clients who have interacted with your platform</p>
          </div>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Client
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <StatCard
            title="Total Clients"
            value={stats.totalClients}
            subtitle={`${stats.activeClients} with orders`}
            icon={Users}
            color="bg-blue-500"
          />
          <StatCard
            title="Total Orders"
            value={stats.totalOrders}
            subtitle="All confirmed bookings"
            icon={ShoppingCart}
            color="bg-green-500"
          />
          <StatCard
            title="Total Revenue"
            value={formatCurrency(stats.totalRevenue)}
            subtitle={`Avg: ${formatCurrency(stats.averageOrderValue)}`}
            icon={DollarSign}
            color="bg-purple-500"
          />
          <StatCard
            title="Quotes & Leads"
            value={stats.totalQuotes + stats.totalLeads}
            subtitle={`${stats.totalQuotes} quotes, ${stats.totalLeads} leads`}
            icon={FileText}
            color="bg-orange-500"
          />
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex-1 max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search by name, email, or phone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => companyId && loadClients(companyId)}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                        {searchTerm ? "No clients found matching your search" : "No clients yet"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredClients.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                              <Users className="h-5 w-5 text-purple-600" />
                            </div>
                            <div>
                              <p className="font-medium text-slate-900">
                                {client.full_name || "Unknown"}
                              </p>
                              {!client.is_active && (
                                <Badge variant="secondary" className="mt-1">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {client.email && (
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Mail className="h-3 w-3" />
                                {client.email}
                              </div>
                            )}
                            {client.phone && (
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Phone className="h-3 w-3" />
                                {client.phone}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                              <ShoppingCart className="h-3 w-3 text-green-600" />
                              <span>{client.total_orders} orders</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <FileText className="h-3 w-3 text-blue-600" />
                              <span>{client.total_quotes} quotes</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <UserPlus className="h-3 w-3 text-orange-600" />
                              <span>{client.total_leads} leads</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-green-600">
                            {formatCurrency(client.total_spent)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {formatDate(client.last_activity_date)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDetails(client)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedClient(client);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 text-sm text-slate-600">
              Showing {filteredClients.length} of {clients.length} clients
            </div>
          </CardContent>
        </Card>

        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
              <DialogDescription>
                Manually add a client to your database. They can also sign up through your platform.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="clientName">Full Name *</Label>
                <Input
                  id="clientName"
                  placeholder="John Doe"
                  value={newClient.full_name}
                  onChange={(e) => setNewClient({ ...newClient, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientEmail">Email *</Label>
                <Input
                  id="clientEmail"
                  type="email"
                  placeholder="john@example.com"
                  value={newClient.email}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientPhone">Phone</Label>
                <Input
                  id="clientPhone"
                  placeholder="+27 12 345 6789"
                  value={newClient.phone}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddClient}>Add Client</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                Deactivate Client
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to deactivate {selectedClient?.full_name}? This will hide them
                from your active client list but preserve all their data.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteClient}>
                Deactivate Client
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Client Details</DialogTitle>
              <DialogDescription>
                Complete activity history for {selectedClient?.full_name}
              </DialogDescription>
            </DialogHeader>
            {clientDetails && (
              <Tabs defaultValue="orders" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="orders">
                    Orders ({clientDetails.orders.length})
                  </TabsTrigger>
                  <TabsTrigger value="quotes">
                    Quotes ({clientDetails.quotes.length})
                  </TabsTrigger>
                  <TabsTrigger value="leads">
                    Leads ({clientDetails.leads.length})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="orders" className="space-y-3 mt-4">
                  {clientDetails.orders.length === 0 ? (
                    <p className="text-center text-slate-500 py-4">No orders yet</p>
                  ) : (
                    clientDetails.orders.map((order: any) => (
                      <Card key={order.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">Order #{order.order_number}</p>
                              <p className="text-sm text-slate-600">
                                {formatDate(order.event_date)} • {order.guest_count} guests
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-green-600">
                                {formatCurrency(order.total)}
                              </p>
                              <Badge>{order.status}</Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>
                <TabsContent value="quotes" className="space-y-3 mt-4">
                  {clientDetails.quotes.length === 0 ? (
                    <p className="text-center text-slate-500 py-4">No quotes yet</p>
                  ) : (
                    clientDetails.quotes.map((quote: any) => (
                      <Card key={quote.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">Quote #{quote.quote_number}</p>
                              <p className="text-sm text-slate-600">
                                {formatDate(quote.event_date)} • {quote.guest_count} guests
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold">{formatCurrency(quote.total)}</p>
                              <Badge variant="outline">{quote.status}</Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>
                <TabsContent value="leads" className="space-y-3 mt-4">
                  {clientDetails.leads.length === 0 ? (
                    <p className="text-center text-slate-500 py-4">No leads yet</p>
                  ) : (
                    clientDetails.leads.map((lead: any) => (
                      <Card key={lead.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{lead.event_type || "Event Inquiry"}</p>
                              <p className="text-sm text-slate-600">
                                {formatDate(lead.event_date)} • {lead.guest_count || "?"} guests
                              </p>
                            </div>
                            <Badge variant="secondary">{lead.status}</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
