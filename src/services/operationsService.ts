/**
 * Operations Service - Main Export Module
 * 
 * This service has been refactored into smaller, focused modules:
 * - orderOperations: Order creation, updates, status management
 * - inventoryOperations: Inventory tracking and stock management
 * - supplierOperations: Supplier management
 * - menuOperations: Menu item management
 * 
 * Import from specific modules for better tree-shaking and maintainability.
 */

export * from "./operations/orderOperations";
export * from "./operations/inventoryOperations";
export * from "./operations/supplierOperations";
export * from "./operations/menuOperations";

// Re-export for backward compatibility
import * as orderOps from "./operations/orderOperations";
import * as inventoryOps from "./operations/inventoryOperations";
import * as supplierOps from "./operations/supplierOperations";
import * as menuOps from "./operations/menuOperations";

export const operations = {
  orders: orderOps,
  inventory: inventoryOps,
  suppliers: supplierOps,
  menu: menuOps,
};