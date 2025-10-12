import { supabase } from "@/integrations/supabase/client";

interface ExchangeRate {
  id: string;
  date: string;
  usd_to_zar_rate: number;
  created_at: string;
}

interface FluctuationAlert {
  id: string;
  check_date: string;
  start_rate: number;
  end_rate: number;
  percentage_change: number;
  days_period: number;
  alert_sent: boolean;
  resolved: boolean;
  created_at: string;
}

export const currencyMonitoringService = {
  /**
   * Fetch current USD to ZAR exchange rate from external API
   */
  async getCurrentExchangeRate(): Promise<number> {
    try {
      const response = await fetch(
        "https://api.exchangerate-api.com/v4/latest/USD"
      );
      const data = await response.json();
      return data.rates.ZAR || 18.50;
    } catch (error) {
      console.error("Error fetching exchange rate:", error);
      return 18.50;
    }
  },

  /**
   * Store exchange rate in database for historical tracking
   */
  async storeExchangeRate(rate: number): Promise<void> {
    try {
      const today = new Date().toISOString().split("T")[0];
      
      const { data: existing, error: checkError } = await supabase
        .from("exchange_rates")
        .select("*")
        .eq("date", today)
        .single();

      if (checkError && checkError.code !== "PGRST116") {
        throw checkError;
      }

      if (existing) {
        await supabase
          .from("exchange_rates")
          .update({ usd_to_zar_rate: rate })
          .eq("date", today);
      } else {
        await supabase
          .from("exchange_rates")
          .insert([{ date: today, usd_to_zar_rate: rate }]);
      }
    } catch (error) {
      console.error("Error storing exchange rate:", error);
    }
  },

  /**
   * Get exchange rates for the last N days
   */
  async getHistoricalRates(days: number = 90): Promise<ExchangeRate[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from("exchange_rates")
        .select("*")
        .gte("date", startDate.toISOString().split("T")[0])
        .order("date", { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error fetching historical rates:", error);
      return [];
    }
  },

  /**
   * Calculate percentage change between two rates
   */
  calculatePercentageChange(startRate: number, endRate: number): number {
    return ((endRate - startRate) / startRate) * 100;
  },

  /**
   * Check for 15% fluctuation over any 90-day rolling period
   */
  async checkForSignificantFluctuation(): Promise<{
    hasFluctuation: boolean;
    percentageChange: number;
    startRate: number;
    endRate: number;
    startDate: string;
    endDate: string;
  }> {
    try {
      const rates = await this.getHistoricalRates(90);

      if (rates.length < 2) {
        return {
          hasFluctuation: false,
          percentageChange: 0,
          startRate: 0,
          endRate: 0,
          startDate: "",
          endDate: ""
        };
      }

      const oldestRate = rates[0];
      const latestRate = rates[rates.length - 1];
      const percentageChange = this.calculatePercentageChange(
        oldestRate.usd_to_zar_rate,
        latestRate.usd_to_zar_rate
      );

      const hasFluctuation = Math.abs(percentageChange) >= 15;

      return {
        hasFluctuation,
        percentageChange,
        startRate: oldestRate.usd_to_zar_rate,
        endRate: latestRate.usd_to_zar_rate,
        startDate: oldestRate.date,
        endDate: latestRate.date
      };
    } catch (error) {
      console.error("Error checking fluctuation:", error);
      return {
        hasFluctuation: false,
        percentageChange: 0,
        startRate: 0,
        endRate: 0,
        startDate: "",
        endDate: ""
      };
    }
  },

  /**
   * Create fluctuation alert in database
   */
  async createFluctuationAlert(fluctuation: {
    startRate: number;
    endRate: number;
    percentageChange: number;
    startDate: string;
    endDate: string;
  }): Promise<void> {
    try {
      const daysPeriod = Math.floor(
        (new Date(fluctuation.endDate).getTime() - 
         new Date(fluctuation.startDate).getTime()) / 
        (1000 * 60 * 60 * 24)
      );

      await supabase.from("currency_fluctuation_alerts").insert([
        {
          check_date: new Date().toISOString().split("T")[0],
          start_rate: fluctuation.startRate,
          end_rate: fluctuation.endRate,
          percentage_change: fluctuation.percentageChange,
          days_period: daysPeriod,
          alert_sent: false,
          resolved: false
        }
      ]);
    } catch (error) {
      console.error("Error creating fluctuation alert:", error);
    }
  },

  /**
   * Get unresolved fluctuation alerts
   */
  async getUnresolvedAlerts(): Promise<FluctuationAlert[]> {
    try {
      const { data, error } = await supabase
        .from("currency_fluctuation_alerts")
        .select("*")
        .eq("resolved", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error fetching unresolved alerts:", error);
      return [];
    }
  },

  /**
   * Mark alert as resolved
   */
  async resolveAlert(alertId: string): Promise<void> {
    try {
      await supabase
        .from("currency_fluctuation_alerts")
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", alertId);
    } catch (error) {
      console.error("Error resolving alert:", error);
    }
  },

  /**
   * Send notification to admin about currency fluctuation
   */
  async notifyAdminOfFluctuation(fluctuation: {
    percentageChange: number;
    startRate: number;
    endRate: number;
    startDate: string;
    endDate: string;
  }): Promise<void> {
    try {
      const message = `
🚨 CURRENCY FLUCTUATION ALERT 🚨

The ZAR has fluctuated by ${fluctuation.percentageChange.toFixed(2)}% over the last 90 days.

Details:
- Start Date: ${fluctuation.startDate}
- Start Rate: 1 USD = ${fluctuation.startRate.toFixed(2)} ZAR
- End Date: ${fluctuation.endDate}
- Current Rate: 1 USD = ${fluctuation.endRate.toFixed(2)} ZAR
- Change: ${fluctuation.percentageChange > 0 ? "+" : ""}${fluctuation.percentageChange.toFixed(2)}%

ACTION REQUIRED:
Please review and adjust ZAR pricing to maintain USD equivalency as per our pricing policy.

Reminder of Policy:
"Our ZAR pricing is pegged to USD rates. We reserve the right to adjust ZAR prices to maintain USD equivalency if significant currency fluctuations occur (exceeding 15% over 90 days). Customers will receive 30 days advance notice of any price changes."

Log in to the admin dashboard to review pricing: /admin/catering-ms-dashboard
      `;

      await supabase.from("admin_notifications").insert([
        {
          type: "currency_fluctuation",
          title: "Currency Fluctuation Alert: Review Pricing",
          message,
          priority: "high",
          read: false
        }
      ]);

      console.log("Admin notification sent for currency fluctuation");
    } catch (error) {
      console.error("Error sending admin notification:", error);
    }
  },

  /**
   * Run daily currency check (should be called via cron job or scheduled task)
   */
  async runDailyCheck(): Promise<void> {
    try {
      const currentRate = await this.getCurrentExchangeRate();
      await this.storeExchangeRate(currentRate);

      const fluctuation = await this.checkForSignificantFluctuation();

      if (fluctuation.hasFluctuation) {
        const unresolvedAlerts = await this.getUnresolvedAlerts();
        
        const recentAlert = unresolvedAlerts.find(alert => {
          const alertDate = new Date(alert.created_at);
          const daysSinceAlert = Math.floor(
            (Date.now() - alertDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          return daysSinceAlert < 7;
        });

        if (!recentAlert) {
          await this.createFluctuationAlert(fluctuation);
          await this.notifyAdminOfFluctuation(fluctuation);
        }
      }
    } catch (error) {
      console.error("Error running daily currency check:", error);
    }
  },

  /**
   * Format currency policy text for display
   */
  getCurrencyPolicyText(): {
    short: string;
    full: string;
  } {
    return {
      short: "Prices in ZAR. USD, GBP, and EUR are approximate. All payments processed in ZAR.",
      full: `Currency Display: Prices shown in ZAR (South African Rand). USD, GBP, and EUR are approximate conversions for reference only. All payments are processed in ZAR.

USD-Pegged Pricing: Our ZAR pricing is pegged to USD rates. We reserve the right to adjust ZAR prices to maintain USD equivalency if significant currency fluctuations occur (exceeding 15% over 90 days). You will receive 30 days advance notice of any price changes.`
    };
  },

  /**
   * Get current conversion rates for display
   */
  async getDisplayConversions(zarAmount: number): Promise<{
    zar: string;
    usd: string;
    gbp: string;
    eur: string;
  }> {
    try {
      const response = await fetch(
        "https://api.exchangerate-api.com/v4/latest/ZAR"
      );
      const data = await response.json();

      return {
        zar: `R${zarAmount.toFixed(0)}`,
        usd: `$${(zarAmount * data.rates.USD).toFixed(0)}`,
        gbp: `£${(zarAmount * data.rates.GBP).toFixed(0)}`,
        eur: `€${(zarAmount * data.rates.EUR).toFixed(0)}`
      };
    } catch (error) {
      console.error("Error getting display conversions:", error);
      return {
        zar: `R${zarAmount.toFixed(0)}`,
        usd: `$${(zarAmount * 0.054).toFixed(0)}`,
        gbp: `£${(zarAmount * 0.043).toFixed(0)}`,
        eur: `€${(zarAmount * 0.050).toFixed(0)}`
      };
    }
  }
};
