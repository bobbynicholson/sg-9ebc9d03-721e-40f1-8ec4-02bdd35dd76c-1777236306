import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
import { subscriptionService } from "@/services/subscriptionService";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bell, CheckCircle, CalendarPlus, Clock, RefreshCw, Crown } from "lucide-react";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { toast } from "@/hooks/use-toast";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface CompanyTrialStatus {
  id: string;
  company_name: string;
  owner_email: string;
  trial_ends_at: string;
  subscription_status: string;
  days_remaining: number;
  notifications_sent: number;
  last_notification_type: string | null;
}

export default function TrialManagementPage() {
  const { user, profile, loading: authLoading } = useAuth() as any;
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
    // Wait for the AuthContext to finish initialising; user/profile start
    // null and only flip after the supabase session resolves.
    if (authLoading) return;
    if (!user) {
      router.push("/auth/login");
      return;
    }
    if (!profile) return;

    const role = (profile as any).active_role || (profile as any).role;
    if (role !== "super_admin") {
      router.push("/");
      return;
    }

    loadTrialCompanies();
  }, [authLoading, user, profile]);

  const loadTrialCompanies = async () => {
    setLoading(true);
    try {
      // Match either status the codebase uses ("trial" in this DB, "trialing"
      // in some Stripe-aligned flows). Anything with a trial_ends_at counts.
      const { data: companiesData, error: companiesError } = await supabase
        .from("companies")
        .select(`
          id,
          company_name,
          owner_id,
          trial_ends_at,
          subscription_status
        `)
        .in("subscription_status", ["trial", "trialing"])
        .order("trial_ends_at", { ascending: true, nullsFirst: false });

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

  const handleExtendTrial = async (companyId: string, currentEndsAt: string, days: number) => {
    try {
      // Extend from whichever is later: now, or the current trial end.
      const base = currentEndsAt ? new Date(currentEndsAt) : new Date();
      const now = new Date();
      const start = base.getTime() > now.getTime() ? base : now;
      const newEnd = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

      const { error } = await supabase
        .from("companies")
        .update({
          trial_ends_at: newEnd.toISOString(),
          subscription_status: "trial",
        })
        .eq("id", companyId);

      if (error) throw error;

      toast({
        title: "Trial extended",
        description: `New end date: ${newEnd.toLocaleDateString()}`,
      });
      await loadTrialCompanies();
    } catch (error: any) {
      toast({
        title: "Failed to extend trial",
        description: error?.message ?? "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleConvertToActive = async (companyId: string) => {
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          subscription_status: "active",
          trial_ends_at: null,
          subscription_starts_at: new Date().toISOString(),
        })
        .eq("id", companyId);

      if (error) throw error;

      toast({
        title: "Subscription activated",
        description: "Company moved off trial onto an active plan.",
      });
      await loadTrialCompanies();
    } catch (error: any) {
      toast({
        title: "Failed to activate",
        description: error?.message ?? "Unknown error",
        variant: "destructive",
      });
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
    <div className="min-h-screen overflow-x-hidden bg-slate-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
      <PlatformNav />
    <div className="p-6 max-w-full">
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
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              Total Trials
              <InfoTooltip content="Companies currently inside their free trial period.\n\nThe full pool that the expiry buckets below break down." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTrials}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              7 Days
              <InfoTooltip content="Trials due to expire in the next four to seven days.\n\nA good time to send the first nudge before things get urgent." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.expiringIn7Days}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              3 Days
              <InfoTooltip content="Trials due to expire in the next two to three days.\n\nThis is the window where the three-day reminder email should go out." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.expiringIn3Days}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              1 Day
              <InfoTooltip content="Trials due to expire within the next 24 hours.\n\nLast chance for a final reminder before they auto-expire." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.expiringIn1Day}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              Expired
              <InfoTooltip content="Trials whose end date has already passed but the company is still flagged as a trial.\n\nThese need to be converted to a paid subscription or cancelled." />
            </CardTitle>
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
            <InfoTooltip content="Runs the trial expiry check manually. It scans every trial company and sends seven, three and one-day reminder emails where they're due.\n\nEvery send is logged so the same reminder doesn't go out twice." />
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
          <CardTitle className="flex items-center gap-2">
            Companies on Trial
            <InfoTooltip content="Every trial tenant in the order they expire, soonest first.\n\nEach row shows the owner, expiry date and a count of reminders already sent." />
          </CardTitle>
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell className="font-medium">
                      <div>
                        <div>{company.company_name}</div>
                      </div>
                    </TableCell>
                    <TableCell>{company.owner_email}</TableCell>
                    <TableCell>
                      {company.trial_ends_at
                        ? new Date(company.trial_ends_at).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell>{getUrgencyBadge(company.days_remaining)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{company.notifications_sent} sent</Badge>
                    </TableCell>
                    <TableCell>
                      {getNotificationBadge(company.last_notification_type)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleExtendTrial(company.id, company.trial_ends_at, 7)}
                          title="Extend trial by 7 days"
                          className="gap-1"
                        >
                          <CalendarPlus className="h-3.5 w-3.5" />
                          +7d
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleExtendTrial(company.id, company.trial_ends_at, 30)}
                          title="Extend trial by 30 days"
                          className="gap-1"
                        >
                          <CalendarPlus className="h-3.5 w-3.5" />
                          +30d
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleConvertToActive(company.id)}
                          title="Mark as active subscription"
                          className="gap-1"
                        >
                          <Crown className="h-3.5 w-3.5" />
                          Activate
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
