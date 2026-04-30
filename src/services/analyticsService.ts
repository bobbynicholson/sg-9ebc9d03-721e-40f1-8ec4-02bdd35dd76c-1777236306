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
  totalCompanies?: number;
  activeCompanies?: number;
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
    // Single source of truth: the companies table. Every tenant lives
    // here whether they're paying, trialing, or cancelled. Joining
    // platform_pricing_plans gives us a live price per plan slug, so
    // MRR / ARR follow whatever Bobby sets in /admin/platform/pricing-management.
    try {
      const [{ data: companies }, { data: plans }] = await Promise.all([
        supabase
          .from("companies")
          .select("id, subscription_status, subscription_plan, subscription_tier, trial_ends_at, created_at, is_active"),
        supabase
          .from("platform_pricing_plans")
          .select("slug, zar_price, is_active"),
      ]);

      const planByKey = new Map<string, number>();
      for (const p of (plans || [])) {
        if (p.is_active === false) continue;
        planByKey.set(String(p.slug).toLowerCase(), Number(p.zar_price) || 0);
      }

      const norm = (v: any) => String(v || "").toLowerCase();
      const list = companies || [];
      const total = list.length;
      const active   = list.filter((c: any) => norm(c.subscription_status) === "active").length;
      const trialing = list.filter((c: any) => norm(c.subscription_status) === "trial").length;
      const cancelled = list.filter((c: any) =>
        ["cancelled", "canceled", "churned"].includes(norm(c.subscription_status))).length;

      // Revenue: only paying tenants count. Plan price comes from
      // platform_pricing_plans (slug match). Tenants without a slug are
      // treated as 0 -- they likely haven't picked yet.
      const monthlyRevenue = list
        .filter((c: any) => norm(c.subscription_status) === "active")
        .reduce((sum: number, c: any) => {
          const slug = norm(c.subscription_plan || c.subscription_tier);
          return sum + (planByKey.get(slug) || 0);
        }, 0);
      const annualRevenue = 0; // Annual flag not currently stored on companies
      const totalRevenue = monthlyRevenue + annualRevenue;

      const arpu = total > 0 ? totalRevenue / total : 0;
      const conversionRate = total > 0 ? (active / total) * 100 : 0;

      // 30-day churn: cancelled rows that updated_at within the last
      // 30 days, divided by current active. We don't have a
      // cancelled_at column on companies, so we use updated_at as a
      // proxy (it ticks on subscription_status changes).
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recentlyCancelled = list.filter((c: any) =>
        ["cancelled", "canceled", "churned"].includes(norm(c.subscription_status))
        && c.updated_at && new Date(c.updated_at).getTime() >= thirtyDaysAgo).length;
      const churnRate = active > 0 ? (recentlyCancelled / active) * 100 : 0;

      return {
        totalRevenue,
        monthlyRecurringRevenue: monthlyRevenue,
        annualRecurringRevenue: annualRevenue,
        totalCustomers: total,
        activeSubscriptions: active,
        trialSubscriptions: trialing,
        cancelledSubscriptions: cancelled,
        churnRate,
        averageRevenuePerUser: arpu,
        lifetimeValue: arpu * 24,
        conversionRate,
        totalCompanies: total,
        activeCompanies: active,
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
      const [{ data: companies }, { data: plans }] = await Promise.all([
        supabase
          .from("companies")
          .select("id, subscription_status, subscription_plan, subscription_tier, created_at"),
        supabase
          .from("platform_pricing_plans")
          .select("slug, zar_price"),
      ]);

      const planByKey = new Map<string, number>();
      for (const p of (plans || [])) {
        planByKey.set(String(p.slug).toLowerCase(), Number(p.zar_price) || 0);
      }

      const monthlyData: Record<string, { newCustomers: number; revenue: number }> = {};

      // First pass: bucket by month, count new tenants, accumulate
      // monthly revenue from active subs only.
      (companies || []).forEach((c: any) => {
        if (!c.created_at) return;
        const date = new Date(c.created_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { newCustomers: 0, revenue: 0 };
        }
        monthlyData[monthKey].newCustomers += 1;
        if (String(c.subscription_status || "").toLowerCase() === "active") {
          const slug = String(c.subscription_plan || c.subscription_tier || "").toLowerCase();
          monthlyData[monthKey].revenue += planByKey.get(slug) || 0;
        }
      });

      // Second pass: compute running cumulative across sorted months
      // so the chart shows the platform's growth trajectory, not just
      // raw signups per month.
      const sortedKeys = Object.keys(monthlyData).sort((a, b) => a.localeCompare(b));
      let running = 0;
      return sortedKeys.map((month) => {
        running += monthlyData[month].newCustomers;
        return {
          month,
          newCustomers: monthlyData[month].newCustomers,
          totalCustomers: running,
          revenue: monthlyData[month].revenue,
        };
      });
    } catch (error) {
      console.error("Error fetching customer growth:", error);
      return [];
    }
  },

  async getPlanDistribution(): Promise<PlanDistribution[]> {
    try {
      const [{ data: companies }, { data: plans }] = await Promise.all([
        supabase
          .from("companies")
          .select("subscription_status, subscription_plan, subscription_tier"),
        supabase
          .from("platform_pricing_plans")
          .select("slug, name, zar_price"),
      ]);

      const planMeta = new Map<string, { displayName: string; price: number }>();
      for (const p of (plans || [])) {
        planMeta.set(String(p.slug).toLowerCase(), {
          displayName: p.name || String(p.slug),
          price: Number(p.zar_price) || 0,
        });
      }

      const planData: Record<string, { count: number; revenue: number }> = {};
      let totalRevenue = 0;

      (companies || []).forEach((c: any) => {
        const status = String(c.subscription_status || "").toLowerCase();
        // Plan distribution covers active + trialing tenants -- both
        // sit on a tier the SaaS owner needs visibility on. Cancelled
        // accounts drop out so the mix reflects the current book.
        if (status !== "active" && status !== "trial") return;

        const slugRaw = String(c.subscription_plan || c.subscription_tier || "trial").toLowerCase();
        const meta = planMeta.get(slugRaw);
        const displayName = meta?.displayName || (slugRaw === "trial" ? "Trial (no plan picked)" : slugRaw);

        if (!planData[displayName]) {
          planData[displayName] = { count: 0, revenue: 0 };
        }
        planData[displayName].count += 1;
        // Trials and unpicked plans contribute zero revenue -- they
        // still appear in the distribution so churn risk is visible.
        if (status === "active" && meta) {
          planData[displayName].revenue += meta.price;
          totalRevenue += meta.price;
        }
      });

      return Object.entries(planData)
        .map(([planName, data]) => ({
          planName,
          count: data.count,
          revenue: data.revenue,
          percentage: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);
    } catch (error) {
      console.error("Error fetching plan distribution:", error);
      return [];
    }
  },

  async getGeographicDistribution(): Promise<GeographicDistribution[]> {
    try {
      const [{ data: companies }, { data: plans }] = await Promise.all([
        supabase
          .from("companies")
          .select("subscription_status, subscription_plan, subscription_tier, country, state_province, city"),
        supabase
          .from("platform_pricing_plans")
          .select("slug, zar_price"),
      ]);

      const planByKey = new Map<string, number>();
      for (const p of (plans || [])) {
        planByKey.set(String(p.slug).toLowerCase(), Number(p.zar_price) || 0);
      }

      // Pivot tenants by country, then by region (state_province) so
      // the panel can show 'South Africa: Western Cape' style detail.
      // Tenants without a country drop into 'Unknown' so they're still
      // visible to the SaaS owner.
      const buckets: Record<string, Record<string, { count: number; revenue: number; cities: Set<string> }>> = {};
      (companies || []).forEach((c: any) => {
        const country = String(c.country || "").trim() || "Unknown";
        const region = String(c.state_province || "").trim() || "All regions";
        if (!buckets[country]) buckets[country] = {};
        if (!buckets[country][region]) buckets[country][region] = { count: 0, revenue: 0, cities: new Set() };
        const b = buckets[country][region];
        b.count += 1;
        if (c.city) b.cities.add(String(c.city).trim());
        if (String(c.subscription_status || "").toLowerCase() === "active") {
          const slug = String(c.subscription_plan || c.subscription_tier || "").toLowerCase();
          b.revenue += planByKey.get(slug) || 0;
        }
      });

      // Flatten one row per (country, region). The dashboard renders
      // them sorted by tenant count so the biggest market sits on top.
      const rows: GeographicDistribution[] = [];
      for (const [country, regions] of Object.entries(buckets)) {
        for (const [region, data] of Object.entries(regions)) {
          const cityNote = data.cities.size > 0
            ? ` (${Array.from(data.cities).slice(0, 3).join(", ")}${data.cities.size > 3 ? `, +${data.cities.size - 3}` : ""})`
            : "";
          rows.push({
            country,
            region: region + cityNote,
            customerCount: data.count,
            revenue: data.revenue,
          });
        }
      }
      return rows.sort((a, b) => b.customerCount - a.customerCount);
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
    // Now keyed off companies + platform_pricing_plans. "Total spent"
    // becomes monthly recurring revenue x months since signup, which
    // is the right shape for the SaaS owner's "who matters" view --
    // older paying tenants beat younger ones at the same plan.
    try {
      const [{ data: companies }, { data: plans }] = await Promise.all([
        supabase
          .from("companies")
          .select("id, company_name, email, subscription_status, subscription_plan, subscription_tier, created_at"),
        supabase
          .from("platform_pricing_plans")
          .select("slug, name, zar_price"),
      ]);

      const planMeta = new Map<string, { displayName: string; price: number }>();
      for (const p of (plans || [])) {
        planMeta.set(String(p.slug).toLowerCase(), {
          displayName: p.name || String(p.slug),
          price: Number(p.zar_price) || 0,
        });
      }

      const now = Date.now();
      return (companies || [])
        .filter((c: any) => String(c.subscription_status || "").toLowerCase() === "active")
        .map((c: any) => {
          const slug = String(c.subscription_plan || c.subscription_tier || "").toLowerCase();
          const meta = planMeta.get(slug);
          const monthly = meta?.price || 0;
          const monthsSinceSignup = c.created_at
            ? Math.max(1, Math.floor((now - new Date(c.created_at).getTime()) / (30 * 24 * 60 * 60 * 1000)))
            : 1;
          return {
            customerId: c.id,
            customerName: c.company_name || "(unnamed)",
            email: c.email || "",
            totalSpent: monthly * monthsSinceSignup,
            planName: meta?.displayName || "(no plan picked)",
            signupDate: c.created_at,
          };
        })
        .sort((a: any, b: any) => b.totalSpent - a.totalSpent)
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
