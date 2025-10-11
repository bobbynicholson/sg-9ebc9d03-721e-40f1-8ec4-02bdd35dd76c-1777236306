
export interface Region {
  id: string;
  name: string;
  code: string;
  province: string;
  country: string;
  status: "active" | "inactive" | "pending";
  createdAt: string;
  settings: RegionSettings;
  contact: RegionContact;
  stats: RegionStats;
}

export interface RegionSettings {
  timezone: string;
  currency: string;
  language: string;
  operatingHours: {
    start: string;
    end: string;
  };
  deliveryRadius: number;
  autoAssignOrders: boolean;
}

export interface RegionContact {
  managerName: string;
  managerEmail: string;
  managerPhone: string;
  address: string;
  city: string;
  postalCode: string;
}

export interface RegionStats {
  totalOrders: number;
  activeDrivers: number;
  kitchenStaff: number;
  inventoryValue: number;
  monthlyRevenue: number;
}

export interface RegionalUser {
  userId: string;
  regionId: string;
  role: "regional_admin" | "kitchen_manager" | "driver" | "cleaner" | "shopper";
  permissions: string[];
  assignedAt: string;
}

export interface OrderAssignment {
  orderId: string;
  regionId: string;
  assignedBy: string;
  assignedAt: string;
  status: "pending" | "accepted" | "in_progress" | "completed" | "rejected";
  notes?: string;
}

export interface RegionalInventory {
  regionId: string;
  items: {
    itemId: string;
    quantity: number;
    location: string;
    lastUpdated: string;
  }[];
}

export interface RegionalEquipment {
  regionId: string;
  equipment: {
    equipmentId: string;
    quantity: number;
    available: number;
    inCleaning: number;
    damaged: number;
  }[];
}
