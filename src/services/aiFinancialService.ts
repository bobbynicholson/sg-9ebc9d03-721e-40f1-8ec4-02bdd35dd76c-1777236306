/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
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

    // Check for upcoming peak season
    if (currentMonth >= 3 && currentMonth <= 4) {
      alerts.push({
        severity: "low",
        message: "Peak Season Approaching",
        suggestedAction: "Wedding season (May-September) is approaching. Ensure adequate inventory, staff availability, and equipment maintenance.",
        predictedDate: new Date(now.getFullYear(), 4, 1).toISOString()
      });
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
        })),
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
      }], {
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
