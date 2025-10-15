import { supabase } from "@/integrations/supabase/client";

export interface RecipeScalingResult {
  original_guest_count: number;
  new_guest_count: number;
  scaling_factor: number;
  ingredient_adjustments: IngredientAdjustment[];
  warnings: string[];
  recommendations: string[];
}

export interface IngredientAdjustment {
  ingredient_name: string;
  original_quantity: number;
  new_quantity: number;
  unit: string;
  rounded_quantity?: number;
  notes?: string;
}

export const aiRecipeScalingService = {
  /**
   * Scale recipe based on guest count change
   */
  async scaleRecipe(
    orderId: string,
    originalGuestCount: number,
    newGuestCount: number,
    ingredients: Array<{ name: string; quantity: number; unit: string }>
  ): Promise<RecipeScalingResult> {
    const scalingFactor = newGuestCount / originalGuestCount;
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Scale each ingredient
    const adjustments: IngredientAdjustment[] = ingredients.map(ingredient => {
      const newQuantity = ingredient.quantity * scalingFactor;
      const roundedQuantity = this.smartRound(newQuantity, ingredient.unit);

      // Add warnings for unusual scaling
      if (scalingFactor > 2) {
        warnings.push(`Large increase detected for ${ingredient.name}. Consider splitting into batches.`);
      }

      // Add recommendations for specific ingredients
      if (ingredient.name.toLowerCase().includes('salt') || ingredient.name.toLowerCase().includes('spice')) {
        recommendations.push(`${ingredient.name}: Scale conservatively and adjust to taste.`);
      }

      return {
        ingredient_name: ingredient.name,
        original_quantity: ingredient.quantity,
        new_quantity: newQuantity,
        rounded_quantity: roundedQuantity,
        unit: ingredient.unit,
        notes: this.getIngredientNotes(ingredient.name, scalingFactor)
      };
    });

    // Add general recommendations
    if (scalingFactor > 1.5) {
      recommendations.push('Consider increasing cooking time by 10-15%');
      recommendations.push('Check equipment capacity before scaling');
    }

    if (scalingFactor < 0.5) {
      recommendations.push('Small batch cooking may require temperature adjustments');
    }

    // Save scaling history
    await this.saveScalingHistory(orderId, originalGuestCount, newGuestCount, scalingFactor, adjustments);

    return {
      original_guest_count: originalGuestCount,
      new_guest_count: newGuestCount,
      scaling_factor: scalingFactor,
      ingredient_adjustments: adjustments,
      warnings,
      recommendations
    };
  },

  /**
   * Smart rounding based on unit type
   */
  smartRound(value: number, unit: string): number {
    const lowerUnit = unit.toLowerCase();

    // Weight measurements - round to nearest 0.1
    if (lowerUnit.includes('kg') || lowerUnit.includes('g')) {
      return Math.round(value * 10) / 10;
    }

    // Volume measurements - round to nearest 0.25
    if (lowerUnit.includes('l') || lowerUnit.includes('ml') || lowerUnit.includes('cup')) {
      return Math.round(value * 4) / 4;
    }

    // Tablespoons/teaspoons - round to nearest 0.5
    if (lowerUnit.includes('tbsp') || lowerUnit.includes('tsp')) {
      return Math.round(value * 2) / 2;
    }

    // Pieces/units - round to nearest whole number
    if (lowerUnit.includes('piece') || lowerUnit.includes('unit') || lowerUnit === '') {
      return Math.ceil(value);
    }

    return Math.round(value * 100) / 100;
  },

  /**
   * Get ingredient-specific scaling notes
   */
  getIngredientNotes(ingredientName: string, scalingFactor: number): string | undefined {
    const lower = ingredientName.toLowerCase();

    if (lower.includes('yeast') && scalingFactor > 1.5) {
      return 'Yeast does not scale linearly - use slightly less than calculated';
    }

    if ((lower.includes('salt') || lower.includes('spice')) && scalingFactor > 2) {
      return 'Season conservatively and adjust to taste';
    }

    if (lower.includes('egg') && scalingFactor < 1) {
      return 'Consider using egg substitute for partial eggs';
    }

    if (lower.includes('garlic') || lower.includes('onion')) {
      return 'Aromatics scale well but can be adjusted to taste';
    }

    return undefined;
  },

  /**
   * Save scaling history to database
   */
  async saveScalingHistory(
    orderId: string,
    originalGuestCount: number,
    newGuestCount: number,
    scalingFactor: number,
    adjustments: IngredientAdjustment[]
  ) {
    const { data: user } = await supabase.auth.getUser();

    if (!user.user) return;

    const { error } = await supabase
      .from('recipe_scaling_history')
      .insert([{
        order_id: orderId,
        original_guest_count: originalGuestCount,
        new_guest_count: newGuestCount,
        scaling_factor: scalingFactor,
        ingredient_adjustments: JSON.parse(JSON.stringify(adjustments)),
        adjusted_by_user_id: user.user.id
      }]);

    if (error) {
      console.error('Error saving scaling history:', error);
    }
  },

  /**
   * Get scaling history for an order
   */
  async getScalingHistory(orderId: string) {
    const { data, error } = await supabase
      .from('recipe_scaling_history')
      .select(`
        *,
        profiles!recipe_scaling_history_adjusted_by_user_id_fkey (
          full_name
        )
      `)
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data;
  },

  /**
   * Predict ingredient requirements for future orders
   */
  async predictIngredientNeeds(startDate: string, endDate: string) {
    // Get all orders in date range
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .gte('event_date', startDate)
      .lte('event_date', endDate);

    if (error) throw error;

    // Aggregate ingredient needs
    const predictions: Record<string, { total_quantity: number; unit: string; orders: number }> = {};

    // This would analyze historical data and predict needs
    // For now, return empty predictions (to be enhanced with real data)

    return predictions;
  }
};
