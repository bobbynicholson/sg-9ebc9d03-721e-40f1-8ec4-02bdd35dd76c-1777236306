
import { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles"> & { currency?: string };
export type Lead = Tables<"leads">;
export type Quote = Tables<"quotes">;

export type Order = Tables<"orders">;
export type OrderStatusUpdate = {
  orderId: string;
  newStatus: Order["status"];
  notes?: string;
};
export type ConvertQuoteToOrderParams = {
  quoteId: string;
  depositPercentage: number;
  balanceDueDaysBeforeEvent: number;
  lastChangeDaysBeforeEvent: number;
};


export interface DisplayLead {
  id: string;
  userId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  eventDate: string;
  eventType: string;
  guestCount: number;
  budget: number | null;
  specialRequests: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  _original: Lead;
}

export interface MenuItem {
  id: string;
  name: string;
  category: "appetizer" | "main" | "side" | "dessert" | "beverage";
  pricePerPerson: number;
  quantity: number;
  ingredients: Ingredient[];
}

export interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  quantityNeeded: number;
  unit: string;
  category: "fresh" | "staple" | "frozen";
}

export interface SupplierPrice {
  supplierId: string;
  supplierName: string;
  price: number;
  lastUpdated: string;
  minimumOrder?: number;
  deliveryTime?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: "fresh_produce" | "staples" | "frozen" | "equipment" | "dairy" | "meat" | "vegetables" | "spices" | "beverages" | "bakery";
  currentStock: number;
  unit: string;
  minimumStock: number;
  lastRestocked: string;
  supplier?: string;
  supplierPrices?: SupplierPrice[];
  averageCost?: number;
  reorderPoint?: number;
  shelfLifeDays?: number;
  purchaseDate?: string;
  expiryDate?: string;
  expiryStatus?: "fresh" | "warning" | "critical" | "expired";
  daysUntilExpiry?: number;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unit: string;
  price: number;
  supplier: string;
  category?: string;
}

export interface ScannedReceipt {
  id: string;
  supplierId: string;
  supplierName: string;
  items: ReceiptItem[];
  totalAmount: number;
  receiptDate: string;
  scannedAt: string;
  status: "pending" | "processed" | "rejected";
}

export interface SupplierComparison {
  itemId: string;
  itemName: string;
  suppliers: {
    name: string;
    price: number;
    lastUpdated: string;
    savings?: number;
    recommended?: boolean;
  }[];
  bestPrice: number;
  averagePrice: number;
  potentialSavings: number;
}

export interface EquipmentItem {
  id: string;
  name: string;
  category: "chafing" | "serving" | "utensil" | "cutlery" | "crockery" | "other";
  quantity: number;
  available: number;
  condition: "excellent" | "good" | "fair" | "poor";
  rentalPrice: number;
  pricePerItem?: number;
  requiresCleaning?: boolean;
  cleaningTimeHours?: number;
  lastCleaned?: string;
  nextAvailableAt?: string;
}

export interface DeliveryJob extends Quote {
  pickupTime: string;
  deliveryTime: string;
  address: string;
  driverAssigned?: string;
  lead_id: string; // Added to satisfy required property from Quote
}

export interface AppOrder extends Tables<"orders"> {
  // All properties should now come directly from the DB types
}

export interface OrderModification {
  id: string;
  modifiedAt: string;
  modifiedBy: string;
  modificationType: "guest_count" | "menu_items" | "equipment" | "address" | "other";
  previousValue: any;
  newValue: any;
  description: string;
  priceImpact: number;
}

export interface ShoppingList {
  id: string;
  orderId: string;
  eventDate: string;
  items: ShoppingItem[];
  status: "pending" | "ordered" | "received";
  createdAt: string;
}

export interface ShoppingItem {
  ingredientId: string;
  name: string;
  quantity: number;
  unit: string;
  category: "fresh_produce" | "staples" | "frozen";
  estimatedCost: number;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  email: string;
  availableJobs: string[];
  assignedJobs: string[];
  completedJobs: number;
  hourlyRate?: number;
  perKmRate?: number;
  totalEarnings?: number;
  pendingPayment?: number;
}

export interface DriverEarnings {
  driverId: string;
  jobId: string;
  startTime?: string;
  endTime?: string;
  totalHours?: number;
  totalKm?: number;
  hourlyEarnings: number;
  kmEarnings: number;
  waiterEarnings?: number;
  totalAmount: number;
  status: "active" | "completed" | "paid";
  paidAt?: string;
}

export interface Delivery {
  id: string;
  orderId: string;
  driverId?: string | null;
  driverName?: string | null;
  pickupTime: string;
  deliveryTime: string;
  location: string;
  status: "available" | "booked" | "in_transit" | "delivered" | "completed";
  clientConfirmation?: boolean;
  requiresWaiter?: boolean;
  waiterDurationHours?: 1 | 2 | 3;
  waiterHourlyRate?: number;
  equipmentReturnMethod?: "waiter_return" | "later_collection";
}

export interface Payment {
  id: string;
  quoteId: string;
  amount: number;
  status: "pending" | "partial" | "paid" | "refunded";
  method?: "card" | "bank_transfer" | "cash";
  paidAmount: number;
  depositAmount?: number;
  depositPaid?: boolean;
  depositPaidAt?: string;
  balanceAmount?: number;
  balanceDueDate?: string;
  balancePaid?: boolean;
  balancePaidAt?: string;
  paidAt?: string;
  reconciled: boolean;
}

