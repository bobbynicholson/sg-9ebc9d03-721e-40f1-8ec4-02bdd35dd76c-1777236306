import { useState, useEffect, useMemo } from "react";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
import { SortHeader } from "@/components/ui/sort-header";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
import { subscriptionService } from "@/services/subscriptionService";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, CalendarPlus, Clock, RefreshCw, Crown, Calendar } from "lucide-react";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile } from "@/components/portal/ui";
import { toast } from "@/hooks/use-toast";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";

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

  // Click-to-sort on the trial table. Default to expiry-date ascending
  // so the most urgent trials sit at the top.
  const trialsSortColumns: ColumnDef<CompanyTrialStatus>[] = useMemo(() => [
    { key: "company", accessor: (c) => c.company_name,                                       type: "string" },
    { key: "owner",   accessor: (c) => c.owner_email,                                        type: "string" },
    { key: "expiry",  accessor: (c) => c.trial_ends_at,                                      type: "date"   },
    { key: "days",    accessor: (c) => Number(c.days_remaining ?? 9999),                     type: "number" },
    { key: "notifs",  accessor: (c) => Number(c.notifications_sent ?? 0),                    type: "number" },
    { key: "last",    accessor: (c) => c.last_notification_type || "",                       type: "string" },
  ], []);
  const trialsSort = useSortable<CompanyTrialStatus>(companies, trialsSortColumns, { defaultKey: "expiry", defaultDir: "asc" });
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
      const { data: companiesData, error: companiesError } = await supabase
        .from("companies")
        .select(`
          id,
          company_name,
          owner_id,
          trial_ends_at,
          subscription_status
        `)
        // A.13 #3 sweep: was .in("subscription_status",
        // ["trial", "trialing"]) defensively. 'trialing' is no
        // longer in the enum (migration 20260518740000) so 'trial'
        // is the only value left.
        .eq("subscription_status", "trial")
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
        description: dbErrorMessage(error, { entity: "trial" }),
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
        description: dbErrorMessage(error, { entity: "subscription" }),
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

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
      <PlatformNav />
      <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
        <PortalHeader
          title="Trial Management"
          subtitle="Monitor and manage trial expirations across all CateringMS companies"
          icon={Calendar}
          actions={
            <>
              <Button onClick={handleCheckNotifications} disabled={checking} className="gap-2">
                {checking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {checking ? "Checking..." : "Check & Send"}
              </Button>
              <Button onClick={loadTrialCompanies} variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </>
          }
        />

        {loading ? (
          <PortalCard className="flex items-center justify-center py-16">
            <div className="text-center text-slate-500 dark:text-slate-400">
              <RefreshCw className="mx-auto mb-4 h-8 w-8 animate-spin" />
              <p>Loading trial companies...</p>
            </div>
          </PortalCard>
        ) : (
          <>
            {/* Stats Overview */}
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
              <StatTile
                label="Total Trials"
                value={stats.totalTrials}
                hint="In their free trial period"
              />
              <StatTile
                label="Within 7 days"
                value={<span className="text-yellow-600 dark:text-yellow-500">{stats.expiringIn7Days}</span>}
                hint="First-nudge window"
              />
              <StatTile
                label="Within 3 days"
                value={<span className="text-orange-600 dark:text-orange-500">{stats.expiringIn3Days}</span>}
                hint="3-day reminder due"
              />
              <StatTile
                label="Within 1 day"
                value={<span className="text-red-600 dark:text-red-500">{stats.expiringIn1Day}</span>}
                hint="Final reminder"
              />
              <StatTile
                label="Expired"
                value={<span className="text-red-700 dark:text-red-400">{stats.expired}</span>}
                hint="Convert or cancel"
              />
            </div>

            {/* Companies Table */}
            <PortalCard>
              <PortalCardHeader title="Companies on Trial" />
              {companies.length === 0 ? (
                <div className="py-8 text-center text-slate-500 dark:text-slate-400">
                  <Clock className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p>No companies currently on trial</p>
                </div>
              ) : (
                <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortHeader sortKey="company" activeKey={trialsSort.sortKey} activeDir={trialsSort.sortDir} onToggle={trialsSort.toggle}>Company</SortHeader>
                  </TableHead>
                  <TableHead>
                    <SortHeader sortKey="owner" activeKey={trialsSort.sortKey} activeDir={trialsSort.sortDir} onToggle={trialsSort.toggle}>Owner Email</SortHeader>
                  </TableHead>
                  <TableHead>
                    <SortHeader sortKey="expiry" activeKey={trialsSort.sortKey} activeDir={trialsSort.sortDir} onToggle={trialsSort.toggle}>Expiry Date</SortHeader>
                  </TableHead>
                  <TableHead>
                    <SortHeader sortKey="days" activeKey={trialsSort.sortKey} activeDir={trialsSort.sortDir} onToggle={trialsSort.toggle}>Days Left</SortHeader>
                  </TableHead>
                  <TableHead>
                    <SortHeader sortKey="notifs" activeKey={trialsSort.sortKey} activeDir={trialsSort.sortDir} onToggle={trialsSort.toggle}>Notifications</SortHeader>
                  </TableHead>
                  <TableHead>
                    <SortHeader sortKey="last" activeKey={trialsSort.sortKey} activeDir={trialsSort.sortDir} onToggle={trialsSort.toggle}>Last Notification</SortHeader>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trialsSort.rows.map((company) => (
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
                        : "-"}
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
            </PortalCard>
          </>
        )}
      </PortalShell>
    </div>
  );
}
