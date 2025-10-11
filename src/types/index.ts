
export interface Lead {
  id: string;
  clientName: string;
  email: string;
  phone: string;
  eventDate: string;
  eventType: string;
  guestCount: number;
  budget: number;
  specialRequests: string;
  status: "new" | "quoted" | "revised" | "confirmed" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export interface Quote {
  id: string;
  leadId: string;
  clientName: string;
  email: string;
  eventDate: string;
  eventType: string;
  guestCount: number;
  menuItems: MenuItem[];
  equipmentItems: EquipmentItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: "draft" | "sent" | "revised" | "accepted" | "rejected";
  version: number;
  createdAt: string;
  updatedAt: string;
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

export interface Order {
  id: string;
  quoteId: string;
  clientName: string;
  eventDate: string;
  venue: string;
  eventLocation: string;
  guestCount: number;
  menuItems: MenuItem[];
  equipmentItems: EquipmentItem[];
  kitchenInstructions: string;
  status: "pending" | "confirmed" | "in_preparation" | "preparing" | "ready" | "in_progress" | "delivered" | "completed";
  totalAmount?: number;
  assignedDriver?: string;
  deliveryTime?: string;
  createdAt: string;
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
  totalAmount: number;
  status: "active" | "completed" | "paid";
  paidAt?: string;
}

export interface Delivery {
  id: string;
  orderId: string;
  driverId?: string;
  pickupTime: string;
  deliveryTime: string;
  location: string;
  status: "available" | "booked" | "in_transit" | "delivered" | "completed";
  clientConfirmation?: boolean;
}

export interface Payment {
  id: string;
  quoteId: string;
  amount: number;
  status: "pending" | "partial" | "paid" | "refunded";
  method?: "card" | "bank_transfer" | "cash";
  paidAmount: number;
  paidAt?: string;
  reconciled: boolean;
}

export type UserRole = "admin" | "kitchen" | "buyer" | "driver" | "client" | "cleaning" | "shopping";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole[];
  primaryRole: UserRole;
  assignedBy?: string;
  createdAt: string;
  phone?: string;
  status: "active" | "inactive";
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
