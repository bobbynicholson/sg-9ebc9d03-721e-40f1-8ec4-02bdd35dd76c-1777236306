/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";

export interface FinancialPrediction {
  prediction_date: string;
  predicted_revenue: number;
  predicted_expenses: number;
  predicted_cashflow: number;
  confidence_score: number;
  risk_level: 'low' | 'medium' | 'high';
  recommendations: string[];
}

export interface CashflowAlert {
  severity: 'info' | 'warning' | 'critical';
  message: string;
  action_items: string[];
  projected_date?: string;
}

export const aiFinancialService = {
  /**
   * Get predictive analytics for dashboard
   */
  async getPredictiveAnalytics(orders: any[] = []) {
    try {
      const predictions = await this.generatePredictions(90, orders);
      
      return {
        predictions,
        summary: {
          avgRevenue: predictions.reduce((sum, p) => sum + p.predicted_revenue, 0) / predictions.length,
          avgCashflow: predictions.reduce((sum, p) => sum + p.predicted_cashflow, 0) / predictions.length,
          highRiskDays: predictions.filter(p => p.risk_level === "high").length,
          confidence: predictions.reduce((sum, p) => sum + p.confidence_score, 0) / predictions.length
        }
      };
    } catch (error) {
      console.error("Error getting predictive analytics:", error);
      return {
        predictions: [],
        summary: {
          avgRevenue: 0,
          avgCashflow: 0,
          highRiskDays: 0,
          confidence: 0
        }
      };
    }
  },

  /**
   * Generate cash flow alerts for dashboard
   */
  async generateCashFlowAlerts(
    orders: any[],
    data: {
      currentCashFlow: number;
      projectedRevenue30Days: number;
      upcomingExpenses: number;
      // FIN-C (financial dashboard follow-ups): per-tenant peak-season
      // window (1-12, inclusive). When both are set the banner uses
      // them; when either is NULL the SA wedding-default May-September
      // applies. peakSeasonEndMonth < peakSeasonStartMonth means the
      // window wraps year-end (e.g. Nov-Jan = 11..1).
      peakSeasonStartMonth?: number | null;
      peakSeasonEndMonth?: number | null;
    }
  ) {
    const alerts: Array<{
      severity: "high" | "medium" | "low";
      message: string;
      suggestedAction: string;
      predictedDate?: string;
    }> = [];

    // Check current cash flow
    if (data.currentCashFlow < 0) {
      alerts.push({
        severity: "high",
        message: "Negative Cash Flow Alert",
        suggestedAction: "Immediately review outstanding invoices and delay non-essential expenses. Consider contacting clients for early payment.",
        predictedDate: new Date().toISOString()
      });
    } else if (data.currentCashFlow < data.upcomingExpenses * 0.5) {
      alerts.push({
        severity: "medium",
        message: "Low Cash Flow Warning",
        suggestedAction: "Cash reserves are below recommended levels. Focus on collecting pending payments and manage expenses carefully.",
        predictedDate: new Date().toISOString()
      });
    }

    // Check upcoming revenue vs expenses
    const cashFlowRatio = data.projectedRevenue30Days / (data.upcomingExpenses || 1);
    if (cashFlowRatio < 1.2) {
      const predictedDate = new Date();
      predictedDate.setDate(predictedDate.getDate() + 15);
      
      alerts.push({
        severity: cashFlowRatio < 1 ? "high" : "medium",
        message: "Tight Cash Flow Expected",
        suggestedAction: "Your projected revenue is close to your upcoming expenses. Consider rescheduling non-urgent expenses or accelerating payment collection.",
        predictedDate: predictedDate.toISOString()
      });
    }

    // Check for seasonal slow periods
    const now = new Date();
    const currentMonth = now.getMonth();
    if (currentMonth >= 0 && currentMonth <= 1) {
      alerts.push({
        severity: "low",
        message: "Seasonal Slow Period",
        suggestedAction: "January-February typically sees lower bookings. Use this time for marketing, equipment maintenance, and planning for peak season.",
        predictedDate: now.toISOString()
      });
    }

    // FIN-C (financial dashboard follow-ups): per-tenant peak-season
    // window. Pre-FIN-C this hardcoded May-September. Now the start +
    // end months read off the companies row (1-indexed). NULL on
    // either side falls back to the SA wedding-default. End < start
    // wraps year-end (Nov-Jan = 11..1) for tenants whose peak runs
    // across December.
    const peakStartMonth1Based = (data.peakSeasonStartMonth ?? 5); // SA wedding default May
    const peakEndMonth1Based = (data.peakSeasonEndMonth ?? 9);     // ... through September
    const peakStartMonth = ((peakStartMonth1Based - 1) % 12 + 12) % 12; // -> 0-indexed
    const peakEndMonth = ((peakEndMonth1Based - 1) % 12 + 12) % 12;

    // Today's date. We pull peak-start of "this season" - if peak has
    // already started or ended this year, roll forward to next year so
    // daysUntil is positive.
    const todayDate = now.getDate();
    let seasonStart = new Date(now.getFullYear(), peakStartMonth, 1);
    // "Inside the window" check handles both same-year (start <= now <=
    // end) and wrap-year (now >= start || now <= end).
    const inWindow = peakStartMonth <= peakEndMonth
      ? (currentMonth >= peakStartMonth && currentMonth <= peakEndMonth)
      : (currentMonth >= peakStartMonth || currentMonth <= peakEndMonth);
    if (!inWindow && seasonStart.getTime() < now.getTime()) {
      seasonStart = new Date(now.getFullYear() + 1, peakStartMonth, 1);
    }
    // Months as labels for the copy. Intl handles localisation if a
    // future tenant wants the banner in their locale; en-ZA stays the
    // default for now.
    const monthLabel = (m: number) =>
      new Date(2000, m, 1).toLocaleString("en-ZA", { month: "long" });
    const windowLabel = `${monthLabel(peakStartMonth)} - ${monthLabel(peakEndMonth)}`;
    const msUntil = seasonStart.getTime() - now.getTime();
    const daysUntil = Math.max(0, Math.ceil(msUntil / 86_400_000));
    // Trigger window: the 6 weeks before peak starts. Operators get the
    // banner with enough runway to stock inventory + roster staff but
    // don't get nagged in the off-season.
    if (!inWindow && daysUntil > 0 && daysUntil <= 42) {
      alerts.push({
        severity: "low",
        message: "Peak season approaching",
        suggestedAction: daysUntil <= 14
          ? `Peak season (${windowLabel}) starts in about ${daysUntil} day${daysUntil === 1 ? "" : "s"}. Lock in inventory, staff availability and equipment maintenance now.`
          : `Peak season (${windowLabel}) is on the horizon (${daysUntil} days). Start lining up inventory, staff availability and equipment maintenance.`,
        predictedDate: seasonStart.toISOString(),
      });
    }
    // Also surface a brief "peak season active" pulse for the first
    // two weeks of the configured window so the operator gets a
    // visible cue when high-volume mode kicks in. Pre-FIN-C this
    // wasn't represented at all.
    if (inWindow) {
      const fromStart = (() => {
        if (peakStartMonth <= peakEndMonth) {
          return Math.floor((now.getTime() - new Date(now.getFullYear(), peakStartMonth, 1).getTime()) / 86_400_000);
        }
        // Wrap case - if we're in the second half of the wrap (Jan
        // when peak runs Nov-Jan), the start was last year.
        const startYear = currentMonth >= peakStartMonth ? now.getFullYear() : now.getFullYear() - 1;
        return Math.floor((now.getTime() - new Date(startYear, peakStartMonth, 1).getTime()) / 86_400_000);
      })();
      if (fromStart >= 0 && fromStart <= 14) {
        alerts.push({
          severity: "low",
          message: "Peak season is here",
          suggestedAction: `${windowLabel} peak window is underway. Watch inventory levels and confirm staff availability for the next 4 weeks.`,
          predictedDate: now.toISOString(),
        });
      }
    }

    // Good financial health
    if (data.currentCashFlow > data.upcomingExpenses * 2 && cashFlowRatio > 1.5) {
      alerts.push({
        severity: "low",
        message: "Strong Financial Position",
        suggestedAction: "Excellent cash flow! Consider investing in equipment upgrades, marketing campaigns, or building cash reserves for slower periods.",
        predictedDate: now.toISOString()
      });
    }

    return alerts;
  },

  /**
   * Generate financial predictions for next 90 days
   */
  async generatePredictions(daysAhead: number = 90, orders: any[]): Promise<FinancialPrediction[]> {
    // If no orders passed, get historical data
    if (!orders || orders.length === 0) {
      const { data: historicalOrders, error: historicalOrdersErr } = await supabase
        .from('orders')
        .select('*')
        .order('event_date', { ascending: false })
        .limit(100);
      if (historicalOrdersErr) console.error("[aiFinancialService/generatePredictions] orders lookup failed:", historicalOrdersErr);

      orders = historicalOrders || [];
    }

    if (!orders || orders.length === 0) {
      return this.generateDefaultPredictions(daysAhead);
    }

    // Calculate historical averages
    const totalRevenue = orders.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);
    const avgDailyRevenue = totalRevenue / orders.length;

    // Generate predictions
    const predictions: FinancialPrediction[] = [];
    const today = new Date();

    for (let i = 0; i < daysAhead; i++) {
      const predictionDate = new Date(today);
      predictionDate.setDate(today.getDate() + i);

      const seasonalFactor = this.getSeasonalFactor(predictionDate);
      const trendFactor = this.getTrendFactor(i, daysAhead);

      const predictedRevenue = avgDailyRevenue * seasonalFactor * trendFactor;
      const predictedExpenses = predictedRevenue * 0.65; // Assume 65% cost ratio
      const predictedCashflow = predictedRevenue - predictedExpenses;

      const prediction: FinancialPrediction = {
        prediction_date: predictionDate.toISOString().split('T')[0],
        predicted_revenue: Math.round(predictedRevenue),
        predicted_expenses: Math.round(predictedExpenses),
        predicted_cashflow: Math.round(predictedCashflow),
        confidence_score: this.calculateConfidence(i, orders.length),
        risk_level: this.assessRisk(predictedCashflow, avgDailyRevenue),
        recommendations: this.generateRecommendations(predictedCashflow, avgDailyRevenue)
      };

      predictions.push(prediction);
    }

    this.savePredictionsBatch(predictions).catch(err =>
      console.error("Background prediction save failed:", err)
    );

    return predictions;
  },

  async savePredictionsBatch(predictions: FinancialPrediction[]) {
    if (!predictions.length) return;
    const { error } = await supabase
      .from('financial_predictions')
      .upsert(
        predictions.map(p => ({
          prediction_date: p.prediction_date,
          predicted_revenue: p.predicted_revenue,
          predicted_expenses: p.predicted_expenses,
          predicted_cashflow: p.predicted_cashflow,
          confidence_score: p.confidence_score,
          risk_level: p.risk_level,
          recommendations: p.recommendations,
        })) as any,
        { onConflict: 'prediction_date' }
      );
    if (error) console.error('Error saving predictions batch:', error);
  },

  /**
   * Get seasonal adjustment factor
   */
  getSeasonalFactor(date: Date): number {
    const month = date.getMonth();

    // Wedding season peaks (May-September)
    if (month >= 4 && month <= 8) {
      return 1.3;
    }

    // Holiday season (November-December)
    if (month >= 10) {
      return 1.5;
    }

    // Slow months (January-February)
    if (month <= 1) {
      return 0.7;
    }

    return 1.0;
  },

  /**
   * Get trend adjustment factor
   */
  getTrendFactor(dayIndex: number, totalDays: number): number {
    // Slight upward trend assumption (5% growth over prediction period)
    return 1 + (dayIndex / totalDays) * 0.05;
  },

  /**
   * Calculate prediction confidence based on data availability
   */
  calculateConfidence(daysAhead: number, historicalDataPoints: number): number {
    let confidence = 0.95;

    // Reduce confidence for longer predictions
    confidence -= (daysAhead / 90) * 0.2;

    // Reduce confidence for limited historical data
    if (historicalDataPoints < 30) {
      confidence -= 0.3;
    } else if (historicalDataPoints < 50) {
      confidence -= 0.15;
    }

    return Math.max(0.5, Math.min(0.99, confidence));
  },

  /**
   * Assess financial risk level
   */
  assessRisk(predictedCashflow: number, avgRevenue: number): 'low' | 'medium' | 'high' {
    const cashflowRatio = predictedCashflow / avgRevenue;

    if (cashflowRatio < 0.1) {
      return 'high';
    } else if (cashflowRatio < 0.25) {
      return 'medium';
    }
    return 'low';
  },

  /**
   * Generate actionable recommendations
   */
  generateRecommendations(predictedCashflow: number, avgRevenue: number): string[] {
    const recommendations: string[] = [];
    const cashflowRatio = predictedCashflow / avgRevenue;

    if (cashflowRatio < 0.15) {
      recommendations.push('⚠️ Low cashflow predicted - consider delaying non-essential expenses');
      recommendations.push('💰 Focus on collecting outstanding invoices');
      recommendations.push('📊 Review pricing strategy for upcoming bookings');
    } else if (cashflowRatio > 0.4) {
      recommendations.push('✅ Strong cashflow predicted - good time for equipment investments');
      recommendations.push('📈 Consider marketing campaigns to sustain momentum');
      recommendations.push('💪 Opportunity to build cash reserves');
    }

    return recommendations;
  },

  /**
   * Save prediction to database
   */
  async savePrediction(prediction: FinancialPrediction) {
    const { error } = await supabase
      .from('financial_predictions')
      .upsert([{
        prediction_date: prediction.prediction_date,
        predicted_revenue: prediction.predicted_revenue,
        predicted_expenses: prediction.predicted_expenses,
        predicted_cashflow: prediction.predicted_cashflow,
        confidence_score: prediction.confidence_score,
        risk_level: prediction.risk_level,
        recommendations: prediction.recommendations
      }] as any, {
        onConflict: 'prediction_date'
      });

    if (error) {
      console.error('Error saving prediction:', error);
    }
  },

  /**
   * Get cashflow alerts
   */
  async getCashflowAlerts(): Promise<CashflowAlert[]> {
    const alerts: CashflowAlert[] = [];

    // Get predictions for next 30 days
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    const { data: predictions, error: predictionsErr } = await supabase
      .from('financial_predictions')
      .select('*')
      .gte('prediction_date', new Date().toISOString().split('T')[0])
      .lte('prediction_date', endDate.toISOString().split('T')[0])
      .order('prediction_date', { ascending: true });
    if (predictionsErr) console.error("[aiFinancialService/getCashflowAlerts] financial_predictions lookup failed:", predictionsErr);

    if (!predictions) return alerts;

    // Check for critical cashflow situations
    predictions.forEach(pred => {
      if (pred.risk_level === 'high') {
        alerts.push({
          severity: 'critical',
          message: `Critical: Low cashflow predicted for ${pred.prediction_date}`,
          action_items: [
            'Review upcoming expenses',
            'Accelerate invoice collections',
            'Consider short-term credit options'
          ],
          projected_date: pred.prediction_date
        });
      } else if (pred.risk_level === 'medium') {
        alerts.push({
          severity: 'warning',
          message: `Warning: Moderate cashflow for ${pred.prediction_date}`,
          action_items: [
            'Monitor daily expenses',
            'Prepare for tighter budget'
          ],
          projected_date: pred.prediction_date
        });
      }
    });

    return alerts;
  },

  /**
   * Generate default predictions when no historical data
   */
  generateDefaultPredictions(daysAhead: number): FinancialPrediction[] {
    const predictions: FinancialPrediction[] = [];
    const today = new Date();
    const defaultDailyRevenue = 5000; // Default assumption

    for (let i = 0; i < daysAhead; i++) {
      const predictionDate = new Date(today);
      predictionDate.setDate(today.getDate() + i);

      const seasonalFactor = this.getSeasonalFactor(predictionDate);
      const predictedRevenue = defaultDailyRevenue * seasonalFactor;

      predictions.push({
        prediction_date: predictionDate.toISOString().split('T')[0],
        predicted_revenue: Math.round(predictedRevenue),
        predicted_expenses: Math.round(predictedRevenue * 0.65),
        predicted_cashflow: Math.round(predictedRevenue * 0.35),
        confidence_score: 0.5,
        risk_level: 'medium',
        recommendations: ['Build historical data for better predictions']
      });
    }

    return predictions;
  }
};
