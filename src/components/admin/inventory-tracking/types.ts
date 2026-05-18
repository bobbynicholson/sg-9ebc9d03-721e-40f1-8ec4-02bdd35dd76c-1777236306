/**
 * Shared types for /admin/inventory-tracking and its child dialogs.
 * Extracted from src/pages/admin/inventory-tracking.tsx in the
 * P2-13 split (audit ledger), so the page-level orchestrator and the
 * AddInventoryItemDialog / StockMovementDialog sub-components can
 * agree on one shape without circular imports.
 */

export interface InventoryItem {
  id: string;
  item_name: string;
  category: string;
  current_stock: number;
  minimum_stock: number;
  maximum_stock: number;
  unit_of_measure: string;
  preferred_supplier_id?: string;
  cost_per_unit: number;
  supplier_name?: string;
}

export interface Supplier {
  id: string;
  supplier_name: string;
  contact_person: string;
  email: string;
  phone: string;
}

export interface StockMovement {
  id: string;
  inventory_item_id: string;
  item_name: string;
  transaction_type: "purchase" | "usage" | "waste" | "adjustment" | "transfer" | "return";
  quantity: number;
  notes: string;
  performed_by: string;
  created_at: string;
  staff_name?: string;
}

export interface InventoryItemFormData {
  item_name: string;
  category: string;
  current_stock: number;
  minimum_stock: number;
  maximum_stock: number;
  unit_of_measure: string;
  preferred_supplier_id: string;
  cost_per_unit: number;
}

export interface StockMovementFormData {
  transaction_type: "purchase" | "usage";
  quantity: number;
  notes: string;
}
