/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import { notificationService } from "./notificationService";

export interface GamificationPoint {
  id: string;
  user_id: string;
  points: number;
  action_type: string;
  action_description?: string;
  order_id?: string;
  awarded_at: string;
}

export interface GamificationAchievement {
  id: string;
  user_id: string;
  achievement_key: string;
  achievement_name: string;
  achievement_description?: string;
  icon?: string;
  unlocked_at: string;
}

export interface LeaderboardEntry {
  user_id: string;
  full_name: string;
  role: string;
  total_points: number;
  rank: number;
  avatar_url?: string;
}

export const gamificationService = {
  /**
   * Award points to a user
   */
  async awardPoints(userId: string, points: number, actionType: string, actionDescription?: string, orderId?: string) {
    const { data, error } = await supabase
      .from('gamification_points')
      .insert([{
        user_id: userId,
        points,
        action_type: actionType,
        action_description: actionDescription,
        order_id: orderId
      }])
      .select()
      .single();

    if (error) throw error;

    // Check for achievement unlocks
    await this.checkAchievements(userId);

    // Send notification. There's no dedicated gamification page yet,
    // so leave link null -- the bell falls back to the inbox view
    // rather than pointing somewhere wrong.
    await notificationService.createNotification({
      title: `🎉 +${points} Points!`,
      message: actionDescription || `You earned ${points} points!`,
      notification_type: 'gamification_points',
      recipient_id: userId,
      user_id: userId,
      link: null,
      metadata: { points, actionType }
    });

    return data as GamificationPoint;
  },

  /**
   * Get user's total points
   */
  async getUserPoints(userId: string) {
    const { data, error } = await supabase
      .from('gamification_points')
      .select('points')
      .eq('user_id', userId);

    if (error) throw error;

    const totalPoints = data.reduce((sum, entry) => sum + entry.points, 0);

    return totalPoints;
  },

  /**
   * Get user's point history
   */
  async getUserPointHistory(userId: string, limit: number = 50) {
    const { data, error } = await supabase
      .from('gamification_points')
      .select('*')
      .eq('user_id', userId)
      .order('awarded_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data as GamificationPoint[];
  },

  /**
   * Unlock achievement for user
   */
  async unlockAchievement(userId: string, achievementKey: string, achievementName: string, achievementDescription?: string, icon?: string) {
    // Check if already unlocked
    const { data: existing } = await supabase
      .from('gamification_achievements')
      .select('*')
      .eq('user_id', userId)
      .eq('achievement_key', achievementKey)
      .single();

    if (existing) return existing;

    const { data, error } = await supabase
      .from('gamification_achievements')
      .insert([{
        user_id: userId,
        achievement_key: achievementKey,
        achievement_name: achievementName,
        achievement_description: achievementDescription,
        icon: icon || '🏆'
      }])
      .select()
      .single();

    if (error) throw error;

    // Send celebratory notification. No dedicated achievements page
    // -- link null falls the bell back to the inbox view.
    await notificationService.createNotification({
      title: `🏆 Achievement Unlocked!`,
      message: `You unlocked: ${achievementName}`,
      notification_type: 'gamification_achievement',
      recipient_id: userId,
      user_id: userId,
      link: null,
      metadata: { achievementKey, achievementName }
    });

    return data as GamificationAchievement;
  },

  /**
   * Get user's achievements
   */
  async getUserAchievements(userId: string) {
    const { data, error } = await supabase
      .from('gamification_achievements')
      .select('*')
      .eq('user_id', userId)
      .order('unlocked_at', { ascending: false });

    if (error) throw error;

    return data as GamificationAchievement[];
  },

  /**
   * Get leaderboard by role
   */
  async getLeaderboard(role?: string, limit: number = 10) {
    let query = supabase
      .from('profiles')
      .select('id, full_name, role, avatar_url');

    if (role) {
      query = query.eq('role', role);
    }

    const { data: users, error } = await query;

    if (error) throw error;

    // Get points for each user
    const leaderboard: LeaderboardEntry[] = [];

    for (const user of users || []) {
      const totalPoints = await this.getUserPoints(user.id);
      leaderboard.push({
        user_id: user.id,
        full_name: user.full_name,
        role: user.role,
        total_points: totalPoints,
        rank: 0,
        avatar_url: user.avatar_url
      });
    }

    // Sort by points and assign ranks
    leaderboard.sort((a, b) => b.total_points - a.total_points);
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return leaderboard.slice(0, limit);
  },

  /**
   * Check and unlock achievements based on activity
   */
  async checkAchievements(userId: string) {
    const totalPoints = await this.getUserPoints(userId);
    const { data: history } = await supabase
      .from('gamification_points')
      .select('*')
      .eq('user_id', userId);

    const completedOrders = history?.filter(h => h.action_type === 'order_completed').length || 0;
    const onTimeDeliveries = history?.filter(h => h.action_type === 'on_time_delivery').length || 0;

    // Point-based achievements
    if (totalPoints >= 100) {
      await this.unlockAchievement(userId, 'first_100', 'Century Club', 'Earned 100 points', '💯');
    }
    if (totalPoints >= 500) {
      await this.unlockAchievement(userId, 'first_500', 'Point Master', 'Earned 500 points', '⭐');
    }
    if (totalPoints >= 1000) {
      await this.unlockAchievement(userId, 'first_1000', 'Point Legend', 'Earned 1000 points', '🌟');
    }

    // Order-based achievements
    if (completedOrders >= 10) {
      await this.unlockAchievement(userId, 'orders_10', 'Starter Pack', 'Completed 10 orders', '📦');
    }
    if (completedOrders >= 50) {
      await this.unlockAchievement(userId, 'orders_50', 'Seasoned Pro', 'Completed 50 orders', '🚚');
    }
    if (completedOrders >= 100) {
      await this.unlockAchievement(userId, 'orders_100', 'Century Driver', 'Completed 100 orders', '🏆');
    }

    // On-time delivery achievements
    if (onTimeDeliveries >= 10) {
      await this.unlockAchievement(userId, 'on_time_10', 'Punctual Pro', '10 on-time deliveries', '⏰');
    }
    if (onTimeDeliveries >= 50) {
      await this.unlockAchievement(userId, 'on_time_50', 'Time Master', '50 on-time deliveries', '⏱️');
    }
  },

  /**
   * Award points for specific actions
   */
  async awardActionPoints(userId: string, action: string, orderId?: string) {
    const pointValues: Record<string, { points: number; description: string }> = {
      'order_completed': { points: 10, description: 'Completed an order' },
      'on_time_delivery': { points: 15, description: 'On-time delivery' },
      'early_delivery': { points: 20, description: 'Early delivery' },
      'perfect_order': { points: 25, description: 'Perfect order (no issues)' },
      'driver_confirmed_early': { points: 5, description: 'Confirmed en-route early' },
      'helped_team': { points: 10, description: 'Helped another team member' },
      'equipment_check': { points: 5, description: 'Completed equipment check' },
      'clean_vehicle': { points: 5, description: 'Vehicle cleanliness verified' }
    };

    const actionData = pointValues[action];
    if (!actionData) return null;

    return await this.awardPoints(
      userId,
      actionData.points,
      action,
      actionData.description,
      orderId
    );
  }
};
