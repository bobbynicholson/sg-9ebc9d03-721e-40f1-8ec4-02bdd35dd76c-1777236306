import { supabase } from "@/integrations/supabase/client";

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
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    try {
      const { data: subscriptions, error } = await supabase
        .from("subscriptions")
        .select("*");

      if (error) throw error;

      const activeSubscriptions = subscriptions?.filter(s => s.status === "active") || [];
      const trialSubscriptions = subscriptions?.filter(s => s.status === "trial") || [];
      const cancelledSubscriptions = subscriptions?.filter(s => s.status === "cancelled") || [];

      const monthlyRevenue = activeSubscriptions
        .filter(s => s.billing_cycle === "monthly")
        .reduce((sum, s) => sum + Number(s.amount), 0);

      const annualRevenue = activeSubscriptions
        .filter(s => s.billing_cycle === "annual")
        .reduce((sum, s) => sum + Number(s.amount), 0);

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
        .from("subscriptions")
        .select("created_at, amount, status")
        .order("created_at", { ascending: true });

      if (error) throw error;

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
          monthlyData[monthKey].revenue += Number(sub.amount);
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
        .from("subscriptions")
        .select("plan_name, amount, status")
        .eq("status", "active");

      if (error) throw error;

      const planData: Record<string, { count: number; revenue: number }> = {};
      let totalRevenue = 0;

      subscriptions?.forEach((sub) => {
        const planName = sub.plan_name || "Unknown";
        if (!planData[planName]) {
          planData[planName] = { count: 0, revenue: 0 };
        }
        planData[planName].count++;
        planData[planName].revenue += Number(sub.amount);
        totalRevenue += Number(sub.amount);
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
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select(`
          country,
          subscriptions (
            amount,
            status
          )
        `);

      if (error) throw error;

      const geoData: Record<string, { customerCount: number; revenue: number }> = {};

      profiles?.forEach((profile: any) => {
        const country = profile.country || "Unknown";
        if (!geoData[country]) {
          geoData[country] = { customerCount: 0, revenue: 0 };
        }
        geoData[country].customerCount++;

        if (profile.subscriptions && Array.isArray(profile.subscriptions)) {
          profile.subscriptions.forEach((sub: any) => {
            if (sub.status === "active") {
              geoData[country].revenue += Number(sub.amount);
            }
          });
        }
      });

      return Object.entries(geoData)
        .map(([country, data]) => ({
          country,
          region: country === "South Africa" ? "Primary Market" : "International",
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
        .select("created_at, amount, status")
        .eq("status", "succeeded")
        .order("created_at", { ascending: true });

      if (error) throw error;

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

        periodData[periodKey].revenue += Number(record.amount);
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
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select(`
          id,
          full_name,
          email,
          created_at,
          subscriptions (
            plan_name,
            amount,
            status
          ),
          billing_history (
            amount,
            status
          )
        `)
        .limit(100);

      if (error) throw error;

      const customers = profiles?.map((profile: any) => {
        const totalSpent = profile.billing_history
          ?.filter((b: any) => b.status === "succeeded")
          .reduce((sum: number, b: any) => sum + Number(b.amount), 0) || 0;

        const activeSubscription = profile.subscriptions?.find((s: any) => s.status === "active");

        return {
          customerId: profile.id,
          customerName: profile.full_name || "Unknown",
          email: profile.email || "",
          totalSpent,
          planName: activeSubscription?.plan_name || "No Active Plan",
          signupDate: profile.created_at
        };
      }) || [];

      return customers
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
