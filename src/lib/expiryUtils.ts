import { InventoryItem } from "@/types/app";

export function calculateExpiryStatus(item: InventoryItem): {
  status: "fresh" | "warning" | "critical" | "expired";
  daysUntilExpiry: number;
  expiryDate: string;
} {
  if (!item.shelfLifeDays || !item.purchaseDate) {
    return {
      status: "fresh",
      daysUntilExpiry: 999,
      expiryDate: ""
    };
  }

  const purchaseDate = new Date(item.purchaseDate);
  const expiryDate = new Date(purchaseDate);
  expiryDate.setDate(expiryDate.getDate() + item.shelfLifeDays);

  const today = new Date();
  const daysUntilExpiry = Math.floor(
    (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  let status: "fresh" | "warning" | "critical" | "expired" = "fresh";
  if (daysUntilExpiry < 0) {
    status = "expired";
  } else if (daysUntilExpiry <= 2) {
    status = "critical";
  } else if (daysUntilExpiry <= 7) {
    status = "warning";
  }

  return {
    status,
    daysUntilExpiry,
    expiryDate: expiryDate.toISOString().split("T")[0]
  };
}

export function getExpiryAlerts(inventory: InventoryItem[]): {
  expired: InventoryItem[];
  critical: InventoryItem[];
  warning: InventoryItem[];
} {
  const expired: InventoryItem[] = [];
  const critical: InventoryItem[] = [];
  const warning: InventoryItem[] = [];

  inventory.forEach(item => {
    if (!item.shelfLifeDays || !item.purchaseDate) return;

    const { status } = calculateExpiryStatus(item);
    
    if (status === "expired") {
      expired.push(item);
    } else if (status === "critical") {
      critical.push(item);
    } else if (status === "warning") {
      warning.push(item);
    }
  });

  return { expired, critical, warning };
}

export function getExpiryStatusConfig(status: "fresh" | "warning" | "critical" | "expired") {
  switch (status) {
    case "expired":
      return {
        label: "Expired",
        color: "bg-red-100 text-red-800 border-red-300",
        icon: "⛔"
      };
    case "critical":
      return {
        label: "Critical",
        color: "bg-orange-100 text-orange-800 border-orange-300",
        icon: "⚠️"
      };
    case "warning":
      return {
        label: "Warning",
        color: "bg-yellow-100 text-yellow-800 border-yellow-300",
        icon: "⏰"
      };
    default:
      return {
        label: "Fresh",
        color: "bg-green-100 text-green-800 border-green-300",
        icon: "✓"
      };
  }
}
