import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
import { PlatformNav } from "@/components/admin/PlatformNav";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  CreditCard, 
  Search,
  RefreshCw,
  Eye,
  Ban,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Users
} from "lucide-react";
import { subscriptionService } from "@/services/subscriptionService";
import type { Database } from "@/integrations/supabase/types";

type SubscriptionWithProfile = Database["public"]["Tables"]["subscriptions"]["Row"] & {
  profiles: {
    full_name: string | null;
    email: string | null;
  } | null;
};

export default function PlatformSubscriptionManagement() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [subscriptions, setSubscriptions] = useState<SubscriptionWithProfile[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    trial: 0,
    cancelled: 0,
    pastDue: 0,
    totalMRR: 0
  });

  useEffect(() => {
    if (user) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Request timeout")), 10000)
      );
      
      const dataPromise = subscriptionService.getAllSubscriptions();
      
      const allSubs = await Promise.race([dataPromise, timeoutPromise]) as SubscriptionWithProfile[];
      
      setSubscriptions(allSubs);
      calculateStats(allSubs);
    } catch (err) {
      console.error("Error loading subscriptions:", err);
      setError(err instanceof Error ? err.message : "Failed to load subscriptions");
      // Set empty data on error to allow UI to render
      setSubscriptions([]);
      calculateStats([]);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (subs: SubscriptionWithProfile[]) => {
    const stats = {
      total: subs.length,
      active: subs.filter(s => s.status === "active").length,
      trial: subs.filter(s => s.status === "trial").length,
      cancelled: subs.filter(s => s.status === "cancelled").length,
      pastDue: subs.filter(s => s.status === "past_due").length,
      totalMRR: subs
        .filter(s => s.status === "active" && s.billing_cycle === "monthly")
        .reduce((sum, s) => sum + Number(s.amount), 0)
    };
    setStats(stats);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const filteredSubscriptions = subscriptions.filter(sub => {
    const matchesSearch = 
      sub.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.profiles?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.plan_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || sub.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (amount: number, currency: string = "ZAR") => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: currency
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-ZA", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; className: string }> = {
      active: { label: "Active", className: "bg-green-500" },
      trial: { label: "Trial", className: "bg-blue-500" },
      past_due: { label: "Past Due", className: "bg-yellow-500" },
      cancelled: { label: "Cancelled", className: "bg-red-500" },
      expired: { label: "Expired", className: "bg-gray-500" }
    };

    const { label, className } = config[status] || { label: status, className: "bg-gray-500" };
    return <Badge className={className}>{label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-purple-600" />
          <p className="text-slate-600">Loading subscription management...</p>
          <p className="text-xs text-slate-400 mt-2">This should only take a few seconds</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">Authentication Required</h3>
            <p className="text-slate-600 mb-6">Please sign in to access subscription management.</p>
            <Button onClick={() => router.push("/auth/login")}>Sign In</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 lg:pl-64 xl:pl-72 pt-16 lg:pt-0">
      <PlatformNav />
      <Head>
        <title>Subscription Management - CateringMS Platform</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Subscription Management</h1>
            <p className="text-slate-600">Monitor and manage customer subscriptions</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              <strong>Error loading subscriptions:</strong> {error}
              <Button 
                variant="link" 
                size="sm" 
                onClick={handleRefresh}
                className="ml-2 text-red-700 underline"
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 md:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Total Subscriptions</CardTitle>
              <Users className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
              <p className="text-xs text-slate-500 mt-1">All customers</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Active</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
              <p className="text-xs text-slate-500 mt-1">Paying customers</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">In Trial</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.trial}</div>
              <p className="text-xs text-slate-500 mt-1">Free trial period</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Monthly MRR</CardTitle>
              <DollarSign className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {formatCurrency(stats.totalMRR)}
              </div>
              <p className="text-xs text-slate-500 mt-1">Recurring revenue</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <CardTitle>Customer Subscriptions</CardTitle>
              <div className="flex items-center gap-3">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search customers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="past_due">Past Due</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredSubscriptions.length === 0 ? (
              <div className="text-center py-12">
                <AlertTriangle className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">
                  {subscriptions.length === 0 
                    ? "No subscriptions found in the system" 
                    : "No subscriptions found matching your criteria"}
                </p>
                {error && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRefresh}
                    className="mt-4"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry Loading
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Billing Cycle</TableHead>
                      <TableHead>Next Billing</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubscriptions.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900">
                              {sub.profiles?.full_name || "Unknown"}
                            </p>
                            <p className="text-sm text-slate-500">
                              {sub.profiles?.email || "No email"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{sub.plan_name}</p>
                        </TableCell>
                        <TableCell>{getStatusBadge(sub.status)}</TableCell>
                        <TableCell>
                          <p className="font-medium">
                            {formatCurrency(Number(sub.amount), sub.currency)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm capitalize">{sub.billing_cycle}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{formatDate(sub.next_billing_date)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/admin/subscription?userId=${sub.user_id}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2 mt-6">
          <Card className="border-yellow-200 bg-yellow-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                At Risk ({stats.pastDue})
              </CardTitle>
              <CardDescription>Subscriptions requiring attention</CardDescription>
            </CardHeader>
            <CardContent>
              {subscriptions.filter(s => s.status === "past_due").length === 0 ? (
                <p className="text-sm text-slate-600 text-center py-4">No at-risk subscriptions</p>
              ) : (
                <div className="space-y-3">
                  {subscriptions.filter(s => s.status === "past_due").map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                      <div>
                        <p className="font-medium text-sm">{sub.profiles?.full_name}</p>
                        <p className="text-xs text-slate-500">{sub.plan_name}</p>
                      </div>
                      <Button variant="outline" size="sm">
                        Contact
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-red-600" />
                Cancelled ({stats.cancelled})
              </CardTitle>
              <CardDescription>Recently cancelled subscriptions</CardDescription>
            </CardHeader>
            <CardContent>
              {subscriptions.filter(s => s.status === "cancelled").length === 0 ? (
                <p className="text-sm text-slate-600 text-center py-4">No cancelled subscriptions</p>
              ) : (
                <div className="space-y-3">
                  {subscriptions.filter(s => s.status === "cancelled").slice(0, 3).map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                      <div>
                        <p className="font-medium text-sm">{sub.profiles?.full_name}</p>
                        <p className="text-xs text-slate-500">
                          Ended {formatDate(sub.current_period_end)}
                        </p>
                      </div>
                      <Button variant="outline" size="sm">
                        Review
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