export type UserRole = "admin" | "kitchen" | "driver" | "client" | "cleaning" | "shopping" | "owner" | "super_admin" | "shopping_staff" | "cleaning_staff" | "kitchen_staff";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole; // Legacy single role for backward compatibility
  roles: UserRole[]; // NEW: Array of assigned roles
  activeRole: UserRole; // NEW: Currently active role
  primaryRole: UserRole;
  assignedBy?: string;
  createdAt: string;
  phone?: string;
  status: "active" | "inactive";
  currency?: "ZAR" | "USD" | "EUR" | "GBP" | "AUD";
  preferredCurrency?: "ZAR" | "USD" | "EUR" | "GBP" | "AUD";
  company_name?: string;
  company_id?: string | null;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  vat_number?: string;
  tax_number?: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_type: 'starter' | 'pro' | 'enterprise';
  status: 'active' | 'cancelled' | 'trialing' | 'past_due';
  amount: number;
  currency: string;
  created_at: string;
  current_period_start: string;
  current_period_end: string;
  active_clients_count: number;
  billing_cycle: 'monthly' | 'quarterly' | 'annually';
  cancel_at_period_end: boolean;
  cancellation_feedback: string;
  cancellation_reason: string;
  cancelled_at: string;
  discount_code: string;
  mrr: number;
  orders_this_quarter: number;
  payment_gateway: string;
  payment_method: string;
  quarterly_orders_limit: number;
  starts_at: string;
  trial_ends_at: string;
  trial_starts_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface CleaningSchedule {
  id: string;
  orderId: string;
  equipmentItems: EquipmentItem[];
  returnedAt?: string;
  cleaningStartedAt?: string;
  estimatedCleaningHours: number;
  availableAt: string;
  status: "pending_return" | "in_cleaning" | "cleaned" | "available";
  assignedTo?: string;
  notes?: string;
}

export interface EquipmentInventory {
  id: string;
  name: string;
  category: "cutlery" | "crockery" | "chafing" | "serving" | "other";
  totalQuantity: number;
  availableQuantity: number;
  inUseQuantity: number;
  cleaningQuantity: number;
  damagedQuantity: number;
  defaultCleaningTimeHours: number;
  lastUpdated: string;
}

export interface GPSLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  speed?: number;
  altitude?: number;
  heading?: number;
}

export interface AfterSalesEmail {
  id: string;
  sequence: 1 | 2 | 3 | 4 | 5 | 6;
  monthsAfterEvent: 2 | 4 | 6 | 8 | 10 | 12;
  subject: string;
  body: string;
  callToAction: string;
  isActive: boolean;
  lastEdited: string;
  editedBy?: string;
}

export interface AfterSalesSchedule {
  id: string;
  orderId: string;
  clientName: string;
  clientEmail: string;
  eventDate: string;
  emailsSent: number[];
  nextEmailDue?: string;
  nextEmailSequence?: number;
  status: "active" | "completed" | "paused";
  createdAt: string;
}

export interface EmailTemplate {
  id: string;
  category: "quote" | "follow_up" | "payment" | "reminder" | "thank_you" | "after_sales" | "review";
  name: string;
  subject: string;
  body: string;
  variables: string[];
  isActive: boolean;
  lastEdited: string;
  sequence?: number;
}

export interface PreDepartureChecklist {
  assignmentId: string;
  cutleryConfirmed: boolean;
  crockeryConfirmed: boolean;
  foodVerified: boolean;
  completedAt?: string;
  departureConfirmed: boolean;
  departureConfirmedAt?: string;
}

export interface WaiterServiceConfig {
  hourlyRates: {
    1: number;
    2: number;
    3: number;
  };
  driverHourlyRates: {
    1: number;
    2: number;
    3: number;
  };
}

export interface EmailVariables {
  clientName?: string;
  driverName?: string;
  eventDate?: string;
  quoteNumber?: string;
  orderNumber?: string;
  currency?: string;
  totalAmount?: string;
  discountedAmount?: string;
  companyName?: string;
  eventType?: string;
  guestCount?: string;
  eventLocation?: string;
  eventTime?: string;
  acceptLink?: string;
  menuDetails?: string;
  changeDeadline?: string;
  contactPhone?: string;
  specialInstructions?: string;
  paymentAmount?: string;
  invoiceNumber?: string;
  paymentDate?: string;
  paymentMethod?: string;
  reviewLink?: string;
}

// ==========================================
// OPERATIONAL STANDARDS - FLEET & EQUIPMENT
// ==========================================

export type Vehicle = Tables<"vehicles">;
export type VehicleInsert = Omit<Vehicle, "id" | "created_at" | "updated_at">;

export type VehicleMaintenance = Tables<"vehicle_maintenance">;
export type VehicleMaintenanceInsert = Omit<VehicleMaintenance, "id" | "created_at">;

export type VehicleLog = Tables<"vehicle_logs">;
export type VehicleLogInsert = Omit<VehicleLog, "id" | "created_at">;

export type EquipmentKit = Tables<"equipment_kits">;
export type EquipmentKitInsert = Omit<EquipmentKit, "id" | "created_at">;

export type EquipmentKitItem = Tables<"equipment_kit_items">;
export type EquipmentKitItemInsert = Omit<EquipmentKitItem, "id">;

export type FinancialDepreciation = Tables<"financial_depreciation">;
export type FinancialDepreciationInsert = Omit<FinancialDepreciation, "id" | "created_at">;
