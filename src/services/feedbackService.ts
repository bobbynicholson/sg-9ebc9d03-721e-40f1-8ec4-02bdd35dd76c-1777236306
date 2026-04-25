/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import { FeedbackData } from "@/components/DeliveryFeedbackModal";

export const feedbackService = {
  /**
   * Submit delivery feedback
   */
  async submitFeedback(feedback: FeedbackData) {
    const { data, error } = await (supabase as any)
      .from("delivery_feedback")
      .insert({
        order_id: feedback.order_id,
        food_quality_rating: feedback.food_quality_rating,
        delivery_speed_rating: feedback.delivery_speed_rating,
        driver_service_rating: feedback.driver_service_rating,
        overall_rating: feedback.overall_rating,
        comments: feedback.comments,
        would_recommend: feedback.would_recommend,
        photo_url: feedback.photo_url,
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
    const { data, error } = await (supabase as any)
      .from("delivery_feedback")
      .select("id")
      .eq("order_id", orderId)
      .single();

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
      .single();

    if (error) {
      console.error("Error fetching order feedback:", error);
      return null;
    }

    return data;
  },
};