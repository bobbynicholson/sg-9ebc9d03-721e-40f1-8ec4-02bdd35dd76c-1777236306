import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type MenuItem = Database["public"]["Tables"]["menu_items"]["Row"];
type MenuItemInsert = Database["public"]["Tables"]["menu_items"]["Insert"];
type Recipe = Database["public"]["Tables"]["recipes"]["Row"];
type RecipeInsert = Database["public"]["Tables"]["recipes"]["Insert"];
type RecipeIngredient = Database["public"]["Tables"]["recipe_ingredients"]["Row"];
type RecipeIngredientInsert = Database["public"]["Tables"]["recipe_ingredients"]["Insert"];
type Allergen = Database["public"]["Tables"]["allergens"]["Row"];
type InventoryBatch = Database["public"]["Tables"]["inventory_batches"]["Row"];
type InventoryBatchInsert = Database["public"]["Tables"]["inventory_batches"]["Insert"];
type StorageLocation = Database["public"]["Tables"]["storage_locations"]["Row"];
type StorageLocationInsert = Database["public"]["Tables"]["storage_locations"]["Insert"];
type TemperatureLog = Database["public"]["Tables"]["temperature_logs"]["Row"];
type TemperatureLogInsert = Database["public"]["Tables"]["temperature_logs"]["Insert"];
type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];
type SupplierInsert = Database["public"]["Tables"]["suppliers"]["Insert"];
type EquipmentMaintenance = Database["public"]["Tables"]["equipment_maintenance"]["Row"];
type EquipmentMaintenanceInsert = Database["public"]["Tables"]["equipment_maintenance"]["Insert"];
type SafetyCheck = Database["public"]["Tables"]["safety_checks"]["Row"];
type SafetyCheckInsert = Database["public"]["Tables"]["safety_checks"]["Insert"];
type TrainingMaterial = Database["public"]["Tables"]["training_materials"]["Row"];
type TrainingMaterialInsert = Database["public"]["Tables"]["training_materials"]["Insert"];
type HealthCertificate = Database["public"]["Tables"]["health_certificates"]["Row"];
type DailyPrepList = Database["public"]["Tables"]["daily_prep_lists"]["Row"];
type DailyPrepListInsert = Database["public"]["Tables"]["daily_prep_lists"]["Insert"];
type WasteLog = Database["public"]["Tables"]["waste_logs"]["Row"];
type WasteLogInsert = Database["public"]["Tables"]["waste_logs"]["Insert"];
type IngredientSubstitution = Database["public"]["Tables"]["ingredient_substitutions"]["Row"];
type IngredientSubstitutionInsert = Database["public"]["Tables"]["ingredient_substitutions"]["Insert"];

// New types for Fleet & Equipment
type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
type VehicleInsert = Database["public"]["Tables"]["vehicles"]["Insert"];
type VehicleMaintenance = Database["public"]["Tables"]["vehicle_maintenance"]["Row"];
type VehicleMaintenanceInsert = Database["public"]["Tables"]["vehicle_maintenance"]["Insert"];
type VehicleLog = Database["public"]["Tables"]["vehicle_logs"]["Row"];
type VehicleLogInsert = Database["public"]["Tables"]["vehicle_logs"]["Insert"];
type EquipmentKit = Database["public"]["Tables"]["equipment_kits"]["Row"];
type EquipmentKitInsert = Database["public"]["Tables"]["equipment_kits"]["Insert"];
type EquipmentKitItem = Database["public"]["Tables"]["equipment_kit_items"]["Row"];
type EquipmentKitItemInsert = Database["public"]["Tables"]["equipment_kit_items"]["Insert"];
type FinancialDepreciation = Database["public"]["Tables"]["financial_depreciation"]["Row"];
type FinancialDepreciationInsert = Database["public"]["Tables"]["financial_depreciation"]["Insert"];


