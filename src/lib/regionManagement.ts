
import { Region, RegionalUser, OrderAssignment } from "@/types/regions";

export const regionManagement = {
  regions: [
    {
      id: "reg_001",
      name: "Johannesburg Operations",
      code: "JHB",
      province: "Gauteng",
      country: "South Africa",
      status: "active" as const,
      createdAt: "2025-01-15T10:00:00Z",
      settings: {
        timezone: "Africa/Johannesburg",
        currency: "ZAR",
        language: "en",
        operatingHours: { start: "06:00", end: "22:00" },
        deliveryRadius: 50,
        autoAssignOrders: true
      },
      contact: {
        managerName: "Sarah Johnson",
        managerEmail: "sarah.jhb@cateringco.za",
        managerPhone: "+27 82 123 4567",
        address: "123 Main Street",
        city: "Johannesburg",
        postalCode: "2000"
      },
      stats: {
        totalOrders: 156,
        activeDrivers: 12,
        kitchenStaff: 8,
        inventoryValue: 245000,
        monthlyRevenue: 580000
      }
    },
    {
      id: "reg_002",
      name: "Cape Town Operations",
      code: "CPT",
      province: "Western Cape",
      country: "South Africa",
      status: "active" as const,
      createdAt: "2025-03-20T10:00:00Z",
      settings: {
        timezone: "Africa/Johannesburg",
        currency: "ZAR",
        language: "en",
        operatingHours: { start: "07:00", end: "23:00" },
        deliveryRadius: 45,
        autoAssignOrders: true
      },
      contact: {
        managerName: "Michael Petersen",
        managerEmail: "michael.cpt@cateringco.za",
        managerPhone: "+27 83 234 5678",
        address: "456 Coastal Road",
        city: "Cape Town",
        postalCode: "8000"
      },
      stats: {
        totalOrders: 89,
        activeDrivers: 8,
        kitchenStaff: 5,
        inventoryValue: 180000,
        monthlyRevenue: 420000
      }
    }
  ] as Region[],

  regionalUsers: [
    {
      userId: "user_001",
      regionId: "reg_001",
      role: "regional_admin" as const,
      permissions: ["manage_kitchen", "manage_drivers", "manage_inventory", "view_reports"],
      assignedAt: "2025-01-15T10:00:00Z"
    },
    {
      userId: "user_002",
      regionId: "reg_001",
      role: "kitchen_manager" as const,
      permissions: ["manage_kitchen", "view_orders"],
      assignedAt: "2025-01-20T10:00:00Z"
    },
    {
      userId: "user_003",
      regionId: "reg_002",
      role: "regional_admin" as const,
      permissions: ["manage_kitchen", "manage_drivers", "manage_inventory", "view_reports"],
      assignedAt: "2025-03-20T10:00:00Z"
    }
  ] as RegionalUser[],

  orderAssignments: [
    {
      orderId: "ord_001",
      regionId: "reg_001",
      assignedBy: "hq_admin_001",
      assignedAt: "2025-10-10T14:30:00Z",
      status: "in_progress" as const,
      notes: "High priority corporate event"
    },
    {
      orderId: "ord_002",
      regionId: "reg_002",
      assignedAt: "2025-10-11T09:15:00Z",
      assignedBy: "hq_admin_001",
      status: "accepted" as const
    }
  ] as OrderAssignment[],

  getRegionById: (regionId: string): Region | undefined => {
    return regionManagement.regions.find(r => r.id === regionId);
  },

  getRegionsByStatus: (status: Region["status"]): Region[] => {
    return regionManagement.regions.filter(r => r.status === status);
  },

  getUserRegions: (userId: string): Region[] => {
    const userRegionIds = regionManagement.regionalUsers
      .filter(ru => ru.userId === userId)
      .map(ru => ru.regionId);
    return regionManagement.regions.filter(r => userRegionIds.includes(r.id));
  },

  getRegionUsers: (regionId: string): RegionalUser[] => {
    return regionManagement.regionalUsers.filter(ru => ru.regionId === regionId);
  },

  getOrdersByRegion: (regionId: string): OrderAssignment[] => {
    return regionManagement.orderAssignments.filter(oa => oa.regionId === regionId);
  },

  assignOrderToRegion: (orderId: string, regionId: string, assignedBy: string, notes?: string): OrderAssignment => {
    const assignment: OrderAssignment = {
      orderId,
      regionId,
      assignedBy,
      assignedAt: new Date().toISOString(),
      status: "pending",
      notes
    };
    regionManagement.orderAssignments.push(assignment);
    return assignment;
  },

  updateAssignmentStatus: (orderId: string, status: OrderAssignment["status"]): void => {
    const assignment = regionManagement.orderAssignments.find(oa => oa.orderId === orderId);
    if (assignment) {
      assignment.status = status;
    }
  },

  createRegion: (regionData: Omit<Region, "id" | "createdAt" | "stats">): Region => {
    const newRegion: Region = {
      ...regionData,
      id: `reg_${Date.now()}`,
      createdAt: new Date().toISOString(),
      stats: {
        totalOrders: 0,
        activeDrivers: 0,
        kitchenStaff: 0,
        inventoryValue: 0,
        monthlyRevenue: 0
      }
    };
    regionManagement.regions.push(newRegion);
    return newRegion;
  },

  updateRegion: (regionId: string, updates: Partial<Region>): Region | null => {
    const index = regionManagement.regions.findIndex(r => r.id === regionId);
    if (index !== -1) {
      regionManagement.regions[index] = { ...regionManagement.regions[index], ...updates };
      return regionManagement.regions[index];
    }
    return null;
  },

  assignUserToRegion: (userId: string, regionId: string, role: RegionalUser["role"], permissions: string[]): RegionalUser => {
    const assignment: RegionalUser = {
      userId,
      regionId,
      role,
      permissions,
      assignedAt: new Date().toISOString()
    };
    regionManagement.regionalUsers.push(assignment);
    return assignment;
  },

  getConsolidatedStats: () => {
    return regionManagement.regions.reduce((acc, region) => ({
      totalRegions: acc.totalRegions + 1,
      totalOrders: acc.totalOrders + region.stats.totalOrders,
      totalDrivers: acc.totalDrivers + region.stats.activeDrivers,
      totalKitchenStaff: acc.totalKitchenStaff + region.stats.kitchenStaff,
      totalInventoryValue: acc.totalInventoryValue + region.stats.inventoryValue,
      totalRevenue: acc.totalRevenue + region.stats.monthlyRevenue
    }), {
      totalRegions: 0,
      totalOrders: 0,
      totalDrivers: 0,
      totalKitchenStaff: 0,
      totalInventoryValue: 0,
      totalRevenue: 0
    });
  }
};
