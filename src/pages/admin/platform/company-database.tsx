import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2,
  Plus,
  Search,
  Users,
  Calendar,
  CreditCard,
  MapPin,
  Edit,
  Trash2,
  UserPlus,
  Eye,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { companyService } from "@/services/companyService";
import { userManagementService } from "@/services/userManagementService";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Company {
  id: string;
  company_name: string;
  company_slug: string;
  owner_id: string;
  email: string;
  phone: string;
  address_line1: string;
  city: string;
  country: string;
  subscription_status: string;
  trial_ends_at: string;
  created_at: string;
  owner_name?: string;
  total_users?: number;
  total_orders?: number;
}

export default function CompanyDatabasePage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  // Add/Edit company modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formData, setFormData] = useState({
    company_name: "",
    company_slug: "",
    email: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "South Africa",
    billing_currency: "ZAR",
    admin_name: "",
    admin_email: "",
    admin_password: "BYPASS_2026",
  });

  // Company details modal
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyUsers, setCompanyUsers] = useState<any[]>([]);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  useEffect(() => {
    if (profile?.active_role === "super_admin") {
      loadCompanies();
    }
  }, [profile]);

  useEffect(() => {
    filterCompanies();
  }, [companies, searchTerm, statusFilter]);

  const loadCompanies = async () => {
    try {
      setLoading(true);
      const { data: companiesData, error } = await supabase
        .from("companies")
        .select(`
          *,
          profiles!companies_owner_id_fkey(full_name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Enhance with stats
      const enhanced = await Promise.all(
        (companiesData || []).map(async (company: any) => {
          // Get total users
          const { count: userCount } = await supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("company_id", company.id);

          // Get total orders
          const { count: orderCount } = await supabase
            .from("orders")
            .select("*", { count: "exact", head: true })
            .eq("company_id", company.id);

          return {
            ...company,
            owner_name: company.profiles?.full_name || "Unknown",
            total_users: userCount || 0,
            total_orders: orderCount || 0,
          };
        })
      );

      setCompanies(enhanced);
    } catch (error: any) {
      console.error("Error loading companies:", error);
      toast({
        title: "Error",
        description: "Failed to load companies",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filterCompanies = () => {
    let filtered = companies;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (company) =>
          company.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          company.company_slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
          company.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(
        (company) => company.subscription_status === statusFilter
      );
    }

    setFilteredCompanies(filtered);
  };

  const handleAddCompany = async () => {
    try {
      if (!formData.company_name || !formData.admin_email) {
        toast({
          title: "Missing Information",
          description: "Company name and admin email are required",
          variant: "destructive",
        });
        return;
      }

      // Generate slug if not provided
      const slug =
        formData.company_slug ||
        formData.company_name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

      // Create company and admin user
      const result = await companyService.createCompanyWithAdmin({
        company_name: formData.company_name,
        company_slug: slug,
        email: formData.email,
        phone: formData.phone,
        address_line1: formData.address_line1,
        address_line2: formData.address_line2,
        city: formData.city,
        state: formData.state,
        postal_code: formData.postal_code,
        country: formData.country,
        billing_currency: formData.billing_currency,
        admin_name: formData.admin_name || "Admin",
        admin_email: formData.admin_email,
        admin_password: formData.admin_password,
      });

      if (result.success) {
        toast({
          title: "Success",
          description: `Company "${formData.company_name}" created successfully!`,
        });

        setIsAddModalOpen(false);
        resetForm();
        loadCompanies();
      } else {
        throw new Error(result.error || "Failed to create company");
      }
    } catch (error: any) {
      console.error("Error creating company:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create company",
        variant: "destructive",
      });
    }
  };

  const handleUpdateCompany = async () => {
    try {
      if (!editingCompany) return;

      const { error } = await supabase
        .from("companies")
        .update({
          company_name: formData.company_name,
          email: formData.email,
          phone: formData.phone,
          address_line1: formData.address_line1,
          address_line2: formData.address_line2,
          city: formData.city,
          state_province: formData.state,
          postal_code: formData.postal_code,
          country: formData.country,
          billing_currency: formData.billing_currency,
        } as any)
        .eq("id", editingCompany.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Company updated successfully!",
      });

      setIsAddModalOpen(false);
      setEditingCompany(null);
      resetForm();
      loadCompanies();
    } catch (error: any) {
      console.error("Error updating company:", error);
      toast({
        title: "Error",
        description: "Failed to update company",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    if (!confirm(`Are you sure you want to delete "${companyName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("companies")
        .update({ 
          is_active: false,
          subscription_status: 'cancelled',
          suspended_reason: 'Deleted by super admin'
        } as any)
        .eq("id", companyId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Company "${companyName}" deleted successfully!`,
      });

      loadCompanies();
    } catch (error: any) {
      console.error("Error deleting company:", error);
      toast({
        title: "Error",
        description: "Failed to delete company",
        variant: "destructive",
      });
    }
  };

  const handleViewCompany = async (company: Company) => {
    try {
      setSelectedCompany(company);
      
      // Load company users
      const { data: users, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setCompanyUsers(users || []);
      setIsDetailsModalOpen(true);
    } catch (error: any) {
      console.error("Error loading company details:", error);
      toast({
        title: "Error",
        description: "Failed to load company details",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      company_name: "",
      company_slug: "",
      email: "",
      phone: "",
      address_line1: "",
      address_line2: "",
      city: "",
      state: "",
      postal_code: "",
      country: "South Africa",
      billing_currency: "ZAR",
      admin_name: "",
      admin_email: "",
      admin_password: "BYPASS_2026",
    });
  };

  const openEditModal = (company: Company) => {
    setEditingCompany(company);
    setFormData({
      company_name: company.company_name,
      company_slug: company.company_slug,
      email: company.email,
      phone: company.phone,
      address_line1: company.address_line1,
      address_line2: "",
      city: company.city,
      state: "",
      postal_code: "",
      country: company.country,
      billing_currency: "ZAR",
      admin_name: "",
      admin_email: "",
      admin_password: "BYPASS_2026",
    });
    setIsAddModalOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      trial: "secondary",
      active: "default",
      past_due: "destructive",
      cancelled: "outline",
      suspended: "destructive",
    };

    return (
      <Badge variant={variants[status] || "outline"}>
        {status.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  if (profile?.active_role !== "super_admin") {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="container mx-auto px-4 py-12">
          <Card>
            <CardContent className="p-12 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
              <p className="text-slate-600">
                You need super admin permissions to access this page.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Company Management</h1>
            <p className="text-slate-600 mt-1">
              Add and manage catering companies on the platform
            </p>
          </div>

          <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setEditingCompany(null); }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Company
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingCompany ? "Edit Company" : "Add New Company"}
                </DialogTitle>
                <DialogDescription>
                  {editingCompany
                    ? "Update company information"
                    : "Create a new catering company and admin user"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Company Information */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Company Information
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label>Company Name *</Label>
                      <Input
                        value={formData.company_name}
                        onChange={(e) =>
                          setFormData({ ...formData, company_name: e.target.value })
                        }
                        placeholder="e.g., Spit Braai Delivery"
                      />
                    </div>

                    <div className="col-span-2">
                      <Label>Company Slug *</Label>
                      <Input
                        value={formData.company_slug}
                        onChange={(e) =>
                          setFormData({ ...formData, company_slug: e.target.value })
                        }
                        placeholder="e.g., spit-braai-delivery"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Used in URLs: yoursite.com/{formData.company_slug}/login
                      </p>
                    </div>

                    <div>
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        placeholder="contact@company.com"
                      />
                    </div>

                    <div>
                      <Label>Phone</Label>
                      <Input
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                        placeholder="+27 XX XXX XXXX"
                      />
                    </div>

                    <div className="col-span-2">
                      <Label>Address Line 1</Label>
                      <Input
                        value={formData.address_line1}
                        onChange={(e) =>
                          setFormData({ ...formData, address_line1: e.target.value })
                        }
                        placeholder="Street address"
                      />
                    </div>

                    <div className="col-span-2">
                      <Label>Address Line 2</Label>
                      <Input
                        value={formData.address_line2}
                        onChange={(e) =>
                          setFormData({ ...formData, address_line2: e.target.value })
                        }
                        placeholder="Unit, suite, etc. (optional)"
                      />
                    </div>

                    <div>
                      <Label>City</Label>
                      <Input
                        value={formData.city}
                        onChange={(e) =>
                          setFormData({ ...formData, city: e.target.value })
                        }
                        placeholder="City"
                      />
                    </div>

                    <div>
                      <Label>State/Province</Label>
                      <Input
                        value={formData.state}
                        onChange={(e) =>
                          setFormData({ ...formData, state: e.target.value })
                        }
                        placeholder="State"
                      />
                    </div>

                    <div>
                      <Label>Postal Code</Label>
                      <Input
                        value={formData.postal_code}
                        onChange={(e) =>
                          setFormData({ ...formData, postal_code: e.target.value })
                        }
                        placeholder="Postal code"
                      />
                    </div>

                    <div>
                      <Label>Country</Label>
                      <Select
                        value={formData.country}
                        onValueChange={(value) =>
                          setFormData({ ...formData, country: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="South Africa">South Africa</SelectItem>
                          <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                          <SelectItem value="United States">United States</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Billing Currency</Label>
                      <Select
                        value={formData.billing_currency}
                        onValueChange={(value) =>
                          setFormData({ ...formData, billing_currency: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ZAR">ZAR (South Africa)</SelectItem>
                          <SelectItem value="GBP">GBP (UK)</SelectItem>
                          <SelectItem value="USD">USD (US)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Admin User (only for new companies) */}
                {!editingCompany && (
                  <div className="space-y-4 border-t pt-4">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                      <UserPlus className="w-4 h-4" />
                      Company Admin User
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Admin Name</Label>
                        <Input
                          value={formData.admin_name}
                          onChange={(e) =>
                            setFormData({ ...formData, admin_name: e.target.value })
                          }
                          placeholder="John Doe"
                        />
                      </div>

                      <div>
                        <Label>Admin Email *</Label>
                        <Input
                          type="email"
                          value={formData.admin_email}
                          onChange={(e) =>
                            setFormData({ ...formData, admin_email: e.target.value })
                          }
                          placeholder="admin@company.com"
                        />
                      </div>

                      <div className="col-span-2">
                        <Label>Password</Label>
                        <Input
                          value={formData.admin_password}
                          onChange={(e) =>
                            setFormData({ ...formData, admin_password: e.target.value })
                          }
                          placeholder="Default: BYPASS_2026"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Default bypass password for easy testing
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingCompany(null);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={editingCompany ? handleUpdateCompany : handleAddCompany}
                >
                  {editingCompany ? "Update Company" : "Create Company"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Total Companies</p>
                  <p className="text-3xl font-bold text-slate-900">
                    {companies.length}
                  </p>
                </div>
                <Building2 className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Active</p>
                  <p className="text-3xl font-bold text-green-600">
                    {companies.filter((c) => c.subscription_status === "active").length}
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">On Trial</p>
                  <p className="text-3xl font-bold text-orange-600">
                    {companies.filter((c) => c.subscription_status === "trial").length}
                  </p>
                </div>
                <Calendar className="w-8 h-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Total Users</p>
                  <p className="text-3xl font-bold text-purple-600">
                    {companies.reduce((sum, c) => sum + (c.total_users || 0), 0)}
                  </p>
                </div>
                <Users className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search companies..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="past_due">Past Due</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Companies Table */}
        <Card>
          <CardHeader>
            <CardTitle>Companies ({filteredCompanies.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        Loading companies...
                      </TableCell>
                    </TableRow>
                  ) : filteredCompanies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        No companies found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCompanies.map((company) => (
                      <TableRow key={company.id}>
                        <TableCell>
                          <div>
                            <p className="font-semibold text-slate-900">
                              {company.company_name}
                            </p>
                            <p className="text-sm text-slate-500">
                              /{company.company_slug}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{company.owner_name}</p>
                          <p className="text-xs text-slate-500">{company.email}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <MapPin className="w-3 h-3" />
                            {company.city}, {company.country}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(company.subscription_status)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Users className="w-3 h-3" />
                            {company.total_users}
                          </div>
                        </TableCell>
                        <TableCell>{company.total_orders}</TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {new Date(company.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleViewCompany(company)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditModal(company)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                handleDeleteCompany(company.id, company.company_name)
                              }
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Company Details Modal */}
        <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedCompany?.company_name}</DialogTitle>
              <DialogDescription>Company details and users</DialogDescription>
            </DialogHeader>

            {selectedCompany && (
              <div className="space-y-6 py-4">
                {/* Company Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-600">Company Slug</Label>
                    <p className="font-semibold">/{selectedCompany.company_slug}</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Status</Label>
                    <div>{getStatusBadge(selectedCompany.subscription_status)}</div>
                  </div>
                  <div>
                    <Label className="text-slate-600">Email</Label>
                    <p>{selectedCompany.email}</p>
                  </div>
                  <div>
                    <Label className="text-slate-600">Phone</Label>
                    <p>{selectedCompany.phone || "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-slate-600">Address</Label>
                    <p>
                      {selectedCompany.address_line1}, {selectedCompany.city},{" "}
                      {selectedCompany.country}
                    </p>
                  </div>
                </div>

                {/* Company Users */}
                <div>
                  <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Company Users ({companyUsers.length})
                  </h3>

                  <div className="space-y-2">
                    {companyUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                      >
                        <div>
                          <p className="font-semibold">{user.full_name || user.email}</p>
                          <p className="text-sm text-slate-600">{user.email}</p>
                        </div>
                        <Badge>{user.active_role}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}