export const operationsService = {
  // ==========================================
  // MENU PLANNING & RECIPES (#1, #2)
  // ==========================================

  async getMenuItems(companyId: string) {
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("category", { ascending: true });

    if (error) throw error;
    return data as MenuItem[];
  },

  async createMenuItem(menuItem: MenuItemInsert) {
    const { data, error } = await supabase
      .from("menu_items")
      .insert(menuItem)
      .select()
      .single();

    if (error) throw error;
    return data as MenuItem;
  },

  async updateMenuItem(id: string, updates: Partial<MenuItem>) {
    const { data, error } = await supabase
      .from("menu_items")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as MenuItem;
  },

  async getRecipes(companyId: string) {
    const { data, error } = await supabase
      .from("recipes")
      .select(`
        *,
        recipe_ingredients (*),
        recipe_allergens (
          allergen_id,
          allergens (*)
        )
      `)
      .eq("company_id", companyId)
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) throw error;
    return data;
  },

  async createRecipe(recipe: RecipeInsert, ingredients: Omit<RecipeIngredientInsert, 'recipe_id'>[], allergenIds: string[]) {
    // Create recipe
    const { data: recipeData, error: recipeError } = await supabase
      .from("recipes")
      .insert(recipe)
      .select()
      .single();

    if (recipeError) throw recipeError;

    // Add ingredients
    if (ingredients.length > 0) {
      const ingredientsWithRecipeId = ingredients.map(ing => ({
        ...ing,
        recipe_id: recipeData.id
      }));

      const { error: ingredientsError } = await supabase
        .from("recipe_ingredients")
        .insert(ingredientsWithRecipeId);

      if (ingredientsError) throw ingredientsError;
    }

    // Add allergens
    if (allergenIds.length > 0) {
      const allergenLinks = allergenIds.map(allergenId => ({
        recipe_id: recipeData.id,
        allergen_id: allergenId
      }));

      const { error: allergensError } = await supabase
        .from("recipe_allergens")
        .insert(allergenLinks);

      if (allergensError) throw allergensError;
    }

    return recipeData as Recipe;
  },

  async getAllergens() {
    const { data, error } = await supabase
      .from("allergens")
      .select("*")
      .order("severity", { ascending: false });

    if (error) throw error;
    return data as Allergen[];
  },

  // ==========================================
  // INVENTORY MANAGEMENT (#8 FIFO System)
  // ==========================================

  async getInventoryBatches(companyId: string, status?: string) {
    let query = supabase
      .from("inventory_batches")
      .select("*")
      .eq("company_id", companyId)
      .order("expiry_date", { ascending: true }); // FIFO ordering

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as InventoryBatch[];
  },

  async createInventoryBatch(batch: InventoryBatchInsert) {
    const { data, error } = await supabase
      .from("inventory_batches")
      .insert(batch)
      .select()
      .single();

    if (error) throw error;
    return data as InventoryBatch;
  },

  async updateInventoryBatch(id: string, updates: Partial<InventoryBatch>) {
    const { data, error } = await supabase
      .from("inventory_batches")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as InventoryBatch;
  },

  async getExpiringInventory(companyId: string, daysAhead: number = 7) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const { data, error } = await supabase
      .from("inventory_batches")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", "available")
      .lte("expiry_date", futureDate.toISOString().split('T')[0])
      .order("expiry_date", { ascending: true });

    if (error) throw error;
    return data as InventoryBatch[];
  },

  // ==========================================
  // STORAGE & TEMPERATURE MANAGEMENT (#6, #7, #17)
  // ==========================================

  async getStorageLocations(companyId: string) {
    const { data, error } = await supabase
      .from("storage_locations")
      .select("*")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("type", { ascending: true });

    if (error) throw error;
    return data as StorageLocation[];
  },

  async createStorageLocation(location: StorageLocationInsert) {
    const { data, error } = await supabase
      .from("storage_locations")
      .insert(location)
      .select()
      .single();

    if (error) throw error;
    return data as StorageLocation;
  },

  async logTemperature(log: TemperatureLogInsert) {
    const { data, error } = await supabase
      .from("temperature_logs")
      .insert(log)
      .select()
      .single();

    if (error) throw error;
    return data as TemperatureLog;
  },

  async getTemperatureLogs(storageLocationId: string, days: number = 7) {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - days);

    const { data, error } = await supabase
      .from("temperature_logs")
      .select("*")
      .eq("storage_location_id", storageLocationId)
      .gte("recorded_at", pastDate.toISOString())
      .order("recorded_at", { ascending: false });

    if (error) throw error;
    return data as TemperatureLog[];
  },

  async getTemperatureAlerts(companyId: string) {
    const { data, error } = await supabase
      .from("temperature_logs")
      .select(`
        *,
        storage_locations!inner(company_id)
      `)
      .eq("alert_triggered", true)
      .eq("storage_locations.company_id", companyId)
      .order("recorded_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    return data;
  },

  // ==========================================
  // WASTE MANAGEMENT (#16)
  // ==========================================

  async logWaste(wasteLog: WasteLogInsert) {
    const { data, error } = await supabase
      .from("waste_logs")
      .insert(wasteLog)
      .select()
      .single();

    if (error) throw error;
    return data as WasteLog;
  },

  async getWasteLogs(companyId: string, startDate?: string, endDate?: string) {
    let query = supabase
      .from("waste_logs")
      .select("*")
      .eq("company_id", companyId)
      .order("date", { ascending: false });

    if (startDate) {
      query = query.gte("date", startDate);
    }
    if (endDate) {
      query = query.lte("date", endDate);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as WasteLog[];
  },
  
  // TODO: Create the 'get_waste_analytics' RPC function in the database.
  // async getWasteAnalytics(companyId: string, period: 'week' | 'month' | 'year') {
  //   const { data, error } = await supabase
  //     .rpc('get_waste_analytics', {
  //       p_company_id: companyId,
  //       p_period: period
  //     });

  //   if (error) {
  //     console.error("Waste analytics error:", error);
  //     return null;
  //   }
  //   return data;
  // },

  // ==========================================
  // INGREDIENT SUBSTITUTIONS (#18)
  // ==========================================

  async getSubstitutions(companyId: string) {
    const { data, error } = await supabase
      .from("ingredient_substitutions")
      .select("*")
      .eq("company_id", companyId)
      .order("original_ingredient", { ascending: true });

    if (error) throw error;
    return data as IngredientSubstitution[];
  },

  async createSubstitution(substitution: IngredientSubstitutionInsert) {
    const { data, error } = await supabase
      .from("ingredient_substitutions")
      .insert(substitution)
      .select()
      .single();

    if (error) throw error;
    return data as IngredientSubstitution;
  },

  // ==========================================
  // SUPPLIER MANAGEMENT (#4, #19)
  // ==========================================

  async getSuppliers(companyId: string) {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("priority", { ascending: true });

    if (error) throw error;
    return data as Supplier[];
  },

  async createSupplier(supplier: SupplierInsert) {
    const { data, error } = await supabase
      .from("suppliers")
      .insert(supplier)
      .select()
      .single();

    if (error) throw error;
    return data as Supplier;
  },

  async updateSupplier(id: string, updates: Partial<Supplier>) {
    const { data, error } = await supabase
      .from("suppliers")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Supplier;
  },

  async getEmergencySuppliers(companyId: string) {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .eq("company_id", companyId)
      .eq("emergency_contact", true)
      .eq("active", true);

    if (error) throw error;
    return data as Supplier[];
  },

  // ==========================================
  // EQUIPMENT MANAGEMENT (#13, #14, #15)
  // ==========================================

  async getEquipment(companyId: string) {
    const { data, error } = await supabase
      .from("equipment_maintenance")
      .select("*")
      .eq("company_id", companyId)
      .order("next_service_date", { ascending: true });

    if (error) throw error;
    return data as EquipmentMaintenance[];
  },

  async createEquipment(equipment: EquipmentMaintenanceInsert) {
    const { data, error } = await supabase
      .from("equipment_maintenance")
      .insert(equipment)
      .select()
      .single();

    if (error) throw error;
    return data as EquipmentMaintenance;
  },

  async updateEquipment(id: string, updates: Partial<EquipmentMaintenance>) {
    const { data, error } = await supabase
      .from("equipment_maintenance")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as EquipmentMaintenance;
  },

  async getEquipmentDueForService(companyId: string, daysAhead: number = 30) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const { data, error } = await supabase
      .from("equipment_maintenance")
      .select("*")
      .eq("company_id", companyId)
      .lte("next_service_date", futureDate.toISOString().split('T')[0])
      .order("next_service_date", { ascending: true });

    if (error) throw error;
    return data as EquipmentMaintenance[];
  },

  async getSafetyChecks(companyId: string) {
    const { data, error } = await supabase
      .from("safety_checks")
      .select("*")
      .eq("company_id", companyId)
      .order("check_date", { ascending: false });

    if (error) throw error;
    return data as SafetyCheck[];
  },

  async createSafetyCheck(check: SafetyCheckInsert) {
    const { data, error } = await supabase
      .from("safety_checks")
      .insert(check)
      .select()
      .single();

    if (error) throw error;
    return data as SafetyCheck;
  },

  // ==========================================
  // TRAINING & CERTIFICATIONS (#31, #37)
  // ==========================================

  async getTrainingMaterials(companyId: string) {
    const { data, error } = await supabase
      .from("training_materials")
      .select("*")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("category", { ascending: true });

    if (error) throw error;
    return data as TrainingMaterial[];
  },

  async createTrainingMaterial(material: TrainingMaterialInsert) {
    const { data, error } = await supabase
      .from("training_materials")
      .insert(material)
      .select()
      .single();

    if (error) throw error;
    return data as TrainingMaterial;
  },

  async getHealthCertificates(companyId: string) {
    const { data, error } = await supabase
      .from("health_certificates")
      .select(`
        *,
        profiles!inner(company_id, full_name, email)
      `)
      .eq("profiles.company_id", companyId)
      .order("expiry_date", { ascending: true });

    if (error) throw error;
    return data;
  },

  async getExpiringCertificates(companyId: string, daysAhead: number = 30) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const { data, error } = await supabase
      .from("health_certificates")
      .select(`
        *,
        profiles!inner(full_name, email, company_id)
      `)
      .eq("profiles.company_id", companyId)
      .lte("expiry_date", futureDate.toISOString().split('T')[0])
      .order("expiry_date", { ascending: true });

    if (error) throw error;
    return data;
  },

  // ==========================================
  // DAILY OPERATIONS (#11 Prep Lists)
  // ==========================================

  async getDailyPrepLists(companyId: string, date: string) {
    const { data, error } = await supabase
      .from("daily_prep_lists")
      .select(`
        *,
        assigned_to_profile:profiles!daily_prep_lists_assigned_to_fkey (full_name),
        completed_by_profile:profiles!daily_prep_lists_completed_by_fkey (full_name)
      `)
      .eq("company_id", companyId)
      .eq("prep_date", date)
      .order("priority", { ascending: false })
      .order("estimated_time_minutes", { ascending: false });

    if (error) throw error;
    return data;
  },

  async createPrepListItem(item: DailyPrepListInsert) {
    const { data, error } = await supabase
      .from("daily_prep_lists")
      .insert(item)
      .select()
      .single();

    if (error) throw error;
    return data as DailyPrepList;
  },

  async updatePrepListItem(id: string, updates: Partial<DailyPrepList>) {
    const { data, error } = await supabase
      .from("daily_prep_lists")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as DailyPrepList;
  },

  // ==========================================
  // COMPLIANCE DASHBOARD
  // ==========================================

  async getComplianceOverview(companyId: string) {
    // Get all compliance-related data in one call
    const [
      certificates,
      equipment,
      safetyChecks,
      inventory,
      temperatures
    ] = await Promise.all([
      this.getExpiringCertificates(companyId, 30),
      this.getEquipmentDueForService(companyId, 30),
      this.getSafetyChecks(companyId),
      this.getExpiringInventory(companyId, 7),
      this.getTemperatureAlerts(companyId)
    ]);

    return {
      expiringCertificates: certificates?.length || 0,
      equipmentDueService: equipment?.length || 0,
      recentSafetyChecks: safetyChecks?.slice(0, 5) || [],
      expiringInventory: inventory?.length || 0,
      temperatureAlerts: temperatures?.length || 0
    };
  },

  // ==========================================
  // FLEET MANAGEMENT (#61, #62, #68, #69, #72)
  // ==========================================

  async getVehicles(companyId: string) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("company_id", companyId)
      .order("name", { ascending: true });

    if (error) throw error;
    return data as Vehicle[];
  },

  async createVehicle(vehicle: VehicleInsert) {
    const { data, error } = await supabase
      .from("vehicles")
      .insert(vehicle)
      .select()
      .single();

    if (error) throw error;
    return data as Vehicle;
  },

  async updateVehicle(id: string, updates: Partial<Vehicle>) {
    const { data, error } = await supabase
      .from("vehicles")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Vehicle;
  },

  async getVehicleMaintenance(vehicleId: string) {
    const { data, error } = await supabase
      .from("vehicle_maintenance")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("service_date", { ascending: false });

    if (error) throw error;
    return data as VehicleMaintenance[];
  },

  async createVehicleMaintenance(maintenance: VehicleMaintenanceInsert) {
    const { data, error } = await supabase
      .from("vehicle_maintenance")
      .insert(maintenance)
      .select()
      .single();

    if (error) throw error;
    return data as VehicleMaintenance;
  },

  async getVehicleLogs(vehicleId: string) {
    const { data, error } = await supabase
      .from("vehicle_logs")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("log_date", { ascending: false });

    if (error) throw error;
    return data as VehicleLog[];
  },

  async createVehicleLog(log: VehicleLogInsert) {
    const { data, error } = await supabase
      .from("vehicle_logs")
      .insert(log)
      .select()
      .single();

    if (error) throw error;
    return data as VehicleLog;
  },

  // ==========================================
  // EQUIPMENT KITS (#42, #70)
  // ==========================================

  async getEquipmentKits(companyId: string) {
    const { data, error } = await supabase
      .from("equipment_kits")
      .select(`
        *,
        equipment_kit_items (
          *,
          equipment (*)
        )
      `)
      .eq("company_id", companyId)
      .order("name", { ascending: true });

    if (error) throw error;
    return data;
  },

  async createEquipmentKit(kit: EquipmentKitInsert, items: Omit<EquipmentKitItemInsert, 'kit_id'>[]) {
    const { data: kitData, error: kitError } = await supabase
      .from("equipment_kits")
      .insert(kit)
      .select()
      .single();

    if (kitError) throw kitError;

    if (items.length > 0) {
      const kitItems = items.map(item => ({ ...item, kit_id: kitData.id }));
      const { error: itemsError } = await supabase.from("equipment_kit_items").insert(kitItems);
      if (itemsError) throw itemsError;
    }

    return kitData as EquipmentKit;
  },

  // ==========================================
  // FINANCIAL & DEPRECIATION (#54)
  // ==========================================

  async getDepreciationSchedules(companyId: string) {
    const { data, error } = await supabase
      .from("financial_depreciation")
      .select(`
        *,
        equipment (*)
      `)
      .eq("company_id", companyId);

    if (error) throw error;
    return data;
  },

  async createDepreciationSchedule(schedule: FinancialDepreciationInsert) {
    const { data, error } = await supabase
      .from("financial_depreciation")
      .insert(schedule)
      .select()
      .single();

    if (error) throw error;
    return data as FinancialDepreciation;
  }
};
