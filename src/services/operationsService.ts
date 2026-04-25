// @ts-nocheck
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

// New types for operational standards 41-75
type PATTesting = Database["public"]["Tables"]["pat_testing"]["Row"];
type PATTestingInsert = Database["public"]["Tables"]["pat_testing"]["Insert"];
type BackupGenerator = Database["public"]["Tables"]["backup_generators"]["Row"];
type BackupGeneratorInsert = Database["public"]["Tables"]["backup_generators"]["Insert"];
type FuelStockpile = Database["public"]["Tables"]["fuel_stockpile"]["Row"];
type FuelStockpileInsert = Database["public"]["Tables"]["fuel_stockpile"]["Insert"];
type UtensilTracking = Database["public"]["Tables"]["utensil_tracking"]["Row"];
type UtensilTrackingInsert = Database["public"]["Tables"]["utensil_tracking"]["Insert"];
type LinenInventory = Database["public"]["Tables"]["linen_inventory"]["Row"];
type LinenInventoryInsert = Database["public"]["Tables"]["linen_inventory"]["Insert"];
type DishwasherCycle = Database["public"]["Tables"]["dishwasher_cycles"]["Row"];
type DishwasherCycleInsert = Database["public"]["Tables"]["dishwasher_cycles"]["Insert"];
type GlasswareCatalog = Database["public"]["Tables"]["glassware_catalog"]["Row"];
type GlasswareCatalogInsert = Database["public"]["Tables"]["glassware_catalog"]["Insert"];
type StorageRack = Database["public"]["Tables"]["storage_racks"]["Row"];
type StorageRackInsert = Database["public"]["Tables"]["storage_racks"]["Insert"];
type CleaningSupply = Database["public"]["Tables"]["cleaning_supplies"]["Row"];
type CleaningSupplyInsert = Database["public"]["Tables"]["cleaning_supplies"]["Insert"];
type PestControlLog = Database["public"]["Tables"]["pest_control_logs"]["Row"];
type PestControlLogInsert = Database["public"]["Tables"]["pest_control_logs"]["Insert"];
type SafetyEquipment = Database["public"]["Tables"]["safety_equipment"]["Row"];
type SafetyEquipmentInsert = Database["public"]["Tables"]["safety_equipment"]["Insert"];
type LightingTest = Database["public"]["Tables"]["lighting_tests"]["Row"];
type LightingTestInsert = Database["public"]["Tables"]["lighting_tests"]["Insert"];
type FloorSafetyInspection = Database["public"]["Tables"]["floor_safety_inspections"]["Row"];
type FloorSafetyInspectionInsert = Database["public"]["Tables"]["floor_safety_inspections"]["Insert"];
type DeliveryCrate = Database["public"]["Tables"]["delivery_crates"]["Row"];
type DeliveryCrateInsert = Database["public"]["Tables"]["delivery_crates"]["Insert"];
type LoadPlan = Database["public"]["Tables"]["load_plans"]["Row"];
type LoadPlanInsert = Database["public"]["Tables"]["load_plans"]["Insert"];
type IceTracking = Database["public"]["Tables"]["ice_tracking"]["Row"];
type IceTrackingInsert = Database["public"]["Tables"]["ice_tracking"]["Insert"];
type InsurancePolicy = Database["public"]["Tables"]["insurance_policies"]["Row"];
type InsurancePolicyInsert = Database["public"]["Tables"]["insurance_policies"]["Insert"];
type LoadoffVerification = Database["public"]["Tables"]["loadoff_verifications"]["Row"];
type LoadoffVerificationInsert = Database["public"]["Tables"]["loadoff_verifications"]["Insert"];
type ReturnLoadTracking = Database["public"]["Tables"]["return_load_tracking"]["Row"];
type ReturnLoadTrackingInsert = Database["public"]["Tables"]["return_load_tracking"]["Insert"];
type DriverRestLog = Database["public"]["Tables"]["driver_rest_logs"]["Row"];
type DriverRestLogInsert = Database["public"]["Tables"]["driver_rest_logs"]["Insert"];


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
  },

  // ==========================================
  // PAT TESTING (Electrical Safety) #43
  // ==========================================

  async getPATTests(companyId: string) {
    const { data, error } = await supabase
      .from("pat_testing")
      .select("*")
      .eq("company_id", companyId)
      .order("next_test_date", { ascending: true });

    if (error) throw error;
    return data as PATTesting[];
  },

  async createPATTest(test: PATTestingInsert) {
    const { data, error } = await supabase
      .from("pat_testing")
      .insert(test)
      .select()
      .single();

    if (error) throw error;
    return data as PATTesting;
  },

  async getOverduePATTests(companyId: string) {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from("pat_testing")
      .select("*")
      .eq("company_id", companyId)
      .lt("next_test_date", today)
      .order("next_test_date", { ascending: true });

    if (error) throw error;
    return data as PATTesting[];
  },

  // ==========================================
  // BACKUP GENERATORS #44
  // ==========================================

  async getBackupGenerators(companyId: string) {
    const { data, error } = await supabase
      .from("backup_generators")
      .select("*")
      .eq("company_id", companyId)
      .order("name", { ascending: true });

    if (error) throw error;
    return data as BackupGenerator[];
  },

  async createBackupGenerator(generator: BackupGeneratorInsert) {
    const { data, error } = await supabase
      .from("backup_generators")
      .insert(generator)
      .select()
      .single();

    if (error) throw error;
    return data as BackupGenerator;
  },

  async updateBackupGenerator(id: string, updates: Partial<BackupGenerator>) {
    const { data, error } = await supabase
      .from("backup_generators")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as BackupGenerator;
  },

  // ==========================================
  // COOKING FUEL STOCKPILE #46
  // ==========================================

  async getFuelStockpile(companyId: string) {
    const { data, error } = await supabase
      .from("fuel_stockpile")
      .select("*")
      .eq("company_id", companyId)
      .order("fuel_type", { ascending: true });

    if (error) throw error;
    return data as FuelStockpile[];
  },

  async updateFuelStock(id: string, updates: Partial<FuelStockpile>) {
    const { data, error } = await supabase
      .from("fuel_stockpile")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as FuelStockpile;
  },

  async getLowFuelStock(companyId: string) {
    const { data, error } = await supabase
      .from("fuel_stockpile")
      .select("*")
      .eq("company_id", companyId)
      .filter("quantity", "lte", "minimum_stock_level");

    if (error) throw error;
    return data as FuelStockpile[];
  },

  // ==========================================
  // SERVING UTENSILS QR TRACKING #47
  // ==========================================

  async getUtensils(companyId: string, status?: string) {
    let query = supabase
      .from("utensil_tracking")
      .select("*")
      .eq("company_id", companyId)
      .order("utensil_type", { ascending: true });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as UtensilTracking[];
  },

  async checkOutUtensil(id: string, userId: string, eventId?: string) {
    const { data, error } = await supabase
      .from("utensil_tracking")
      .update({
        status: "checked_out",
        checked_out_by: userId,
        checked_out_at: new Date().toISOString(),
        event_id: eventId
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as UtensilTracking;
  },

  async checkInUtensil(id: string) {
    const { data, error } = await supabase
      .from("utensil_tracking")
      .update({
        status: "returned",
        checked_in_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as UtensilTracking;
  },

  async scanUtensilQR(qrCode: string) {
    const { data, error } = await supabase
      .from("utensil_tracking")
      .select("*")
      .eq("qr_code", qrCode)
      .single();

    if (error) throw error;
    return data as UtensilTracking;
  },

  // ==========================================
  // LINEN MANAGEMENT #49
  // ==========================================

  async getLinenInventory(companyId: string) {
    const { data, error } = await supabase
      .from("linen_inventory")
      .select("*")
      .eq("company_id", companyId)
      .order("item_type", { ascending: true });

    if (error) throw error;
    return data as LinenInventory[];
  },

  async updateLinenStatus(id: string, updates: Partial<LinenInventory>) {
    const { data, error } = await supabase
      .from("linen_inventory")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as LinenInventory;
  },

  async getLinenDueLaundry(companyId: string) {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from("linen_inventory")
      .select("*")
      .eq("company_id", companyId)
      .lte("next_laundry_date", today)
      .order("next_laundry_date", { ascending: true });

    if (error) throw error;
    return data as LinenInventory[];
  },

  // ==========================================
  // DISHWASHER CYCLE PLANNING #50
  // ==========================================

  async getDishwasherCycles(companyId: string, date?: string) {
    let query = supabase
      .from("dishwasher_cycles")
      .select("*")
      .eq("company_id", companyId)
      .order("cycle_start_time", { ascending: false });

    if (date) {
      const startOfDay = `${date}T00:00:00`;
      const endOfDay = `${date}T23:59:59`;
      query = query.gte("cycle_start_time", startOfDay).lte("cycle_start_time", endOfDay);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as DishwasherCycle[];
  },

  async createDishwasherCycle(cycle: DishwasherCycleInsert) {
    const { data, error } = await supabase
      .from("dishwasher_cycles")
      .insert(cycle)
      .select()
      .single();

    if (error) throw error;
    return data as DishwasherCycle;
  },

  async completeDishwasherCycle(id: string) {
    const { data, error } = await supabase
      .from("dishwasher_cycles")
      .update({
        completed: true,
        cycle_end_time: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as DishwasherCycle;
  },

  // ==========================================
  // GLASSWARE CATEGORIZATION #51
  // ==========================================

  async getGlasswareCatalog(companyId: string) {
    const { data, error } = await supabase
      .from("glassware_catalog")
      .select("*")
      .eq("company_id", companyId)
      .order("glass_type", { ascending: true });

    if (error) throw error;
    return data as GlasswareCatalog[];
  },

  async createGlassware(glassware: GlasswareCatalogInsert) {
    const { data, error } = await supabase
      .from("glassware_catalog")
      .insert(glassware)
      .select()
      .single();

    if (error) throw error;
    return data as GlasswareCatalog;
  },

  async updateGlasswareQuantity(id: string, quantityChange: number) {
    const { data: current } = await supabase
      .from("glassware_catalog")
      .select("quantity_available")
      .eq("id", id)
      .single();

    if (!current) throw new Error("Glassware not found");

    const { data, error } = await supabase
      .from("glassware_catalog")
      .update({ quantity_available: current.quantity_available + quantityChange })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as GlasswareCatalog;
  },

  // ==========================================
  // STORAGE RACK MAPPING #52
  // ==========================================

  async getStorageRacks(companyId: string) {
    const { data, error } = await supabase
      .from("storage_racks")
      .select("*")
      .eq("company_id", companyId)
      .order("zone", { ascending: true })
      .order("rack_number", { ascending: true });

    if (error) throw error;
    return data as StorageRack[];
  },

  async createStorageRack(rack: StorageRackInsert) {
    const { data, error } = await supabase
      .from("storage_racks")
      .insert(rack)
      .select()
      .single();

    if (error) throw error;
    return data as StorageRack;
  },

  async updateStorageRack(id: string, updates: Partial<StorageRack>) {
    const { data, error } = await supabase
      .from("storage_racks")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as StorageRack;
  },

  // ==========================================
  // CLEANING SUPPLIES AUTO-REORDER #55
  // ==========================================

  async getCleaningSupplies(companyId: string) {
    const { data, error } = await supabase
      .from("cleaning_supplies")
      .select("*")
      .eq("company_id", companyId)
      .order("supply_name", { ascending: true });

    if (error) throw error;
    return data as CleaningSupply[];
  },

  async updateCleaningSupplyStock(id: string, newQuantity: number) {
    const { data, error } = await supabase
      .from("cleaning_supplies")
      .update({ current_quantity: newQuantity })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as CleaningSupply;
  },

  async getLowCleaningSupplies(companyId: string) {
    const { data, error } = await supabase
      .from("cleaning_supplies")
      .select("*")
      .eq("company_id", companyId)
      .filter("current_quantity", "lte", "reorder_trigger_level")
      .order("current_quantity", { ascending: true });

    if (error) throw error;
    return data as CleaningSupply[];
  },

  // ==========================================
  // PEST CONTROL SCHEDULE #56
  // ==========================================

  async getPestControlLogs(companyId: string) {
    const { data, error } = await supabase
      .from("pest_control_logs")
      .select("*")
      .eq("company_id", companyId)
      .order("inspection_date", { ascending: false });

    if (error) throw error;
    return data as PestControlLog[];
  },

  async createPestControlLog(log: PestControlLogInsert) {
    const { data, error } = await supabase
      .from("pest_control_logs")
      .insert(log)
      .select()
      .single();

    if (error) throw error;
    return data as PestControlLog;
  },

  async getUpcomingPestControl(companyId: string, daysAhead: number = 7) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const { data, error } = await supabase
      .from("pest_control_logs")
      .select("*")
      .eq("company_id", companyId)
      .lte("next_inspection_date", futureDate.toISOString().split('T')[0])
      .order("next_inspection_date", { ascending: true });

    if (error) throw error;
    return data as PestControlLog[];
  },

  // ==========================================
  // SAFETY EQUIPMENT TRACKING #57
  // ==========================================

  async getSafetyEquipment(companyId: string) {
    const { data, error } = await supabase
      .from("safety_equipment")
      .select("*")
      .eq("company_id", companyId)
      .order("location", { ascending: true });

    if (error) throw error;
    return data as SafetyEquipment[];
  },

  async createSafetyEquipment(equipment: SafetyEquipmentInsert) {
    const { data, error } = await supabase
      .from("safety_equipment")
      .insert(equipment)
      .select()
      .single();

    if (error) throw error;
    return data as SafetyEquipment;
  },

  async getExpiringSafetyEquipment(companyId: string, daysAhead: number = 30) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const { data, error } = await supabase
      .from("safety_equipment")
      .select("*")
      .eq("company_id", companyId)
      .or(`next_inspection_date.lte.${futureDate.toISOString().split('T')[0]},expiry_date.lte.${futureDate.toISOString().split('T')[0]}`)
      .order("next_inspection_date", { ascending: true });

    if (error) throw error;
    return data as SafetyEquipment[];
  },

  // ==========================================
  // LIGHTING ADEQUACY TESTS #58
  // ==========================================

  async getLightingTests(companyId: string) {
    const { data, error } = await supabase
      .from("lighting_tests")
      .select("*")
      .eq("company_id", companyId)
      .order("test_date", { ascending: false });

    if (error) throw error;
    return data as LightingTest[];
  },

  async createLightingTest(test: LightingTestInsert) {
    const { data, error } = await supabase
      .from("lighting_tests")
      .insert(test)
      .select()
      .single();

    if (error) throw error;
    return data as LightingTest;
  },

  async getNonCompliantLighting(companyId: string) {
    const { data, error } = await supabase
      .from("lighting_tests")
      .select("*")
      .eq("company_id", companyId)
      .eq("compliant", false)
      .order("test_date", { ascending: false });

    if (error) throw error;
    return data as LightingTest[];
  },

  // ==========================================
  // FLOOR SAFETY INSPECTIONS #59
  // ==========================================

  async getFloorSafetyInspections(companyId: string) {
    const { data, error } = await supabase
      .from("floor_safety_inspections")
      .select("*")
      .eq("company_id", companyId)
      .order("inspection_date", { ascending: false });

    if (error) throw error;
    return data as FloorSafetyInspection[];
  },

  async createFloorSafetyInspection(inspection: FloorSafetyInspectionInsert) {
    const { data, error } = await supabase
      .from("floor_safety_inspections")
      .insert(inspection)
      .select()
      .single();

    if (error) throw error;
    return data as FloorSafetyInspection;
  },

  // ==========================================
  // DELIVERY CRATES BARCODE SYSTEM #60
  // ==========================================

  async getDeliveryCrates(companyId: string, status?: string) {
    let query = supabase
      .from("delivery_crates")
      .select("*")
      .eq("company_id", companyId)
      .order("barcode", { ascending: true });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as DeliveryCrate[];
  },

  async assignCrateToEvent(crateId: string, eventId: string, driverId: string) {
    const { data, error } = await supabase
      .from("delivery_crates")
      .update({
        status: "in_transit",
        assigned_to_event: eventId,
        assigned_to_driver: driverId
      })
      .eq("id", crateId)
      .select()
      .single();

    if (error) throw error;
    return data as DeliveryCrate;
  },

  async scanCrateBarcode(barcode: string) {
    const { data, error } = await supabase
      .from("delivery_crates")
      .select("*")
      .eq("barcode", barcode)
      .single();

    if (error) throw error;
    return data as DeliveryCrate;
  },

  // ==========================================
  // LOAD PLANNING (HOT/COLD SEPARATION) #64
  // ==========================================

  async getLoadPlans(companyId: string, eventId?: string) {
    let query = supabase
      .from("load_plans")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (eventId) {
      query = query.eq("event_id", eventId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as LoadPlan[];
  },

  async createLoadPlan(plan: LoadPlanInsert) {
    const { data, error } = await supabase
      .from("load_plans")
      .insert(plan)
      .select()
      .single();

    if (error) throw error;
    return data as LoadPlan;
  },

  async verifyLoadPlan(id: string, verifiedBy: string) {
    const { data, error } = await supabase
      .from("load_plans")
      .update({
        verified_by: verifiedBy,
        verified_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as LoadPlan;
  },

  // ==========================================
  // ICE AND COOLING TRANSPORT #71
  // ==========================================

  async getIceTracking(companyId: string, eventId?: string) {
    let query = supabase
      .from("ice_tracking")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (eventId) {
      query = query.eq("event_id", eventId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as IceTracking[];
  },

  async logIceDelivery(log: IceTrackingInsert) {
    const { data, error } = await supabase
      .from("ice_tracking")
      .insert(log)
      .select()
      .single();

    if (error) throw error;
    return data as IceTracking;
  },

  // ==========================================
  // INSURANCE TRACKING #72
  // ==========================================

  async getInsurancePolicies(companyId: string) {
    const { data, error } = await supabase
      .from("insurance_policies")
      .select("*")
      .eq("company_id", companyId)
      .order("expiry_date", { ascending: true });

    if (error) throw error;
    return data as InsurancePolicy[];
  },

  async createInsurancePolicy(policy: InsurancePolicyInsert) {
    const { data, error } = await supabase
      .from("insurance_policies")
      .insert(policy)
      .select()
      .single();

    if (error) throw error;
    return data as InsurancePolicy;
  },

  async getExpiringInsurance(companyId: string, daysAhead: number = 30) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const { data, error } = await supabase
      .from("insurance_policies")
      .select("*")
      .eq("company_id", companyId)
      .lte("expiry_date", futureDate.toISOString().split('T')[0])
      .order("expiry_date", { ascending: true });

    if (error) throw error;
    return data as InsurancePolicy[];
  },

  // ==========================================
  // LOAD-OFF PROCEDURES #73
  // ==========================================

  async getLoadoffVerifications(companyId: string, eventId?: string) {
    let query = supabase
      .from("loadoff_verifications")
      .select("*")
      .eq("company_id", companyId)
      .order("venue_arrival_time", { ascending: false });

    if (eventId) {
      query = query.eq("event_id", eventId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as LoadoffVerification[];
  },

  async createLoadoffVerification(verification: LoadoffVerificationInsert) {
    const { data, error } = await supabase
      .from("loadoff_verifications")
      .insert(verification)
      .select()
      .single();

    if (error) throw error;
    return data as LoadoffVerification;
  },

  // ==========================================
  // RETURN LOAD TRACKING #74
  // ==========================================

  async getReturnLoadTracking(companyId: string, eventId?: string) {
    let query = supabase
      .from("return_load_tracking")
      .select("*")
      .eq("company_id", companyId)
      .order("departure_time", { ascending: false });

    if (eventId) {
      query = query.eq("event_id", eventId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as ReturnLoadTracking[];
  },

  async createReturnLoadTracking(tracking: ReturnLoadTrackingInsert) {
    const { data, error } = await supabase
      .from("return_load_tracking")
      .insert(tracking)
      .select()
      .single();

    if (error) throw error;
    return data as ReturnLoadTracking;
  },

  async verifyReturnLoad(id: string, verifiedBy: string) {
    const { data, error } = await supabase
      .from("return_load_tracking")
      .update({
        scan_verification_complete: true,
        verified_by: verifiedBy,
        verified_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as ReturnLoadTracking;
  },

  // ==========================================
  // DRIVER REST COMPLIANCE #75
  // ==========================================

  async getDriverRestLogs(companyId: string, driverId?: string) {
    let query = supabase
      .from("driver_rest_logs")
      .select("*")
      .eq("company_id", companyId)
      .order("shift_date", { ascending: false });

    if (driverId) {
      query = query.eq("driver_id", driverId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as DriverRestLog[];
  },

  async createDriverRestLog(log: DriverRestLogInsert) {
    const { data, error } = await supabase
      .from("driver_rest_logs")
      .insert(log)
      .select()
      .single();

    if (error) throw error;
    return data as DriverRestLog;
  },

  async getDriverRestViolations(companyId: string) {
    const { data, error } = await supabase
      .from("driver_rest_logs")
      .select("*")
      .eq("company_id", companyId)
      .eq("compliant", false)
      .order("shift_date", { ascending: false });

    if (error) throw error;
    return data as DriverRestLog[];
  },

  // ==========================================
  // COMPREHENSIVE OPERATIONS DASHBOARD
  // ==========================================

  async getOperationsDashboard(companyId: string) {
    const [
      patTests,
      generators,
      fuelStock,
      utensils,
      linen,
      glassware,
      cleaningSupplies,
      pestControl,
      safetyEquipment,
      lightingTests,
      crates,
      insurance,
      restViolations
    ] = await Promise.all([
      this.getOverduePATTests(companyId),
      this.getBackupGenerators(companyId),
      this.getLowFuelStock(companyId),
      this.getUtensils(companyId),
      this.getLinenDueLaundry(companyId),
      this.getGlasswareCatalog(companyId),
      this.getLowCleaningSupplies(companyId),
      this.getUpcomingPestControl(companyId, 14),
      this.getExpiringSafetyEquipment(companyId, 30),
      this.getNonCompliantLighting(companyId),
      this.getDeliveryCrates(companyId, "available"),
      this.getExpiringInsurance(companyId, 30),
      this.getDriverRestViolations(companyId)
    ]);

    return {
      overduePATTests: patTests?.length || 0,
      activeGenerators: generators?.filter(g => g.status === 'operational').length || 0,
      lowFuelItems: fuelStock?.length || 0,
      availableUtensils: utensils?.filter(u => u.status === 'available').length || 0,
      laundryDue: linen?.length || 0,
      totalGlassware: glassware?.reduce((sum, g) => sum + (g.quantity_available || 0), 0) || 0,
      lowCleaningSupplies: cleaningSupplies?.length || 0,
      upcomingPestControl: pestControl?.length || 0,
      expiringSafety: safetyEquipment?.length || 0,
      lightingIssues: lightingTests?.length || 0,
      availableCrates: crates?.length || 0,
      expiringInsurance: insurance?.length || 0,
      restViolations: restViolations?.length || 0
    };
  }
};
