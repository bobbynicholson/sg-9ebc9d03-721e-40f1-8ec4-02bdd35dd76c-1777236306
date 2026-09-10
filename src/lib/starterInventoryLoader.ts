import starterData from "@/data/starter-inventory.json";

export interface StarterMenuItem {
  name: string;
  description: string;
  category: "appetizers" | "mains" | "sides" | "desserts";
  basePrice: number;
  preparationTime: number;
  servingSize: number;
  allergens: string[];
  isAvailable: boolean;
}

export interface StarterInventoryItem {
  itemName: string;
  category: "meat" | "vegetables" | "dry_goods" | "condiments" | "dairy" | "beverages";
  unit: "kg" | "l" | "units";
  currentStock: number;
  minimumStock: number;
  costPerUnit: number;
  supplierId: string | null;
}

export interface StarterSupplier {
  supplierName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  category: "meat" | "vegetables" | "dry_goods" | "condiments" | "dairy" | "beverages";
  paymentTerms: string;
  isActive: boolean;
}

export interface StarterInventoryData {
  menuItems: StarterMenuItem[];
  inventoryItems: StarterInventoryItem[];
  suppliers: StarterSupplier[];
}

export function getStarterInventory(): StarterInventoryData {
  return starterData as StarterInventoryData;
}

export function getStarterMenuItems(): StarterMenuItem[] {
  return starterData.menuItems as StarterMenuItem[];
}

export function getStarterInventoryItems(): StarterInventoryItem[] {
  return starterData.inventoryItems as StarterInventoryItem[];
}

export function getStarterSuppliers(): StarterSupplier[] {
  return starterData.suppliers as StarterSupplier[];
}