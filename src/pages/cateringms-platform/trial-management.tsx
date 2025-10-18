import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
import { subscriptionService } from "@/services/subscriptionService";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Bell, CheckCircle, Clock, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CompanyTrialStatus {
  id: string;
  company_name: string;
  slug: string;
  owner_email: string;
  trial_ends_at: string;
  subscription_status: string;
  days_remaining: number;
  notifications_sent: number;
  last_notification_type: string | null;
}

export default function TrialManagementPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyTrialStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [stats, setStats] = useState({
    totalTrials: 0,
    expiringIn7Days: 0,
    expiringIn3Days: 0,
    expiringIn1Day: 0,
    expired: 0
  });

  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    // Check if user has super_admin role
    if (profile?.active_role !== "super_admin") {
      router.push("/");
      return;
    }

    loadTrialCompanies();
  }, [user, profile]);

  const loadTrialCompanies = async () => {
    setLoading(true);
    try {
      // Get all companies with trial status
      const { data: companiesData, error: companiesError } = await supabase
        .from("companies")
        .select(`
          id,
          company_name,
          slug,
          owner_id,
          trial_ends_at,
          subscription_status
        `)
        .eq("subscription_status", "trialing")
        .order("trial_ends_at", { ascending: true });

      if (companiesError) throw companiesError;

      if (!companiesData) {
        setCompanies([]);
        return;
      }

      // Get owner emails
      const ownerIds = companiesData.map(c => c.owner_id).filter(Boolean);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", ownerIds);

      const emailMap = new Map(profilesData?.map(p => [p.id, p.email]) || []);

      // Calculate days remaining and get notification counts
      const now = new Date();
      const enrichedCompanies = await Promise.all(
        companiesData.map(async (company) => {
          const trialEnd = company.trial_ends_at ? new Date(company.trial_ends_at) : null;
          const daysRemaining = trialEnd
            ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
            : 0;

          // Get notification history
          const { data: notifications } = await supabase
            .from("trial_expiry_notifications")
            .select("notification_type")
            .eq("company_id", company.id)
            .order("sent_at", { ascending: false });

          return {
            id: company.id,
            company_name: company.company_name,
            slug: company.slug,
            owner_email: emailMap.get(company.owner_id || "") || "N/A",
            trial_ends_at: company.trial_ends_at || "",
            subscription_status: company.subscription_status || "unknown",
            days_remaining: daysRemaining,
            notifications_sent: notifications?.length || 0,
            last_notification_type: notifications?.[0]?.notification_type || null
          };
        })
      );

      setCompanies(enrichedCompanies);

      // Calculate stats
      const newStats = {
        totalTrials: enrichedCompanies.length,
        expiringIn7Days: enrichedCompanies.filter(c => c.days_remaining <= 7 && c.days_remaining > 3).length,
        expiringIn3Days: enrichedCompanies.filter(c => c.days_remaining <= 3 && c.days_remaining > 1).length,
        expiringIn1Day: enrichedCompanies.filter(c => c.days_remaining <= 1 && c.days_remaining > 0).length,
        expired: enrichedCompanies.filter(c => c.days_remaining === 0).length
      };
      setStats(newStats);

    } catch (error) {
      console.error("Error loading trial companies:", error);
      toast({
        title: "Error",
        description: "Failed to load trial companies",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckNotifications = async () => {
    setChecking(true);
    try {
      const result = await subscriptionService.triggerTrialExpiryCheck();
      
      if (result.success) {
        toast({
          title: "Success",
          description: "Trial expiry notifications checked and sent successfully",
        });
        await loadTrialCompanies();
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error checking notifications:", error);
      toast({
        title: "Error",
        description: "Failed to check trial notifications",
        variant: "destructive"
      });
    } finally {
      setChecking(false);
    }
  };

  const getUrgencyBadge = (daysRemaining: number) => {
    if (daysRemaining === 0) {
      return <Badge variant="destructive">Expired</Badge>;
    } else if (daysRemaining <= 1) {
      return <Badge variant="destructive">{daysRemaining} day</Badge>;
    } else if (daysRemaining <= 3) {
      return <Badge className="bg-orange-500">{daysRemaining} days</Badge>;
    } else if (daysRemaining <= 7) {
      return <Badge className="bg-yellow-500">{daysRemaining} days</Badge>;
    } else {
      return <Badge variant="secondary">{daysRemaining} days</Badge>;
    }
  };

  const getNotificationBadge = (type: string | null) => {
    if (!type) return <Badge variant="outline">None</Badge>;
    
    const typeMap: Record<string, { label: string; color: string }> = {
      "7_days": { label: "7 Days", color: "bg-blue-500" },
      "3_days": { label: "3 Days", color: "bg-yellow-500" },
      "1_day": { label: "1 Day", color: "bg-orange-500" },
      "expired": { label: "Expired", color: "bg-red-500" }
    };

    const config = typeMap[type] || { label: type, color: "bg-gray-500" };
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading trial companies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Trial Management Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor and manage trial expirations across all CateringMS companies
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Trials</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTrials}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">7 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.expiringIn7Days}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">3 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.expiringIn3Days}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">1 Day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.expiringIn1Day}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{stats.expired}</div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Management
          </CardTitle>
          <CardDescription>
            Manually trigger trial expiry notification checks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button 
              onClick={handleCheckNotifications}
              disabled={checking}
              className="gap-2"
            >
              {checking ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              {checking ? "Checking..." : "Check & Send Notifications"}
            </Button>
            <Button 
              onClick={loadTrialCompanies}
              variant="outline"
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Companies Table */}
      <Card>
        <CardHeader>
          <CardTitle>Companies on Trial</CardTitle>
          <CardDescription>
            All companies currently in their trial period, sorted by expiry date
          </CardDescription>
        </CardHeader>
        <CardContent>
          {companies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No companies currently on trial</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Owner Email</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Days Left</TableHead>
                  <TableHead>Notifications</TableHead>
                  <TableHead>Last Notification</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell className="font-medium">
                      <div>
                        <div>{company.company_name}</div>
                        <div className="text-sm text-muted-foreground">/{company.slug}</div>
                      </div>
                    </TableCell>
                    <TableCell>{company.owner_email}</TableCell>
                    <TableCell>
                      {new Date(company.trial_ends_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{getUrgencyBadge(company.days_remaining)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{company.notifications_sent} sent</Badge>
                    </TableCell>
                    <TableCell>
                      {getNotificationBadge(company.last_notification_type)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
