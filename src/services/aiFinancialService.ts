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
   * Generate financial predictions for next 90 days
   */
  async generatePredictions(daysAhead: number = 90): Promise<FinancialPrediction[]> {
    // Get historical data
    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .order('event_date', { ascending: false })
      .limit(100);

    if (!orders || orders.length === 0) {
      return this.generateDefaultPredictions(daysAhead);
    }

    // Calculate historical averages
    const totalRevenue = orders.reduce((sum, order) => sum + (Number(order.total_cost) || 0), 0);
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

      // Save to database
      await this.savePrediction(prediction);
    }

    return predictions;
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

    const { data: predictions } = await supabase
      .from('financial_predictions')
      .select('*')
      .gte('prediction_date', new Date().toISOString().split('T')[0])
      .lte('prediction_date', endDate.toISOString().split('T')[0])
      .order('prediction_date', { ascending: true });

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
