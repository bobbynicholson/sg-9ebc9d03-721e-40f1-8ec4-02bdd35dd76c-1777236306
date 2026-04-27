/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import type { Order } from "@/types";

interface DashboardMetrics {
  totalRevenue: number;
  monthlyRecurringRevenue: number;
  annualRecurringRevenue: number;
  totalCustomers: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  cancelledSubscriptions: number;
  churnRate: number;
  averageRevenuePerUser: number;
  lifetimeValue: number;
  conversionRate: number;
}

interface CustomerGrowth {
  month: string;
  newCustomers: number;
  totalCustomers: number;
  revenue: number;
}

interface PlanDistribution {
  planName: string;
  count: number;
  revenue: number;
  percentage: number;
}

interface GeographicDistribution {
  country: string;
  region: string;
  customerCount: number;
  revenue: number;
}

interface RevenueByPeriod {
  period: string;
  revenue: number;
  customers: number;
}

export const analyticsService = {
  /**
   * Get financial analytics for client dashboard (catering company specific)
   */
  async getFinancialAnalytics(companyId?: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Resolve company scope from caller arg or the user's profile
      let scopedCompanyId = companyId;
      if (!scopedCompanyId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", user.id)
          .maybeSingle();
        scopedCompanyId = profile?.company_id ?? undefined;
      }

      // Get orders for the user's company (multi-tenant)
      let ordersQuery = supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (scopedCompanyId) {
        ordersQuery = ordersQuery.eq("company_id", scopedCompanyId);
      } else {
        // Fallback to user-owned only if no company resolved
        ordersQuery = ordersQuery.eq("user_id", user.id);
      }
      const { data: orders, error: ordersError } = await ordersQuery;

      if (ordersError) {
        console.error("Error fetching orders:", ordersError);
        return this.getEmptyFinancialAnalytics();
      }

      // Get payment ledger data scoped to the same company
      let ledgerQuery = supabase
        .from("staff_work_sessions")
        .select("*")
        .eq("payment_status", "unpaid");
      if (scopedCompanyId) {
        ledgerQuery = ledgerQuery.eq("company_id", scopedCompanyId);
      }
      const { data: paymentLedger, error: ledgerError } = await ledgerQuery;

      if (ledgerError) {
        console.error("Error fetching payment ledger:", ledgerError);
      }

      // Calculate analytics — orders.total was dropped, read total_amount
      const totalRevenue = (orders as Order[] || [])
        .filter(o => o.payment_status === "paid")
        .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

      const pendingRevenue = (orders as Order[] || [])
        .filter(o => o.payment_status === "pending" || o.payment_status === "partial")
        .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

      const totalOrders = orders?.length || 0;
      const completedOrders = orders?.filter(o => o.status === "completed").length || 0;
      const upcomingOrders = orders?.filter(o => {
        const eventDate = new Date(o.event_date);
        return eventDate > new Date() && o.status !== "cancelled";
      }).length || 0;

      const staffPaymentsOwed = (paymentLedger || [])
        .reduce((sum, session) => sum + Number(session.total_earnings || 0), 0);

      return {
        totalRevenue,
        pendingRevenue,
        totalOrders,
        completedOrders,
        upcomingOrders,
        staffPaymentsOwed,
        averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        completionRate: totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0
      };
    } catch (error) {
      console.error("Error fetching financial analytics:", error);
      return this.getEmptyFinancialAnalytics();
    }
  },

  /**
   * Return empty analytics when data unavailable
   */
  getEmptyFinancialAnalytics() {
    return {
      totalRevenue: 0,
      pendingRevenue: 0,
      totalOrders: 0,
      completedOrders: 0,
      upcomingOrders: 0,
      staffPaymentsOwed: 0,
      averageOrderValue: 0,
      completionRate: 0
    };
  },

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    try {
      const { data: subscriptions, error } = await supabase
        .rpc("get_all_subscriptions_admin");

      if (error) {
        console.error("Error fetching subscriptions:", error);
        throw error;
      }

      const activeSubscriptions = subscriptions?.filter(s => s.status === "active") || [];
      const trialSubscriptions = subscriptions?.filter(s => s.status === "trial") || [];
      const cancelledSubscriptions = subscriptions?.filter(s => s.status === "cancelled") || [];

      const monthlyRevenue = activeSubscriptions
        .filter(s => s.billing_cycle === "monthly")
        .reduce((sum, s) => sum + Number(s.amount || 0), 0);

      const annualRevenue = activeSubscriptions
        .filter(s => s.billing_cycle === "annual")
        .reduce((sum, s) => sum + Number(s.amount || 0), 0);

      const totalRevenue = monthlyRevenue + annualRevenue;
      const totalCustomers = subscriptions?.length || 0;
      const averageRevenuePerUser = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthCancelled = cancelledSubscriptions.filter(
        s => s.cancelled_at && new Date(s.cancelled_at) >= lastMonth
      ).length;
      const churnRate = activeSubscriptions.length > 0 
        ? (lastMonthCancelled / activeSubscriptions.length) * 100 
        : 0;

      const conversionRate = totalCustomers > 0
        ? (activeSubscriptions.length / totalCustomers) * 100
        : 0;

      return {
        totalRevenue,
        monthlyRecurringRevenue: monthlyRevenue,
        annualRecurringRevenue: annualRevenue,
        totalCustomers,
        activeSubscriptions: activeSubscriptions.length,
        trialSubscriptions: trialSubscriptions.length,
        cancelledSubscriptions: cancelledSubscriptions.length,
        churnRate,
        averageRevenuePerUser,
        lifetimeValue: averageRevenuePerUser * 24,
        conversionRate
      };
    } catch (error) {
      console.error("Error fetching dashboard metrics:", error);
      return {
        totalRevenue: 0,
        monthlyRecurringRevenue: 0,
        annualRecurringRevenue: 0,
        totalCustomers: 0,
        activeSubscriptions: 0,
        trialSubscriptions: 0,
        cancelledSubscriptions: 0,
        churnRate: 0,
        averageRevenuePerUser: 0,
        lifetimeValue: 0,
        conversionRate: 0
      };
    }
  },

  async getCustomerGrowth(): Promise<CustomerGrowth[]> {
    try {
      const { data: subscriptions, error } = await supabase
        .rpc("get_all_subscriptions_admin");

      if (error) {
        console.error("Error fetching subscriptions for growth:", error);
        return [];
      }

      const monthlyData: Record<string, { newCustomers: number; totalCustomers: number; revenue: number }> = {};
      let cumulativeCustomers = 0;

      subscriptions?.forEach((sub) => {
        const date = new Date(sub.created_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { newCustomers: 0, totalCustomers: 0, revenue: 0 };
        }

        monthlyData[monthKey].newCustomers++;
        cumulativeCustomers++;
        monthlyData[monthKey].totalCustomers = cumulativeCustomers;
        
        if (sub.status === "active") {
          monthlyData[monthKey].revenue += Number(sub.amount || 0);
        }
      });

      return Object.entries(monthlyData)
        .map(([month, data]) => ({
          month,
          newCustomers: data.newCustomers,
          totalCustomers: data.totalCustomers,
          revenue: data.revenue
        }))
        .sort((a, b) => a.month.localeCompare(b.month));
    } catch (error) {
      console.error("Error fetching customer growth:", error);
      return [];
    }
  },

  async getPlanDistribution(): Promise<PlanDistribution[]> {
    try {
      const { data: subscriptions, error } = await supabase
        .rpc("get_all_subscriptions_admin");

      if (error) {
        console.error("Error fetching plan distribution:", error);
        return [];
      }

      const activeSubscriptions = subscriptions?.filter(s => s.status === "active") || [];
      const planData: Record<string, { count: number; revenue: number }> = {};
      let totalRevenue = 0;

      activeSubscriptions.forEach((sub) => {
        const planName = sub.plan_name || "Unknown";
        if (!planData[planName]) {
          planData[planName] = { count: 0, revenue: 0 };
        }
        planData[planName].count++;
        const amount = Number(sub.amount || 0);
        planData[planName].revenue += amount;
        totalRevenue += amount;
      });

      return Object.entries(planData)
        .map(([planName, data]) => ({
          planName,
          count: data.count,
          revenue: data.revenue,
          percentage: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0
        }))
        .sort((a, b) => b.revenue - a.revenue);
    } catch (error) {
      console.error("Error fetching plan distribution:", error);
      return [];
    }
  },

  async getGeographicDistribution(): Promise<GeographicDistribution[]> {
    try {
      const { data: subscriptions, error: subError } = await supabase
        .rpc("get_all_subscriptions_admin");

      if (subError) {
        console.error("Error fetching subscriptions for geo:", subError);
        return [];
      }

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, company_name");

      if (profileError) {
        console.error("Error fetching profiles for geo:", profileError);
        return [];
      }

      const geoData: Record<string, { customerCount: number; revenue: number }> = {};

      subscriptions?.forEach((sub) => {
        const country = "South Africa";
        
        if (!geoData[country]) {
          geoData[country] = { customerCount: 0, revenue: 0 };
        }
        
        geoData[country].customerCount++;
        
        if (sub.status === "active") {
          geoData[country].revenue += Number(sub.amount || 0);
        }
      });

      return Object.entries(geoData)
        .map(([country, data]) => ({
          country,
          region: "Primary Market",
          customerCount: data.customerCount,
          revenue: data.revenue
        }))
        .sort((a, b) => b.customerCount - a.customerCount);
    } catch (error) {
      console.error("Error fetching geographic distribution:", error);
      return [];
    }
  },

  async getRevenueByPeriod(period: "day" | "week" | "month" | "quarter"): Promise<RevenueByPeriod[]> {
    try {
      const { data: billingHistory, error } = await supabase
        .from("billing_history")
        .select("created_at, amount, status, user_id")
        .eq("status", "succeeded")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching billing history:", error);
        return [];
      }

      const periodData: Record<string, { revenue: number; customers: Set<string> }> = {};

      billingHistory?.forEach((record) => {
        const date = new Date(record.created_at);
        let periodKey: string;

        switch (period) {
          case "day":
            periodKey = date.toISOString().split("T")[0];
            break;
          case "week":
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            periodKey = weekStart.toISOString().split("T")[0];
            break;
          case "month":
            periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
            break;
          case "quarter":
            const quarter = Math.floor(date.getMonth() / 3) + 1;
            periodKey = `${date.getFullYear()}-Q${quarter}`;
            break;
        }

        if (!periodData[periodKey]) {
          periodData[periodKey] = { revenue: 0, customers: new Set() };
        }

        periodData[periodKey].revenue += Number(record.amount || 0);
        periodData[periodKey].customers.add(record.user_id);
      });

      return Object.entries(periodData)
        .map(([period, data]) => ({
          period,
          revenue: data.revenue,
          customers: data.customers.size
        }))
        .sort((a, b) => a.period.localeCompare(b.period));
    } catch (error) {
      console.error("Error fetching revenue by period:", error);
      return [];
    }
  },

  async getTopCustomers(limit: number = 10): Promise<Array<{
    customerId: string;
    customerName: string;
    email: string;
    totalSpent: number;
    planName: string;
    signupDate: string;
  }>> {
    try {
      const { data: subscriptions, error: subError } = await supabase
        .rpc("get_all_subscriptions_admin");

      if (subError) {
        console.error("Error fetching subscriptions for top customers:", subError);
        return [];
      }

      const activeSubscriptions = subscriptions?.filter(s => s.status === "active") || [];

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, company_name, email, created_at");

      if (profileError) {
        console.error("Error fetching profiles for top customers:", profileError);
        return [];
      }

      const customerMap = new Map<string, {
        customerName: string;
        email: string;
        totalSpent: number;
        planName: string;
        signupDate: string;
      }>();

      activeSubscriptions.forEach((sub) => {
        const profile = profiles?.find(p => p.id === sub.user_id);
        if (!profile) return;

        const customerId = sub.user_id;
        const amount = Number(sub.amount || 0);

        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            customerName: profile.company_name || profile.full_name || "Unknown",
            email: profile.email || "",
            totalSpent: 0,
            planName: sub.plan_name || "Unknown",
            signupDate: profile.created_at
          });
        }

        const customer = customerMap.get(customerId)!;
        customer.totalSpent += amount;
      });

      return Array.from(customerMap.entries())
        .map(([customerId, data]) => ({
          customerId,
          ...data
        }))
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, limit);
    } catch (error) {
      console.error("Error fetching top customers:", error);
      return [];
    }
  },

  formatCurrency(amount: number, currency: string = "ZAR"): string {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  },

  formatPercentage(value: number): string {
    return `${value.toFixed(1)}%`;
  },

  formatNumber(value: number): string {
    return new Intl.NumberFormat("en-ZA").format(Math.round(value));
  }
};
