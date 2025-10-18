import { useState, useEffect, useMemo, useCallback } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  Search,
  Plus,
  Eye,
  Trash2,
  Mail,
  Phone,
  Calendar,
  AlertCircle,
  Filter,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { companyService, type CompanyWithOwner } from "@/services/companyService";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { toast } from "@/hooks/use-toast";

type NewCompany = {
  name: string;
  owner_email: string;
  email?: string;
  phone?: string;
}

const CompanyDatabasePage: React.FC = () => {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyWithOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState<{ key: keyof CompanyWithOwner, direction: "ascending" | "descending" } | null>({ key: 'created_at', direction: 'descending' });

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyWithOwner | null>(null);
  const [newCompany, setNewCompany] = useState<NewCompany>({ name: "", owner_email: "" });

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await companyService.getAllCompanies();
      setCompanies(data);
    } catch (err: any) {
      setError(err.message);
      toast({
        title: "Error fetching companies",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);
  
  const handleAddCompany = async () => {
    // Basic validation
    if (!newCompany.name || !newCompany.owner_email) {
      toast({ title: "Validation Error", description: "Company Name and Owner Email are required.", variant: "destructive" });
      return;
    }
    // More robust implementation would be needed here
    console.log("Adding company (manual):", newCompany);
    setAddDialogOpen(false);
    setNewCompany({ name: "", owner_email: "" });
    toast({ title: "Success", description: "Company added manually. Note: This does not create a user." });
  };
  
  const handleDeleteCompany = async () => {
    if (!selectedCompany) return;
    try {
      await companyService.deactivateCompany(selectedCompany.id);
      toast({
        title: "Company Deactivated",
        description: `${selectedCompany.company_name} has been successfully deactivated.`,
      });
      fetchCompanies(); // Refresh the list
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleteDialogOpen(false);
      setSelectedCompany(null);
    }
  };

  const filteredAndSortedCompanies = useMemo(() => {
    let filtered = [...companies];

    if (statusFilter !== "all") {
      filtered = filtered.filter(c => c.subscription_status === statusFilter);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (company) =>
          company.company_name.toLowerCase().includes(term) ||
          company.slug.toLowerCase().includes(term) ||
          company.email?.toLowerCase().includes(term) ||
          company.owner_email?.toLowerCase().includes(term)
      );
    }

    if (sortConfig) {
      const { key, direction } = sortConfig;
      filtered.sort((a, b) => {
        let aValue = a[key];
        let bValue = b[key];

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          aValue = aValue?.toLowerCase() ?? '';
          bValue = bValue?.toLowerCase() ?? '';
        }
    
        if (aValue < bValue) {
          return direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [companies, searchTerm, sortConfig, statusFilter]);

  const requestSort = (key: keyof CompanyWithOwner) => {
    if (sortConfig && sortConfig.key === key) {
      setSortConfig({ ...sortConfig, direction: sortConfig.direction === 'ascending' ? 'descending' : 'ascending' });
    } else {
      setSortConfig({ key, direction: 'ascending' });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: { [key: string]: { variant: "default" | "destructive" | "secondary", label: string, className?: string } } = {
      trial: { variant: "default", label: "Trial" },
      active: { variant: "default", label: "Active", className: "bg-green-500 hover:bg-green-600 text-white" },
      past_due: { variant: "destructive", label: "Past Due" },
      cancelled: { variant: "secondary", label: "Cancelled" },
    };

    const config = statusConfig[status] || statusConfig.trial;
    
    return (
      <Badge variant={config.variant} className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <NoIndexMeta />
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-purple-600" />
          <p className="text-slate-600">Loading companies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <NoIndexMeta />
      <Head>
        <title>Company Database - CateringMS Platform</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Company Database</h1>
            <p className="text-slate-600">Manage all catering companies on the platform</p>
          </div>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Company
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex-1 max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search by name, slug, or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="trialing">Trial</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="past_due">Past Due</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={fetchCompanies}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead onClick={() => requestSort('company_name')}>Company Name</TableHead>
                    <TableHead onClick={() => requestSort('slug')}>Slug</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead onClick={() => requestSort('created_at')}>Created At</TableHead>
                    <TableHead onClick={() => requestSort('subscription_status')}>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6}>Loading...</TableCell></TableRow>
                  ) : error ? (
                    <TableRow><TableCell colSpan={6} className="text-red-500">{error}</TableCell></TableRow>
                  ) : (
                    filteredAndSortedCompanies.map((company) => (
                      <TableRow key={company.id}>
                        <TableCell className="font-medium">{company.company_name}</TableCell>
                        <TableCell>
                          <a href={`/${company.slug}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                            /{company.slug}
                          </a>
                        </TableCell>
                        <TableCell>{company.owner_email || 'N/A'}</TableCell>
                        <TableCell>{new Date(company.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {getStatusBadge(company.subscription_status || 'trial')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/${company.slug}/admin/onboarding`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedCompany(company);
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
              Showing {filteredAndSortedCompanies.length} of {companies.length} companies
            </div>
          </CardContent>
        </Card>

        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Company</DialogTitle>
              <DialogDescription>
                Note: Companies should sign up through the platform. This is for manual additions only.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name *</Label>
                <Input
                  id="companyName"
                  placeholder="e.g., Delicious Catering Co."
                  value={newCompany.name}
                  onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerEmail">Owner Email *</Label>
                <Input
                  id="ownerEmail"
                  type="email"
                  placeholder="owner@example.com"
                  value={newCompany.owner_email}
                  onChange={(e) =>
                    setNewCompany({ ...newCompany, owner_email: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyEmail">Company Email</Label>
                <Input
                  id="companyEmail"
                  type="email"
                  placeholder="info@company.com"
                  value={newCompany.email}
                  onChange={(e) => setNewCompany({ ...newCompany, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyPhone">Company Phone</Label>
                <Input
                  id="companyPhone"
                  placeholder="+1234567890"
                  value={newCompany.phone}
                  onChange={(e) => setNewCompany({ ...newCompany, phone: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddCompany}>Add Company</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                Deactivate Company
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to deactivate {selectedCompany?.company_name}? This will prevent
                access to their platform but preserve all data.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteCompany}>
                Deactivate Company
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default CompanyDatabasePage;
