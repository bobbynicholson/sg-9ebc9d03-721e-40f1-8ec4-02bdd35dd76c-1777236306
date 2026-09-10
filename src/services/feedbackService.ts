/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { FeedbackData } from "@/components/DeliveryFeedbackModal";

export const feedbackService = {
  /**
   * Submit delivery feedback.
   *
   * client_id + company_id are REQUIRED: both are NOT NULL on
   * delivery_feedback, and the RLS INSERT policy (client_submit_feedback)
   * checks `client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())`.
   * Omitting them is what produced the 403 on submit - the caller must
   * resolve the logged-in user's client row and pass it through.
   */
  async submitFeedback(
    feedback: FeedbackData,
    ctx: { client_id: string; company_id: string },
  ) {
    const { data, error } = await (supabase as any)
      .from("delivery_feedback")
      // Column names per the live schema: delivery_timeliness_rating /
      // driver_professionalism_rating (not delivery_speed_/driver_service_).
      // would_recommend + photo_url have no columns on delivery_feedback, so
      // they're not persisted (the whole insert 400'd before).
      .insert({
        order_id: feedback.order_id,
        client_id: ctx.client_id,
        company_id: ctx.company_id,
        food_quality_rating: feedback.food_quality_rating,
        delivery_timeliness_rating: feedback.delivery_speed_rating,
        driver_professionalism_rating: feedback.driver_service_rating,
        overall_rating: feedback.overall_rating,
        comments: feedback.comments,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error submitting feedback:", error);
      throw error;
    }

    return data;
  },

  /**
   * Get all feedback for a company
   */
  async getCompanyFeedback(companyId: string, limit = 50) {
    const { data, error } = await (supabase as any)
      .from("delivery_feedback")
      .select(`
        *,
        orders (
          client_name,
          venue_address,
          driver_id,
          delivery_time
        )
      `)
      .eq("orders.company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching feedback:", error);
      return [];
    }

    return data || [];
  },

  /**
   * Get feedback statistics for a company
   */
  async getFeedbackStats(companyId: string) {
    const feedback = await this.getCompanyFeedback(companyId, 1000);

    if (feedback.length === 0) {
      return {
        total_reviews: 0,
        average_overall: 0,
        average_food_quality: 0,
        average_delivery_speed: 0,
        average_driver_service: 0,
        recommendation_rate: 0,
        five_star_count: 0,
        four_star_count: 0,
        three_star_count: 0,
        two_star_count: 0,
        one_star_count: 0,
      };
    }

    const total = feedback.length;
    const avgOverall = feedback.reduce((sum, f) => sum + (f.overall_rating || 0), 0) / total;
    const avgFood = feedback.reduce((sum, f) => sum + (f.food_quality_rating || 0), 0) / total;
    const avgDelivery = feedback.reduce((sum, f) => sum + (f.delivery_speed_rating || 0), 0) / total;
    const avgDriver = feedback.reduce((sum, f) => sum + (f.driver_service_rating || 0), 0) / total;
    const recommendCount = feedback.filter(f => f.would_recommend).length;

    const ratingCounts = {
      5: feedback.filter(f => f.overall_rating === 5).length,
      4: feedback.filter(f => f.overall_rating === 4).length,
      3: feedback.filter(f => f.overall_rating === 3).length,
      2: feedback.filter(f => f.overall_rating === 2).length,
      1: feedback.filter(f => f.overall_rating === 1).length,
    };

    return {
      total_reviews: total,
      average_overall: Math.round(avgOverall * 10) / 10,
      average_food_quality: Math.round(avgFood * 10) / 10,
      average_delivery_speed: Math.round(avgDelivery * 10) / 10,
      average_driver_service: Math.round(avgDriver * 10) / 10,
      recommendation_rate: Math.round((recommendCount / total) * 100),
      five_star_count: ratingCounts[5],
      four_star_count: ratingCounts[4],
      three_star_count: ratingCounts[3],
      two_star_count: ratingCounts[2],
      one_star_count: ratingCounts[1],
    };
  },

  /**
   * Get recent feedback with details
   */
  async getRecentFeedback(companyId: string, limit = 10) {
    return this.getCompanyFeedback(companyId, limit);
  },

  /**
   * Check if feedback exists for an order
   */
  async checkFeedbackExists(orderId: string): Promise<boolean> {
    // maybeSingle, not single: 'no feedback yet' is the normal case and
    // must not throw a 406 (PGRST116 '0 rows') in the console.
    const { data, error } = await (supabase as any)
      .from("delivery_feedback")
      .select("id")
      .eq("order_id", orderId)
      .maybeSingle();

    return !!data && !error;
  },

  /**
   * Get feedback for a specific order
   */
  async getOrderFeedback(orderId: string) {
    const { data, error } = await (supabase as any)
      .from("delivery_feedback")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching order feedback:", error);
      return null;
    }

    return data;
  },
};