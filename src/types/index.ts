
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
  quantityNeeded: number;
  unit: string;
  category: "fresh" | "staple" | "frozen";
}

export interface EquipmentItem {
  id: string;
  name: string;
  category: "chafing" | "serving" | "utensil" | "other";
  quantity: number;
  rentalPrice: number;
}

export interface Order {
  id: string;
  quoteId: string;
  clientName: string;
  eventDate: string;
  eventLocation: string;
  guestCount: number;
  menuItems: MenuItem[];
  equipmentItems: EquipmentItem[];
  kitchenInstructions: string;
  status: "pending" | "in_preparation" | "ready" | "delivered" | "completed";
  assignedDriver?: string;
  deliveryTime?: string;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: "fresh_produce" | "staples" | "frozen" | "equipment";
  currentStock: number;
  unit: string;
  minimumStock: number;
  lastRestocked: string;
  supplier?: string;
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

export type UserRole = "admin" | "kitchen" | "buyer" | "driver" | "client";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}
